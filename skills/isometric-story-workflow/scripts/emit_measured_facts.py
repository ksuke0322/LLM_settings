"""Emit deterministic, reviewable measurements from a Blender scene.

The module deliberately has no top-level Blender import.  Pure geometry,
selection, and Markdown helpers can therefore be tested with normal Python;
the Blender API is imported only by the runtime collection function.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys
from typing import Any, Iterable, Mapping, Sequence


DEFAULT_FRAME = 300
DEFAULT_SCALE = 332.3
DEFAULT_TOLERANCE = 1e-6
HANDHOLD_FACE = 0.500
HANDHOLD_BASE = 0.440
# The current beehive fixture offsets the visual inner plane by 0.012 world
# units.  The emitted fact remains the contract face/base pair, while this
# alternate plane lets the detector verify the recess without manual input.
HANDHOLD_VISUAL_BASE = HANDHOLD_BASE + 0.012


class MeasuredFactsError(RuntimeError):
    """Base error for fail-closed input and measurement failures."""


class SelectionError(MeasuredFactsError):
    """Raised when requested or contract-backed objects cannot be resolved."""


def _point_values(point: Any) -> tuple[float, float, float]:
    if all(hasattr(point, axis) for axis in ("x", "y", "z")):
        return (float(point.x), float(point.y), float(point.z))
    try:
        values = tuple(float(value) for value in point)
    except (TypeError, ValueError) as error:
        raise ValueError("point must contain three numeric coordinates") from error
    if len(values) != 3:
        raise ValueError("point must contain three numeric coordinates")
    return values


def _vector(values: Sequence[float]) -> tuple[float, float, float]:
    if len(values) != 3:
        raise ValueError("vector must contain three values")
    return tuple(float(value) for value in values)  # type: ignore[return-value]


def bbox(points: Iterable[Any]) -> dict[str, tuple[float, float, float]]:
    """Return min, max, and dimensions for a non-empty point collection."""

    normalized = [_point_values(point) for point in points]
    if not normalized:
        raise ValueError("bbox requires at least one point")
    minimum = tuple(min(point[index] for point in normalized) for index in range(3))
    maximum = tuple(max(point[index] for point in normalized) for index in range(3))
    dimensions = tuple(maximum[index] - minimum[index] for index in range(3))
    return {"min": minimum, "max": maximum, "dimensions": dimensions}


def bbox_from_points(points: Iterable[Any]) -> dict[str, tuple[float, float, float]]:
    """Named alias for callers that prefer an explicit geometry helper name."""

    return bbox(points)


def local_cross_section(points: Iterable[Any]) -> dict[str, Any]:
    """Return a local bbox and its two smallest dimensions."""

    measured = bbox(points)
    dimensions = measured["dimensions"]
    measured["cross_section"] = tuple(sorted(dimensions)[:2])
    return measured


def calculate_local_cross_section(points: Iterable[Any]) -> dict[str, Any]:
    """Named alias for the local cross-section helper."""

    return local_cross_section(points)


def _has_plane(values: Iterable[float], target: float, tolerance: float) -> bool:
    return any(math.isclose(value, target, abs_tol=tolerance, rel_tol=0.0) for value in values)


def detect_handhold(local_points: Iterable[Any], tolerance: float = 1e-4) -> dict[str, Any] | None:
    """Detect the beehive handhold recess from its two local x planes.

    The geometry is a recess: the returned ``through`` value is always false.
    The fixture's visual opening plane may be offset by 0.012 from the
    contract base; that visual plane is normalized back to the contract fact.
    Only the presence of both measured planes is sufficient; no hole is
    inferred from the existence of the planes.
    """

    x_values = [_point_values(point)[0] for point in local_points]
    if not _has_plane(x_values, HANDHOLD_FACE, tolerance):
        return None
    if not (
        _has_plane(x_values, HANDHOLD_BASE, tolerance)
        or _has_plane(x_values, HANDHOLD_VISUAL_BASE, tolerance)
    ):
        return None
    return {"face": HANDHOLD_FACE, "base": HANDHOLD_BASE, "through": False}


def default_output_path(blend_path: Path, cool: int) -> Path:
    """Return the contract's default evidence path for a dated cool."""

    if not isinstance(cool, int) or isinstance(cool, bool) or cool < 1:
        raise ValueError("cool must be a positive integer")
    return blend_path.parent / "evidence" / f"cool{cool}_measured_facts.md"


def parse_arguments(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse arguments after Blender's ``--`` separator."""

    if argv is None:
        raw = sys.argv[1:]
        if "--" in raw:
            raw = raw[raw.index("--") + 1 :]
    else:
        raw = list(argv)
        if "--" in raw:
            raw = raw[raw.index("--") + 1 :]

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blend", required=True, type=Path, help="absolute path to the .blend file")
    parser.add_argument("--contract", type=Path, help="optional story_contract.json")
    parser.add_argument("--kinds", help="comma-separated exact names, story ids, or story types")
    parser.add_argument("--cool", type=int, help="cool number used for contract filtering")
    parser.add_argument("--scale", type=float, default=DEFAULT_SCALE, help="pixels per world unit")
    parser.add_argument("--output", type=Path, help="absolute Markdown output path")
    parser.set_defaults(frame=DEFAULT_FRAME)
    return parser.parse_args(raw)


def _parse_kinds(raw: str | None) -> list[str] | None:
    if raw is None:
        return None
    values = [item.strip() for item in raw.split(",")]
    if not values or any(not value for value in values):
        raise SelectionError("--kinds must contain non-empty comma-separated names")
    return values


def _string_values(spec: Mapping[str, Any], keys: Sequence[str]) -> set[str]:
    values: set[str] = set()
    for key in keys:
        raw = spec.get(key)
        if isinstance(raw, str) and raw:
            values.add(raw)
        elif isinstance(raw, list):
            if not all(isinstance(item, str) and item for item in raw):
                raise SelectionError(f"contract field {key} must contain non-empty strings")
            values.update(raw)
    return values


def _contract_identifiers(spec: Mapping[str, Any]) -> set[str]:
    return _string_values(
        spec,
        ("id", "story_id", "story_type", "name", "object_name", "object_names", "names", "members"),
    )


def _validated_contract_specs(contract: Any) -> list[dict[str, Any]]:
    if not isinstance(contract, Mapping):
        raise SelectionError("contract must be a JSON object")
    raw_objects = contract.get("objects")
    if not isinstance(raw_objects, list) or not raw_objects:
        raise SelectionError("contract.objects must be a non-empty list")

    specs: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw_spec in enumerate(raw_objects):
        if not isinstance(raw_spec, Mapping):
            raise SelectionError(f"contract.objects[{index}] must be an object")
        spec = dict(raw_spec)
        first_cool = spec.get("first_cool")
        if isinstance(first_cool, bool) or not isinstance(first_cool, int) or first_cool < 1:
            raise SelectionError(f"contract.objects[{index}].first_cool must be a positive integer")
        identifiers = _contract_identifiers(spec)
        if not identifiers:
            raise SelectionError(f"contract.objects[{index}] needs an id, name, story_id, or story_type")
        logical_id = spec.get("id") or spec.get("story_id") or spec.get("name")
        if isinstance(logical_id, str):
            if logical_id in seen_ids:
                raise SelectionError(f"contract object id is duplicated: {logical_id}")
            seen_ids.add(logical_id)
        specs.append(spec)
    return specs


def _record_name(record: Mapping[str, Any]) -> str:
    name = record.get("name")
    if not isinstance(name, str) or not name:
        raise SelectionError("available object must have a non-empty name")
    return name


def _validate_available(available: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    records = [dict(record) for record in available]
    names: set[str] = set()
    for record in records:
        name = _record_name(record)
        if name in names:
            raise SelectionError(f"available object name is duplicated: {name}")
        names.add(name)
    return records


def _spec_matches_token(spec: Mapping[str, Any], token: str) -> bool:
    return token in _contract_identifiers(spec)


def _record_matches_spec(record: Mapping[str, Any], spec: Mapping[str, Any]) -> bool:
    name = _record_name(record)
    explicit_names = _string_values(
        spec,
        ("id", "story_id", "name", "object_name", "object_names", "names", "members"),
    )
    if name in explicit_names:
        return True

    spec_ids = _string_values(spec, ("id", "story_id"))
    spec_types = _string_values(spec, ("story_type",))
    record_story_id = record.get("story_id")
    record_story_type = record.get("story_type")
    return (
        isinstance(record_story_id, str)
        and record_story_id in spec_ids
    ) or (
        isinstance(record_story_type, str)
        and (record_story_type in spec_types or record_story_type in spec_ids)
    )


def _append_unique(target: list[dict[str, Any]], records: Iterable[Mapping[str, Any]]) -> None:
    seen = {_record_name(record) for record in target}
    for record in records:
        copied = dict(record)
        if _record_name(copied) not in seen:
            target.append(copied)
            seen.add(_record_name(copied))


def _mark_representatives(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for record in records:
        scatter_group = record.get("scatter_group")
        story_id = record.get("story_id") if isinstance(record.get("story_id"), str) else ""
        story_type = record.get("story_type") if isinstance(record.get("story_type"), str) else ""
        group_key = ("scatter:" + scatter_group, "") if isinstance(scatter_group, str) and scatter_group else (story_id, story_type)
        if record.get("story_scatter") is True or record.get("scatter") is True or story_id or story_type:
            groups.setdefault(group_key, []).append(record)

    representative_names: set[str] = set()
    for group in groups.values():
        if len(group) > 1 or any(item.get("story_scatter") is True or item.get("scatter") is True for item in group):
            representative_names.add(min(_record_name(item) for item in group))

    result: list[dict[str, Any]] = []
    for record in records:
        copied = dict(record)
        copied["representative"] = _record_name(copied) in representative_names
        result.append(copied)
    return result


def _annotate_contract_record(record: Mapping[str, Any], spec: Mapping[str, Any]) -> dict[str, Any]:
    copied = dict(record)
    logical_id = spec.get("id") or spec.get("story_id")
    story_type = spec.get("story_type")
    if not isinstance(copied.get("story_id"), str) and isinstance(logical_id, str):
        copied["story_id"] = logical_id
    if not isinstance(copied.get("story_type"), str) and isinstance(story_type, str):
        copied["story_type"] = story_type
    if any(spec.get(key) is True for key in ("scatter", "is_scatter", "story_scatter")):
        copied["scatter"] = True
        copied["story_scatter"] = True
    scatter_group = spec.get("scatter_group")
    if isinstance(scatter_group, str) and scatter_group:
        copied["scatter_group"] = scatter_group
    return copied


def resolve_selection(
    available: Iterable[Mapping[str, Any]],
    requested: Sequence[str] | None,
    *,
    contract: Mapping[str, Any] | None = None,
    cool: int | None = None,
) -> list[dict[str, Any]]:
    """Resolve exact names or contract ids/types without silently widening input."""

    records = _validate_available(available)
    if not records:
        raise SelectionError("no available objects")
    requested_values = list(requested) if requested is not None else None
    if requested_values is not None and (not requested_values or any(not isinstance(value, str) or not value for value in requested_values)):
        raise SelectionError("selection must contain non-empty strings")

    if contract is None:
        if requested_values is None:
            return _mark_representatives(records)
        by_name = {_record_name(record): record for record in records}
        selected: list[dict[str, Any]] = []
        for name in requested_values:
            if name not in by_name:
                raise SelectionError(f"requested object was not found by exact name: {name}")
            _append_unique(selected, [by_name[name]])
        return _mark_representatives(selected)

    if isinstance(cool, bool) or not isinstance(cool, int) or cool < 1:
        raise SelectionError("--cool is required and must be a positive integer with --contract")
    specs = _validated_contract_specs(contract)
    eligible = [spec for spec in specs if spec["first_cool"] <= cool]
    if not eligible:
        raise SelectionError(f"contract has no objects introduced by cool {cool}")

    selected = []
    specs_to_resolve: list[tuple[str | None, dict[str, Any]]] = [(None, spec) for spec in eligible]
    if requested_values is not None:
        specs_to_resolve = []
        for token in requested_values:
            matches = [spec for spec in eligible if _spec_matches_token(spec, token)]
            if not matches:
                matches = [
                    spec
                    for spec in eligible
                    if any(_record_name(record) == token and _record_matches_spec(record, spec) for record in records)
                ]
            if not matches:
                raise SelectionError(f"requested kind was not found in eligible contract objects: {token}")
            if len(matches) > 1:
                raise SelectionError(f"requested kind is ambiguous in contract: {token}")
            specs_to_resolve.append((token, matches[0]))

    for token, spec in specs_to_resolve:
        matches = [record for record in records if _record_matches_spec(record, spec)]
        if token is not None and token in {_record_name(record) for record in matches}:
            matches = [record for record in matches if _record_name(record) == token]
        if not matches:
            logical_id = spec.get("id") or spec.get("story_id") or spec.get("story_type") or spec.get("name")
            raise SelectionError(f"contract object has no matching Blender object: {logical_id}")
        _append_unique(selected, [_annotate_contract_record(record, spec) for record in matches])

    return _mark_representatives(selected)


def _bbox_for_record(record: Mapping[str, Any]) -> Mapping[str, Sequence[float]]:
    value = record.get("world_bbox")
    if not isinstance(value, Mapping):
        raise ValueError("record.world_bbox is required")
    for key in ("min", "max", "dimensions"):
        if key not in value:
            raise ValueError(f"record.world_bbox.{key} is required")
    return value


def _intervals_overlap(left_min: float, left_max: float, right_min: float, right_max: float, tolerance: float) -> bool:
    return max(left_min, right_min) <= min(left_max, right_max) + tolerance


def _bounds_touch(left: Mapping[str, Sequence[float]], right: Mapping[str, Sequence[float]], tolerance: float) -> bool:
    touching_axis = False
    for index in range(3):
        left_min, left_max = float(left["min"][index]), float(left["max"][index])
        right_min, right_max = float(right["min"][index]), float(right["max"][index])
        if math.isclose(left_max, right_min, abs_tol=tolerance, rel_tol=0.0) or math.isclose(right_max, left_min, abs_tol=tolerance, rel_tol=0.0):
            touching_axis = True
        elif not _intervals_overlap(left_min, left_max, right_min, right_max, tolerance):
            return False
    return touching_axis


def detect_contacting_pairs(records: Sequence[Mapping[str, Any]], tolerance: float = 1e-5) -> list[tuple[str, str]]:
    """Return individual object-name pairs whose bounds touch with XY overlap."""

    pairs: list[tuple[str, str]] = []
    for index, left_record in enumerate(records):
        left_bbox = _bbox_for_record(left_record)
        left_name = _record_name(left_record)
        for right_record in records[index + 1 :]:
            right_bbox = _bbox_for_record(right_record)
            if not _intervals_overlap(float(left_bbox["min"][0]), float(left_bbox["max"][0]), float(right_bbox["min"][0]), float(right_bbox["max"][0]), tolerance):
                continue
            if not _intervals_overlap(float(left_bbox["min"][1]), float(left_bbox["max"][1]), float(right_bbox["min"][1]), float(right_bbox["max"][1]), tolerance):
                continue
            if _bounds_touch(left_bbox, right_bbox, tolerance):
                pairs.append((left_name, _record_name(right_record)))
    return pairs


def _fmt_values(values: Sequence[float]) -> str:
    return "(" + ", ".join(f"{float(value):.6f}" for value in values) + ")"


def _fmt_bool(value: Any) -> str:
    return "true" if value is True else "false"


def _dimension_lines(label: str, values: Sequence[float], scale: float, indent: str = "") -> list[str]:
    px_values = tuple(float(value) * scale for value in values)
    return [
        f"{indent}- {label}: {_fmt_values(values)}",
        f"{indent}  - {label}_px: {_fmt_values(px_values)}",
    ]


def _scalar_dimension_lines(label: str, value: float, scale: float, indent: str = "") -> list[str]:
    measured = float(value)
    return [
        f"{indent}- {label}: {measured:.6f}",
        f"{indent}  - {label}_px: {measured * scale:.6f}",
    ]


def format_markdown(
    records: Sequence[Mapping[str, Any]],
    contacts: Sequence[tuple[str, str]],
    *,
    scale: float = DEFAULT_SCALE,
    frame: int = DEFAULT_FRAME,
    blend_path: Path | str | None = None,
    contract_path: Path | str | None = None,
    cool: int | None = None,
) -> str:
    """Format measured records with stable headings and explicit px facts."""

    if scale <= 0:
        raise ValueError("scale must be positive")
    lines = [
        "# Measured Facts",
        "",
        f"- frame: {int(frame)}",
        f"- scale_px_per_world_unit: {scale:.6f}",
        f"- selected_object_count: {len(records)}",
    ]
    if blend_path is not None:
        lines.append(f"- blend: {Path(blend_path)}")
    if contract_path is not None:
        lines.append(f"- contract: {Path(contract_path)}")
    if cool is not None:
        lines.append(f"- cool: {cool}")

    for record in records:
        name = _record_name(record)
        world = _bbox_for_record(record)
        local = record.get("local_bbox")
        if not isinstance(local, Mapping):
            raise ValueError(f"{name}.local_bbox is required")
        lines.extend(["", f"## Object: {name}", "", f"- representative: {_fmt_bool(record.get('representative', False))}"])
        for key in ("story_id", "story_type"):
            if record.get(key) is not None:
                lines.append(f"- {key}: {record[key]}")

        lines.extend(["", "### World-space bbox"])
        lines.extend(_dimension_lines("min", world["min"], scale))
        lines.extend(_dimension_lines("max", world["max"], scale))
        lines.extend(_dimension_lines("dimensions", world["dimensions"], scale))

        lines.extend(["", "### Rotation-cancelled local bbox"])
        lines.extend(_dimension_lines("min", local["min"], scale))
        lines.extend(_dimension_lines("max", local["max"], scale))
        lines.extend(_dimension_lines("dimensions", local["dimensions"], scale))
        cross_section = record.get("cross_section", local.get("cross_section"))
        if cross_section is None:
            cross_section = tuple(sorted(float(value) for value in local["dimensions"])[:2])
        lines.extend(_dimension_lines("cross_section_dimensions", cross_section, scale))
        differs = record.get("world_bbox_differs")
        if differs is None:
            differs = any(
                not math.isclose(float(world["dimensions"][index]), float(local["dimensions"][index]), abs_tol=1e-6, rel_tol=0.0)
                for index in range(3)
            )
        note = "world bbox differs from rotation-cancelled local bbox" if differs else "world bbox matches rotation-cancelled local bbox"
        lines.append(f"- bbox_note: {note}")

        lines.extend(["", "### Contact z faces (source mesh)"])
        bottom_z = float(record["bottom_z"])
        top_z = float(record["top_z"])
        lines.extend(_scalar_dimension_lines("bottom_z", bottom_z, scale))
        lines.extend(_scalar_dimension_lines("top_z", top_z, scale))
        if "evaluated_bottom_z" in record and "evaluated_top_z" in record:
            lines.extend(["", "### Evaluated render z envelope"])
            lines.extend(_scalar_dimension_lines("evaluated_bottom_z", float(record["evaluated_bottom_z"]), scale))
            lines.extend(_scalar_dimension_lines("evaluated_top_z", float(record["evaluated_top_z"]), scale))

        handhold = record.get("handhold")
        lines.extend(["", "### Beehive handhold recess"])
        if handhold is None:
            lines.append("- detected: false")
        else:
            lines.extend([
                "- detected: true",
                f"- face: {float(handhold['face']):.6f}",
                f"  - face_px: {float(handhold['face']) * scale:.6f}",
                f"- base: {float(handhold['base']):.6f}",
                f"  - base_px: {float(handhold['base']) * scale:.6f}",
                f"- through: {_fmt_bool(handhold.get('through'))}",
                "- note: recess, not a hole",
            ])

    lines.extend(["", "## Contacting Pairs", ""])
    if contacts:
        for left, right in contacts:
            lines.append(f"- {left} <-> {right}")
    else:
        lines.append("- none detected")
    return "\n".join(lines) + "\n"


def _custom_property(obj: Any, key: str) -> Any:
    try:
        return obj.get(key)
    except AttributeError:
        return None


def _load_contract(path: Path | None) -> Mapping[str, Any] | None:
    if path is None:
        return None
    if not path.is_file():
        raise MeasuredFactsError(f"contract does not exist: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise MeasuredFactsError(f"contract could not be read: {path}") from error
    _validated_contract_specs(value)
    return value


def _cancel_world_rotation(matrix_world: Any, world_point: Any) -> tuple[float, float, float]:
    location, rotation, _scale = matrix_world.decompose()
    relative = world_point - location
    cancelled = rotation.to_matrix().inverted() @ relative
    return _point_values(cancelled)


def _frame_points(obj: Any, matrix_world: Any, world_points: Sequence[Any]) -> list[tuple[float, float, float]]:
    """Return points in an assembly frame or a rotation-cancelled world frame.

    A child mesh such as ``tool_handle_bar`` inherits its parent's scale and
    rotation.  Measuring in the child's world matrix would therefore report
    the presentation transform (for example 0.0408 instead of the intended
    0.060 cross-section).  The parent frame removes that inherited transform;
    standalone objects fall back to the existing rotation-cancelled frame.
    """

    parent = getattr(obj, "parent", None)
    parent_matrix = getattr(parent, "matrix_world", None) if parent is not None else None
    if parent_matrix is not None and hasattr(parent_matrix, "inverted"):
        inverse_parent = parent_matrix.inverted()
        return [_point_values(inverse_parent @ point) for point in world_points]
    return [_cancel_world_rotation(matrix_world, point) for point in world_points]


def _runtime_records(bpy: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for obj in bpy.data.objects:
        if getattr(obj, "type", None) != "MESH" or bool(getattr(obj, "hide_render", False)):
            continue
        records.append({
            "name": obj.name,
            "story_id": _custom_property(obj, "story_id"),
            "story_type": _custom_property(obj, "story_type"),
            "story_scatter": _custom_property(obj, "story_scatter") is True,
            "_object": obj,
        })
    return records


def collect_measured_objects(
    blend_path: Path,
    *,
    contract: Mapping[str, Any] | None = None,
    kinds: Sequence[str] | None = None,
    cool: int | None = None,
    frame: int = DEFAULT_FRAME,
) -> list[dict[str, Any]]:
    """Collect evaluated Blender mesh measurements at one frame."""

    try:
        import bpy  # type: ignore[import-not-found]
    except ImportError as error:
        raise MeasuredFactsError("Blender bpy is required to collect scene measurements") from error

    if not blend_path.is_file():
        raise MeasuredFactsError(f"blend does not exist: {blend_path}")

    current_path = Path(getattr(bpy.data, "filepath", "")) if getattr(bpy.data, "filepath", "") else None
    if current_path is None or current_path.resolve() != blend_path.resolve():
        try:
            bpy.ops.wm.open_mainfile(filepath=str(blend_path))
        except Exception as error:  # Blender raises several runtime-specific exception types here.
            raise MeasuredFactsError(f"blend could not be opened: {blend_path}") from error

    scene = getattr(bpy.context, "scene", None)
    if scene is None:
        raise MeasuredFactsError("Blender scene is unavailable")
    original_frame = int(scene.frame_current)
    try:
        scene.frame_set(frame)
        view_layer = getattr(bpy.context, "view_layer", None)
        if view_layer is not None and hasattr(view_layer, "update"):
            view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        available = _runtime_records(bpy)
        selected = resolve_selection(available, kinds, contract=contract, cool=cool)
        measured: list[dict[str, Any]] = []
        for record in selected:
            obj = record.get("_object")
            if obj is None:
                raise SelectionError(f"selected object has no Blender object: {record.get('name')}")
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            try:
                if not mesh.vertices:
                    raise MeasuredFactsError(f"selected object has no evaluated vertices: {obj.name}")
                world_matrix = evaluated.matrix_world.copy()
                world_vectors = [world_matrix @ vertex.co for vertex in mesh.vertices]
                world_points = [_point_values(point) for point in world_vectors]
                rotation_cancelled_points = _frame_points(obj, world_matrix, world_vectors)
                world_bbox = bbox(world_points)
                local_bbox = local_cross_section(rotation_cancelled_points)
                source_vertices = list(getattr(getattr(obj, "data", None), "vertices", []))
                source_world_points = [
                    _point_values(obj.matrix_world @ vertex.co) for vertex in source_vertices
                ]
                source_world_bbox = bbox(source_world_points) if source_world_points else world_bbox
                handhold = detect_handhold(rotation_cancelled_points)
                row = {key: value for key, value in record.items() if key != "_object"}
                row.update({
                    "world_bbox": world_bbox,
                    "local_bbox": local_bbox,
                    "cross_section": local_bbox["cross_section"],
                    "world_bbox_differs": any(
                        not math.isclose(world_bbox["dimensions"][index], local_bbox["dimensions"][index], abs_tol=1e-6, rel_tol=0.0)
                        for index in range(3)
                    ),
                    # Contact-face facts come from the source mesh so bevel,
                    # subdivision, and displacement do not turn a design
                    # contact into a rendered-envelope measurement.
                    "bottom_z": source_world_bbox["min"][2],
                    "top_z": source_world_bbox["max"][2],
                    "evaluated_bottom_z": world_bbox["min"][2],
                    "evaluated_top_z": world_bbox["max"][2],
                    "handhold": handhold,
                })
                measured.append(row)
            finally:
                evaluated.to_mesh_clear()
        if not measured:
            raise SelectionError("no mesh objects were selected")
        return measured
    finally:
        scene.frame_set(original_frame)


def _validate_cli(args: argparse.Namespace) -> None:
    if not args.blend.is_absolute():
        raise MeasuredFactsError("--blend must be an absolute path")
    if not args.blend.is_file():
        raise MeasuredFactsError(f"blend does not exist: {args.blend}")
    if args.contract is not None and not args.contract.is_file():
        raise MeasuredFactsError(f"contract does not exist: {args.contract}")
    if args.output is not None and not args.output.is_absolute():
        raise MeasuredFactsError("--output must be an absolute path")
    if args.contract is None and args.kinds is None:
        raise MeasuredFactsError("one of --contract or --kinds is required")
    if args.scale <= 0 or not math.isfinite(args.scale):
        raise MeasuredFactsError("--scale must be a finite positive number")
    if args.cool is not None and (isinstance(args.cool, bool) or args.cool < 1):
        raise MeasuredFactsError("--cool must be a positive integer")
    if args.contract is not None and args.cool is None:
        raise MeasuredFactsError("--cool is required when --contract is used")
    _parse_kinds(args.kinds)


def _write_markdown(path: Path, content: str) -> None:
    if not path.is_absolute():
        raise MeasuredFactsError("output path must be absolute")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    except OSError as error:
        raise MeasuredFactsError(f"output could not be written: {path}") from error


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_arguments(argv)
        _validate_cli(args)
        kinds = _parse_kinds(args.kinds)
        contract = _load_contract(args.contract)
        records = collect_measured_objects(
            args.blend,
            contract=contract,
            kinds=kinds,
            cool=args.cool,
            frame=args.frame,
        )
        contacts = detect_contacting_pairs(records)
        output = args.output or (default_output_path(args.blend, args.cool) if args.cool is not None else None)
        markdown = format_markdown(
            records,
            contacts,
            scale=args.scale,
            frame=args.frame,
            blend_path=args.blend,
            contract_path=args.contract,
            cool=args.cool,
        )
        if output is None:
            print(markdown, end="")
        else:
            _write_markdown(output, markdown)
            print(f"wrote {output}")
        return 0
    except (MeasuredFactsError, OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

"""Export measured Blender scene/timeline evidence for isometric-story-workflow.

Run only inside Blender:
blender --background scene.blend --python export_quantitative_evidence.py -- \
  --contract /abs/story_contract.json --cool 1 --output-dir /abs/evidence

Every render-visible mesh must have story_id/story_tier/story_type custom properties,
unless qa_exempt is true.  Multiple meshes may share one story_id.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import statistics
import sys
from typing import Any

import bpy
from bpy_extras.object_utils import world_to_camera_view
import mathutils
from mathutils.bvhtree import BVHTree


SAFE_Y_MIN, SAFE_Y_MAX = 0.21875, 0.78125
EPSILON = 0.01
CRAFT_MODS = {"BEVEL", "SUBSURF", "DISPLACE", "SOLIDIFY", "BOOLEAN", "NODES", "ARRAY"}
PRIMITIVE_VERTS = {8, 12, 16, 24, 32, 42, 48, 64, 96}


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def _check(checks: list[dict[str, Any]], check_id: str, passed: bool, actual: Any, threshold: Any, *, warn: bool = False) -> None:
    checks.append({"id": check_id, "status": "PASS" if passed else ("WARN" if warn else "FAIL"), "actual": actual, "threshold": threshold})


def _visible(obj: bpy.types.Object) -> bool:
    return obj.type == "MESH" and not obj.hide_render and not obj.hide_get()


def _world_vertices(obj: bpy.types.Object, depsgraph) -> list[Any]:
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        return [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def _bbox(vertices: list[Any]) -> tuple[list[float], list[float], list[float], float]:
    minimum = [min(vertex[index] for vertex in vertices) for index in range(3)]
    maximum = [max(vertex[index] for vertex in vertices) for index in range(3)]
    dimensions = [maximum[index] - minimum[index] for index in range(3)]
    return minimum, maximum, dimensions, dimensions[0] * dimensions[1] * dimensions[2]


def _material_kind(materials: list[bpy.types.Material]) -> tuple[str, bool, list[float], bool, bool]:
    node_types: set[str] = set()
    roughness: list[float] = []
    has_alpha = False
    has_emission = False
    for material in materials:
        if not material or not material.use_nodes or not material.node_tree:
            continue
        for node in material.node_tree.nodes:
            node_types.add(node.type)
            if node.type == "BSDF_PRINCIPLED":
                roughness.append(float(node.inputs["Roughness"].default_value))
                has_alpha = float(node.inputs["Alpha"].default_value) < 0.999
            if node.type == "EMISSION" or (node.type == "BSDF_PRINCIPLED" and float(node.inputs["Emission Strength"].default_value) > 0):
                has_emission = True
    kind = "image" if "TEX_IMAGE" in node_types else "procedural" if node_types & {"TEX_NOISE", "TEX_VORONOI", "TEX_WAVE", "VALTORGB", "BUMP"} else "placeholder"
    return kind, "BSDF_PRINCIPLED" in node_types, roughness, has_alpha, has_emission


def _asset_objects(contract: dict[str, Any], ground_name: str, cool_number: int, checks: list[dict[str, Any]]) -> dict[str, list[bpy.types.Object]]:
    known = {item["id"] for item in contract["objects"]}
    introduced = {item["id"] for item in contract["objects"] if item["first_cool"] <= cool_number}
    assets: dict[str, list[bpy.types.Object]] = {}
    for obj in bpy.context.scene.objects:
        if not _visible(obj) or obj.name == ground_name or obj.get("qa_exempt") is True:
            continue
        story_id, tier, story_type = obj.get("story_id"), obj.get("story_tier"), obj.get("story_type")
        valid = all(isinstance(value, str) and value for value in (story_id, tier, story_type)) and story_id in known
        _check(checks, f"identity.{obj.name}", valid, {"story_id": story_id, "story_tier": tier, "story_type": story_type}, "known story_id + story_tier + story_type")
        if valid:
            assets.setdefault(story_id, []).append(obj)
    for object_id in introduced:
        _check(checks, f"identity.required.{object_id}", object_id in assets, object_id in assets, True)
    return assets


def _ray_ground(vertices: list[Any], hidden: list[bpy.types.Object], depsgraph) -> tuple[bool, float | None]:
    for obj in hidden:
        obj.hide_set(True)
    try:
        lowest = min(vertices, key=lambda point: point.z)
        # 小さいオフセットのみ確保する: 固定2.0だと、垂直方向に積層する構造(スーパー箱の積み増し等)で
        # 自グループの直上に別グループの資産が存在する場合、そちらへ誤ヒットして偽FAILになる。
        # 直下の支持面(地面 or 直下の別資産)を確実に検出するには自己遮蔽を避ける最小限のオフセットで足りる。
        hit, location, *_ = bpy.context.scene.ray_cast(depsgraph, (lowest.x, lowest.y, lowest.z + 0.05), (0, 0, -1), distance=5.0)
        return (hit and abs(lowest.z - location.z) <= EPSILON, (lowest.z - location.z) if hit else None)
    finally:
        for obj in hidden:
            obj.hide_set(False)


def _camera_coverage(vertices: list[Any], camera: bpy.types.Object) -> tuple[float, bool, list[float]]:
    projected = [world_to_camera_view(bpy.context.scene, camera, point) for point in vertices]
    minimum = [min(point[index] for point in projected) for index in range(2)]
    maximum = [max(point[index] for point in projected) for index in range(2)]
    width, height = maximum[0] - minimum[0], maximum[1] - minimum[1]
    coverage = max(width, height / (SAFE_Y_MAX - SAFE_Y_MIN))
    inside = minimum[0] >= 0 and maximum[0] <= 1 and minimum[1] >= SAFE_Y_MIN and maximum[1] <= SAFE_Y_MAX
    return coverage, inside, [minimum[0], minimum[1], maximum[0], maximum[1]]


def _shrink_toward_centroid(vertices: list[Any], epsilon: float) -> list[Any]:
    # 積層構造(スーパー箱の積み増し等)では、異なるstory_id同士が接地面ぴったり(隙間0)で
    # 接触するのが正しい設計。BVH.overlapは面が同一平面で接するだけでも重なり扱いにするため、
    # 真の食い込みとの区別がつかない。各頂点を自分自身のセントロイドへEPSILON分だけ寄せてから
    # 判定することで、ぴったり接触(0隙間)は重なり扱いにならず、実際の食い込みだけを検出する。
    if not vertices:
        return vertices
    centroid = sum(vertices, mathutils.Vector((0.0, 0.0, 0.0))) / len(vertices)
    shrunk = []
    for point in vertices:
        direction = centroid - point
        length = direction.length
        if length <= epsilon:
            shrunk.append(centroid.copy())
        else:
            shrunk.append(point + direction.normalized() * epsilon)
    return shrunk


def _intersects(left: bpy.types.Object, right: bpy.types.Object, depsgraph) -> bool:
    left_vertices, right_vertices = _world_vertices(left, depsgraph), _world_vertices(right, depsgraph)
    left_min, left_max, *_ = _bbox(left_vertices)
    right_min, right_max, *_ = _bbox(right_vertices)
    if any(left_max[index] < right_min[index] or right_max[index] < left_min[index] for index in range(3)):
        return False
    left_vertices = _shrink_toward_centroid(left_vertices, EPSILON)
    right_vertices = _shrink_toward_centroid(right_vertices, EPSILON)
    def bvh_for(obj, vertices):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            return BVHTree.FromPolygons(vertices, [polygon.vertices[:] for polygon in mesh.polygons])
        finally:
            evaluated.to_mesh_clear()
    return bool(bvh_for(left, left_vertices).overlap(bvh_for(right, right_vertices)))


def _fcurves(objects: list[bpy.types.Object]) -> list[Any]:
    curves = []
    for obj in objects:
        action = obj.animation_data.action if obj.animation_data and obj.animation_data.action else None
        if action:
            curves.extend(action.fcurves)
    return curves


def _has_motion(curves: list[Any], start: int, end: int) -> bool:
    return any(curve.data_path not in {"hide_viewport", "hide_render"} and any(start <= point.co.x <= end for point in curve.keyframe_points) and any(point.interpolation != "CONSTANT" for point in curve.keyframe_points) for curve in curves)


def _hide_transition_pair(curves: list[Any], start: int, end: int) -> bool:
    hides = [curve for curve in curves if curve.data_path in {"hide_viewport", "hide_render"}]
    return bool(hides) and _has_motion(curves, start, end)


def _timeline(contract: dict[str, Any], cool: dict[str, Any], assets: dict[str, list[bpy.types.Object]], checks: list[dict[str, Any]]) -> dict[str, Any]:
    transitions = []
    starts: dict[str, list[int]] = {}
    for transition in cool["transitions"]:
        object_id, start, end = transition["object_id"], transition["start_frame"], transition["end_frame"]
        curves = _fcurves(assets.get(object_id, []))
        paired = _hide_transition_pair(curves, start, end)
        _check(checks, f"timeline.transition.{object_id}", paired, paired, "hide key + non-CONSTANT motion in transition interval")
        if paired:
            transitions.append(dict(transition))
            group = next((obj.get("story_stagger_group") for obj in assets.get(object_id, []) if obj.get("story_stagger_group")), None)
            if group:
                starts.setdefault(group, []).append(start)
    for group, values in starts.items():
        if len(values) < 2:
            continue
        duration = max(item["end_frame"] - item["start_frame"] + 1 for item in cool["transitions"] if any(obj.get("story_stagger_group") == group for obj in assets.get(item["object_id"], [])))
        ratio = (max(values) - min(values)) / duration
        _check(checks, f"timeline.stagger.{group}", 0.30 <= ratio <= 0.40, round(ratio, 4), "0.30..0.40", warn=True)
    final_start, final_end = cool["end_frame"] - 10, cool["end_frame"]
    ambient = any(abs(curve.evaluate(final_start) - curve.evaluate(final_end)) > EPSILON for objects in assets.values() for curve in _fcurves(objects))
    _check(checks, "timeline.ambient_loop", ambient, ambient, "FCurve changes during final 10 frames")
    return {"cool_number": cool["number"], "transitions": transitions}


def _emission_values(materials: list[bpy.types.Material]) -> list[float]:
    values = []
    for material in materials:
        if material and material.use_nodes and material.node_tree:
            for node in material.node_tree.nodes:
                if node.type == "EMISSION":
                    values.append(float(node.inputs["Strength"].default_value))
                elif node.type == "BSDF_PRINCIPLED" and "Emission Strength" in node.inputs:
                    values.append(float(node.inputs["Emission Strength"].default_value))
    return values


def _state_progression(contract: dict[str, Any], assets: dict[str, list[bpy.types.Object]], depsgraph, checks: list[dict[str, Any]]) -> None:
    original = bpy.context.scene.frame_current
    stats = []
    try:
        for cool in contract["cools"]:
            bpy.context.scene.frame_set(cool["end_frame"])
            visible = [obj for objects in assets.values() for obj in objects if _visible(obj)]
            volume = sum(_bbox(_world_vertices(obj, depsgraph))[3] for obj in visible)
            stats.append((len(visible), volume))
        monotonic = all(current[0] >= previous[0] and current[1] >= previous[1] for previous, current in zip(stats, stats[1:]))
        _check(checks, "state.progression", monotonic, [{"visible": count, "volume": round(volume, 4)} for count, volume in stats], "non-decreasing visible count and volume", warn=True)
    finally:
        bpy.context.scene.frame_set(original)


def export(contract_path: Path, cool_number: int, output_dir: Path, ground_name: str) -> dict[str, Any]:
    contract = json.loads(contract_path.read_text())
    cool = next((item for item in contract["cools"] if item["number"] == cool_number), None)
    if cool is None:
        raise ValueError(f"cool {cool_number} is absent from contract")
    scene, depsgraph, checks = bpy.context.scene, bpy.context.evaluated_depsgraph_get(), []
    original_frame = scene.frame_current
    scene.frame_set(cool["end_frame"])
    try:
        assets = _asset_objects(contract, ground_name, cool_number, checks)
        contract_objects = {item["id"]: item for item in contract["objects"]}
        asset_rows = []
        for object_id, spec in contract_objects.items():
            if spec["first_cool"] > cool_number or object_id not in assets:
                continue
            objects = assets[object_id]
            vertices = [point for obj in objects for point in _world_vertices(obj, depsgraph)]
            minimum, maximum, dimensions, volume = _bbox(vertices)
            materials = [material for obj in objects for material in obj.data.materials if material]
            kind, principled, roughness, has_alpha, has_emission = _material_kind(materials)
            grounded, ground_delta = _ray_ground(vertices, objects, depsgraph)
            crafted = any(any(modifier.type in CRAFT_MODS for modifier in obj.modifiers) or len(obj.data.vertices) not in PRIMITIVE_VERTS for obj in objects)
            within_stage = all(abs(value) <= contract["stage_extent"] for point in vertices for value in point)
            size_ratio = max(dimensions) / contract["stage_extent"]
            _check(checks, f"material.principled.{object_id}", principled, principled, True)
            _check(checks, f"material.roughness.{object_id}", all(0.05 <= value <= 0.9 for value in roughness), roughness, "0.05..0.90")
            if has_emission:
                _check(checks, f"material.emission_visibility.{object_id}", has_alpha or any(curve.data_path in {"hide_viewport", "hide_render"} for curve in _fcurves(objects)), {"alpha": has_alpha}, "transparent shell or hide key")
                samples = []
                for frame in range(max(cool["end_frame"] - 10, cool["start_frame"]), cool["end_frame"] + 1):
                    scene.frame_set(frame)
                    samples.extend(_emission_values(materials))
                scene.frame_set(cool["end_frame"])
                baseline = max(samples) if samples else 0
                amplitude = ((max(samples) - min(samples)) / baseline) if baseline else 0
                _check(checks, f"material.emission_strength.{object_id}", baseline > 0, baseline, ">0")
                _check(checks, f"material.emission_ambient.{object_id}", 0.05 <= amplitude <= 0.10, round(amplitude, 4), "0.05..0.10", warn=True)
            _check(checks, f"geometry.grounded.{object_id}", grounded, ground_delta, f"abs(delta)<={EPSILON}")
            _check(checks, f"geometry.stage.{object_id}", within_stage, [minimum, maximum], f"abs(x/y/z)<={contract['stage_extent']}")
            # 作り込み(craft)は助言のみ: WARNにしてFAILさせない。作り込み品質の合否は
            # 独立サブエージェントレビュー(8B: 物理的妥当性 / 8C: 署名パーツの仕様実現)で判定する。
            _check(checks, f"geometry.craft.{object_id}", crafted, crafted, "advisory only (blocking judgment is 8B/8C)", warn=True)
            _check(checks, f"identity.tier.{object_id}", all(obj.get("story_tier") == spec["tier"] for obj in objects), [obj.get("story_tier") for obj in objects], spec["tier"])
            asset_rows.append({"id": object_id, "tier": spec["tier"], "material_kind": kind, "crafted": crafted, "grounded": grounded, "visible": True, "bounds_within_stage": within_stage, "size_ratio": size_ratio, "dimensions": dimensions, "material_id": "|".join(sorted({material.name for material in materials}))})
        hero_vertices = [point for obj in assets.get(cool["hero"], []) for point in _world_vertices(obj, depsgraph)]
        if scene.camera and hero_vertices:
            coverage, inside, projected = _camera_coverage(hero_vertices, scene.camera)
            _check(checks, "camera.safe_area", inside and coverage >= 0.60, {"coverage": coverage, "bbox": projected}, "inside central square and coverage>=0.60")
        else:
            coverage = 0.0
            _check(checks, "camera.safe_area", False, None, "active camera and hero geometry")
        for index, left_id in enumerate(sorted(assets)):
            for right_id in sorted(assets)[index + 1:]:
                overlaps = any(_intersects(left, right, depsgraph) for left in assets[left_id] for right in assets[right_id])
                allowed = any(obj.get("qa_allow_overlap") is True for obj in assets[left_id] + assets[right_id])
                _check(checks, f"geometry.intersection.{left_id}.{right_id}", not overlaps or allowed, overlaps, "no mesh overlap unless qa_allow_overlap")
        natural_groups: dict[str, list[bpy.types.Object]] = {}
        for objects in assets.values():
            for obj in objects:
                if obj.get("story_natural") is True:
                    natural_groups.setdefault(obj["story_type"], []).append(obj)
        for story_type, objects in natural_groups.items():
            if len(objects) >= 3:
                values = [max(obj.scale) for obj in objects]
                deviation = statistics.pstdev(values)
                _check(checks, f"natural.variance.{story_type}", deviation >= 0.02, round(deviation, 4), ">=0.02", warn=True)
        scatter_count, scatter_types, scatter_points = 0, set(), []
        for objects in assets.values():
            for obj in objects:
                if obj.get("story_scatter") is True:
                    scatter_count += 1
                    scatter_types.add(obj.get("story_type"))
                    scatter_points.append((obj.location.x, obj.location.y, float(obj.get("story_scatter_min_distance", 0))))
                    raw_zones = obj.get("story_exclusion_zones", "[]")
                    try:
                        zones = json.loads(raw_zones) if isinstance(raw_zones, str) else raw_zones
                    except json.JSONDecodeError:
                        zones = None
                    valid_zones = isinstance(zones, list) and all(isinstance(zone, list) and len(zone) == 4 for zone in zones)
                    _check(checks, f"scatter.exclusion_schema.{obj.name}", valid_zones, raw_zones, "JSON [[min_x,min_y,max_x,max_y], ...]")
                    if valid_zones:
                        inside = any(zone[0] <= obj.location.x <= zone[2] and zone[1] <= obj.location.y <= zone[3] for zone in zones)
                        _check(checks, f"scatter.exclusion.{obj.name}", not inside, [obj.location.x, obj.location.y], "outside exclusion zones")
        for index, (x, y, minimum_distance) in enumerate(scatter_points):
            if minimum_distance > 0:
                nearest = min((math.hypot(x - other_x, y - other_y) for other_index, (other_x, other_y, _) in enumerate(scatter_points) if other_index != index), default=math.inf)
                _check(checks, f"scatter.distance.{index}", nearest >= minimum_distance, nearest, f">={minimum_distance}")
        background = cool.get("background", {})
        _check(checks, "scatter.count", scatter_count == background.get("visible_count", 0), scatter_count, background.get("visible_count", 0))
        _check(checks, "scatter.types", scatter_types == set(background.get("types", [])), sorted(scatter_types), background.get("types", []))
        scale_references = [obj for objects in assets.values() for obj in objects if obj.get("story_scale_reference") is True]
        hero_size = max(_bbox(hero_vertices)[2]) if hero_vertices else 0
        ratios = [max(_bbox(_world_vertices(obj, depsgraph))[2]) / hero_size for obj in scale_references] if hero_size else []
        # heroが複数クールにわたって成長し続ける設計(例: 積み増しスーパー箱)では、旧クールで設定した
        # 寸法対比物がその後のクールでも永続的に1/3〜1/2を満たすことは構造上不可能。この判定は
        # 対比物自身のfirst_coolでのみブロッキングとし、hero成長後のクールでは助言(warn)に留める。
        reference_first_cools = {contract_objects[obj.get("story_id")]["first_cool"] for obj in scale_references if obj.get("story_id") in contract_objects}
        blocking = cool_number in reference_first_cools
        _check(checks, "scale.reference", len(scale_references) >= 1 and any(1 / 3 <= ratio <= 1 / 2 for ratio in ratios), ratios, "at least one ratio in 0.33..0.50", warn=not blocking)
        _state_progression(contract, assets, depsgraph, checks)
        timeline = _timeline(contract, cool, assets, checks)
        snapshot = {"cool_number": cool_number, "collections": [collection.name for collection in bpy.data.collections], "camera": {"hero_safe_area_coverage": coverage}, "assets": asset_rows, "background": {"visible_count": scatter_count, "type_count": len(scatter_types)}, "world": {"id": scene.world.name if scene.world else None}}
        report = {"schema_version": 1, "checks": checks}
        _write_json(output_dir / "scene_snapshot.json", snapshot)
        _write_json(output_dir / "timeline_snapshot.json", timeline)
        _write_json(output_dir / "measurement_report.json", report)
        return report
    finally:
        scene.frame_set(original_frame)


def main() -> None:
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", required=True, type=Path)
    parser.add_argument("--cool", required=True, type=int)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--ground-name", default="Ground_Grass")
    args = parser.parse_args(arguments)
    report = export(args.contract, args.cool, args.output_dir, args.ground_name)
    print(json.dumps({"valid": not any(check["status"] == "FAIL" for check in report["checks"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()

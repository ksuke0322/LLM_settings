#!/usr/bin/env python3
"""Check whether signature parts are large enough to read at render scale."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys
from typing import Any


DEFAULT_SCALE = 332.3
DEFAULT_THRESHOLDS = {"silhouette": 12, "contrast": 6}
VISUALIZATION_KINDS = frozenset(DEFAULT_THRESHOLDS)


class ContractError(Exception):
    """A schema error that should be reported as a JSON failure."""

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def _is_finite_number(value: Any) -> bool:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(float(value))
    except (OverflowError, ValueError):
        return False


def _parse_option_number(value: Any, name: str, *, allow_zero: bool = False) -> float:
    try:
        number = float(value)
    except (OverflowError, TypeError, ValueError):
        raise ContractError([f"{name} must be a finite number"]) from None
    if not math.isfinite(number) or (number < 0 if allow_zero else number <= 0):
        requirement = "non-negative" if allow_zero else "positive"
        raise ContractError([f"{name} must be a finite {requirement} number"])
    return number


def _require_mapping(value: Any, location: str, errors: list[str]) -> bool:
    if not isinstance(value, dict):
        errors.append(f"{location} must be an object")
        return False
    return True


def _validate_part(part: Any, location: str, object_label: str, errors: list[str], output: list[dict[str, Any]]) -> None:
    if not _require_mapping(part, location, errors):
        return

    missing = [key for key in ("name", "visualization", "dominant_dimension") if key not in part]
    if missing:
        errors.append(f"{location} is missing required field(s): {', '.join(missing)}")
        return

    name = part["name"]
    if not isinstance(name, str) or not name.strip():
        errors.append(f"{location}.name must be a non-empty string")
        return

    visualization = part["visualization"]
    if not isinstance(visualization, str) or visualization not in VISUALIZATION_KINDS:
        errors.append(
            f"{location}.visualization must be one of: {', '.join(sorted(VISUALIZATION_KINDS))}"
        )
        return

    dominant_dimension = part["dominant_dimension"]
    if not _is_finite_number(dominant_dimension) or dominant_dimension <= 0:
        errors.append(f"{location}.dominant_dimension must be a positive number")
        return

    contrast_edges = 1
    if "contrast_edges" in part:
        if visualization != "contrast":
            errors.append(f"{location}.contrast_edges is only valid for contrast parts")
            return
        candidate = part["contrast_edges"]
        if isinstance(candidate, bool) or not isinstance(candidate, int) or candidate < 1:
            errors.append(f"{location}.contrast_edges must be a positive integer")
            return
        contrast_edges = candidate

    normalized = {
        "object": object_label,
        "part": name,
        "visualization": visualization,
        "dominant_dimension": dominant_dimension,
    }
    if contrast_edges != 1:
        normalized["contrast_edges"] = contrast_edges
    output.append(normalized)


def _extract_signature_parts(contract: Any) -> list[dict[str, Any]]:
    if not isinstance(contract, dict):
        raise ContractError(["story_contract must be an object"])

    errors: list[str] = []
    parts: list[dict[str, Any]] = []

    if "objects" in contract:
        objects = contract["objects"]
        if not isinstance(objects, list) or not objects:
            raise ContractError(["story_contract.objects must contain at least one object"])

        for object_index, obj in enumerate(objects):
            location = f"objects[{object_index}]"
            if not _require_mapping(obj, location, errors):
                continue

            object_label = obj.get("id", obj.get("name"))
            if not isinstance(object_label, str) or not object_label.strip():
                errors.append(f"{location}.id or .name must be a non-empty string")
                continue

            if "signature_parts" not in obj:
                errors.append(f"{location}.signature_parts is required")
                continue
            signature_parts = obj["signature_parts"]
            if not isinstance(signature_parts, list) or not signature_parts:
                errors.append(f"{location}.signature_parts must contain at least one part")
                continue

            for part_index, part in enumerate(signature_parts):
                _validate_part(
                    part,
                    f"{location}.signature_parts[{part_index}]",
                    object_label,
                    errors,
                    parts,
                )
    elif "signature_parts" in contract:
        signature_parts = contract["signature_parts"]
        if not isinstance(signature_parts, list) or not signature_parts:
            raise ContractError(["story_contract.signature_parts must contain at least one part"])

        for part_index, part in enumerate(signature_parts):
            _validate_part(
                part,
                f"signature_parts[{part_index}]",
                "top-level",
                errors,
                parts,
            )
    else:
        raise ContractError(["story_contract must contain objects[].signature_parts[] or signature_parts[]"])

    if errors:
        raise ContractError(errors)
    if not parts:
        raise ContractError(["story_contract contains no valid signature parts"])
    return parts


def _load_contract(path_value: str) -> Any:
    try:
        content = Path(path_value).read_text(encoding="utf-8")
    except (OSError, TypeError) as error:
        raise ContractError([f"unable to read contract: {error}"]) from None

    try:
        return json.loads(content)
    except json.JSONDecodeError as error:
        raise ContractError([f"contract is not valid JSON: {error.msg}"]) from None


def _base_payload(scale: Any, thresholds: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "fail",
        "scale": scale,
        "thresholds": thresholds,
        "below_threshold": [],
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--contract")
    parser.add_argument("--scale", default=DEFAULT_SCALE)
    parser.add_argument(
        "--silhouette-threshold",
        "--silhouette-threshold-px",
        dest="silhouette_threshold",
        default=DEFAULT_THRESHOLDS["silhouette"],
    )
    parser.add_argument(
        "--contrast-threshold",
        "--contrast-threshold-px",
        dest="contrast_threshold",
        default=DEFAULT_THRESHOLDS["contrast"],
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    payload = _base_payload(DEFAULT_SCALE, dict(DEFAULT_THRESHOLDS))

    try:
        args, unknown = parser.parse_known_args(argv)
        if unknown:
            raise ContractError([f"unknown argument(s): {' '.join(unknown)}"])

        scale = _parse_option_number(args.scale, "scale")
        thresholds = {
            "silhouette": _parse_option_number(
                args.silhouette_threshold,
                "silhouette threshold",
                allow_zero=True,
            ),
            "contrast": _parse_option_number(
                args.contrast_threshold,
                "contrast threshold",
                allow_zero=True,
            ),
        }
        payload = _base_payload(scale, thresholds)

        if not args.contract:
            raise ContractError(["--contract is required"])

        parts = _extract_signature_parts(_load_contract(args.contract))
        for part in parts:
            try:
                raw_pixels = part["dominant_dimension"] * scale
                edge_count = part.get("contrast_edges", 1)
                pixels = raw_pixels / edge_count if part["visualization"] == "contrast" else raw_pixels
            except (OverflowError, TypeError):
                raise ContractError(
                    [f"{part['object']}/{part['part']} pixel calculation is not finite"]
                ) from None
            if not math.isfinite(raw_pixels) or not math.isfinite(pixels):
                raise ContractError(
                    [f"{part['object']}/{part['part']} pixel calculation is not finite"]
                )
            raw_pixels = round(raw_pixels, 6)
            pixels = round(pixels, 6)
            if pixels < thresholds[part["visualization"]]:
                below = {**part, "pixels": pixels}
                if edge_count != 1:
                    below["raw_pixels"] = raw_pixels
                payload["below_threshold"].append(below)
        payload["status"] = "fail" if payload["below_threshold"] else "pass"
    except ContractError as error:
        payload["errors"] = error.errors

    print(json.dumps(payload, ensure_ascii=False))
    return 0 if payload["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())

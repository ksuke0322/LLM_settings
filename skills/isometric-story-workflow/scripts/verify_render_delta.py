#!/usr/bin/env python3
"""Verify that two PNG renders contain a meaningful pixel delta."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys
from typing import Any


DEFAULT_THRESHOLD = 0.002

try:
    from PIL import Image
except ImportError:  # pragma: no cover - exercised only without Pillow installed
    Image = None


class InputError(ValueError):
    """Raised when the comparison inputs cannot be evaluated."""


class ArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise InputError(message)


def _fraction(value: str) -> float:
    try:
        parsed = float(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("threshold must be a number") from error
    if not math.isfinite(parsed) or not 0 <= parsed <= 1:
        raise argparse.ArgumentTypeError("threshold must be between 0 and 1")
    return parsed


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="*", metavar="PNG")
    parser.add_argument("--before", type=Path)
    parser.add_argument("--after", type=Path)
    parser.add_argument("--threshold", type=_fraction, default=DEFAULT_THRESHOLD)
    parser.add_argument("--x", type=int)
    parser.add_argument("--y", type=int)
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument(
        "--region",
        nargs=4,
        type=int,
        metavar=("X", "Y", "WIDTH", "HEIGHT"),
    )
    return parser.parse_args(argv)


def _resolve_inputs(args: argparse.Namespace) -> tuple[Path, Path]:
    explicit = args.before is not None or args.after is not None
    if args.inputs and explicit:
        raise InputError("use either positional PNG inputs or --before/--after")
    if args.inputs:
        if len(args.inputs) != 2:
            raise InputError("expected exactly two positional PNG inputs: before and after")
        return Path(args.inputs[0]), Path(args.inputs[1])
    if args.before is None or args.after is None:
        raise InputError("both --before and --after PNG inputs are required")
    return args.before, args.after


def _resolve_region(args: argparse.Namespace) -> dict[str, int] | None:
    individual = (args.x, args.y, args.width, args.height)
    if args.region is not None and any(value is not None for value in individual):
        raise InputError("use either --region or --x/--y/--width/--height")
    values = args.region if args.region is not None else individual
    if all(value is None for value in values):
        return None
    if any(value is None for value in values):
        raise InputError("region requires x, y, width, and height")
    x, y, width, height = values
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        raise InputError("region x and y must be non-negative and width and height must be positive")
    return {"x": x, "y": y, "width": width, "height": height}


def _load_png(path: Path) -> Any:
    if Image is None:
        raise InputError("Pillow is required to compare PNG images")
    if not path.is_file():
        raise InputError(f"PNG input does not exist: {path}")
    try:
        with Image.open(path) as image:
            if image.format != "PNG":
                raise InputError(f"input is not a PNG image: {path}")
            image.load()
            return image.convert("RGBA")
    except InputError:
        raise
    except (OSError, ValueError) as error:
        raise InputError(f"PNG input could not be read: {path}: {error}") from error


def _validate_region(region: dict[str, int] | None, size: tuple[int, int]) -> tuple[int, int, int, int]:
    if region is None:
        return (0, 0, size[0], size[1])
    right = region["x"] + region["width"]
    bottom = region["y"] + region["height"]
    if right > size[0] or bottom > size[1]:
        raise InputError("region must fit within the image dimensions")
    return (region["x"], region["y"], right, bottom)


def compare_images(
    before_path: Path,
    after_path: Path,
    threshold: float = DEFAULT_THRESHOLD,
    region: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Return the changed-pixel ratio and pass/fail decision for two PNGs."""

    before = _load_png(before_path)
    after = _load_png(after_path)
    if before.size != after.size:
        raise InputError(
            f"images must have the same dimensions: before={before.size}, after={after.size}"
        )
    box = _validate_region(region, before.size)
    before_pixels = before.crop(box).getdata()
    after_pixels = after.crop(box).getdata()
    changed_pixels = sum(before_pixel != after_pixel for before_pixel, after_pixel in zip(before_pixels, after_pixels))
    region_area = (box[2] - box[0]) * (box[3] - box[1])
    changed_ratio = changed_pixels / region_area
    status = "pass" if changed_pixels > 0 and changed_ratio >= threshold else "fail"
    result: dict[str, Any] = {
        "changed_ratio": changed_ratio,
        "threshold": threshold,
        "status": status,
    }
    if region is not None:
        result["region"] = region
    return result


def _error_result(threshold: float, error: Exception, region: dict[str, int] | None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "changed_ratio": None,
        "threshold": threshold,
        "status": "fail",
        "error": str(error),
    }
    if region is not None:
        result["region"] = region
    return result


def main(argv: list[str] | None = None) -> int:
    try:
        args = _parse_args(argv)
    except InputError as error:
        result = _error_result(DEFAULT_THRESHOLD, error, None)
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 2

    region: dict[str, int] | None = None
    try:
        before_path, after_path = _resolve_inputs(args)
        region = _resolve_region(args)
        result = compare_images(before_path, after_path, args.threshold, region)
    except (InputError, OSError) as error:
        result = _error_result(args.threshold, error, region)

    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())

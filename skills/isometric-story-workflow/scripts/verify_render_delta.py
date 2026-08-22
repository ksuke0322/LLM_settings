#!/usr/bin/env python3
"""Verify that two PNG renders contain a meaningful pixel delta."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import math
from pathlib import Path
import struct
import sys
from typing import Any
import zlib


DEFAULT_THRESHOLD = 0.002
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PNG_COLOR_TYPES = {2: 3, 6: 4}


class InputError(ValueError):
    """Raised when the comparison inputs cannot be evaluated."""


@dataclass(frozen=True)
class PNGImage:
    width: int
    height: int
    pixels: tuple[tuple[tuple[int, ...], ...], ...]

    @property
    def size(self) -> tuple[int, int]:
        return self.width, self.height


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


def _paeth_predictor(left: int, above: int, upper_left: int) -> int:
    prediction = left + above - upper_left
    distances = (
        abs(prediction - left),
        abs(prediction - above),
        abs(prediction - upper_left),
    )
    return (left, above, upper_left)[distances.index(min(distances))]


def _unfilter_row(filtered: bytes, previous: bytes, bytes_per_pixel: int, filter_type: int) -> bytes:
    if filter_type not in range(5):
        raise InputError(f"unsupported PNG row filter: {filter_type}")
    row = bytearray(len(filtered))
    for index, value in enumerate(filtered):
        left = row[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
        above = previous[index] if previous else 0
        upper_left = previous[index - bytes_per_pixel] if previous and index >= bytes_per_pixel else 0
        if filter_type == 0:
            predictor = 0
        elif filter_type == 1:
            predictor = left
        elif filter_type == 2:
            predictor = above
        elif filter_type == 3:
            predictor = (left + above) // 2
        else:
            predictor = _paeth_predictor(left, above, upper_left)
        row[index] = (value + predictor) & 0xFF
    return bytes(row)


def _load_png(path: Path) -> PNGImage:
    if not path.is_file():
        raise InputError(f"PNG input does not exist: {path}")
    try:
        payload = path.read_bytes()
        if not payload.startswith(PNG_SIGNATURE):
            raise InputError(f"input is not a PNG image: {path}")
        offset = len(PNG_SIGNATURE)
        header: tuple[int, int, int, int, int, int, int] | None = None
        compressed = bytearray()
        saw_end = False
        while offset < len(payload):
            if offset + 12 > len(payload):
                raise InputError(f"PNG chunk header is truncated: {path}")
            length = struct.unpack(">I", payload[offset:offset + 4])[0]
            chunk_type = payload[offset + 4:offset + 8]
            start = offset + 8
            end = start + length
            if end + 4 > len(payload):
                raise InputError(f"PNG chunk data is truncated: {path}")
            chunk_data = payload[start:end]
            expected_crc = struct.unpack(">I", payload[end:end + 4])[0]
            actual_crc = zlib.crc32(chunk_type + chunk_data) & 0xFFFFFFFF
            if actual_crc != expected_crc:
                raise InputError(f"PNG chunk CRC mismatch: {path}")
            if chunk_type == b"IHDR":
                if header is not None or length != 13:
                    raise InputError(f"PNG has an invalid IHDR chunk: {path}")
                header = struct.unpack(">IIBBBBB", chunk_data)
            elif chunk_type == b"IDAT":
                compressed.extend(chunk_data)
            elif chunk_type == b"IEND":
                saw_end = True
                break
            offset = end + 4
        if header is None or not saw_end:
            raise InputError(f"PNG is missing IHDR or IEND: {path}")
        width, height, bit_depth, color_type, compression, filter_method, interlace = header
        if width <= 0 or height <= 0:
            raise InputError(f"PNG dimensions must be positive: {path}")
        if bit_depth != 8 or color_type not in PNG_COLOR_TYPES or compression != 0 or filter_method != 0 or interlace != 0:
            raise InputError(f"unsupported PNG format: {path}")
        channels = PNG_COLOR_TYPES[color_type]
        row_width = width * channels
        try:
            raw = zlib.decompress(bytes(compressed))
        except zlib.error as error:
            raise InputError(f"PNG image data could not be decompressed: {path}") from error
        expected_size = height * (row_width + 1)
        if len(raw) != expected_size:
            raise InputError(f"PNG image data has an invalid size: {path}")
        rows: list[tuple[tuple[int, ...], ...]] = []
        previous = b""
        offset = 0
        for _row_index in range(height):
            filter_type = raw[offset]
            row_start = offset + 1
            row_end = row_start + row_width
            decoded = _unfilter_row(raw[row_start:row_end], previous, channels, filter_type)
            rows.append(tuple(tuple(decoded[index:index + channels]) for index in range(0, row_width, channels)))
            previous = decoded
            offset = row_end
        return PNGImage(width, height, tuple(rows))
    except InputError:
        raise
    except (OSError, ValueError, struct.error) as error:
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
    changed_pixels = sum(
        before.pixels[y][x] != after.pixels[y][x]
        for y in range(box[1], box[3])
        for x in range(box[0], box[2])
    )
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
        "status": "error",
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
    if result["status"] == "pass":
        return 0
    if result["status"] == "fail":
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main())

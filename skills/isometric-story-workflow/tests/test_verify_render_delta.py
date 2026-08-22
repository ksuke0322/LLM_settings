import binascii
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib


SKILL_DIR = Path(__file__).resolve().parents[1]
SCRIPT_PATH = SKILL_DIR / "scripts" / "verify_render_delta.py"


class VerifyRenderDeltaTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    @staticmethod
    def _chunk(kind, payload):
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF)
        )

    @staticmethod
    def _paeth(left, above, upper_left):
        prediction = left + above - upper_left
        distances = (
            abs(prediction - left),
            abs(prediction - above),
            abs(prediction - upper_left),
        )
        return (left, above, upper_left)[distances.index(min(distances))]

    @classmethod
    def _filter_row(cls, row, previous, bytes_per_pixel, filter_type):
        filtered = []
        for index, value in enumerate(row):
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
            elif filter_type == 4:
                predictor = cls._paeth(left, above, upper_left)
            else:
                raise ValueError(f"unknown PNG filter: {filter_type}")
            filtered.append((value - predictor) & 0xFF)
        return bytes(filtered)

    def _write_image(self, name, size=(10, 10), changes=None, mode="RGBA", filters=None):
        width, height = size
        channels = {"RGB": 3, "RGBA": 4}[mode]
        color_type = {"RGB": 2, "RGBA": 6}[mode]
        default = (0, 0, 0, 255) if mode == "RGBA" else (0, 0, 0)
        rows = [list(default) * width for _ in range(height)]
        for (x, y), color in (changes or {}).items():
            start = x * channels
            rows[y][start:start + channels] = list(color)
        filter_types = list(filters or [0] * height)
        if len(filter_types) != height:
            raise ValueError("one filter type is required per row")
        raw = bytearray()
        previous = []
        for row, filter_type in zip(rows, filter_types):
            raw.append(filter_type)
            raw.extend(self._filter_row(row, previous, channels, filter_type))
            previous = row
        ihdr = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
        png = b"\x89PNG\r\n\x1a\n" + self._chunk(b"IHDR", ihdr)
        png += self._chunk(b"IDAT", zlib.compress(bytes(raw)))
        png += self._chunk(b"IEND", b"")
        path = self.root / name
        path.write_bytes(png)
        return path

    def _run_cli(self, *arguments):
        completed = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), *map(str, arguments)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertTrue(completed.stdout.strip(), completed.stderr)
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError as error:
            self.fail(f"CLI did not emit one JSON object: {error}: {completed.stdout!r}")
        return completed, payload

    def test_identical_images_fail_with_default_threshold(self):
        before = self._write_image("before.png")
        after = self._write_image("after.png")

        completed, payload = self._run_cli(before, after)

        self.assertEqual(1, completed.returncode)
        self.assertEqual(0.0, payload["changed_ratio"])
        self.assertEqual(0.002, payload["threshold"])
        self.assertEqual("fail", payload["status"])
        self.assertNotIn("region", payload)

    def test_changed_image_passes(self):
        before = self._write_image("before.png")
        after = self._write_image(
            "after.png",
            changes={(2, 3): (255, 255, 255, 255)},
        )

        completed, payload = self._run_cli(before, after)

        self.assertEqual(0, completed.returncode)
        self.assertAlmostEqual(0.01, payload["changed_ratio"])
        self.assertEqual(0.002, payload["threshold"])
        self.assertEqual("pass", payload["status"])

    def test_rgb_and_rgba_pngs_are_supported(self):
        before_rgb = self._write_image("before-rgb.png", mode="RGB")
        after_rgb = self._write_image("after-rgb.png", mode="RGB", changes={(2, 3): (255, 255, 255)})
        before_rgba = self._write_image("before-rgba.png")
        after_rgba = self._write_image("after-rgba.png", changes={(2, 3): (255, 255, 255, 255)})

        rgb_completed, rgb_payload = self._run_cli(before_rgb, after_rgb)
        rgba_completed, rgba_payload = self._run_cli(before_rgba, after_rgba)

        self.assertEqual(0, rgb_completed.returncode)
        self.assertEqual("pass", rgb_payload["status"])
        self.assertEqual(0, rgba_completed.returncode)
        self.assertEqual("pass", rgba_payload["status"])

    def test_png_filters_are_decoded(self):
        filters = [0, 1, 2, 3, 4]
        before = self._write_image("before-filters.png", size=(3, 5), filters=filters)
        after = self._write_image(
            "after-filters.png",
            size=(3, 5),
            filters=filters,
            changes={(1, 4): (255, 255, 255, 255)},
        )

        completed, payload = self._run_cli(before, after)

        self.assertEqual(0, completed.returncode)
        self.assertAlmostEqual(1 / 15, payload["changed_ratio"])
        self.assertEqual("pass", payload["status"])

    def test_explicit_inputs_and_threshold_are_supported(self):
        before = self._write_image("before.png")
        after = self._write_image(
            "after.png",
            changes={(2, 3): (255, 255, 255, 255)},
        )

        completed, payload = self._run_cli(
            "--before",
            before,
            "--after",
            after,
            "--threshold",
            "0.005",
        )

        self.assertEqual(0, completed.returncode)
        self.assertEqual(0.005, payload["threshold"])
        self.assertEqual("pass", payload["status"])

    def test_region_ignores_changes_outside_region(self):
        before = self._write_image("before.png")
        after = self._write_image(
            "after.png",
            changes={
                (1, 1): (255, 255, 255, 255),
                (9, 9): (255, 255, 255, 255),
            },
        )

        completed, payload = self._run_cli(
            before,
            after,
            "--x",
            0,
            "--y",
            0,
            "--width",
            5,
            "--height",
            5,
        )

        self.assertEqual(0, completed.returncode)
        self.assertAlmostEqual(1 / 25, payload["changed_ratio"])
        self.assertEqual("pass", payload["status"])
        self.assertEqual(
            {"x": 0, "y": 0, "width": 5, "height": 5},
            payload["region"],
        )

    def test_incompatible_image_sizes_are_rejected_cleanly(self):
        before = self._write_image("before.png", size=(10, 10))
        after = self._write_image("after.png", size=(11, 10))

        completed, payload = self._run_cli(before, after)

        self.assertEqual(2, completed.returncode)
        self.assertEqual("error", payload["status"])
        self.assertIsNone(payload["changed_ratio"])
        self.assertIn("same dimensions", payload["error"])

    def test_corrupt_png_is_an_error_not_a_content_failure(self):
        before = self._write_image("before.png")
        after = self.root / "corrupt.png"
        after.write_bytes(b"not a png")

        completed, payload = self._run_cli(before, after)

        self.assertEqual(2, completed.returncode)
        self.assertEqual("error", payload["status"])
        self.assertIsNone(payload["changed_ratio"])

    def test_unsupported_png_format_is_an_error(self):
        before = self._write_image("before.png")
        unsupported = self.root / "unsupported.png"
        ihdr = struct.pack(">IIBBBBB", 1, 1, 16, 6, 0, 0, 0)
        unsupported.write_bytes(
            b"\x89PNG\r\n\x1a\n"
            + self._chunk(b"IHDR", ihdr)
            + self._chunk(b"IEND", b"")
        )

        completed, payload = self._run_cli(before, unsupported)

        self.assertEqual(2, completed.returncode)
        self.assertEqual("error", payload["status"])
        self.assertIsNone(payload["changed_ratio"])


if __name__ == "__main__":
    unittest.main()

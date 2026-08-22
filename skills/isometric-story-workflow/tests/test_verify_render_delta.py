import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image


SKILL_DIR = Path(__file__).resolve().parents[1]
SCRIPT_PATH = SKILL_DIR / "scripts" / "verify_render_delta.py"


class VerifyRenderDeltaTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _write_image(self, name, size=(10, 10), changes=None):
        image = Image.new("RGBA", size, (0, 0, 0, 255))
        for coordinate, color in (changes or {}).items():
            image.putpixel(coordinate, color)
        path = self.root / name
        image.save(path, format="PNG")
        return path

    def _run_cli(self, *arguments):
        completed = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), *map(str, arguments)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(
            completed.returncode,
            2,
            f"CLI invocation failed before producing a result: {completed.stderr}",
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

        self.assertEqual(1, completed.returncode)
        self.assertEqual("fail", payload["status"])
        self.assertIsNone(payload["changed_ratio"])
        self.assertIn("same dimensions", payload["error"])


if __name__ == "__main__":
    unittest.main()

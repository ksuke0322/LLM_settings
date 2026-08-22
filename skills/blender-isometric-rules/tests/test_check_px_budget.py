import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_px_budget.py"


class CheckPxBudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.contract_path = Path(self.temp_dir.name) / "story_contract.json"

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_checker(self, contract, *arguments):
        self.contract_path.write_text(json.dumps(contract), encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--contract", str(self.contract_path), *arguments],
            capture_output=True,
            text=True,
        )

    def parse_output(self, result):
        self.assertTrue(result.stdout, result.stderr)
        return json.loads(result.stdout)

    def test_nested_signature_parts_report_each_part_below_its_visual_threshold(self):
        result = self.run_checker(
            {
                "objects": [
                    {
                        "id": "tower",
                        "signature_parts": [
                            {
                                "name": "roof finial",
                                "visualization": "silhouette",
                                "dominant_dimension": 0.02,
                            },
                            {
                                "name": "window trim",
                                "visualization": "contrast",
                                "dominant_dimension": 0.01,
                            },
                        ],
                    }
                ]
            }
        )

        self.assertEqual(1, result.returncode, result.stderr)
        payload = self.parse_output(result)
        self.assertEqual("fail", payload["status"])
        self.assertEqual(332.3, payload["scale"])
        self.assertEqual({"silhouette": 12, "contrast": 6}, payload["thresholds"])
        self.assertEqual(
            [
                {
                    "object": "tower",
                    "part": "roof finial",
                    "visualization": "silhouette",
                    "dominant_dimension": 0.02,
                    "pixels": 6.646,
                },
                {
                    "object": "tower",
                    "part": "window trim",
                    "visualization": "contrast",
                    "dominant_dimension": 0.01,
                    "pixels": 3.323,
                },
            ],
            payload["below_threshold"],
        )

    def test_top_level_signature_parts_accept_custom_scale_and_thresholds(self):
        result = self.run_checker(
            {
                "signature_parts": [
                    {
                        "name": "mast",
                        "visualization": "silhouette",
                        "dominant_dimension": 0.5,
                    },
                    {
                        "name": "stripe",
                        "visualization": "contrast",
                        "dominant_dimension": 0.3,
                    },
                ]
            },
            "--scale",
            "100",
            "--silhouette-threshold",
            "40",
            "--contrast-threshold",
            "25",
        )

        self.assertEqual(0, result.returncode, result.stderr)
        payload = self.parse_output(result)
        self.assertEqual("pass", payload["status"])
        self.assertEqual(100.0, payload["scale"])
        self.assertEqual({"silhouette": 40.0, "contrast": 25.0}, payload["thresholds"])
        self.assertEqual([], payload["below_threshold"])

    def test_part_at_threshold_is_not_reported_as_below_threshold(self):
        result = self.run_checker(
            {
                "signature_parts": [
                    {
                        "name": "edge",
                        "visualization": "contrast",
                        "dominant_dimension": 0.06,
                    }
                ]
            },
            "--scale",
            "100",
            "--contrast-threshold",
            "6",
        )

        self.assertEqual(0, result.returncode, result.stderr)
        payload = self.parse_output(result)
        self.assertEqual("pass", payload["status"])
        self.assertEqual([], payload["below_threshold"])

    def test_malformed_or_missing_signature_schema_fails_closed(self):
        contracts = [
            {},
            {"objects": []},
            {"objects": [{"id": "tower"}]},
            {"signature_parts": [{"name": "finial", "visualization": "silhouette"}]},
        ]

        for contract in contracts:
            with self.subTest(contract=contract):
                result = self.run_checker(contract)
                self.assertEqual(1, result.returncode, result.stderr)
                payload = self.parse_output(result)
                self.assertEqual("fail", payload["status"])
                self.assertEqual([], payload["below_threshold"])
                self.assertTrue(payload["errors"])

    def test_unknown_visualization_kind_is_rejected(self):
        result = self.run_checker(
            {
                "signature_parts": [
                    {
                        "name": "paint",
                        "visualization": "texture",
                        "dominant_dimension": 0.1,
                    }
                ]
            }
        )

        self.assertEqual(1, result.returncode, result.stderr)
        payload = self.parse_output(result)
        self.assertEqual("fail", payload["status"])
        self.assertTrue(any("visualization" in error for error in payload["errors"]))

    def test_non_positive_or_non_numeric_dominant_dimension_is_rejected(self):
        dimensions = [0, -0.1, "0.1", True]

        for dimension in dimensions:
            with self.subTest(dimension=dimension):
                result = self.run_checker(
                    {
                        "signature_parts": [
                            {
                                "name": "part",
                                "visualization": "silhouette",
                                "dominant_dimension": dimension,
                            }
                        ]
                    }
                )
                self.assertEqual(1, result.returncode, result.stderr)
                payload = self.parse_output(result)
                self.assertEqual("fail", payload["status"])
                self.assertTrue(payload["errors"])


if __name__ == "__main__":
    unittest.main()

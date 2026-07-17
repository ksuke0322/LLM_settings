import importlib.util
from pathlib import Path
import unittest


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"


def load_runner():
    spec = importlib.util.spec_from_file_location(
        "run_blender_quantitative_qa", SCRIPTS_DIR / "run_blender_quantitative_qa.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BlenderQuantitativeQaReportTests(unittest.TestCase):
    def test_passes_when_all_measurements_pass(self):
        runner = load_runner()
        report = {
            "schema_version": 1,
            "checks": [
                {"id": "camera.safe_area", "status": "PASS", "actual": 0.7, "threshold": ">=0.6"},
                {"id": "timeline.stagger", "status": "PASS", "actual": 0.33, "threshold": "0.30..0.40"},
            ],
        }

        self.assertEqual([], runner.validate_measurement_report(report))

    def test_rejects_fail_measurement(self):
        runner = load_runner()
        report = {
            "schema_version": 1,
            "checks": [{"id": "material.principled", "status": "FAIL", "actual": False, "threshold": True}],
        }

        self.assertEqual(
            ["measurement FAIL: material.principled"],
            runner.validate_measurement_report(report),
        )

    def test_warn_requires_value_threshold_and_waiver_reason(self):
        runner = load_runner()
        report = {
            "schema_version": 1,
            "checks": [{"id": "scatter.variance", "status": "WARN", "actual": 0.01, "threshold": ">=0.02"}],
        }

        self.assertEqual(
            ["measurement WARN requires waiver_reason: scatter.variance"],
            runner.validate_measurement_report(report),
        )

    def test_rejects_unknown_status_and_missing_check_metadata(self):
        runner = load_runner()
        report = {"schema_version": 1, "checks": [{"id": "bad", "status": "MAYBE"}, {"status": "PASS"}]}

        self.assertEqual(
            [
                "measurement status is invalid: bad",
                "measurement check id is required",
            ],
            runner.validate_measurement_report(report),
        )


if __name__ == "__main__":
    unittest.main()

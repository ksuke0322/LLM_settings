import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


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

    def test_repeated_failures_stop_before_third_blender_run(self):
        runner = load_runner()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            blend = root / "cool.blend"
            contract = root / "contract.json"
            output = root / "evidence"
            ledger = root / "ledger.json"
            blender = root / "blender"
            blend.write_text("blend")
            contract.write_text("{}")
            blender.write_text("#!/bin/sh\nexit 0\n")
            blender.chmod(0o755)
            calls = []

            def fake_run(command, capture_output=True, text=True):
                calls.append(command)
                raw = output / "raw"
                raw.mkdir(parents=True, exist_ok=True)
                (raw / "scene_snapshot.json").write_text("{}")
                (raw / "timeline_snapshot.json").write_text("{}")
                (raw / "measurement_report.json").write_text(json.dumps({
                    "schema_version": 1,
                    "checks": [{"id": "material.fail", "status": "FAIL", "actual": False, "threshold": True}],
                }))
                return mock.Mock(returncode=0, stderr="", stdout="")

            with mock.patch.object(runner, "_contract_errors", return_value=[]), mock.patch.object(runner.subprocess, "run", side_effect=fake_run):
                args = [
                    "--blend", str(blend), "--contract", str(contract), "--cool", "1",
                    "--output-dir", str(output), "--blender", str(blender), "--ledger", str(ledger),
                ]
                self.assertEqual(1, runner.main(args))
                self.assertEqual(1, runner.main(args))
                self.assertEqual(1, runner.main(args))
            self.assertEqual(2, len(calls))
            self.assertEqual(2, len(json.loads(ledger.read_text())["attempts"]))

    def test_malformed_ledger_fails_closed_before_blender_run(self):
        runner = load_runner()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            blend = root / "cool.blend"
            contract = root / "contract.json"
            output = root / "evidence"
            ledger = root / "ledger.json"
            blender = root / "blender"
            blend.write_text("blend")
            contract.write_text("{}")
            ledger.write_text("{")
            blender.write_text("#!/bin/sh\nexit 0\n")
            blender.chmod(0o755)
            with mock.patch.object(runner.subprocess, "run") as run:
                args = [
                    "--blend", str(blend), "--contract", str(contract), "--cool", "1",
                    "--output-dir", str(output), "--blender", str(blender), "--ledger", str(ledger),
                ]
                self.assertEqual(1, runner.main(args))
                run.assert_not_called()

    def test_repeated_contract_failures_are_fingerprinted(self):
        runner = load_runner()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            blend = root / "cool.blend"
            contract = root / "contract.json"
            output = root / "evidence"
            ledger = root / "ledger.json"
            blender = root / "blender"
            blend.write_text("blend")
            contract.write_text("{}")
            blender.write_text("#!/bin/sh\nexit 0\n")
            blender.chmod(0o755)
            calls = []

            def fake_run(command, capture_output=True, text=True):
                calls.append(command)
                raw = output / "raw"
                raw.mkdir(parents=True, exist_ok=True)
                (raw / "scene_snapshot.json").write_text("{}")
                (raw / "timeline_snapshot.json").write_text("{}")
                (raw / "measurement_report.json").write_text(json.dumps({"schema_version": 1, "checks": []}))
                return mock.Mock(returncode=0, stderr="", stdout="")

            with mock.patch.object(runner, "_contract_errors", return_value=["contract.fail"]), mock.patch.object(runner.subprocess, "run", side_effect=fake_run):
                args = [
                    "--blend", str(blend), "--contract", str(contract), "--cool", "1",
                    "--output-dir", str(output), "--blender", str(blender), "--ledger", str(ledger),
                ]
                self.assertEqual(1, runner.main(args))
                self.assertEqual(1, runner.main(args))
                self.assertEqual(1, runner.main(args))
            self.assertEqual(2, len(calls))

    def test_repeated_exporter_failures_are_recorded_and_stop_before_third_run(self):
        runner = load_runner()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            blend = root / "cool.blend"
            contract = root / "contract.json"
            output = root / "evidence"
            ledger = root / "ledger.json"
            blender = root / "blender"
            blend.write_text("blend")
            contract.write_text("{}")
            blender.write_text("#!/bin/sh\nexit 0\n")
            blender.chmod(0o755)
            calls = []

            def fake_run(command, capture_output=True, text=True):
                calls.append(command)
                return mock.Mock(returncode=3, stderr="exporter crashed", stdout="")

            with mock.patch.object(runner.subprocess, "run", side_effect=fake_run):
                args = [
                    "--blend", str(blend), "--contract", str(contract), "--cool", "1",
                    "--output-dir", str(output), "--blender", str(blender), "--ledger", str(ledger),
                ]
                self.assertEqual(3, runner.main(args))
                self.assertEqual(3, runner.main(args))
                self.assertEqual(1, runner.main(args))

            self.assertEqual(2, len(calls))
            recorded = json.loads(ledger.read_text())
            self.assertEqual("fail", recorded["status"])
            self.assertEqual(2, len(recorded["attempts"]))
            self.assertTrue((output / "quantitative_qa_error.json").is_file())

    def test_parent_decision_records_one_entry_and_clears_repeat_stop(self):
        runner = load_runner()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            blend = root / "cool.blend"
            contract = root / "contract.json"
            output = root / "evidence"
            ledger = root / "ledger.json"
            blender = root / "blender"
            blend.write_text("blend")
            contract.write_text("{}")
            blender.write_text("#!/bin/sh\nexit 0\n")
            blender.chmod(0o755)
            repeated = {
                "schema_version": 1,
                "ledger_type": "quantitative_qa",
                "status": "fail",
                "attempts": [
                    {"attempt": 1, "status": "fail", "finding_fingerprints": ["same"]},
                    {"attempt": 2, "status": "fail", "finding_fingerprints": ["same"]},
                ],
            }
            ledger.write_text(json.dumps(repeated))
            calls = []

            def fake_run(command, capture_output=True, text=True):
                calls.append(command)
                raw = output / "raw"
                raw.mkdir(parents=True, exist_ok=True)
                (raw / "scene_snapshot.json").write_text("{}")
                (raw / "timeline_snapshot.json").write_text("{}")
                (raw / "measurement_report.json").write_text(json.dumps({
                    "schema_version": 1,
                    "checks": [{"id": "material.ok", "status": "PASS", "actual": True, "threshold": True}],
                }))
                return mock.Mock(returncode=0, stderr="", stdout="")

            with mock.patch.object(runner, "_contract_errors", return_value=[]), mock.patch.object(runner.subprocess, "run", side_effect=fake_run):
                args = [
                    "--blend", str(blend), "--contract", str(contract), "--cool", "1",
                    "--output-dir", str(output), "--blender", str(blender), "--ledger", str(ledger),
                    "--parent-decision", "実測で修正方針を確定した",
                ]
                self.assertEqual(0, runner.main(args))

            self.assertEqual(1, len(calls))
            recorded = json.loads(ledger.read_text())
            decisions = [entry for entry in recorded["attempts"] if entry.get("status") == "parent_decision"]
            self.assertEqual(1, len(decisions))
            self.assertEqual([], decisions[0]["finding_fingerprints"])
            self.assertEqual("fix", decisions[0]["parent_action"])
            self.assertEqual("実測で修正方針を確定した", decisions[0]["note"])
            self.assertTrue(decisions[0]["decided_at"])
            self.assertEqual("pass", recorded["status"])


if __name__ == "__main__":
    unittest.main()

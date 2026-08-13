import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RepetitionControlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.input = self.root / "input.json"
        self.output = self.root / "output.json"
        self.input.write_text("input")
        self.output.write_text("output")
        self.control = load("repetition_control")
        self.execution = load("validate_execution_report")
        self.preflight = load("validate_preflight_cache")

    def tearDown(self):
        self.temp.cleanup()

    def test_same_key_reuses_only_verified_pass(self):
        key = {"blend_sha256": self.control.sha256_path(self.input), "scope": "scene"}
        ledger = {
            "schema_version": 1,
            "status": "pass",
            "key": key,
            "outputs": [self.control.output_entry(self.output)],
            "attempts": [{
                "attempt": 1,
                "key": key,
                "status": "pass",
                "finding_fingerprints": [],
                "outputs": [self.control.output_entry(self.output)],
            }],
        }
        self.assertEqual("verified_unchanged_input", self.control.cache_decision(ledger, key)["reason"])
        self.assertTrue(self.control.cache_decision(ledger, key)["reuse"])

    def test_changed_key_missing_output_and_failed_result_do_not_reuse(self):
        key = {"scope": "scene"}
        ledger = {
            "schema_version": 1,
            "status": "fail",
            "key": key,
            "outputs": [self.control.output_entry(self.output)],
            "attempts": [{
                "attempt": 1,
                "key": key,
                "status": "fail",
                "finding_fingerprints": ["finding"],
                "outputs": [self.control.output_entry(self.output)],
            }],
        }
        self.assertFalse(self.control.cache_decision(ledger, key)["reuse"])
        ledger["status"] = "pass"
        ledger["outputs"] = [{"path": str(self.root / "missing.json"), "sha256": "missing"}]
        self.assertFalse(self.control.cache_decision(ledger, key)["reuse"])
        self.assertFalse(self.control.cache_decision(ledger, {"scope": "timeline"})["reuse"])

    def test_same_finding_twice_requires_parent_decision(self):
        previous = [{"finding_fingerprints": ["abc"]}, {"finding_fingerprints": ["abc"]}]
        self.assertEqual("needs_parent_decision", self.control.repeated_finding_decision(previous, ["abc"]))

    def test_shared_finding_across_different_sets_requires_parent_decision(self):
        previous = [
            {"finding_fingerprints": ["x", "y"]},
            {"finding_fingerprints": ["x", "z"]},
        ]
        self.assertEqual(
            "needs_parent_decision",
            self.control.repeated_finding_decision(previous, ["x", "z"]),
        )

    def test_rerun_decision_stops_shared_finding_across_different_sets(self):
        ledger = {
            "status": "fail",
            "attempts": [
                {"finding_fingerprints": ["x", "y"]},
                {"finding_fingerprints": ["x", "z"]},
            ],
        }
        self.assertEqual("needs_parent_decision", self.control.rerun_decision(ledger))

    def test_execution_report_accepts_absolute_hashed_paths(self):
        report = {
            "schema_version": 1, "status": "pass", "operation": "validate", "step": "9.5",
            "inputs": [{"path": str(self.input), "sha256": self.control.sha256_path(self.input)}],
            "outputs": [{"path": str(self.output), "sha256": self.control.sha256_path(self.output)}],
            "command": ["validator"], "exit_code": 0, "duration_ms": 10, "warnings": [],
        }
        self.assertEqual([], self.execution.validate_report(report))

    def test_execution_report_rejects_relative_or_bad_hash(self):
        report = {
            "schema_version": 1, "status": "pass", "operation": "validate", "step": "9.5",
            "inputs": [{"path": "relative.json", "sha256": "bad"}], "outputs": [],
            "command": ["validator"], "exit_code": 0, "duration_ms": 0, "warnings": [],
        }
        errors = self.execution.validate_report(report)
        self.assertTrue(any("absolute" in error for error in errors))

    def test_empty_outputs_are_not_reusable(self):
        key = {"scope": "scene"}
        ledger = {"schema_version": 1, "status": "pass", "key": key, "outputs": [], "attempts": [{"attempt": 1}]}
        self.assertFalse(self.control.cache_decision(ledger, key)["reuse"])

    def test_execution_report_rejects_empty_execution_and_extra_history(self):
        report = {
            "schema_version": 1, "status": "pass", "operation": "validate", "step": "9.5",
            "inputs": [], "outputs": [], "command": [], "exit_code": 0, "duration_ms": 0,
            "warnings": [], "history": "previous report",
        }
        errors = self.execution.validate_report(report)
        self.assertTrue(any("non-empty" in error for error in errors))
        self.assertTrue(any("unknown fields" in error for error in errors))

    def test_preflight_key_preserves_image_order_and_invalidates_changed_image(self):
        second = self.root / "second.png"
        second.write_text("second")
        key = self.preflight.preflight_key([self.input, second], "step8_review_preflight", "luna-max-v1", "prompt-v1")
        ledger = {
            "schema_version": 1,
            "status": "pass",
            "key": key,
            "outputs": [self.control.output_entry(self.output)],
            "attempts": [{
                "attempt": 1,
                "key": key,
                "status": "pass",
                "finding_fingerprints": [],
                "outputs": [self.control.output_entry(self.output)],
            }],
        }
        self.assertTrue(self.control.cache_decision(ledger, key)["reuse"])
        second.write_text("changed")
        changed = self.preflight.preflight_key([self.input, second], "step8_review_preflight", "luna-max-v1", "prompt-v1")
        self.assertFalse(self.control.cache_decision(ledger, changed)["reuse"])

    def test_preflight_cache_miss_allows_rerun_and_success_can_be_recorded(self):
        ledger = self.root / "preflight-ledger.json"
        key = self.preflight.preflight_key([self.input], "step8_review_preflight", "luna-max-v1", "prompt-v1")
        report = self.root / "preflight-report.json"
        report.write_text(json.dumps({
            "purpose": "step8_review_preflight",
            "input_images": [str(self.input.resolve())],
            "observations": [{"item": "clear", "evidence_image": str(self.input.resolve()), "confidence": "high", "note": "ok"}],
            "uncertainties": [],
            "failure": None,
        }))
        self.preflight.record_success(ledger, report, key)
        recorded = json.loads(ledger.read_text())
        self.assertEqual("codex_image_preflight", recorded["ledger_type"])
        self.assertTrue(self.control.cache_decision(recorded, key, "codex_image_preflight")["reuse"])

    def test_preflight_low_confidence_cannot_be_cached(self):
        ledger = self.root / "preflight-ledger.json"
        key = self.preflight.preflight_key([self.input], "step8_review_preflight", "luna-max-v1", "prompt-v1")
        report = self.root / "preflight-report.json"
        report.write_text(json.dumps({
            "purpose": "step8_review_preflight",
            "input_images": [str(self.input.resolve())],
            "observations": [{"item": "unclear", "evidence_image": str(self.input.resolve()), "confidence": 0.2, "note": "not enough evidence"}],
            "uncertainties": [],
            "failure": None,
        }))
        with self.assertRaises(ValueError):
            self.preflight.record_success(ledger, report, key)

    def test_preflight_cli_cache_miss_is_rerun_allowed(self):
        ledger = self.root / "missing-ledger.json"
        script = ROOT / "scripts" / "validate_preflight_cache.py"
        result = subprocess.run([
            sys.executable, str(script), str(ledger), "--purpose", "step8_review_preflight",
            "--model-revision", "luna-max-v1", "--prompt-revision", "prompt-v1", str(self.input),
        ], capture_output=True, text=True)
        self.assertEqual(0, result.returncode)
        self.assertEqual("rerun_allowed", json.loads(result.stdout)["status"])


if __name__ == "__main__":
    unittest.main()

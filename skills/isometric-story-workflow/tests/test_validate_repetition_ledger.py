import importlib.util
from pathlib import Path
import tempfile
import unittest


PATH = Path(__file__).resolve().parents[1] / "scripts" / "validate_repetition_ledger.py"
spec = importlib.util.spec_from_file_location("validate_repetition_ledger", PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ValidateRepetitionLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.output = Path(self.temp.name) / "report.json"
        self.output.write_text("{}")

    def tearDown(self):
        self.temp.cleanup()

    def test_valid_motion_ledger_passes(self):
        key = {"blend_sha256": "abc", "video_sha256": "def", "criteria_revision": "v1", "sample_set_revision": "v1"}
        result = module.validate_ledger({
            "schema_version": 1, "ledger_type": "motion_qa", "status": "pass",
            "key": key,
            "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}],
            "finding_fingerprints": [], "attempts": [{"attempt": 1, "key": key, "status": "pass", "finding_fingerprints": [], "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}]}],
        })
        self.assertEqual("pass", result["status"])
        self.assertFalse(result["errors"])

    def test_repeated_finding_requires_parent(self):
        key = {"blend_sha256": "abc", "video_sha256": "def", "criteria_revision": "v1", "sample_set_revision": "v1"}
        result = module.validate_ledger({
            "schema_version": 1, "ledger_type": "motion_qa", "status": "fail",
            "key": key,
            "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}],
            "finding_fingerprints": ["same"],
            "attempts": [
                {"attempt": 1, "key": key, "status": "fail", "finding_fingerprints": ["same"], "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}]},
                {"attempt": 2, "key": key, "status": "fail", "finding_fingerprints": ["same"], "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}]},
            ],
        })
        self.assertEqual("needs_parent_decision", result["status"])
        self.assertFalse(result["rerun_allowed"])

    def test_malformed_fingerprint_values_fail_closed_without_raising(self):
        key = {"blend_sha256": "abc", "video_sha256": "def", "criteria_revision": "v1", "sample_set_revision": "v1"}
        result = module.validate_ledger({
            "schema_version": 1, "ledger_type": "motion_qa", "status": "fail",
            "key": key,
            "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}],
            "finding_fingerprints": ["same"],
            "attempts": [
                {"attempt": 1, "key": key, "status": "fail", "finding_fingerprints": None, "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}]},
                {"attempt": 2, "key": key, "status": "fail", "finding_fingerprints": None, "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}]},
            ],
        })
        self.assertEqual("fail", result["status"])
        self.assertFalse(result["rerun_allowed"])
        self.assertTrue(any("finding_fingerprints" in error for error in result["errors"]))

    def test_missing_output_never_passes(self):
        key = {"video_sha256": "abc", "render_spec_revision": "v1", "validator_sha256": "v1", "through": "render", "ffprobe_path": "/tmp/ffprobe", "ffmpeg_path": "/tmp/ffmpeg", "ffprobe_version": "v1", "ffmpeg_version": "v1"}
        result = module.validate_ledger({
            "schema_version": 1, "ledger_type": "render_validation", "status": "pass",
            "key": key, "outputs": [{"path": str(Path(self.temp.name) / "missing"), "sha256": "missing"}],
            "finding_fingerprints": [], "attempts": [{"attempt": 1, "key": key, "status": "pass", "finding_fingerprints": [], "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}]}],
        })
        self.assertEqual("fail", result["status"])
        self.assertFalse(result["rerun_allowed"])

    def test_same_current_motion_key_is_cache_reusable(self):
        key = {"blend_sha256": "abc", "video_sha256": "def", "criteria_revision": "v1", "sample_set_revision": "v1"}
        result = module.validate_ledger({
            "schema_version": 1, "ledger_type": "motion_qa", "status": "pass", "key": key,
            "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}],
            "finding_fingerprints": [],
            "attempts": [{"attempt": 1, "key": key, "status": "pass", "finding_fingerprints": [], "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}]}],
        }, key)
        self.assertEqual("pass", result["status"])
        self.assertTrue(result["cache_reusable"])
        self.assertFalse(result["rerun_allowed"])

    def test_changed_motion_key_allows_a_new_run(self):
        old_key = {"blend_sha256": "abc", "video_sha256": "def", "criteria_revision": "v1", "sample_set_revision": "v1"}
        new_key = {**old_key, "video_sha256": "changed"}
        result = module.validate_ledger({
            "schema_version": 1, "ledger_type": "motion_qa", "status": "pass", "key": old_key,
            "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}],
            "finding_fingerprints": [],
            "attempts": [{"attempt": 1, "key": old_key, "status": "pass", "finding_fingerprints": [], "outputs": [{"path": str(self.output), "sha256": module.sha256_path(self.output)}]}],
        }, new_key)
        self.assertEqual("rerun_allowed", result["status"])
        self.assertTrue(result["rerun_allowed"])
        self.assertFalse(result["errors"])


if __name__ == "__main__":
    unittest.main()

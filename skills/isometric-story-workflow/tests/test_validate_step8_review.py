import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SKILL_DIR = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = SKILL_DIR / "scripts" / "validate_step8_review.py"


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_step8_review", VALIDATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ValidateStep8ReviewTests(unittest.TestCase):
    def setUp(self):
        self.validator = load_validator()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.images = []
        for name in ("overall.png", "closeup.png", "evidence.png"):
            path = self.root / name
            path.write_bytes(b"image")
            self.images.append(str(path))
        self.baseline = {
            "schema_version": 1,
            "cool": 1,
            "reference_image": self.images[0],
            "current_render": self.images[1],
            "current_render_sha256": hashlib.sha256(Path(self.images[1]).read_bytes()).hexdigest(),
            "candidate_sha256": "c" * 64,
            "render_set_sha256": "d" * 64,
            "visual_anchors": ["主役の輪郭", "素材感", "装飾密度"],
            "conflicts": [],
            "accepted_tolerances": [],
            "waiver_candidates": [],
        }
        self.baseline_path = self.root / "cool1_step8_baseline.json"
        self.baseline_path.write_text(json.dumps(self.baseline, ensure_ascii=False))

    def tearDown(self):
        self.temp_dir.cleanup()

    def _base(self, review_type):
        report = {
            "schema_version": 1,
            "review_type": review_type,
            "status": "pass",
            "input_images": self.images[:2],
            "conclusion": "判定対象の必須条件を確認した。",
        }
        if review_type in {"8A", "8B"}:
            report["findings"] = []
        else:
            report["kinds"] = []
        return report

    def _assert_pass(self, report):
        result = self._validate(report)
        self.assertEqual("pass", result["status"])
        self.assertEqual([], result["errors"])

    def _validate(self, report, ledger=None, **kwargs):
        if report.get("review_type") == "8A" and "baseline" not in kwargs:
            kwargs["baseline"] = dict(self.baseline)
        if report.get("review_type") == "8A":
            baseline = kwargs["baseline"]
            kwargs.setdefault("candidate_sha256", baseline["candidate_sha256"])
            kwargs.setdefault("render_set_sha256", baseline["render_set_sha256"])
        return self.validator.validate_step8_review(report, ledger, **kwargs)

    def test_valid_8a_8b_8c_reports_are_accepted(self):
        self._assert_pass(self._base("8A"))
        self._assert_pass(self._base("8B"))
        report = self._base("8C")
        report["kinds"] = [
            {
                "kind": "desk",
                "signature_realization": "pass",
                "class_readable": "pass",
                "existence_reason_readable": "pass",
                "evidence_images": [self.images[2]],
            }
        ]
        self._assert_pass(report)

    def test_missing_required_fields_are_rejected(self):
        report = self._base("8A")
        del report["input_images"]
        result = self._validate(report)
        self.assertEqual("fail", result["status"])
        self.assertTrue(any("input_images" in error for error in result["errors"]))

    def test_unknown_report_fields_are_rejected(self):
        report = self._base("8A")
        report["history"] = "previous review"
        result = self._validate(report)
        self.assertEqual("fail", result["status"])
        self.assertFalse(result["rerun_allowed"])
        self.assertTrue(any("unknown field" in error for error in result["errors"]))

    def test_unknown_finding_fields_are_rejected(self):
        report = self._base("8B")
        report["findings"] = [
            {
                "severity": "minor",
                "kind": "shelf",
                "location": "top joint",
                "evidence_images": [self.images[2]],
                "note": "軽微な改善余地がある。",
                "previous_review": "ignored history",
            }
        ]
        result = self._validate(report)
        self.assertEqual("fail", result["status"])
        self.assertTrue(any("unknown field" in error for error in result["errors"]))

    def test_unknown_waiver_fields_are_rejected(self):
        report = self._base("8A")
        report["findings"] = [
            {
                "classification": "waiver",
                "kind": "legacy",
                "criterion": "reference texture",
                "location": "background",
                "evidence_images": [self.images[2]],
                "note": "承認済みの許容差である。",
            }
        ]
        report["waiver"] = {
            "reason": "引き継ぎ資産の差分",
            "impact": "質感差は残るが機能的破綻はない",
            "approved_by": "parent",
            "history": "previous review",
        }
        manifest = {"gates": {"visual_acceptance": {"status": "waived", **report["waiver"]}}}
        result = self._validate(report, manifest=manifest)
        self.assertEqual("fail", result["status"])
        self.assertTrue(any("unknown field" in error for error in result["errors"]))

    def test_8a_waiver_metadata_requires_a_waiver_finding(self):
        report = self._base("8A")
        report["waiver"] = {
            "reason": "引き継ぎ資産の差分",
            "impact": "質感差は残るが機能的破綻はない",
            "approved_by": "parent",
        }
        manifest = {"gates": {"visual_acceptance": {"status": "waived", **report["waiver"]}}}
        result = self._validate(report, manifest=manifest)
        self.assertEqual("fail", result["status"])
        self.assertTrue(any("waiver finding" in error for error in result["errors"]))

    def test_8a_requires_parent_baseline_before_review(self):
        report = self._base("8A")
        result = self.validator.validate_step8_review(report)
        self.assertEqual("fail", result["status"])
        self.assertFalse(result["rerun_allowed"])
        self.assertTrue(any("baseline" in error for error in result["errors"]))

    def test_8a_baseline_requires_readable_images_and_three_to_five_anchors(self):
        report = self._base("8A")
        invalid_baseline = dict(self.baseline)
        invalid_baseline["reference_image"] = str(self.root / "missing-reference.png")
        invalid_baseline["visual_anchors"] = ["one", "two"]
        result = self._validate(report, baseline=invalid_baseline)
        self.assertEqual("fail", result["status"])
        self.assertFalse(result["rerun_allowed"])
        self.assertTrue(any("reference_image" in error and "does not exist" in error for error in result["errors"]))
        self.assertTrue(any("visual_anchors" in error for error in result["errors"]))

    def test_8a_baseline_binds_render_and_input_revisions(self):
        report = self._base("8A")
        baseline = dict(self.baseline)
        baseline["current_render_sha256"] = "0" * 64
        baseline["candidate_sha256"] = "a" * 64
        baseline["render_set_sha256"] = "b" * 64
        result = self.validator.validate_step8_review(
            report,
            baseline=baseline,
            candidate_sha256="c" * 64,
            render_set_sha256="d" * 64,
        )
        self.assertEqual("fail", result["status"])
        self.assertFalse(result["rerun_allowed"])
        self.assertTrue(any("current_render_sha256" in error for error in result["errors"]))
        self.assertTrue(any("candidate_sha256" in error for error in result["errors"]))
        self.assertTrue(any("render_set_sha256" in error for error in result["errors"]))

    def test_8a_required_match_is_blocking(self):
        report = self._base("8A")
        report["status"] = "fail"
        report["findings"] = [
            {
                "classification": "required_match",
                "kind": "wall",
                "criterion": "material richness",
                "location": "left wall",
                "evidence_images": [self.images[2]],
                "note": "質感の必須一致が不足している。",
            }
        ]
        result = self._validate(report)
        self.assertEqual("fail", result["status"])
        self.assertTrue(result["rerun_allowed"])
        self.assertEqual(
            ["8a|wall|material richness|left wall"],
            result["finding_fingerprints"],
        )

    def test_8b_high_or_medium_is_blocking(self):
        for severity in ("high", "medium"):
            report = self._base("8B")
            report["status"] = "fail"
            report["findings"] = [
                {
                    "severity": severity,
                    "kind": "shelf",
                    "location": "top joint",
                    "evidence_images": [self.images[2]],
                    "note": "接合が不自然である。",
                }
            ]
            result = self._validate(report)
            self.assertEqual("fail", result["status"])
            self.assertTrue(result["errors"])

    def test_8c_requires_all_three_kind_checks_to_pass(self):
        report = self._base("8C")
        report["status"] = "fail"
        report["kinds"] = [
            {
                "kind": "windmill",
                "signature_realization": "fail",
                "class_readable": "pass",
                "existence_reason_readable": "fail",
                "evidence_images": [self.images[2]],
                "note": "署名パーツと存在理由が読めない。",
            }
        ]
        result = self._validate(report)
        self.assertEqual("fail", result["status"])
        self.assertTrue(result["errors"])

    def test_relative_or_missing_evidence_images_are_rejected(self):
        report = self._base("8A")
        report["findings"] = [
            {
                "classification": "improvable",
                "kind": "tree",
                "criterion": "detail",
                "location": "right side",
                "evidence_images": ["relative.png", str(self.root / "missing.png")],
                "note": "軽微な改善余地がある。",
            }
        ]
        result = self._validate(report)
        self.assertEqual("fail", result["status"])
        self.assertTrue(any("absolute path" in error for error in result["errors"]))
        self.assertTrue(any("does not exist" in error for error in result["errors"]))

    def test_no_change_rerun_is_rejected(self):
        report = self._base("8A")
        report["status"] = "fail"
        report["findings"] = [
            {
                "classification": "required_match",
                "kind": "wall",
                "criterion": "material richness",
                "location": "left wall",
                "evidence_images": [self.images[2]],
                "note": "必須一致が不足している。",
            }
        ]
        current_report_path = self.root / "report-2.json"
        current_report_path.write_text(json.dumps(report))
        ledger = {
            "schema_version": 1,
            "attempts": [
                {
                    "review_type": "8A",
                    "attempt": 1,
                    "candidate_sha256": "a" * 64,
                    "render_set_sha256": "b" * 64,
                    "acceptance_matrix_revision": "r1",
                    "report_path": str(self.root / "report-1.json"),
                    "finding_fingerprints": [],
                    "parent_action": "fix",
                }
            ],
        }
        Path(ledger["attempts"][0]["report_path"]).write_text("{}")
        result = self._validate(
            report,
            ledger,
            review_type="8A",
            attempt=2,
            candidate_sha256="a" * 64,
            render_set_sha256="b" * 64,
            acceptance_matrix_revision="r1",
            report_path=str(current_report_path),
        )
        self.assertEqual("fail", result["status"])
        self.assertFalse(result["rerun_allowed"])
        self.assertTrue(any("unchanged" in error for error in result["errors"]))

    def test_repeated_fingerprint_stops_before_third_automatic_attempt(self):
        report = self._base("8A")
        report["status"] = "fail"
        finding = {
            "classification": "required_match",
            "kind": "wall",
            "criterion": "material richness",
            "location": "left wall",
            "evidence_images": [self.images[2]],
            "note": "同じ必須一致の指摘が残っている。",
        }
        report["findings"] = [finding]
        previous_report_path = self.root / "report-1.json"
        previous_report_path.write_text(json.dumps(report))
        current_report_path = self.root / "report-2.json"
        current_report_path.write_text(json.dumps(report))
        ledger = {
            "schema_version": 1,
            "attempts": [
                {
                    "review_type": "8A",
                    "attempt": 1,
                    "candidate_sha256": "a" * 64,
                    "render_set_sha256": "b" * 64,
                    "acceptance_matrix_revision": "r1",
                    "report_path": str(previous_report_path),
                    "finding_fingerprints": ["8a|wall|material richness|left wall"],
                    "parent_action": "fix",
                }
            ],
        }
        result = self._validate(
            report,
            ledger,
            review_type="8A",
            attempt=2,
            candidate_sha256="c" * 64,
            render_set_sha256="d" * 64,
            acceptance_matrix_revision="r1",
            report_path=str(current_report_path),
        )
        self.assertEqual("needs_parent_decision", result["status"])
        self.assertFalse(result["rerun_allowed"])
        self.assertIn("8a|wall|material richness|left wall", result["finding_fingerprints"])

    def test_updated_measurement_revision_allows_rerun_without_new_render(self):
        report = self._base("8A")
        report["status"] = "fail"
        report["findings"] = [
            {
                "classification": "required_match",
                "kind": "wall",
                "criterion": "material richness",
                "location": "left wall",
                "evidence_images": [self.images[2]],
                "note": "実測値の更新後も確認が必要である。",
            }
        ]
        previous_report = self.root / "measurement-report-1.json"
        current_report = self.root / "measurement-report-2.json"
        previous_report.write_text(json.dumps(report))
        current_report.write_text(json.dumps(report))
        ledger = {
            "schema_version": 1,
            "attempts": [
                {
                    "review_type": "8A",
                    "attempt": 1,
                    "candidate_sha256": "a" * 64,
                    "render_set_sha256": "b" * 64,
                    "measurement_revision": "snapshot@1",
                    "acceptance_matrix_revision": "r1",
                    "report_path": str(previous_report),
                    "finding_fingerprints": [],
                    "parent_action": "fix",
                }
            ],
        }
        result = self._validate(
            report,
            ledger,
            review_type="8A",
            attempt=2,
            candidate_sha256="a" * 64,
            render_set_sha256="b" * 64,
            measurement_revision="snapshot@2",
            acceptance_matrix_revision="r1",
            report_path=str(current_report),
        )
        self.assertEqual("fail", result["status"])
        self.assertTrue(result["rerun_allowed"])
        self.assertFalse(any("unchanged" in error for error in result["errors"]))

    def test_8b_and_8c_waivers_do_not_complete_the_gate(self):
        report = self._base("8B")
        report["findings"] = [
            {
                "severity": "waiver",
                "kind": "shelf",
                "location": "top joint",
                "evidence_images": [self.images[2]],
                "note": "承認済み差分として記録する。",
            }
        ]
        report["status"] = "needs_parent_decision"
        result = self._validate(report)
        self.assertEqual("needs_parent_decision", result["status"])

        report = self._base("8C")
        report["kinds"] = [
            {
                "kind": "shelf",
                "signature_realization": "pass",
                "class_readable": "pass",
                "existence_reason_readable": "pass",
                "evidence_images": [self.images[2]],
                "waiver": True,
            }
        ]
        report["status"] = "needs_parent_decision"
        result = self._validate(report)
        self.assertEqual("fail", result["status"])

    def test_approved_8a_waiver_is_valid_only_with_required_metadata(self):
        report = self._base("8A")
        report["findings"] = [
            {
                "classification": "waiver",
                "kind": "legacy",
                "criterion": "reference texture",
                "location": "background",
                "evidence_images": [self.images[2]],
                "note": "承認済みの許容差である。",
            }
        ]
        report["waiver"] = {
            "reason": "引き継ぎ資産の差分",
            "impact": "質感差は残るが機能的破綻はない",
            "approved_by": "parent",
        }
        manifest = {"gates": {"visual_acceptance": {"status": "waived", **report["waiver"]}}}
        result = self._validate(report, manifest=manifest)
        self.assertEqual("pass", result["status"])
        self.assertEqual([], result["errors"])

        report["waiver"].pop("approved_by")
        report["status"] = "needs_parent_decision"
        result = self._validate(report)
        self.assertEqual("needs_parent_decision", result["status"])

    def test_8a_waiver_requires_matching_manifest_record(self):
        report = self._base("8A")
        report["findings"] = [
            {
                "classification": "waiver",
                "kind": "legacy",
                "criterion": "reference texture",
                "location": "background",
                "evidence_images": [self.images[2]],
                "note": "承認済みの許容差である。",
            }
        ]
        report["waiver"] = {
            "reason": "引き継ぎ資産の差分",
            "impact": "質感差は残るが機能的破綻はない",
            "approved_by": "parent",
        }
        manifest = {"gates": {"visual_acceptance": {"status": "pass"}}}
        result = self._validate(report, manifest=manifest)
        self.assertEqual("fail", result["status"])
        self.assertTrue(any("visual_acceptance" in error for error in result["errors"]))

        matching = {"gates": {"visual_acceptance": {"status": "waived", **report["waiver"]}}}
        result = self._validate(report, manifest=matching)
        self.assertEqual("pass", result["status"])
        self.assertEqual([], result["errors"])

    def test_ledger_waiver_requires_manifest_approval_metadata(self):
        report = self._base("8A")
        previous_report = self.root / "waiver-report-1.json"
        current_report = self.root / "waiver-report-2.json"
        previous_report.write_text(json.dumps(report))
        current_report.write_text(json.dumps(report))
        ledger = {
            "schema_version": 1,
            "attempts": [
                {
                    "review_type": "8A",
                    "attempt": 1,
                    "candidate_sha256": "a" * 64,
                    "render_set_sha256": "b" * 64,
                    "acceptance_matrix_revision": "r1",
                    "report_path": str(previous_report),
                    "finding_fingerprints": [],
                    "parent_action": "waiver",
                }
            ],
        }
        result = self._validate(
            report,
            ledger,
            review_type="8A",
            attempt=2,
            candidate_sha256="c" * 64,
            render_set_sha256="d" * 64,
            acceptance_matrix_revision="r1",
            report_path=str(current_report),
        )
        self.assertEqual("fail", result["status"])
        self.assertTrue(any("ledger.attempts[0].waiver" in error for error in result["errors"]))

    def test_malformed_ledger_fingerprints_fail_closed_without_exception(self):
        report = self._base("8A")
        report["status"] = "fail"
        report["findings"] = [
            {
                "classification": "required_match",
                "kind": "wall",
                "criterion": "material richness",
                "location": "left wall",
                "evidence_images": [self.images[2]],
                "note": "必須一致が不足している。",
            }
        ]
        report_path = self.root / "malformed-ledger-report.json"
        report_path.write_text(json.dumps(report))
        ledger = {
            "schema_version": 1,
            "attempts": [
                {
                    "review_type": "8A",
                    "attempt": 1,
                    "candidate_sha256": "a" * 64,
                    "render_set_sha256": "b" * 64,
                    "acceptance_matrix_revision": "r1",
                    "report_path": str(report_path),
                    "finding_fingerprints": None,
                    "parent_action": "fix",
                }
            ],
        }
        result = self._validate(
            report,
            ledger,
            review_type="8A",
            attempt=2,
            candidate_sha256="c" * 64,
            render_set_sha256="d" * 64,
            acceptance_matrix_revision="r1",
            report_path=str(report_path),
        )
        self.assertEqual("fail", result["status"])
        self.assertFalse(result["rerun_allowed"])
        self.assertTrue(any("finding_fingerprints" in error for error in result["errors"]))

    def test_note_is_one_sentence_and_at_most_240_characters(self):
        report = self._base("8A")
        report["findings"] = [
            {
                "classification": "improvable",
                "kind": "tree",
                "criterion": "detail",
                "location": "right side",
                "evidence_images": [self.images[2]],
                "note": "a" * 241,
            }
        ]
        result = self._validate(report)
        self.assertEqual("fail", result["status"])
        self.assertTrue(any("240" in error for error in result["errors"]))

    def test_cli_emits_fixed_json_shape(self):
        report_path = self.root / "report.json"
        report_path.write_text(json.dumps(self._base("8A")))
        result = subprocess.run(
            [
                sys.executable,
                str(VALIDATOR_PATH),
                "--report",
                str(report_path),
                "--baseline",
                str(self.baseline_path),
                "--candidate-sha256",
                self.baseline["candidate_sha256"],
                "--render-set-sha256",
                self.baseline["render_set_sha256"],
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(0, result.returncode)
        payload = json.loads(result.stdout)
        self.assertEqual(
            {"status", "rerun_allowed", "errors", "warnings", "finding_fingerprints"},
            set(payload),
        )


if __name__ == "__main__":
    unittest.main()

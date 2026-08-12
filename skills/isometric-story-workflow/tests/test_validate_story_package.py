import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SKILL_DIR = Path(__file__).resolve().parents[1]
FIXTURES_DIR = Path(__file__).parent / "fixtures"
VALIDATOR_PATH = SKILL_DIR / "scripts" / "validate_story_package.py"


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_story_package", VALIDATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ValidateStoryPackageTests(unittest.TestCase):
    def setUp(self):
        self.validator = load_validator()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.package_dir = Path(self.temp_dir.name)
        template = (FIXTURES_DIR / "valid_manifest.json").read_text()
        self.manifest = json.loads(template.replace("__PACKAGE_DIR__", str(self.package_dir)))
        self.ffprobe = json.loads((FIXTURES_DIR / "ffprobe_valid.json").read_text())
        self._create_artifacts()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _create_artifacts(self):
        paths = []
        for value in self.manifest["artifacts"].values():
            paths.extend(value if isinstance(value, list) else [value])
        paths.extend(gate["evidence"] for gate in self.manifest["gates"].values())
        for gate in self.manifest["gates"].values():
            review_package = gate.get("review_package")
            if isinstance(review_package, dict):
                paths.append(review_package["path"])
        for raw_path in paths:
            path = Path(raw_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"fixture")
        Path(self.manifest["artifacts"]["video"]).write_bytes(b"0" * (4 * 1024 * 1024))

    def _validate(self, manifest=None, ffprobe=None, through="app", story_ffprobe=None):
        return self.validator.validate_manifest(
            manifest or self.manifest,
            ffprobe or self.ffprobe,
            through,
            story_ffprobe or self.ffprobe,
        )

    def test_valid_package_passes(self):
        self.assertEqual([], self._validate())

    def test_optional_step8_review_paths_are_validated(self):
        manifest = copy.deepcopy(self.manifest)
        baseline = self.package_dir / "evidence" / "cool1_step8_baseline.json"
        ledger = self.package_dir / "evidence" / "cool1_step8_review_ledger.json"
        baseline.parent.mkdir(parents=True, exist_ok=True)
        baseline.write_text("{}")
        ledger.write_text("{}")
        manifest["step8_review"] = {
            "baseline": str(baseline),
            "ledger": str(ledger),
        }
        self.assertEqual([], self._validate(manifest))

        manifest["step8_review"]["baseline"] = "relative-baseline.json"
        errors = self._validate(manifest)
        self.assertIn("manifest.step8_review.baseline must be an absolute path", errors)

        manifest["step8_review"]["baseline"] = str(self.package_dir / "missing.json")
        errors = self._validate(manifest)
        self.assertTrue(any("manifest.step8_review.baseline does not exist" in error for error in errors))

    def test_step8_waiver_report_must_match_visual_acceptance_manifest_gate(self):
        manifest = copy.deepcopy(self.manifest)
        report = self.package_dir / "evidence" / "cool1_step8_8a_latest.json"
        report.write_text(json.dumps({
            "schema_version": 1,
            "review_type": "8A",
            "status": "pass",
            "waiver": {
                "reason": "引き継ぎ資産の差分",
                "impact": "質感差は残るが機能的破綻はない",
                "approved_by": "parent",
            },
        }))
        manifest["step8_review"] = {"report": str(report)}
        errors = self._validate(manifest)
        self.assertTrue(any("visual_acceptance" in error for error in errors))

        manifest["gates"]["visual_acceptance"] = {
            "status": "waived",
            "reviewer": "parent",
            "evidence": manifest["gates"]["visual_acceptance"]["evidence"],
            "reason": "引き継ぎ資産の差分",
            "impact": "質感差は残るが機能的破綻はない",
            "approved_by": "parent",
        }
        self.assertFalse(any("visual_acceptance" in error for error in self._validate(manifest)))

    def test_step8_baseline_current_render_must_match_manifest_final_still(self):
        manifest = copy.deepcopy(self.manifest)
        baseline = self.package_dir / "evidence" / "cool1_step8_baseline.json"
        baseline.write_text(json.dumps({
            "current_render": manifest["artifacts"]["animatic"],
        }))
        manifest["step8_review"] = {"baseline": str(baseline)}
        errors = self._validate(manifest)
        self.assertTrue(any("current_render" in error and "final_still" in error for error in errors))

    def test_legacy_manifest_without_step8_review_remains_backward_compatible(self):
        manifest = copy.deepcopy(self.manifest)
        manifest.pop("step8_review", None)
        manifest.pop("step8_review_ledger", None)
        self.assertEqual([], self._validate(manifest))

    def test_optional_repetition_ledger_path_is_validated(self):
        manifest = copy.deepcopy(self.manifest)
        ledger = self.package_dir / "evidence" / "motion_qa_ledger.json"
        ledger.write_text("{}")
        manifest["motion_qa_ledger"] = str(ledger)
        self.assertEqual([], self._validate(manifest))
        manifest["motion_qa_ledger"] = "relative-ledger.json"
        self.assertIn("manifest.motion_qa_ledger must be an absolute path", self._validate(manifest))

    def test_missing_required_field_fails(self):
        manifest = copy.deepcopy(self.manifest)
        del manifest["reproduction"]["seed"]
        self.assertIn("reproduction.seed is required", self._validate(manifest))

    def test_tbd_value_fails(self):
        manifest = copy.deepcopy(self.manifest)
        manifest["reproduction"]["color_management"] = "TBD"
        errors = self._validate(manifest)
        self.assertTrue(any("TBD" in error for error in errors))

    def test_missing_artifact_fails(self):
        Path(self.manifest["artifacts"]["final_still"]).unlink()
        errors = self._validate()
        self.assertTrue(any("final_still" in error and "does not exist" in error for error in errors))

    def test_human_review_package_is_required(self):
        manifest = copy.deepcopy(self.manifest)
        del manifest["gates"]["still_human_review"]["review_package"]
        self.assertIn(
            "gates.still_human_review.review_package is required",
            self._validate(manifest),
        )

    def test_human_review_package_requires_absolute_existing_paths(self):
        manifest = copy.deepcopy(self.manifest)
        package = manifest["gates"]["still_human_review"]["review_package"]
        package["path"] = "review/cool1_still.md"
        package["primary_assets"] = [str(self.package_dir / "missing.png")]
        errors = self._validate(manifest)
        self.assertIn(
            "gates.still_human_review.review_package.path must be an absolute path",
            errors,
        )
        self.assertTrue(any("primary_assets[0] does not exist" in error for error in errors))

    def test_human_review_package_requires_primary_assets_and_supported_presentation(self):
        manifest = copy.deepcopy(self.manifest)
        package = manifest["gates"]["still_human_review"]["review_package"]
        package["primary_assets"] = []
        package["presentation"] = "markdown_preview"
        errors = self._validate(manifest)
        self.assertIn(
            "gates.still_human_review.review_package.primary_assets must contain at least one path",
            errors,
        )
        self.assertIn(
            "gates.still_human_review.review_package.presentation must be a supported presentation",
            errors,
        )

    def test_waiver_without_approval_fails(self):
        manifest = copy.deepcopy(self.manifest)
        del manifest["gates"]["technical_spike"]["approved_by"]
        self.assertIn(
            "gates.technical_spike.approved_by is required for waived status",
            self._validate(manifest),
        )

    def test_invalid_codec_fps_and_pixel_format_fail(self):
        probe = copy.deepcopy(self.ffprobe)
        stream = probe["streams"][0]
        stream.update(codec_name="hevc", pix_fmt="yuv444p", r_frame_rate="24/1", avg_frame_rate="24/1")
        errors = self._validate(ffprobe=probe)
        self.assertTrue(any("codec must be h264" in error for error in errors))
        self.assertTrue(any("pixel format must be yuv420p" in error for error in errors))
        self.assertTrue(any("frame rate must be 30fps" in error for error in errors))

    def test_polyhaven_asset_requires_reproducibility_fields(self):
        manifest = copy.deepcopy(self.manifest)
        manifest["reproduction"]["polyhaven_assets"] = [{"id": "wood_planks"}]
        errors = self._validate(manifest)
        self.assertIn("reproduction.polyhaven_assets[0].resolution is required", errors)
        self.assertIn("reproduction.polyhaven_assets[0].retrieved_on is required", errors)

    def test_render_phase_allows_future_gates_to_be_pending(self):
        manifest = copy.deepcopy(self.manifest)
        for gate_name in ("motion_qa", "story_final_review", "app_integration_qa"):
            manifest["gates"][gate_name] = {"status": "pending"}
        manifest["artifacts"].pop("story_video")
        self.assertEqual([], self._validate(manifest, through="render"))
        self.assertTrue(any("must be pass or waived" in error for error in self._validate(manifest, through="app")))

    def test_irregular_frame_timestamps_fail_cfr_check(self):
        probe = copy.deepcopy(self.ffprobe)
        probe["frames"][2]["best_effort_timestamp_time"] = "0.080000"
        errors = self._validate(ffprobe=probe)
        self.assertIn("video must use a constant 30fps frame cadence", errors)

    def test_cli_returns_json_and_exit_one_for_non_object_manifest(self):
        manifest_path = self.package_dir / "invalid.json"
        manifest_path.write_text("[]")
        result = subprocess.run(
            [sys.executable, str(VALIDATOR_PATH), str(manifest_path), "--json-only"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(1, result.returncode)
        payload = json.loads(result.stdout)
        self.assertFalse(payload["valid"])
        self.assertIn("manifest root must be an object", payload["errors"])

    def test_non_waivable_human_gate_cannot_be_waived(self):
        manifest = copy.deepcopy(self.manifest)
        manifest["gates"]["still_human_review"].update(
            status="waived",
            reason="skip",
            impact="unknown",
            approved_by="owner",
        )
        self.assertIn(
            "gates.still_human_review cannot be waived",
            self._validate(manifest),
        )

    def test_story_video_is_validated_at_app_phase(self):
        story_probe = copy.deepcopy(self.ffprobe)
        story_probe["streams"][0]["codec_name"] = "hevc"
        errors = self._validate(story_ffprobe=story_probe)
        self.assertIn("story_video codec must be h264", errors)

    def test_render_validation_ledger_skips_probe_and_decode_when_input_is_unchanged(self):
        manifest_path = self.package_dir / "manifest.json"
        manifest_path.write_text(json.dumps(self.manifest))
        probe_path = self.package_dir / "ffprobe.json"
        probe_path.write_text(json.dumps(self.ffprobe))
        probe_counter = self.package_dir / "ffprobe.count"
        decode_counter = self.package_dir / "ffmpeg.count"

        def make_tool(path, body):
            path.write_text("#!/usr/bin/env python3\n" + body)
            path.chmod(0o755)

        make_tool(
            self.package_dir / "ffprobe",
            "import sys\nfrom pathlib import Path\n"
            "if '-version' in sys.argv:\n    print('ffprobe version test')\n"
            "else:\n"
            f"    counter=Path({str(probe_counter)!r}); counter.write_text(str((int(counter.read_text()) if counter.exists() else 0)+1))\n"
            f"    print(Path({str(probe_path)!r}).read_text())\n",
        )
        make_tool(
            self.package_dir / "ffmpeg",
            "import sys\nfrom pathlib import Path\n"
            "if '-version' in sys.argv:\n    print('ffmpeg version test')\n"
            "else:\n"
            f"    counter=Path({str(decode_counter)!r}); counter.write_text(str((int(counter.read_text()) if counter.exists() else 0)+1))\n",
        )
        ledger = self.package_dir / "evidence" / "render_validation_ledger.json"
        command = [
            sys.executable, str(VALIDATOR_PATH), str(manifest_path), "--through", "render", "--json-only",
            "--ffprobe-bin", str(self.package_dir / "ffprobe"), "--ffmpeg-bin", str(self.package_dir / "ffmpeg"), "--ledger", str(ledger),
        ]
        first = subprocess.run(command, capture_output=True, text=True)
        second = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(0, first.returncode, first.stderr)
        self.assertEqual(0, second.returncode, second.stderr)
        self.assertEqual("1", probe_counter.read_text())
        self.assertEqual("1", decode_counter.read_text())
        self.assertEqual("render_validation", json.loads(ledger.read_text())["ledger_type"])
        changed_manifest = copy.deepcopy(self.manifest)
        changed_manifest["render_spec_revision"] = "v2"
        manifest_path.write_text(json.dumps(changed_manifest))
        third = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(0, third.returncode, third.stderr)
        self.assertEqual("2", probe_counter.read_text())
        self.assertEqual("2", decode_counter.read_text())

    def test_repeated_ffprobe_failures_are_recorded_and_stop_before_third_probe(self):
        manifest_path = self.package_dir / "manifest.json"
        manifest_path.write_text(json.dumps(self.manifest))

        def make_tool(path, body):
            path.write_text("#!/usr/bin/env python3\n" + body)
            path.chmod(0o755)

        make_tool(
            self.package_dir / "ffprobe-failing",
            "import sys\n"
            "if '-version' in sys.argv:\n    print('ffprobe version test')\n"
            "else:\n    print('probe failed', file=sys.stderr); sys.exit(3)\n",
        )
        make_tool(
            self.package_dir / "ffmpeg-ok",
            "import sys\n"
            "if '-version' in sys.argv:\n    print('ffmpeg version test')\n"
            "else:\n    sys.exit(0)\n",
        )
        ledger = self.package_dir / "evidence" / "render_validation_ledger.json"
        command = [
            sys.executable, str(VALIDATOR_PATH), str(manifest_path), "--through", "render", "--json-only",
            "--ffprobe-bin", str(self.package_dir / "ffprobe-failing"),
            "--ffmpeg-bin", str(self.package_dir / "ffmpeg-ok"),
            "--ledger", str(ledger),
        ]
        first = subprocess.run(command, capture_output=True, text=True)
        second = subprocess.run(command, capture_output=True, text=True)
        third = subprocess.run(command, capture_output=True, text=True)

        self.assertEqual(1, first.returncode)
        self.assertEqual(1, second.returncode)
        self.assertEqual(1, third.returncode)
        self.assertEqual("needs_parent_decision", json.loads(third.stdout)["status"])
        recorded = json.loads(ledger.read_text())
        self.assertEqual("fail", recorded["status"])
        self.assertEqual(2, len(recorded["attempts"]))
        self.assertTrue((self.package_dir / "evidence" / "render_validation_error.json").is_file())


if __name__ == "__main__":
    unittest.main()

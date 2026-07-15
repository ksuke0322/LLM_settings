import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SKILL_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = SKILL_DIR / "scripts"


def valid_contract():
    return {
        "schema_version": 1,
        "theme_id": "windmill",
        "story_id": "windmill-story-01",
        "source": {"notion_url": "https://www.notion.so/story", "revision": "2026-07-15"},
        "frames_per_second": 30,
        "stage_extent": 10,
        "common_environment": "common_environment",
        "cools": [
            {
                "number": 1,
                "start_frame": 1,
                "end_frame": 300,
                "duration_seconds": 10,
                "hero": "mill",
                "emotional_reward": "羽根が回り始める",
                "concurrent_motion_limit": 1,
                "technical_risks": [],
                "spike_required": False,
                "transitions": [
                    {
                        "object_id": "mill",
                        "start_frame": 1,
                        "end_frame": 45,
                        "easing": "ease_out",
                        "entry_type": "drop",
                    }
                ],
                "background": {"visible_count": 15, "types": ["grass", "stone", "flower", "path", "fence"]},
            },
            {
                "number": 2,
                "start_frame": 1,
                "end_frame": 300,
                "duration_seconds": 10,
                "hero": "mill",
                "emotional_reward": "灯りがともる",
                "concurrent_motion_limit": 1,
                "technical_risks": [],
                "spike_required": False,
                "transitions": [
                    {
                        "object_id": "lamp",
                        "start_frame": 60,
                        "end_frame": 105,
                        "easing": "ease_in_out",
                        "entry_type": "fade",
                    }
                ],
                "background": {"visible_count": 16, "types": ["grass", "stone", "flower", "path", "fence"]},
            },
        ],
        "objects": [
            {
                "id": "mill",
                "category": "hero",
                "first_cool": 1,
                "tier": "hero",
                "size_ratio": 0.5,
                "entry_type": "drop",
                "motion_kind": "vertical",
                "signature_details": ["羽根"],
                "shared_material": True,
            },
            {
                "id": "lamp",
                "category": "peripheral",
                "first_cool": 2,
                "tier": "midground",
                "size_ratio": 0.3,
                "entry_type": "fade",
                "motion_kind": "light",
                "signature_details": ["発光部"],
                "shared_material": False,
            },
        ],
    }


def valid_scene(cool_number=1):
    assets = [
        {
            "id": "mill",
            "tier": "hero",
            "material_kind": "procedural",
            "crafted": True,
            "grounded": True,
            "visible": True,
            "bounds_within_stage": True,
            "size_ratio": 0.5,
            "dimensions": [5, 5, 5],
            "material_id": "mill-clay",
        }
    ]
    if cool_number == 2:
        assets.append(
            {
                "id": "lamp",
                "tier": "midground",
                "material_kind": "procedural",
                "crafted": True,
                "grounded": True,
                "visible": True,
                "bounds_within_stage": True,
                "size_ratio": 0.3,
                "dimensions": [3, 3, 3],
                "material_id": "lamp-clay",
            }
        )
    return {
        "cool_number": cool_number,
        "collections": ["common_environment"],
        "camera": {"hero_safe_area_coverage": 0.8},
        "assets": assets,
        "background": {"visible_count": 15, "type_count": 5},
        "world": {"id": "warm-dusk"},
    }


class QuantitativeValidatorTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_validator(self, script_name, payload):
        input_path = self.root / f"{script_name}.json"
        input_path.write_text(json.dumps(payload))
        result = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / script_name), str(input_path), "--json-only"],
            capture_output=True,
            text=True,
        )
        self.assertTrue(result.stdout, result.stderr)
        return result.returncode, json.loads(result.stdout)

    def test_story_contract_lints_timing_and_spike_requirements(self):
        contract = valid_contract()
        code, payload = self.run_validator("validate_story_contract.py", contract)
        self.assertEqual(0, code, payload)

        invalid = copy.deepcopy(contract)
        invalid["cools"][0]["technical_risks"] = ["new pivot"]
        code, payload = self.run_validator("validate_story_contract.py", invalid)
        self.assertEqual(1, code)
        self.assertIn("cools[0].spike_required must be true", payload["errors"])

    def test_scene_contract_lints_safe_area_and_asset_audit(self):
        payload = {"contract": valid_contract(), "scene": valid_scene()}
        code, result = self.run_validator("validate_scene_contract.py", payload)
        self.assertEqual(0, code, result)

        payload["scene"]["camera"]["hero_safe_area_coverage"] = 0.4
        code, result = self.run_validator("validate_scene_contract.py", payload)
        self.assertEqual(1, code)
        self.assertIn("scene.camera.hero_safe_area_coverage must be at least 0.6", result["errors"])

    def test_cool_continuity_rejects_unapproved_inherited_change(self):
        payload = {"contract": valid_contract(), "previous": valid_scene(1), "current": valid_scene(2)}
        code, result = self.run_validator("validate_cool_continuity.py", payload)
        self.assertEqual(0, code, result)

        payload["current"]["assets"][0]["dimensions"] = [6, 5, 5]
        code, result = self.run_validator("validate_cool_continuity.py", payload)
        self.assertEqual(1, code)
        self.assertIn("inherited asset mill dimensions changed without approval", result["errors"])

    def test_timeline_matches_contract_and_motion_limit(self):
        payload = {
            "contract": valid_contract(),
            "timeline": {
                "cool_number": 1,
                "transitions": copy.deepcopy(valid_contract()["cools"][0]["transitions"]),
            },
        }
        code, result = self.run_validator("validate_timeline.py", payload)
        self.assertEqual(0, code, result)

        payload["timeline"]["transitions"].append(
            {"object_id": "lamp", "start_frame": 10, "end_frame": 30, "easing": "ease_out", "entry_type": "fade"}
        )
        code, result = self.run_validator("validate_timeline.py", payload)
        self.assertEqual(1, code)
        self.assertIn("timeline.concurrent_motion_count exceeds 1", result["errors"])

    def test_review_evidence_requires_human_review_artifacts(self):
        paths = []
        for name in ("animatic.mp4", "still.png", "story.mp4", "animatic.md", "still.md", "story.md"):
            path = self.root / name
            path.write_text("fixture")
            paths.append(path)
        payload = {
            "reviews": {
                "animatic": {"package": str(paths[3]), "primary_assets": [str(paths[0])]},
                "still_human_review": {"package": str(paths[4]), "primary_assets": [str(paths[1])]},
                "story_final_review": {"package": str(paths[5]), "primary_assets": [str(paths[2])]},
            }
        }
        code, result = self.run_validator("validate_review_evidence.py", payload)
        self.assertEqual(0, code, result)

        payload["reviews"]["still_human_review"]["primary_assets"] = []
        code, result = self.run_validator("validate_review_evidence.py", payload)
        self.assertEqual(1, code)
        self.assertIn("reviews.still_human_review.primary_assets must contain at least one path", result["errors"])

    def test_review_evidence_allows_current_gate_subset(self):
        animatic = self.root / "animatic.mp4"
        still = self.root / "still.png"
        animatic_package = self.root / "animatic.md"
        still_package = self.root / "still.md"
        for path in (animatic, still, animatic_package, still_package):
            path.write_text("fixture")
        payload = {
            "required_gates": ["animatic", "still_human_review"],
            "reviews": {
                "animatic": {"package": str(animatic_package), "primary_assets": [str(animatic)]},
                "still_human_review": {"package": str(still_package), "primary_assets": [str(still)]},
            },
        }
        code, result = self.run_validator("validate_review_evidence.py", payload)
        self.assertEqual(0, code, result)

    def test_theme_integration_checks_catalog_and_bundled_videos(self):
        content = self.root / "Content"
        videos = content / "Videos"
        videos.mkdir(parents=True)
        (videos / "windmill-cool1.mp4").write_bytes(b"fixture")
        (videos / "windmill-cool2.mp4").write_bytes(b"fixture")
        (content / "themes.json").write_text(
            json.dumps(
                {
                    "themes": [
                        {
                            "id": "windmill",
                            "stories": [
                                {
                                    "id": "windmill-story-01",
                                    "cools": [
                                        {"order": 0, "artwork": {"type": "video", "name": "windmill-cool1"}},
                                        {"order": 1, "artwork": {"type": "video", "name": "windmill-cool2"}},
                                    ],
                                }
                            ],
                        }
                    ]
                }
            )
        )
        payload = {"contract": valid_contract(), "app_root": str(self.root), "session_seconds": 1500}
        code, result = self.run_validator("validate_theme_integration.py", payload)
        self.assertEqual(0, code, result)

        (videos / "windmill-cool2.mp4").unlink()
        code, result = self.run_validator("validate_theme_integration.py", payload)
        self.assertEqual(1, code)
        self.assertIn("missing bundled video: windmill-cool2.mp4", result["errors"])


if __name__ == "__main__":
    unittest.main()

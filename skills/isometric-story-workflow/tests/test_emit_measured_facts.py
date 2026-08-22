import importlib.util
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "emit_measured_facts.py"


def load_script():
    spec = importlib.util.spec_from_file_location("emit_measured_facts", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class EmitMeasuredFactsPureHelperTests(unittest.TestCase):
    def test_import_does_not_require_bpy_and_parser_uses_default_scale(self):
        script = load_script()

        with tempfile.TemporaryDirectory() as temp:
            blend = Path(temp) / "cool1.blend"
            blend.touch()
            args = script.parse_arguments(["--blend", str(blend)])

        self.assertEqual(332.3, args.scale)
        self.assertEqual(300, args.frame)

    def test_cli_requires_contract_or_explicit_kinds(self):
        script = load_script()

        with tempfile.TemporaryDirectory() as temp:
            blend = Path(temp) / "cool1.blend"
            blend.touch()
            args = script.parse_arguments(["--blend", str(blend)])

            with self.assertRaises(script.MeasuredFactsError):
                script._validate_cli(args)

    def test_bbox_and_local_cross_section_return_explicit_dimensions(self):
        script = load_script()
        points = [(0.0, -1.0, 2.0), (2.0, 3.0, 3.0), (-1.0, 1.0, 2.5)]

        measured = script.bbox(points)
        cross_section = script.local_cross_section(points)

        self.assertEqual((-1.0, -1.0, 2.0), measured["min"])
        self.assertEqual((2.0, 3.0, 3.0), measured["max"])
        self.assertEqual((3.0, 4.0, 1.0), measured["dimensions"])
        self.assertEqual((1.0, 3.0), cross_section["cross_section"])

    def test_explicit_selection_preserves_individual_object_names(self):
        script = load_script()
        available = [
            {"name": "stand_stone_R1", "story_id": "stone", "story_type": "stand_stone"},
            {"name": "stand_stone_R2", "story_id": "stone", "story_type": "stand_stone"},
            {"name": "stand_stone_R3", "story_id": "stone", "story_type": "stand_stone"},
        ]

        selected = script.resolve_selection(available, ["stand_stone_R1", "stand_stone_R2"])

        self.assertEqual(["stand_stone_R1", "stand_stone_R2"], [item["name"] for item in selected])

    def test_contract_selection_filters_first_cool_and_resolves_story_type(self):
        script = load_script()
        available = [
            {"name": "hive_body", "story_id": "hive", "story_type": "hive_deep"},
            {"name": "hive_handhold", "story_id": "hive", "story_type": "hive_deep"},
            {"name": "future_lamp", "story_id": "lamp", "story_type": "lamp", "first_cool": 2},
        ]
        contract = {
            "objects": [
                {"id": "hive", "first_cool": 1, "story_type": "hive_deep"},
                {"id": "lamp", "first_cool": 2, "story_type": "lamp"},
            ]
        }

        selected = script.resolve_selection(available, ["hive_deep"], contract=contract, cool=1)

        self.assertEqual(["hive_body", "hive_handhold"], [item["name"] for item in selected])

    def test_contract_explicit_members_are_individual_and_have_one_representative(self):
        script = load_script()
        available = [
            {"name": "stand_stone_R1"},
            {"name": "stand_stone_R2"},
        ]
        contract = {
            "objects": [{
                "id": "stand_stones",
                "first_cool": 1,
                "members": ["stand_stone_R1", "stand_stone_R2"],
                "scatter": True,
            }]
        }

        selected = script.resolve_selection(
            available,
            ["stand_stone_R1", "stand_stone_R2"],
            contract=contract,
            cool=1,
        )

        self.assertEqual(["stand_stone_R1", "stand_stone_R2"], [item["name"] for item in selected])
        self.assertEqual([True, False], [item["representative"] for item in selected])

    def _closed_recess_fixture(self, base=0.452):
        points = [
            (0.500, -1.0, -1.0),
            (0.500, 1.0, -1.0),
            (0.500, 1.0, 1.0),
            (0.500, -1.0, 1.0),
            (base, -1.0, -1.0),
            (base, 1.0, -1.0),
            (base, 1.0, 1.0),
            (base, -1.0, 1.0),
        ]
        faces = [
            (0, 1, 5, 4),
            (1, 2, 6, 5),
            (2, 3, 7, 6),
            (3, 0, 4, 7),
            (4, 5, 6, 7),
        ]
        return points, faces

    def test_recess_detection_reports_measured_planes_and_depth(self):
        script = load_script()
        points, faces = self._closed_recess_fixture()

        recess = script.detect_recess(points, faces)

        self.assertEqual(0.500, recess["face"])
        self.assertEqual(0.452, recess["base"])
        self.assertAlmostEqual(0.048, recess["depth"])
        self.assertFalse(recess["through"])
        self.assertNotIn("note", recess)
        self.assertIsNone(script.detect_recess([(0.5, 0.0, 0.0)]))

    def test_recess_detection_follows_a_moved_inner_plane(self):
        script = load_script()
        points, faces = self._closed_recess_fixture(base=0.318)

        self.assertEqual(
            {
                "face": 0.500,
                "base": 0.318,
                "depth": 0.182,
                "through": False,
            },
            script.detect_recess(points, faces),
        )

    def test_recess_detection_reports_true_for_an_open_tunnel(self):
        script = load_script()
        points, faces = self._closed_recess_fixture()

        self.assertTrue(script.detect_recess(points, faces[:-1])["through"])

    def test_recess_detection_is_undetermined_without_topology(self):
        script = load_script()
        result = script.detect_recess([(0.500, 0.0, 0.0), (0.452, 0.1, 0.1)])

        self.assertEqual(0.500, result["face"])
        self.assertEqual(0.452, result["base"])
        self.assertAlmostEqual(0.048, result["depth"])
        self.assertIsNone(result["through"])
        self.assertEqual("not determined", result["note"])

    def test_recess_detector_has_no_case_specific_constants_or_heading(self):
        script = load_script()
        source = SCRIPT.read_text(encoding="utf-8")

        self.assertNotIn("HANDHOLD_", source)
        self.assertNotIn("detect_handhold", source)
        self.assertNotIn("Beehive handhold", source)
        self.assertEqual("recess", script._MEASURED_RECESS_KEY)

    def test_malformed_selection_and_contract_fail_closed(self):
        script = load_script()
        available = [{"name": "stone", "story_id": "stone", "story_type": "stone"}]

        with self.assertRaises(script.SelectionError):
            script.resolve_selection(available, ["missing"])
        with self.assertRaises(script.SelectionError):
            script.resolve_selection(available, ["stone"], contract={"objects": []}, cool=1)
        with self.assertRaises(script.SelectionError):
            script.resolve_selection(available, ["stone"], contract={"objects": [{"id": "stone"}]}, cool=1)
        with self.assertRaises(script.SelectionError):
            script.resolve_selection([], None)

    def test_default_output_path_uses_blend_parent_evidence_and_cool(self):
        script = load_script()

        path = script.default_output_path(Path("/tmp/work/cool1.blend"), 7)

        self.assertEqual(Path("/tmp/work/evidence/cool7_measured_facts.md"), path)

    def test_contact_pairs_and_markdown_include_individual_names_and_px_facts(self):
        script = load_script()
        objects = [
            {
                "name": "stand_stone_R1",
                "representative": True,
                "world_bbox": {"min": (0.0, 0.0, 0.0), "max": (1.0, 1.0, 1.0), "dimensions": (1.0, 1.0, 1.0)},
                "local_bbox": {"min": (0.0, 0.0, 0.0), "max": (1.0, 1.0, 1.0), "dimensions": (1.0, 1.0, 1.0)},
                "cross_section": (1.0, 1.0),
                "bottom_z": 0.0,
                "top_z": 1.0,
                "recess": None,
            },
            {
                "name": "stand_stone_R2",
                "representative": False,
                "world_bbox": {"min": (0.25, 0.25, 1.0), "max": (0.75, 0.75, 2.0), "dimensions": (0.5, 0.5, 1.0)},
                "local_bbox": {"min": (0.25, 0.25, 1.0), "max": (0.75, 0.75, 2.0), "dimensions": (0.5, 0.5, 1.0)},
                "cross_section": (0.5, 0.5),
                "bottom_z": 1.0,
                "top_z": 2.0,
                "evaluated_bottom_z": 1.0,
                "evaluated_top_z": 2.0,
                "recess": None,
            },
        ]

        contacts = script.detect_contacting_pairs(objects)
        markdown = script.format_markdown(objects, contacts, scale=10.0, frame=300)

        self.assertEqual([("stand_stone_R1", "stand_stone_R2")], contacts)
        self.assertIn("## Object: stand_stone_R1", markdown)
        self.assertIn("## Object: stand_stone_R2", markdown)
        self.assertIn("representative: true", markdown)
        self.assertIn("dimensions_px: (10.000000, 10.000000, 10.000000)", markdown)
        self.assertIn("- bottom_z: 0.000000", markdown)
        self.assertIn("  - bottom_z_px: 0.000000", markdown)
        self.assertIn("- top_z: 1.000000", markdown)
        self.assertIn("  - top_z_px: 10.000000", markdown)
        self.assertIn("### Recess measurement", markdown)
        self.assertNotIn("Beehive handhold", markdown)
        self.assertIn("## Contacting Pairs", markdown)


if __name__ == "__main__":
    unittest.main()

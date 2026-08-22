import importlib.util
from pathlib import Path
import tempfile
import unittest


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
TEMPLATE = Path(__file__).resolve().parents[1] / "references" / "reference-conflicts-template.md"


def load_validator():
    spec = importlib.util.spec_from_file_location(
        "validate_reference_conflicts", SCRIPTS_DIR / "validate_reference_conflicts.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ReferenceConflictValidatorTests(unittest.TestCase):
    def test_five_item_template_passes(self):
        validator = load_validator()
        result = validator.validate_file(TEMPLATE)
        self.assertTrue(result["valid"], result)
        self.assertEqual(5, result["item_count"])

        template = TEMPLATE.read_text(encoding="utf-8")
        self.assertIn("そのまま転記しない", template)
        self.assertIn("adopt: design: 留め継ぎ", template)
        self.assertIn("adopt: real_data: 実物ラングストロス寸法をそのまま採用", template)
        self.assertIn("adopt: real_data: 暗い内部", template)
        self.assertIn("adopt: design: 固定カメラのまま手前の石のみ可視", template)

    def test_blank_tbd_and_missing_adopt_side_fail(self):
        validator = load_validator()
        content = """# Reference conflicts

## 1. Conflict
- conflict: TBD
- reference_shows: reference
- design_or_real_data: design
- adopt:
- basis: reason
"""
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "reference_conflicts.md"
            path.write_text(content, encoding="utf-8")
            result = validator.validate_file(path)
        self.assertFalse(result["valid"])
        self.assertTrue(any("TBD" in error for error in result["errors"]))
        self.assertTrue(any("adopt" in error for error in result["errors"]))

    def test_missing_required_item_fails(self):
        validator = load_validator()
        content = """# Reference conflicts

## 1. Conflict
- conflict: lap joint vs finger join
- reference_shows: lap joint
- design_or_real_data: finger join
- adopt: design
- basis: signature requirement
"""
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "reference_conflicts.md"
            path.write_text(content, encoding="utf-8")
            result = validator.validate_file(path)
        self.assertFalse(result["valid"])
        self.assertTrue(any("5" in error for error in result["errors"]))

    def test_adopt_requires_a_canonical_prefix_with_non_empty_content(self):
        validator = load_validator()
        valid_prefixes = ("design", "reference", "real_data", "hybrid")
        for prefix in valid_prefixes:
            content = f"""# Reference conflicts

## 1. Conflict
- conflict: conflict
- reference_shows: reference
- design_or_real_data: design
- adopt: {prefix}: selected side
- basis: reason
"""
            result = validator.validate_content(content, expected_count=1)
            self.assertTrue(result["valid"], (prefix, result))

        for adopt in ("something design: selected side", "real: selected side", "design"):
            content = f"""# Reference conflicts

## 1. Conflict
- conflict: conflict
- reference_shows: reference
- design_or_real_data: design
- adopt: {adopt}
- basis: reason
"""
            result = validator.validate_content(content, expected_count=1)
            self.assertFalse(result["valid"], (adopt, result))


if __name__ == "__main__":
    unittest.main()

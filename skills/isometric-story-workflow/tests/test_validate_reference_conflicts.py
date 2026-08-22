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


if __name__ == "__main__":
    unittest.main()

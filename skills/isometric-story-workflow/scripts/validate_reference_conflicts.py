"""Validate the fixed Step 4 reference-conflict decision document."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
from typing import Any


REQUIRED_FIELDS = (
    "conflict",
    "reference_shows",
    "design_or_real_data",
    "adopt",
    "basis",
)
FIELD_PATTERN = re.compile(r"^-\s+([a-z_]+):\s*(.*)$", re.MULTILINE)
SECTION_PATTERN = re.compile(r"^##\s+(\d+)\.\s+(.+?)\s*$", re.MULTILINE)
TBD_PATTERN = re.compile(r"\b(?:tbd|todo|unknown)\b|未定|未確認|要確認", re.IGNORECASE)
ADOPT_PATTERN = re.compile(r"reference|design|real|hybrid|参照|設計|実物|併用", re.IGNORECASE)


def _sections(content: str) -> list[tuple[int, str, str]]:
    matches = list(SECTION_PATTERN.finditer(content))
    result: list[tuple[int, str, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        result.append((int(match.group(1)), match.group(2), content[match.end():end]))
    return result


def validate_content(content: str, expected_count: int = 5) -> dict[str, Any]:
    errors: list[str] = []
    sections = _sections(content)
    if len(sections) != expected_count:
        errors.append(f"expected {expected_count} numbered conflict items, found {len(sections)}")
    expected_numbers = list(range(1, expected_count + 1))
    actual_numbers = [number for number, _, _ in sections]
    if actual_numbers != expected_numbers:
        errors.append(f"conflict item numbers must be {expected_numbers}, found {actual_numbers}")

    for number, title, body in sections:
        fields: dict[str, str] = {}
        for match in FIELD_PATTERN.finditer(body):
            fields[match.group(1)] = match.group(2).strip()
        for field in REQUIRED_FIELDS:
            value = fields.get(field, "")
            if not value:
                errors.append(f"item {number} {field} is blank")
            elif TBD_PATTERN.search(value):
                errors.append(f"item {number} {field} contains TBD/unknown")
        adopt = fields.get("adopt", "")
        if adopt and not ADOPT_PATTERN.search(adopt):
            errors.append(f"item {number} adopt must name the adopted side")
        if not title.strip():
            errors.append(f"item {number} title is blank")

    return {"valid": not errors, "item_count": len(sections), "errors": errors}


def validate_file(path: Path, expected_count: int = 5) -> dict[str, Any]:
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        return {"valid": False, "item_count": 0, "errors": [f"cannot read reference conflicts: {error}"]}
    return validate_content(content, expected_count=expected_count)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--expected-count", type=int, default=5)
    args = parser.parse_args(argv)
    result = validate_file(args.file, expected_count=args.expected_count)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

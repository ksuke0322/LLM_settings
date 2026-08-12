#!/usr/bin/env python3
"""Validate the compact JSON contract returned by Codex/Luna executions."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from repetition_control import sha256_path


OPERATIONS = {"render", "validate", "snapshot", "quantitative_qa", "evidence_check"}
STATUSES = {"pass", "fail", "needs_parent_decision"}
REQUIRED_FIELDS = (
    "schema_version", "status", "operation", "step", "inputs", "outputs",
    "command", "exit_code", "duration_ms", "warnings",
)
ALLOWED_FIELDS = set(REQUIRED_FIELDS)


def validate_report(report: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(report, dict):
        return ["report must be an object"]
    for key in REQUIRED_FIELDS:
        if key not in report:
            errors.append(f"{key} is required")
    unknown = sorted(set(report) - ALLOWED_FIELDS)
    if unknown:
        errors.append(f"unknown fields are not allowed: {', '.join(unknown)}")
    if report.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if report.get("status") not in STATUSES:
        errors.append("status is invalid")
    if report.get("operation") not in OPERATIONS:
        errors.append("operation is invalid")
    if not isinstance(report.get("step"), str) or not report.get("step", "").strip():
        errors.append("step must be a non-empty string")
    if not isinstance(report.get("command"), list) or not report.get("command") or not all(isinstance(value, str) and value for value in report.get("command", [])):
        errors.append("command must be a non-empty array of strings")
    if not isinstance(report.get("warnings"), list) or not all(isinstance(value, str) for value in report.get("warnings", [])):
        errors.append("warnings must be an array of strings")
    if isinstance(report.get("exit_code"), bool) or not isinstance(report.get("exit_code"), int):
        errors.append("exit_code must be an integer")
    if isinstance(report.get("duration_ms"), bool) or not isinstance(report.get("duration_ms"), (int, float)) or report.get("duration_ms", -1) < 0:
        errors.append("duration_ms must be non-negative")
    if report.get("status") == "pass" and report.get("exit_code") != 0:
        errors.append("pass requires exit_code 0")
    if report.get("status") in {"fail", "needs_parent_decision"} and report.get("exit_code") == 0:
        errors.append("non-pass status requires a non-zero exit_code")
    for field in ("inputs", "outputs"):
        entries = report.get(field)
        if not isinstance(entries, list) or not entries:
            errors.append(f"{field} must be a non-empty array")
            continue
        for index, entry in enumerate(entries):
            label = f"{field}[{index}]"
            if not isinstance(entry, dict):
                errors.append(f"{label} must be an object")
                continue
            raw_path = entry.get("path")
            if not isinstance(raw_path, str) or not Path(raw_path).is_absolute():
                errors.append(f"{label}.path must be absolute")
                continue
            if not Path(raw_path).is_file():
                errors.append(f"{label}.path does not exist")
                continue
            if entry.get("sha256") != sha256_path(raw_path):
                errors.append(f"{label}.sha256 does not match")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    try:
        errors = validate_report(json.loads(args.report.read_text()))
    except (OSError, json.JSONDecodeError, TypeError) as error:
        errors = [f"report could not be read: {error}"]
    print(json.dumps({"status": "fail" if errors else "pass", "errors": errors}, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Validate workflow repetition ledgers and stop repeated findings fail-closed."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from repetition_control import cache_decision, repeated_finding_decision, rerun_decision, sha256_path


LEDGER_TYPES = {"quantitative_qa", "motion_qa", "render_validation", "codex_image_preflight"}
REQUIRED_KEY_FIELDS = {
    "quantitative_qa": {"blend_sha256", "inputs", "cool", "qa_scope", "runner_revision", "exporter_revision", "validator_revision", "tool_revision", "ground_name", "report_path"},
    "motion_qa": {"blend_sha256", "video_sha256", "criteria_revision", "sample_set_revision"},
    "render_validation": {"video_sha256", "render_spec_revision", "validator_sha256", "through", "ffprobe_path", "ffmpeg_path", "ffprobe_version", "ffmpeg_version"},
    "codex_image_preflight": {"purpose", "ordered_images", "model_revision", "prompt_revision"},
}


def validate_ledger(ledger: Any, current_key: dict[str, Any] | None = None) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    fingerprints: list[str] = []
    if not isinstance(ledger, dict):
        return {"status": "fail", "rerun_allowed": False, "errors": ["ledger must be an object"], "warnings": [], "finding_fingerprints": []}
    if ledger.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if ledger.get("ledger_type") not in LEDGER_TYPES:
        errors.append("ledger_type is invalid")
    if ledger.get("status") not in {"pass", "fail", "needs_parent_decision"}:
        errors.append("status is invalid")
    ledger_type = ledger.get("ledger_type")
    if not isinstance(ledger.get("key"), dict):
        errors.append("key must be an object")
        key = {}
    else:
        key = ledger["key"]
    missing_key_fields = sorted(REQUIRED_KEY_FIELDS.get(ledger_type, set()) - set(key))
    if missing_key_fields:
        errors.append(f"key is missing required fields: {', '.join(missing_key_fields)}")
    outputs = ledger.get("outputs")
    if not isinstance(outputs, list) or not outputs:
        errors.append("outputs must be a non-empty array")
        outputs = []
    for index, raw_path in enumerate(outputs):
        if not isinstance(raw_path, dict):
            errors.append(f"outputs[{index}] must be an object")
            continue
        path_value = raw_path.get("path")
        path = Path(path_value) if isinstance(path_value, str) else Path("")
        if not path.is_absolute() or not path.is_file():
            errors.append(f"outputs[{index}] must be an existing absolute file")
        elif raw_path.get("sha256") != sha256_path(path):
            errors.append(f"outputs[{index}].sha256 does not match")
    attempts = ledger.get("attempts")
    if not isinstance(attempts, list) or not attempts:
        errors.append("attempts must be a non-empty array")
        attempts = []
    for index, attempt in enumerate(attempts):
        if not isinstance(attempt, dict):
            errors.append(f"attempts[{index}] must be an object")
            continue
        if attempt.get("attempt") != index + 1:
            errors.append(f"attempts[{index}].attempt must be {index + 1}")
        if attempt.get("status") not in {"pass", "fail", "needs_parent_decision"}:
            errors.append(f"attempts[{index}].status is invalid")
        attempt_key = attempt.get("key")
        if not isinstance(attempt_key, dict):
            errors.append(f"attempts[{index}].key must be an object")
        else:
            missing_attempt_key_fields = sorted(REQUIRED_KEY_FIELDS.get(ledger_type, set()) - set(attempt_key))
            if missing_attempt_key_fields:
                errors.append(
                    f"attempts[{index}].key is missing required fields: {', '.join(missing_attempt_key_fields)}"
                )
        attempt_outputs = attempt.get("outputs")
        if not isinstance(attempt_outputs, list) or not attempt_outputs:
            errors.append(f"attempts[{index}].outputs must be a non-empty array")
        else:
            for output_index, output in enumerate(attempt_outputs):
                if not isinstance(output, dict):
                    errors.append(f"attempts[{index}].outputs[{output_index}] must be an object")
                    continue
                output_path = output.get("path")
                if not isinstance(output_path, str) or not Path(output_path).is_absolute() or not Path(output_path).is_file():
                    errors.append(f"attempts[{index}].outputs[{output_index}] must be an existing absolute file")
                elif output.get("sha256") != sha256_path(output_path):
                    errors.append(f"attempts[{index}].outputs[{output_index}].sha256 does not match")
        attempt_fingerprints = attempt.get("finding_fingerprints")
        if not isinstance(attempt_fingerprints, list) or not all(isinstance(value, str) for value in attempt_fingerprints):
            errors.append(f"attempts[{index}].finding_fingerprints must be an array of strings")
        else:
            fingerprints.extend(attempt_fingerprints)
    current = ledger.get("finding_fingerprints")
    if not isinstance(current, list) or not all(isinstance(value, str) for value in current):
        errors.append("finding_fingerprints must be an array of strings")
        current = []
    if attempts and isinstance(attempts[-1], dict) and attempts[-1].get("key") != key:
        errors.append("ledger.key must match the latest attempt key")
    if repeated_finding_decision(attempts, current) == "needs_parent_decision" or rerun_decision(ledger) == "needs_parent_decision":
        return {"status": "needs_parent_decision", "rerun_allowed": False, "errors": errors, "warnings": warnings, "finding_fingerprints": current}
    if ledger.get("status") == "needs_parent_decision":
        return {"status": "needs_parent_decision", "rerun_allowed": False, "errors": errors, "warnings": warnings, "finding_fingerprints": fingerprints}
    if current_key is not None and not errors:
        decision = cache_decision(ledger, current_key, ledger_type)
        if decision["reuse"]:
            return {"status": "pass", "rerun_allowed": False, "cache_reusable": True, "errors": errors, "warnings": [decision["reason"]], "finding_fingerprints": fingerprints}
        if ledger.get("status") == "pass":
            return {"status": "rerun_allowed", "rerun_allowed": True, "cache_reusable": False, "errors": errors, "warnings": [decision["reason"]], "finding_fingerprints": fingerprints}
    return {"status": "fail" if errors else ledger.get("status", "fail"), "rerun_allowed": not errors and ledger.get("status") == "fail", "cache_reusable": False, "errors": errors, "warnings": warnings, "finding_fingerprints": fingerprints}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("ledger", type=Path)
    parser.add_argument("--key-file", type=Path, help="current input key JSON for no-change cache validation")
    args = parser.parse_args()
    try:
        current_key = json.loads(args.key_file.read_text()) if args.key_file else None
        if current_key is not None and not isinstance(current_key, dict):
            raise TypeError("current key must be an object")
        result = validate_ledger(json.loads(args.ledger.read_text()), current_key)
    except (OSError, json.JSONDecodeError, TypeError) as error:
        result = {"status": "fail", "rerun_allowed": False, "errors": [f"ledger could not be read: {error}"], "warnings": [], "finding_fingerprints": []}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["status"] in {"pass", "rerun_allowed"} and not result["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

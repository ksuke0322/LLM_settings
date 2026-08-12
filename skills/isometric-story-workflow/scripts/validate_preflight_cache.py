#!/usr/bin/env python3
"""Return a fail-closed reuse decision for Ministral image preflight results."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from repetition_control import cache_decision, output_entry, sha256_path


MIN_CONFIDENCE = 0.6


def preflight_key(images: list[Path], purpose: str, model_revision: str, prompt_revision: str) -> dict:
    return {
        "purpose": purpose,
        "ordered_images": [{"path": str(path.resolve()), "sha256": sha256_path(path)} for path in images],
        "model_revision": model_revision,
        "prompt_revision": prompt_revision,
    }


def _confidence_is_acceptable(value: object) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return MIN_CONFIDENCE <= value <= 1
    return isinstance(value, str) and value.strip().casefold() in {"medium", "high"}


def record_success(ledger_path: Path, report_path: Path, key: dict) -> None:
    report = json.loads(report_path.read_text())
    if not isinstance(report, dict):
        raise ValueError("preflight report must be a JSON object")
    required = {"purpose", "input_images", "observations", "uncertainties", "failure"}
    missing = sorted(required - set(report))
    if missing:
        raise ValueError(f"preflight report is missing fields: {', '.join(missing)}")
    expected_images = [entry["path"] for entry in key["ordered_images"]]
    if report.get("purpose") != key["purpose"] or report.get("input_images") != expected_images:
        raise ValueError("preflight report does not match the cache key")
    if report.get("failure") not in (None, False, ""):
        raise ValueError("failed preflight reports cannot be cached")
    if not isinstance(report.get("observations"), list) or not isinstance(report.get("uncertainties"), list):
        raise ValueError("observations and uncertainties must be arrays")
    for index, observation in enumerate(report["observations"]):
        if not isinstance(observation, dict):
            raise ValueError(f"observations[{index}] must be an object")
        if not isinstance(observation.get("item"), str) or not observation["item"].strip():
            raise ValueError(f"observations[{index}].item must be a non-empty string")
        evidence = observation.get("evidence_image")
        if not isinstance(evidence, str) or not Path(evidence).is_absolute() or not Path(evidence).is_file():
            raise ValueError(f"observations[{index}].evidence_image must be an existing absolute path")
        if not _confidence_is_acceptable(observation.get("confidence")):
            raise ValueError(f"observations[{index}].confidence is missing, low, or invalid")
        if not isinstance(observation.get("note"), str) or not observation["note"].strip():
            raise ValueError(f"observations[{index}].note must be a non-empty string")
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    previous = json.loads(ledger_path.read_text()) if ledger_path.is_file() else {}
    attempts = previous.get("attempts", []) if isinstance(previous, dict) else []
    if not isinstance(attempts, list):
        attempts = []
    attempts.append({
        "attempt": len(attempts) + 1,
        "key": key,
        "status": "pass",
        "finding_fingerprints": [],
        "outputs": [output_entry(report_path)],
    })
    ledger_path.write_text(json.dumps({
        "schema_version": 1,
        "ledger_type": "ministral_preflight",
        "status": "pass",
        "key": key,
        "outputs": [output_entry(report_path)],
        "finding_fingerprints": [],
        "attempts": attempts,
    }, ensure_ascii=False, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("ledger", type=Path)
    parser.add_argument("--purpose", required=True)
    parser.add_argument("--model-revision", required=True)
    parser.add_argument("--prompt-revision", required=True)
    parser.add_argument("--record-report", type=Path, help="record a successful JSON preflight report")
    parser.add_argument("images", nargs="+", type=Path)
    args = parser.parse_args()
    try:
        key = preflight_key(args.images, args.purpose, args.model_revision, args.prompt_revision)
        ledger = json.loads(args.ledger.read_text()) if args.ledger.is_file() else None
        result = cache_decision(ledger, key, "ministral_preflight") if ledger else {"reuse": False, "reason": "no_ledger"}
        if args.record_report:
            record_success(args.ledger, args.record_report, key)
            payload = {"status": "pass", "reuse": False, "recorded": True, "reason": "preflight_report_recorded"}
        elif result["reuse"]:
            payload = {"status": "pass", "reuse": True, "reason": result["reason"]}
        else:
            payload = {"status": "rerun_allowed", "reuse": False, "reason": result["reason"]}
    except (OSError, json.JSONDecodeError, TypeError, ValueError, FileNotFoundError) as error:
        payload = {"status": "needs_parent_decision", "reuse": False, "reason": f"input_unreadable: {error}"}
    print(json.dumps(payload, ensure_ascii=False))
    return 0 if payload["status"] in {"pass", "rerun_allowed"} else 1


if __name__ == "__main__":
    raise SystemExit(main())

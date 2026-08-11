#!/usr/bin/env python3
"""Validate Step 8 independent-review reports and their rerun ledger.

The validator is deliberately independent of Blender.  It checks the fixed
JSON contract, image evidence, gate-specific conclusions, and the immutable
input revisions recorded by the parent agent.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
from typing import Any


SCHEMA_VERSION = 1
REVIEW_TYPES = {"8A", "8B", "8C"}
REPORT_STATUSES = {"pass", "fail", "needs_parent_decision"}
PARENT_ACTIONS = {"fix", "pause", "waiver", "pass"}
SHA256_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")
OUTPUT_KEYS = (
    "status",
    "rerun_allowed",
    "errors",
    "warnings",
    "finding_fingerprints",
)
GATE_FAILURE_MESSAGES = {
    "8A has unresolved required_match findings",
    "8B has unresolved high or medium findings",
    "8C has an unrealized signature, unreadable class, or unreadable existence reason",
}


def _is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().casefold())


def finding_fingerprint(
    review_type: str,
    kind: Any,
    criterion: Any,
    location: Any,
) -> str:
    """Return the stable fingerprint required by ReviewLedger v1."""

    return "|".join(
        (
            _normalize(review_type),
            _normalize(kind),
            _normalize(criterion),
            _normalize(location),
        )
    )


def _validate_path(raw_path: Any, label: str, errors: list[str]) -> None:
    if not _is_nonempty_string(raw_path):
        errors.append(f"{label} is required")
        return
    path = Path(raw_path)
    if not path.is_absolute():
        errors.append(f"{label} must be an absolute path")
    elif not path.exists():
        errors.append(f"{label} does not exist: {path}")
    elif not path.is_file():
        errors.append(f"{label} must be a regular file: {path}")


def _validate_images(raw_images: Any, label: str, errors: list[str]) -> None:
    if not isinstance(raw_images, list) or not raw_images:
        errors.append(f"{label} must contain at least one absolute path")
        return
    for index, raw_path in enumerate(raw_images):
        _validate_path(raw_path, f"{label}[{index}]", errors)


def _validate_note(raw_note: Any, label: str, errors: list[str], required: bool = True) -> None:
    if not _is_nonempty_string(raw_note):
        if required:
            errors.append(f"{label} is required")
        return
    if len(raw_note) > 240:
        errors.append(f"{label} must be at most 240 characters")
    if "\n" in raw_note or "\r" in raw_note:
        errors.append(f"{label} must be one sentence on one line")


def _validate_waiver_metadata(raw_waiver: Any, label: str, errors: list[str]) -> bool:
    if not isinstance(raw_waiver, dict):
        errors.append(f"{label} must contain reason, impact, and approved_by")
        return False
    valid = True
    for key in ("reason", "impact", "approved_by"):
        if not _is_nonempty_string(raw_waiver.get(key)):
            errors.append(f"{label}.{key} is required")
            valid = False
    return valid


def _validate_common(report: Any, errors: list[str]) -> str | None:
    if not isinstance(report, dict):
        errors.append("report must be a JSON object")
        return None
    if report.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"schema_version must be {SCHEMA_VERSION}")
    review_type = report.get("review_type")
    if review_type not in REVIEW_TYPES:
        errors.append("review_type must be one of 8A, 8B, or 8C")
        review_type = None
    if report.get("status") not in REPORT_STATUSES:
        errors.append("status must be pass, fail, or needs_parent_decision")
    _validate_images(report.get("input_images"), "input_images", errors)
    _validate_note(report.get("conclusion"), "conclusion", errors)
    return review_type


def _validate_finding_images(finding: dict[str, Any], label: str, errors: list[str]) -> None:
    _validate_images(finding.get("evidence_images"), f"{label}.evidence_images", errors)
    _validate_note(finding.get("note"), f"{label}.note", errors)


def _validate_8a(report: dict[str, Any], errors: list[str], warnings: list[str]) -> tuple[str, list[str]]:
    findings = report.get("findings")
    if not isinstance(findings, list):
        errors.append("findings must be an array for review_type 8A")
        return "fail", []

    fingerprints: list[str] = []
    blocking = False
    has_waiver = False
    for index, finding in enumerate(findings):
        label = f"findings[{index}]"
        if not isinstance(finding, dict):
            errors.append(f"{label} must be an object")
            continue
        classification = finding.get("classification")
        if classification not in {"required_match", "allowed_difference", "improvable", "waiver"}:
            errors.append(
                f"{label}.classification must be required_match, allowed_difference, improvable, or waiver"
            )
        for key in ("kind", "criterion", "location"):
            if not _is_nonempty_string(finding.get(key)):
                errors.append(f"{label}.{key} is required")
        _validate_finding_images(finding, label, errors)
        if classification in {"required_match", "waiver"}:
            fingerprints.append(
                finding_fingerprint("8A", finding.get("kind"), finding.get("criterion"), finding.get("location"))
            )
        if classification == "required_match":
            blocking = True
        if classification == "waiver":
            has_waiver = True

    if blocking:
        errors.append("8A has unresolved required_match findings")
        return "fail", fingerprints
    if has_waiver:
        waiver_errors: list[str] = []
        if _validate_waiver_metadata(report.get("waiver"), "waiver", waiver_errors):
            warnings.append("8A waiver is accepted only with the matching parent manifest record")
            return "pass", fingerprints
        warnings.extend(waiver_errors)
        return "needs_parent_decision", fingerprints
    return "pass", fingerprints


def _validate_8b(report: dict[str, Any], errors: list[str]) -> tuple[str, list[str]]:
    findings = report.get("findings")
    if not isinstance(findings, list):
        errors.append("findings must be an array for review_type 8B")
        return "fail", []

    fingerprints: list[str] = []
    blocking = False
    has_waiver = False
    for index, finding in enumerate(findings):
        label = f"findings[{index}]"
        if not isinstance(finding, dict):
            errors.append(f"{label} must be an object")
            continue
        severity = finding.get("severity")
        if severity not in {"high", "medium", "minor", "waiver"}:
            errors.append(f"{label}.severity must be high, medium, minor, or waiver")
        for key in ("kind", "location"):
            if not _is_nonempty_string(finding.get(key)):
                errors.append(f"{label}.{key} is required")
        _validate_finding_images(finding, label, errors)
        if severity in {"high", "medium", "waiver"}:
            fingerprints.append(
                finding_fingerprint("8B", finding.get("kind"), finding.get("criterion", severity), finding.get("location"))
            )
        if severity in {"high", "medium"}:
            blocking = True
        if severity == "waiver":
            has_waiver = True

    if blocking:
        errors.append("8B has unresolved high or medium findings")
        return "fail", fingerprints
    if has_waiver:
        return "needs_parent_decision", fingerprints
    return "pass", fingerprints


def _validate_8c(report: dict[str, Any], errors: list[str]) -> tuple[str, list[str]]:
    kinds = report.get("kinds")
    if not isinstance(kinds, list) or not kinds:
        errors.append("kinds must contain at least one item for review_type 8C")
        return "fail", []

    fingerprints: list[str] = []
    blocking = False
    for index, item in enumerate(kinds):
        label = f"kinds[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{label} must be an object")
            continue
        kind = item.get("kind")
        if not _is_nonempty_string(kind):
            errors.append(f"{label}.kind is required")
        _validate_images(item.get("evidence_images"), f"{label}.evidence_images", errors)
        has_failure = any(
            item.get(criterion) != "pass"
            for criterion in ("signature_realization", "class_readable", "existence_reason_readable")
        )
        _validate_note(item.get("note"), f"{label}.note", errors, required=has_failure)
        if item.get("waiver"):
            errors.append(f"{label}.waiver cannot complete the 8C gate")
            blocking = True
        for criterion in ("signature_realization", "class_readable", "existence_reason_readable"):
            value = item.get(criterion)
            if value not in {"pass", "fail"}:
                errors.append(f"{label}.{criterion} must be pass or fail")
            if value != "pass":
                blocking = True
                fingerprints.append(finding_fingerprint("8C", kind, criterion, kind))
    if blocking:
        errors.append("8C has an unrealized signature, unreadable class, or unreadable existence reason")
        return "fail", fingerprints
    return "pass", fingerprints


def _validate_report(report: Any) -> tuple[list[str], list[str], list[str], str | None, bool]:
    errors: list[str] = []
    warnings: list[str] = []
    review_type = _validate_common(report, errors)
    if review_type is None or not isinstance(report, dict):
        return errors, warnings, [], None, False

    if "waiver" in report and review_type != "8A":
        errors.append("waiver metadata is supported only for review_type 8A")
    if review_type == "8A":
        derived_status, fingerprints = _validate_8a(report, errors, warnings)
    elif review_type == "8B":
        derived_status, fingerprints = _validate_8b(report, errors)
    else:
        derived_status, fingerprints = _validate_8c(report, errors)

    gate_errors = {
        "8A has unresolved required_match findings",
        "8B has unresolved high or medium findings",
        "8C has an unrealized signature, unreadable class, or unreadable existence reason",
    }
    if report.get("status") != derived_status:
        errors.append(
            f"report.status={report.get('status')!r} does not match the derived status {derived_status!r}"
        )
    structural_valid = not any(error not in gate_errors for error in errors)
    if report.get("status") != derived_status and derived_status != "needs_parent_decision":
        structural_valid = False
    return errors, warnings, fingerprints, derived_status, structural_valid


def _valid_sha(value: Any) -> bool:
    return isinstance(value, str) and bool(SHA256_PATTERN.fullmatch(value))


def _validate_ledger_entry(entry: Any, label: str, errors: list[str]) -> None:
    if not isinstance(entry, dict):
        errors.append(f"{label} must be an object")
        return
    for key in (
        "review_type",
        "attempt",
        "candidate_sha256",
        "render_set_sha256",
        "acceptance_matrix_revision",
        "report_path",
        "finding_fingerprints",
        "parent_action",
    ):
        if key not in entry:
            errors.append(f"{label}.{key} is required")
    if entry.get("review_type") not in REVIEW_TYPES:
        errors.append(f"{label}.review_type is invalid")
    if not isinstance(entry.get("attempt"), int) or isinstance(entry.get("attempt"), bool) or entry.get("attempt", 0) < 1:
        errors.append(f"{label}.attempt must be a positive integer")
    for key in ("candidate_sha256", "render_set_sha256"):
        if not _valid_sha(entry.get(key)):
            errors.append(f"{label}.{key} must be a SHA-256 hex digest")
    if not _is_nonempty_string(entry.get("acceptance_matrix_revision")):
        errors.append(f"{label}.acceptance_matrix_revision is required")
    if "measurement_revision" in entry and not _is_nonempty_string(entry.get("measurement_revision")):
        errors.append(f"{label}.measurement_revision must be a non-empty string when supplied")
    _validate_path(entry.get("report_path"), f"{label}.report_path", errors)
    fingerprints = entry.get("finding_fingerprints")
    if not isinstance(fingerprints, list) or any(not _is_nonempty_string(item) for item in fingerprints):
        errors.append(f"{label}.finding_fingerprints must be an array of strings")
    if entry.get("parent_action") not in PARENT_ACTIONS:
        errors.append(f"{label}.parent_action must be fix, pause, waiver, or pass")
    if entry.get("parent_action") == "waiver":
        _validate_waiver_metadata(entry.get("waiver"), f"{label}.waiver", errors)


def _validate_ledger(
    ledger: Any,
    review_type: str | None,
    attempt: int | None,
    candidate_sha256: str | None,
    render_set_sha256: str | None,
    acceptance_matrix_revision: str | None,
    measurement_revision: str | None,
    report_path: str | None,
    current_fingerprints: list[str],
    errors: list[str],
) -> tuple[bool, list[str]]:
    """Validate ledger state and return (parent_decision, repeated_fingerprints)."""

    if not isinstance(ledger, dict):
        errors.append("ledger must be a JSON object")
        return False, []
    if ledger.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"ledger.schema_version must be {SCHEMA_VERSION}")
    attempts = ledger.get("attempts")
    if not isinstance(attempts, list):
        errors.append("ledger.attempts must be an array")
        return False, []
    for index, entry in enumerate(attempts):
        _validate_ledger_entry(entry, f"ledger.attempts[{index}]", errors)

    if any(value is not None for value in (attempt, candidate_sha256, render_set_sha256, acceptance_matrix_revision, measurement_revision, report_path)):
        if not isinstance(attempt, int) or isinstance(attempt, bool) or attempt < 1:
            errors.append("attempt must be a positive integer when ledger validation is requested")
        if not _valid_sha(candidate_sha256):
            errors.append("candidate_sha256 must be a SHA-256 hex digest when ledger validation is requested")
        if not _valid_sha(render_set_sha256):
            errors.append("render_set_sha256 must be a SHA-256 hex digest when ledger validation is requested")
        if not _is_nonempty_string(acceptance_matrix_revision):
            errors.append("acceptance_matrix_revision is required when ledger validation is requested")
        _validate_path(report_path, "report_path", errors)
    elif attempts:
        errors.append("current revisions are required when a non-empty ledger is supplied")
        return False, []
    else:
        return False, []

    matching = [entry for entry in attempts if isinstance(entry, dict) and entry.get("review_type") == review_type]
    if not matching:
        if attempt != 1:
            errors.append("attempt must start at 1 for a review type with no ledger history")
        return False, []
    latest = max(matching, key=lambda entry: entry.get("attempt", 0))
    latest_attempt = latest.get("attempt")
    if attempt != latest_attempt + 1:
        errors.append(f"attempt must be the next number after {latest_attempt}")
    if (
        candidate_sha256 == latest.get("candidate_sha256")
        and render_set_sha256 == latest.get("render_set_sha256")
        and measurement_revision is None
    ):
        errors.append("candidate and render set revisions are unchanged; rerun is not allowed")
    elif (
        candidate_sha256 == latest.get("candidate_sha256")
        and render_set_sha256 == latest.get("render_set_sha256")
        and measurement_revision == latest.get("measurement_revision")
    ):
        errors.append("candidate, render set, and measurement revisions are unchanged; rerun is not allowed")

    previous_fingerprints = set(latest.get("finding_fingerprints", []))
    repeated = sorted(previous_fingerprints.intersection(current_fingerprints))
    return bool(repeated), repeated


def validate_step8_review(
    report: Any,
    ledger: Any | None = None,
    *,
    review_type: str | None = None,
    attempt: int | None = None,
    candidate_sha256: str | None = None,
    render_set_sha256: str | None = None,
    acceptance_matrix_revision: str | None = None,
    measurement_revision: str | None = None,
    report_path: str | None = None,
) -> dict[str, Any]:
    """Return the fixed validator output contract."""

    errors, warnings, fingerprints, derived_status, structurally_valid = _validate_report(report)
    actual_review_type = report.get("review_type") if isinstance(report, dict) else None
    if review_type is not None and actual_review_type != review_type:
        errors.append("review_type argument does not match report.review_type")
        structurally_valid = False

    repeated: list[str] = []
    parent_decision = False
    ledger_has_errors = False
    if ledger is not None:
        error_count_before_ledger = len(errors)
        parent_decision, repeated = _validate_ledger(
            ledger,
            actual_review_type,
            attempt,
            candidate_sha256,
            render_set_sha256,
            acceptance_matrix_revision,
            measurement_revision,
            report_path,
            fingerprints,
            errors,
        )
        ledger_has_errors = len(errors) > error_count_before_ledger
        if repeated:
            warnings.append(
                "the same finding fingerprint appeared in two consecutive attempts; parent decision is required"
            )

    only_gate_errors = bool(errors) and all(error in GATE_FAILURE_MESSAGES for error in errors)
    if parent_decision and (not errors or only_gate_errors):
        status = "needs_parent_decision"
    elif errors:
        status = "fail"
    elif derived_status == "needs_parent_decision":
        status = "needs_parent_decision"
    else:
        status = derived_status or "fail"

    gate_failure_only = (
        bool(errors)
        and structurally_valid
        and derived_status == "fail"
        and not repeated
        and not any("status=" in error or "argument" in error for error in errors)
    )
    rerun_allowed = gate_failure_only and not parent_decision
    if ledger_has_errors:
        rerun_allowed = False
    if status != "fail" or parent_decision or derived_status == "needs_parent_decision":
        rerun_allowed = False

    return {
        "status": status,
        "rerun_allowed": rerun_allowed,
        "errors": errors,
        "warnings": warnings,
        "finding_fingerprints": fingerprints,
    }


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--ledger", type=Path)
    parser.add_argument("--review-type", choices=sorted(REVIEW_TYPES))
    parser.add_argument("--attempt", type=int)
    parser.add_argument("--candidate-sha256")
    parser.add_argument("--render-set-sha256")
    parser.add_argument("--acceptance-matrix-revision")
    parser.add_argument("--measurement-revision")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        report = _load_json(args.report)
        ledger = _load_json(args.ledger) if args.ledger else None
        result = validate_step8_review(
            report,
            ledger,
            review_type=args.review_type,
            attempt=args.attempt,
            candidate_sha256=args.candidate_sha256,
            render_set_sha256=args.render_set_sha256,
            acceptance_matrix_revision=args.acceptance_matrix_revision,
            measurement_revision=args.measurement_revision,
            report_path=str(args.report),
        )
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        result = {
            "status": "fail",
            "rerun_allowed": False,
            "errors": [f"validation could not run: {error}"],
            "warnings": [],
            "finding_fingerprints": [],
        }
    print(json.dumps({key: result[key] for key in OUTPUT_KEYS}, ensure_ascii=False, separators=(",", ":")))
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())

"""Shared fail-closed controls for repeated workflow checks."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def sha256_path(path: str | Path) -> str:
    target = Path(path)
    if not target.is_file():
        raise FileNotFoundError(target)
    digest = hashlib.sha256()
    with target.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def revision(paths: list[str | Path], label: str = "") -> str:
    entries = [label]
    for raw_path in sorted((str(Path(path).resolve()) for path in paths)):
        entries.append(f"{raw_path}:{sha256_path(raw_path)}")
    return hashlib.sha256("\n".join(entries).encode()).hexdigest()


def finding_fingerprint(kind: str, finding: dict[str, Any]) -> str:
    parts = [kind]
    for key in ("validator", "check_id", "object", "kind", "field", "criterion", "location"):
        value = finding.get(key)
        if value not in (None, ""):
            parts.append(f"{key}={str(value).strip().lower()}")
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text())


def _normalized_fingerprints(value: Any) -> list[str]:
    """Normalize malformed fingerprint fields without allowing them to raise."""

    if not isinstance(value, list):
        return []
    return sorted({item for item in value if isinstance(item, str) and item})


def cache_decision(ledger: dict[str, Any], key: dict[str, Any], ledger_type: str | None = None) -> dict[str, Any]:
    """Return a fail-closed cache decision without changing the ledger."""
    if not isinstance(ledger, dict) or ledger.get("schema_version") != 1:
        return {"reuse": False, "reason": "invalid_ledger"}
    if ledger_type is not None and ledger.get("ledger_type") != ledger_type:
        return {"reuse": False, "reason": "ledger_type_mismatch"}
    if ledger.get("status") != "pass":
        return {"reuse": False, "reason": "previous_result_not_pass"}
    if ledger.get("key") != key:
        return {"reuse": False, "reason": "input_revision_changed"}
    attempts = ledger.get("attempts")
    if not isinstance(attempts, list) or not attempts or not all(isinstance(attempt, dict) for attempt in attempts):
        return {"reuse": False, "reason": "cached_attempts_missing"}
    for index, attempt in enumerate(attempts):
        if attempt.get("attempt") != index + 1:
            return {"reuse": False, "reason": "cached_attempts_invalid"}
        if attempt.get("status") not in {"pass", "fail", "needs_parent_decision"}:
            return {"reuse": False, "reason": "cached_attempts_invalid"}
        if not isinstance(attempt.get("key"), dict):
            return {"reuse": False, "reason": "cached_attempts_invalid"}
        attempt_fingerprints = attempt.get("finding_fingerprints")
        if not isinstance(attempt_fingerprints, list) or not all(isinstance(value, str) for value in attempt_fingerprints):
            return {"reuse": False, "reason": "cached_attempts_invalid"}
        attempt_outputs = attempt.get("outputs")
        if not isinstance(attempt_outputs, list) or not attempt_outputs:
            return {"reuse": False, "reason": "cached_attempts_invalid"}
    if attempts[-1].get("status") != "pass" or attempts[-1].get("key") != key:
        return {"reuse": False, "reason": "cached_attempts_invalid"}
    outputs = ledger.get("outputs")
    if not isinstance(outputs, list) or not outputs:
        return {"reuse": False, "reason": "cached_outputs_missing"}
    for raw_output in outputs:
        if not isinstance(raw_output, dict):
            return {"reuse": False, "reason": "cached_output_contract_invalid"}
        raw_path = raw_output.get("path")
        if not isinstance(raw_path, str) or not Path(raw_path).is_absolute():
            return {"reuse": False, "reason": "cached_output_path_not_absolute"}
        if not isinstance(raw_output.get("sha256"), str):
            return {"reuse": False, "reason": "cached_output_hash_missing"}
        try:
            actual = sha256_path(raw_path)
        except (FileNotFoundError, OSError):
            return {"reuse": False, "reason": "cached_output_missing"}
        if isinstance(raw_output, dict) and raw_output.get("sha256") != actual:
            return {"reuse": False, "reason": "cached_output_changed"}
    return {"reuse": True, "reason": "verified_unchanged_input"}


def repeated_finding_decision(previous: list[dict[str, Any]], fingerprints: list[str]) -> str:
    if not isinstance(previous, list):
        return "rerun_allowed"
    current = _normalized_fingerprints(fingerprints)
    valid_previous = [entry for entry in previous if isinstance(entry, dict)]
    if not current or len(valid_previous) < 2:
        return "rerun_allowed"
    prior = [_normalized_fingerprints(entry.get("finding_fingerprints")) for entry in valid_previous[-2:]]
    if set(prior[0]).intersection(prior[1], current):
        return "needs_parent_decision"
    return "rerun_allowed"


def rerun_decision(ledger: dict[str, Any] | None) -> str:
    """Stop before a third automatic attempt when the last two findings repeat."""
    if not isinstance(ledger, dict):
        return "rerun_allowed"
    if ledger.get("status") == "needs_parent_decision":
        return "needs_parent_decision"
    attempts = ledger.get("attempts", [])
    if not isinstance(attempts, list) or len(attempts) < 2:
        return "rerun_allowed"
    prior = [_normalized_fingerprints(entry.get("finding_fingerprints")) for entry in attempts[-2:] if isinstance(entry, dict)]
    if len(prior) == 2 and set(prior[0]).intersection(prior[1]):
        return "needs_parent_decision"
    return "rerun_allowed"


def output_entry(path: str | Path) -> dict[str, str]:
    target = Path(path).resolve()
    return {"path": str(target), "sha256": sha256_path(target)}

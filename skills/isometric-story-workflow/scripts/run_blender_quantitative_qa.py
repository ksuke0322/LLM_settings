"""Run Blender-derived quantitative QA and existing story contract validators.

The runner is deliberately outside Blender. It starts Blender headlessly, consumes only
the evidence JSON written by the exporter, validates contracts, probes the rendered video,
and writes a single machine-readable report.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
EXPORTER = SCRIPT_DIR.parents[1] / "blender-isometric-rules" / "scripts" / "export_quantitative_evidence.py"

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from repetition_control import cache_decision, finding_fingerprint, output_entry, rerun_decision, sha256_path


def validate_measurement_report(report: Any) -> list[str]:
    """Return hard-gate errors for a Blender measurement report."""
    if not isinstance(report, dict) or report.get("schema_version") != 1:
        return ["measurement report schema_version must be 1"]
    checks = report.get("checks")
    if not isinstance(checks, list):
        return ["measurement report checks must be a list"]
    errors: list[str] = []
    for check in checks:
        if not isinstance(check, dict):
            errors.append("measurement check must be an object")
            continue
        check_id = check.get("id")
        if not isinstance(check_id, str) or not check_id:
            errors.append("measurement check id is required")
            continue
        status = check.get("status")
        if status not in {"PASS", "WARN", "FAIL"}:
            errors.append(f"measurement status is invalid: {check_id}")
            continue
        if status == "FAIL":
            errors.append(f"measurement FAIL: {check_id}")
        if status == "WARN":
            if "actual" not in check or "threshold" not in check:
                errors.append(f"measurement WARN requires actual and threshold: {check_id}")
            if not isinstance(check.get("waiver_reason"), str) or not check["waiver_reason"].strip():
                errors.append(f"measurement WARN requires waiver_reason: {check_id}")
    return errors


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def _read_ledger(path: Path) -> dict[str, Any]:
    """Read a ledger as an object and fail closed before any rerun."""

    try:
        value = _read_json(path)
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as error:
        raise ValueError(f"quantitative QA ledger could not be read: {error}") from error
    if not isinstance(value, dict):
        raise ValueError("quantitative QA ledger must be a JSON object")
    return value


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def _input_key(args: argparse.Namespace, blender: str) -> dict[str, Any]:
    paths = {"blend": args.blend, "contract": args.contract}
    for name in ("previous_scene", "approved_changes", "waivers", "video"):
        value = getattr(args, name, None)
        if value:
            paths[name] = value
    return {
        "blend_sha256": sha256_path(args.blend),
        "inputs": {name: sha256_path(path) for name, path in sorted(paths.items())},
        "cool": args.cool,
        "qa_scope": "quantitative_qa",
        "runner_revision": sha256_path(Path(__file__).resolve()),
        "exporter_revision": sha256_path(EXPORTER),
        "validator_revision": sha256_path(SCRIPT_DIR / "quantitative_validation.py"),
        "tool_revision": sha256_path(blender) if Path(blender).is_file() else blender,
        "ground_name": args.ground_name,
        "report_path": str((args.output_dir / "quantitative_qa_report.json").resolve()),
    }


def _probe_video(video_path: Path) -> list[dict[str, Any]]:
    command = ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video_path)]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        payload = json.loads(result.stdout)
    except (FileNotFoundError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        return [{"id": "output.ffprobe", "status": "FAIL", "actual": str(error), "threshold": "ffprobe succeeds"}]
    streams = payload.get("streams", [])
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    audio = [item for item in streams if item.get("codec_type") == "audio"]
    fmt = payload.get("format", {})
    checks: list[dict[str, Any]] = []
    checks.append({"id": "output.video_stream", "status": "PASS" if video else "FAIL", "actual": bool(video), "threshold": True})
    if not video:
        return checks
    fps_raw = video.get("avg_frame_rate", "0/1")
    try:
        numerator, denominator = (int(part) for part in fps_raw.split("/", 1))
        fps = numerator / denominator if denominator else 0
    except (ValueError, ZeroDivisionError):
        fps = 0
    duration = float(fmt.get("duration", 0) or 0)
    expected = [
        ("output.resolution", (video.get("width"), video.get("height")), (1080, 1920)),
        ("output.fps", fps, 30),
        ("output.codec", video.get("codec_name"), "h264"),
        ("output.pixel_format", video.get("pix_fmt"), "yuv420p"),
        ("output.audio", len(audio), 0),
        ("output.duration", duration, "7..12"),
    ]
    for check_id, actual, threshold in expected:
        if check_id == "output.fps":
            passed = abs(actual - 30) < 0.01
        elif check_id == "output.duration":
            passed = 7 <= actual <= 12
        else:
            passed = actual == threshold
        checks.append({"id": check_id, "status": "PASS" if passed else "FAIL", "actual": actual, "threshold": threshold})
    size_mb = video_path.stat().st_size / 1_000_000
    checks.append({"id": "output.size_mb", "status": "PASS" if 3 <= size_mb <= 5 else "WARN", "actual": round(size_mb, 3), "threshold": "3..5"})
    return checks


def _contract_errors(contract: dict[str, Any], scene: dict[str, Any], timeline: dict[str, Any], previous: dict[str, Any] | None, approved_changes: list[str]) -> list[str]:
    sys.path.insert(0, str(SCRIPT_DIR))
    from quantitative_validation import validate_cool_continuity, validate_scene_contract, validate_timeline

    errors = validate_scene_contract({"contract": contract, "scene": scene})
    errors.extend(validate_timeline({"contract": contract, "timeline": timeline}))
    if previous is not None:
        errors.extend(validate_cool_continuity({"contract": contract, "previous": previous, "current": scene, "approved_changes": approved_changes}))
    return errors


def _render_markdown(report: dict[str, Any]) -> str:
    lines = ["# Quantitative QA", "", f"- status: **{report['status']}**", "", "| Check | Status | Actual | Threshold |", "|---|---|---|---|"]
    for check in report["checks"]:
        lines.append(f"| {check.get('id', '-')} | {check.get('status', '-')} | {check.get('actual', '-')} | {check.get('threshold', '-')} |")
    if report["errors"]:
        lines.extend(["", "## Errors", ""] + [f"- {error}" for error in report["errors"]])
    return "\n".join(lines) + "\n"


def _record_operational_failure(
    args: argparse.Namespace,
    key: dict[str, Any],
    error_code: str,
    detail: str,
    exit_code: int | None = None,
) -> None:
    """Record a repeatable runner failure so identical failures reach the parent."""

    if not args.ledger:
        return
    error_report_path = args.output_dir / "quantitative_qa_error.json"
    _write_json(
        error_report_path,
        {
            "schema_version": 1,
            "status": "FAIL",
            "error_code": error_code,
            "detail": detail,
            "exit_code": exit_code,
        },
    )
    try:
        previous_ledger = _read_json(args.ledger) if args.ledger.is_file() else {}
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        previous_ledger = {}
    previous_attempts = previous_ledger.get("attempts", []) if isinstance(previous_ledger, dict) else []
    if not isinstance(previous_attempts, list) or not all(isinstance(attempt, dict) for attempt in previous_attempts):
        previous_attempts = []
    fingerprints = [finding_fingerprint("quantitative_qa", {"criterion": error_code})]
    output = output_entry(error_report_path)
    attempt = {
        "attempt": len(previous_attempts) + 1,
        "key": key,
        "status": "fail",
        "finding_fingerprints": fingerprints,
        "outputs": [output],
    }
    _write_json(
        args.ledger,
        {
            "schema_version": 1,
            "ledger_type": "quantitative_qa",
            "status": "fail",
            "key": key,
            "outputs": [output],
            "finding_fingerprints": fingerprints,
            "attempts": [*previous_attempts, attempt],
        },
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True, type=Path)
    parser.add_argument("--contract", required=True, type=Path)
    parser.add_argument("--cool", required=True, type=int)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--video", type=Path)
    parser.add_argument("--previous-scene", type=Path)
    parser.add_argument("--blender", default="blender")
    parser.add_argument("--ground-name", default="Ground_Grass")
    parser.add_argument("--waivers", type=Path)
    parser.add_argument("--approved-changes", type=Path, help="JSON array of previous-cool継続性差分の承認済みキー(例: [\"hive_body.dimensions\"])")
    parser.add_argument("--ledger", type=Path, help="optional QuantitativeQALedger v1 path")
    args = parser.parse_args(argv)

    if not args.blend.is_file() or not args.contract.is_file():
        parser.error("--blend and --contract must exist")
    blender = shutil.which(args.blender) or (args.blender if Path(args.blender).is_file() else None)
    if blender is None:
        print(json.dumps({"valid": False, "errors": [f"Blender executable is unavailable: {args.blender}"]}, ensure_ascii=False))
        return 1
    try:
        key = _input_key(args, blender)
    except FileNotFoundError as error:
        print(json.dumps({"valid": False, "errors": [f"input does not exist: {error}"]}, ensure_ascii=False))
        return 1
    ledger: dict[str, Any] = {}
    if args.ledger and args.ledger.is_file():
        try:
            ledger = _read_ledger(args.ledger)
        except ValueError as error:
            print(json.dumps({
                "valid": False,
                "status": "fail",
                "rerun_allowed": False,
                "errors": ["Quantitative QA ledger could not be read"],
                "detail": str(error),
            }, ensure_ascii=False))
            return 1
        if rerun_decision(ledger) == "needs_parent_decision":
            print(json.dumps({"valid": False, "status": "needs_parent_decision", "errors": ["same finding fingerprint repeated twice"]}, ensure_ascii=False))
            return 1
        decision = cache_decision(ledger, key, "quantitative_qa")
        cached_report = args.output_dir / "quantitative_qa_report.json"
        if decision["reuse"] and cached_report.is_file():
            try:
                cached = _read_json(cached_report)
            except (OSError, json.JSONDecodeError):
                cached = None
            if isinstance(cached, dict) and cached.get("status") == "PASS" and cached.get("errors") == []:
                print(json.dumps({"valid": True, "cached": True, "errors": []}, ensure_ascii=False))
                return 0
    raw_dir = args.output_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    command = [blender, "--background", str(args.blend), "--python", str(EXPORTER), "--", "--contract", str(args.contract), "--cool", str(args.cool), "--output-dir", str(raw_dir), "--ground-name", args.ground_name]
    try:
        result = subprocess.run(command, capture_output=True, text=True)
    except OSError as error:
        _record_operational_failure(args, key, "blender_exporter_unavailable", str(error))
        print(json.dumps({"valid": False, "errors": ["Blender exporter could not be started"], "stderr": str(error)}, ensure_ascii=False))
        return 1
    if result.returncode:
        _record_operational_failure(args, key, "blender_exporter_failed", result.stderr[-4000:], result.returncode)
        print(json.dumps({"valid": False, "errors": ["Blender exporter failed"], "stderr": result.stderr[-4000:]}, ensure_ascii=False))
        return result.returncode
    try:
        scene = _read_json(raw_dir / "scene_snapshot.json")
        timeline = _read_json(raw_dir / "timeline_snapshot.json")
        measurement = _read_json(raw_dir / "measurement_report.json")
        waivers = _read_json(args.waivers) if args.waivers else {}
        for check in measurement.get("checks", []):
            if check.get("status") == "WARN" and check.get("id") in waivers:
                check["waiver_reason"] = waivers[check["id"]]
        checks = measurement.get("checks", [])
        if args.video:
            checks.extend(_probe_video(args.video))
            for check in checks:
                if check.get("status") == "WARN" and check.get("id") in waivers:
                    check["waiver_reason"] = waivers[check["id"]]
        previous = _read_json(args.previous_scene) if args.previous_scene else None
        approved_changes = _read_json(args.approved_changes) if args.approved_changes else []
        contract = _read_json(args.contract)
        errors = validate_measurement_report({"schema_version": 1, "checks": checks})
        errors.extend(_contract_errors(contract, scene, timeline, previous, approved_changes))
        report = {"schema_version": 1, "status": "PASS" if not errors else "FAIL", "checks": checks, "errors": errors, "scene": scene, "timeline": timeline}
    except (OSError, json.JSONDecodeError, TypeError, ValueError, KeyError) as error:
        _record_operational_failure(args, key, "quantitative_evidence_invalid", str(error))
        print(json.dumps({"valid": False, "errors": ["Quantitative QA evidence could not be read or validated"], "detail": str(error)}, ensure_ascii=False))
        return 1
    _write_json(args.output_dir / "quantitative_qa_report.json", report)
    (args.output_dir / "quantitative_qa_report.md").write_text(_render_markdown(report))
    if args.ledger:
        previous_ledger = ledger
        previous_attempts = previous_ledger.get("attempts", []) if isinstance(previous_ledger, dict) else []
        if not isinstance(previous_attempts, list):
            previous_attempts = []
        fingerprints = sorted({
            finding_fingerprint("quantitative_qa", {"criterion": error})
            for error in errors
        })
        attempt = {
            "attempt": len(previous_attempts) + 1,
            "key": key,
            "status": "pass" if not errors else "fail",
            "finding_fingerprints": fingerprints,
            "outputs": [output_entry(args.output_dir / "quantitative_qa_report.json")],
        }
        _write_json(args.ledger, {
            "schema_version": 1,
            "ledger_type": "quantitative_qa",
            "status": "pass" if not errors else "fail",
            "key": key,
            "outputs": [output_entry(args.output_dir / "quantitative_qa_report.json")],
            "finding_fingerprints": fingerprints,
            "attempts": [*previous_attempts, attempt],
        })
    print(json.dumps({"valid": not errors, "errors": errors}, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())

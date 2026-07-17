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


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


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


def _contract_errors(contract: dict[str, Any], scene: dict[str, Any], timeline: dict[str, Any], previous: dict[str, Any] | None) -> list[str]:
    sys.path.insert(0, str(SCRIPT_DIR))
    from quantitative_validation import validate_cool_continuity, validate_scene_contract, validate_timeline

    errors = validate_scene_contract({"contract": contract, "scene": scene})
    errors.extend(validate_timeline({"contract": contract, "timeline": timeline}))
    if previous is not None:
        errors.extend(validate_cool_continuity({"contract": contract, "previous": previous, "current": scene, "approved_changes": []}))
    return errors


def _render_markdown(report: dict[str, Any]) -> str:
    lines = ["# Quantitative QA", "", f"- status: **{report['status']}**", "", "| Check | Status | Actual | Threshold |", "|---|---|---|---|"]
    for check in report["checks"]:
        lines.append(f"| {check.get('id', '-')} | {check.get('status', '-')} | {check.get('actual', '-')} | {check.get('threshold', '-')} |")
    if report["errors"]:
        lines.extend(["", "## Errors", ""] + [f"- {error}" for error in report["errors"]])
    return "\n".join(lines) + "\n"


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
    args = parser.parse_args(argv)

    if not args.blend.is_file() or not args.contract.is_file():
        parser.error("--blend and --contract must exist")
    blender = shutil.which(args.blender) or (args.blender if Path(args.blender).is_file() else None)
    if blender is None:
        print(json.dumps({"valid": False, "errors": [f"Blender executable is unavailable: {args.blender}"]}, ensure_ascii=False))
        return 1
    raw_dir = args.output_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    command = [blender, "--background", str(args.blend), "--python", str(EXPORTER), "--", "--contract", str(args.contract), "--cool", str(args.cool), "--output-dir", str(raw_dir), "--ground-name", args.ground_name]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        print(json.dumps({"valid": False, "errors": ["Blender exporter failed"], "stderr": result.stderr[-4000:]}, ensure_ascii=False))
        return result.returncode
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
    contract = _read_json(args.contract)
    errors = validate_measurement_report({"schema_version": 1, "checks": checks})
    errors.extend(_contract_errors(contract, scene, timeline, previous))
    report = {"schema_version": 1, "status": "PASS" if not errors else "FAIL", "checks": checks, "errors": errors, "scene": scene, "timeline": timeline}
    _write_json(args.output_dir / "quantitative_qa_report.json", report)
    (args.output_dir / "quantitative_qa_report.md").write_text(_render_markdown(report))
    print(json.dumps({"valid": not errors, "errors": errors}, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())

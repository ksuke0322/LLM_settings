#!/usr/bin/env python3
"""Validate one cool manifest and its rendered delivery artifacts."""

from __future__ import annotations

import argparse
from fractions import Fraction
import json
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from repetition_control import cache_decision, finding_fingerprint, output_entry, rerun_decision, sha256_path

BASE_ARTIFACTS = (
    "blend",
    "world_reference",
    "cool_reference",
    "reference_pack",
    "animatic",
    "final_still",
    "video",
)
REQUIRED_REPRODUCTION = (
    "blender_version",
    "render_engine",
    "color_management",
    "seed",
    "polyhaven_assets",
)
GATE_PHASES = {
    "story_beat": "render",
    "animatic": "render",
    "technical_spike": "render",
    "visual_acceptance": "render",
    "common_sense_review": "render",
    "signature_realization": "render",
    "still_human_review": "render",
    "motion_qa": "motion",
    "story_final_review": "app",
    "app_integration_qa": "app",
}
PHASE_ORDER = {"render": 0, "motion": 1, "app": 2}
WAIVABLE_GATES = {"technical_spike", "visual_acceptance", "motion_qa"}
HUMAN_REVIEW_GATES = {"animatic", "still_human_review", "story_final_review"}
REVIEW_PRESENTATIONS = {"codex_inline_ui", "claude_artifact", "standalone_file"}
FORBIDDEN_PLACEHOLDERS = {"tbd", "後で決める", "未定"}
STEP8_REVIEW_FIELDS = ("step8_review", "step8_review_ledger")
STEP8_REVIEW_PATH_KEYS = ("path", "baseline", "ledger", "report", "report_path")
REPETITION_LEDGER_FIELDS = (
    "quantitative_qa_ledger",
    "codex_image_preflight_ledger",
    "render_validation_ledger",
    "motion_qa_ledger",
)


class RenderValidationOperationalError(RuntimeError):
    """A probe/decode failure that should be represented in the render ledger."""

    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _walk(value: Any, path: str = "manifest"):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from _walk(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk(child, f"{path}[{index}]")
    else:
        yield path, value


def _require(mapping: dict[str, Any], key: str, prefix: str, errors: list[str]) -> None:
    if key not in mapping or _is_blank(mapping[key]):
        errors.append(f"{prefix}.{key} is required")


def _validate_path(raw_path: Any, label: str, errors: list[str]) -> None:
    if not isinstance(raw_path, str) or not raw_path.strip():
        errors.append(f"{label} is required")
        return
    path = Path(raw_path)
    if not path.is_absolute():
        errors.append(f"{label} must be an absolute path")
    elif not path.exists():
        errors.append(f"{label} does not exist: {path}")
    elif not path.is_file():
        errors.append(f"{label} must be a regular file: {path}")


def _validate_review_package(gate: dict[str, Any], label: str, errors: list[str]) -> None:
    review_package = gate.get("review_package")
    if not isinstance(review_package, dict):
        errors.append(f"{label}.review_package is required")
        return
    for key in ("path", "primary_assets", "presentation"):
        _require(review_package, key, f"{label}.review_package", errors)
    if review_package.get("path") is not None:
        _validate_path(review_package["path"], f"{label}.review_package.path", errors)
    primary_assets = review_package.get("primary_assets")
    if not isinstance(primary_assets, list) or not primary_assets:
        errors.append(f"{label}.review_package.primary_assets must contain at least one path")
    else:
        for index, path in enumerate(primary_assets):
            _validate_path(path, f"{label}.review_package.primary_assets[{index}]", errors)
    if review_package.get("presentation") not in REVIEW_PRESENTATIONS:
        errors.append(f"{label}.review_package.presentation must be a supported presentation")


def _load_step8_object(raw_path: str, label: str, errors: list[str]) -> dict[str, Any] | None:
    try:
        value = json.loads(Path(raw_path).read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        errors.append(f"{label} must contain valid JSON: {error}")
        return None
    if not isinstance(value, dict):
        errors.append(f"{label} must contain a JSON object")
        return None
    return value


def _validate_step8_baseline_manifest_linkage(
    manifest: dict[str, Any],
    baseline: dict[str, Any],
    label: str,
    errors: list[str],
) -> None:
    current_render = baseline.get("current_render")
    artifacts = manifest.get("artifacts")
    final_still = artifacts.get("final_still") if isinstance(artifacts, dict) else None
    if isinstance(current_render, str) and isinstance(final_still, str):
        if Path(current_render).resolve() != Path(final_still).resolve():
            errors.append(f"{label}.current_render must match manifest.artifacts.final_still")


def _validate_step8_report_manifest_linkage(
    manifest: dict[str, Any],
    report: dict[str, Any],
    label: str,
    errors: list[str],
) -> None:
    gates = manifest.get("gates")
    gate = gates.get("visual_acceptance") if isinstance(gates, dict) else None
    waiver = report.get("waiver") if report.get("review_type") == "8A" else None
    if isinstance(waiver, dict):
        if not isinstance(gate, dict) or gate.get("status") != "waived":
            errors.append(f"{label} 8A waiver requires gates.visual_acceptance.status=waived")
            return
        for key in ("reason", "impact", "approved_by"):
            if gate.get(key) != waiver.get(key):
                errors.append(f"{label} waiver.{key} must match gates.visual_acceptance.{key}")
    elif isinstance(gate, dict) and gate.get("status") == "waived":
        errors.append(f"{label} must contain an 8A waiver matching gates.visual_acceptance")


def _validate_step8_review_paths(manifest: dict[str, Any], errors: list[str]) -> None:
    """Validate optional Step 8 baseline/ledger/report paths when supplied."""

    baseline_paths: list[str] = []
    report_paths: list[str] = []
    for field in STEP8_REVIEW_FIELDS:
        if field not in manifest:
            continue
        value = manifest[field]
        if isinstance(value, str):
            _validate_path(value, f"manifest.{field}", errors)
            continue
        if not isinstance(value, dict):
            errors.append(f"manifest.{field} must be an absolute path or an object of paths")
            continue
        supplied = False
        for key in STEP8_REVIEW_PATH_KEYS:
            if key in value:
                supplied = True
                _validate_path(value[key], f"manifest.{field}.{key}", errors)
                if isinstance(value[key], str) and Path(value[key]).is_file():
                    if key == "baseline":
                        baseline_paths.append(value[key])
                    elif key in {"report", "report_path"}:
                        report_paths.append(value[key])
        if not supplied:
            errors.append(
                f"manifest.{field} must contain at least one path field: {', '.join(STEP8_REVIEW_PATH_KEYS)}"
            )
    for raw_path in sorted(set(baseline_paths)):
        baseline = _load_step8_object(raw_path, f"manifest.step8_review baseline {raw_path}", errors)
        if baseline is not None:
            _validate_step8_baseline_manifest_linkage(manifest, baseline, f"manifest.step8_review.baseline", errors)
    for raw_path in sorted(set(report_paths)):
        report = _load_step8_object(raw_path, f"manifest.step8_review report {raw_path}", errors)
        if report is not None:
            _validate_step8_report_manifest_linkage(manifest, report, f"manifest.step8_review.report", errors)
    for field in REPETITION_LEDGER_FIELDS:
        if field in manifest:
            _validate_path(manifest[field], f"manifest.{field}", errors)


def _rate(value: Any) -> Fraction | None:
    try:
        return Fraction(str(value))
    except (ValueError, ZeroDivisionError):
        return None


def _validate_video(
    probe: dict[str, Any],
    video_path: Path,
    errors: list[str],
    label: str = "video",
    delivery_limits: bool = True,
) -> None:
    streams = probe.get("streams", [])
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    if len(video_streams) != 1:
        errors.append(f"{label} must contain exactly one video stream")
        return
    if audio_streams:
        errors.append(f"{label} must not contain an audio stream")

    stream = video_streams[0]
    if stream.get("codec_name") != "h264":
        errors.append(f"{label} codec must be h264")
    if stream.get("pix_fmt") != "yuv420p":
        errors.append(f"{label} pixel format must be yuv420p")
    if (stream.get("width"), stream.get("height")) != (1080, 1920):
        errors.append(f"{label} resolution must be 1080x1920")

    real_rate = _rate(stream.get("r_frame_rate"))
    average_rate = _rate(stream.get("avg_frame_rate"))
    if real_rate != Fraction(30, 1) or average_rate != Fraction(30, 1):
        errors.append(f"{label} frame rate must be 30fps")
    frames = [frame for frame in probe.get("frames", []) if frame.get("media_type") == "video"]
    timestamps = []
    for frame in frames:
        try:
            timestamps.append(float(frame["best_effort_timestamp_time"]))
        except (KeyError, TypeError, ValueError):
            errors.append(f"{label} frame timestamps are unavailable")
            break
    if len(timestamps) < 2:
        errors.append(f"{label} frame timestamps are required for CFR validation")
    elif any(abs((later - earlier) - (1 / 30)) > 0.0001 for earlier, later in zip(timestamps, timestamps[1:])):
        errors.append(f"{label} must use a constant 30fps frame cadence")

    duration_value = stream.get("duration") or probe.get("format", {}).get("duration")
    try:
        duration = float(duration_value)
    except (TypeError, ValueError):
        errors.append(f"{label} duration is unavailable")
    else:
        if delivery_limits and not 7 <= duration <= 12:
            errors.append(f"{label} duration must be between 7 and 12 seconds")

    major_brand = probe.get("format", {}).get("tags", {}).get("major_brand", "").lower()
    if video_path.suffix.lower() != ".mp4" or major_brand not in {"isom", "iso2", "avc1", "mp41", "mp42"}:
        errors.append(f"{label} container must be mp4")
    if delivery_limits and video_path.exists():
        size_mb = video_path.stat().st_size / 1_000_000
        if not 3 <= size_mb <= 5:
            errors.append(f"{label} size must be between 3 and 5 MB")


def validate_manifest(
    manifest: dict[str, Any],
    probe: dict[str, Any],
    through: str = "app",
    story_probe: dict[str, Any] | None = None,
) -> list[str]:
    errors: list[str] = []
    if through not in PHASE_ORDER:
        return ["validation phase must be render, motion, or app"]
    if not isinstance(manifest, dict):
        return ["manifest root must be an object"]
    _require(manifest, "schema_version", "manifest", errors)
    _require(manifest, "cool_number", "manifest", errors)
    for new_key, old_key in (("design_doc_path", "story_page_url"), ("prompt_notes_path", "prompt_page_url")):
        if new_key not in manifest and old_key not in manifest:
            errors.append(f"manifest.{new_key} is required")
    if manifest.get("schema_version") != 1:
        errors.append("manifest.schema_version must be 1")
    cool_number = manifest.get("cool_number")
    if isinstance(cool_number, bool) or not isinstance(cool_number, int) or cool_number < 1:
        errors.append("manifest.cool_number must be a positive integer")
    for new_key, old_key in (("design_doc_path", "story_page_url"), ("prompt_notes_path", "prompt_page_url")):
        url_key = new_key if new_key in manifest else old_key
        url = manifest.get(url_key)
        if isinstance(url, str):
            is_notion = url.startswith(("https://www.notion.so/", "https://app.notion.com/"))
            is_local_file = Path(url).is_absolute() and Path(url).is_file()
            if not (is_notion or is_local_file):
                errors.append(f"manifest.{url_key} must be a Notion URL or an existing absolute local file path")

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict):
        errors.append("manifest.artifacts is required")
        artifacts = {}
    required_artifacts = BASE_ARTIFACTS + (("story_video",) if through == "app" else ())
    for key in required_artifacts:
        _require(artifacts, key, "artifacts", errors)
    for key in required_artifacts:
        value = artifacts.get(key)
        if key == "reference_pack":
            if not isinstance(value, list) or not value:
                errors.append("artifacts.reference_pack must contain at least one path")
            else:
                for index, path in enumerate(value):
                    _validate_path(path, f"artifacts.reference_pack[{index}]", errors)
        elif value is not None:
            _validate_path(value, f"artifacts.{key}", errors)

    _validate_step8_review_paths(manifest, errors)

    reproduction = manifest.get("reproduction")
    if not isinstance(reproduction, dict):
        errors.append("manifest.reproduction is required")
        reproduction = {}
    for key in REQUIRED_REPRODUCTION:
        _require(reproduction, key, "reproduction", errors)
    if isinstance(reproduction.get("seed"), bool) or not isinstance(reproduction.get("seed"), int):
        errors.append("reproduction.seed must be an integer")
    if not isinstance(reproduction.get("polyhaven_assets"), list):
        errors.append("reproduction.polyhaven_assets must be a list")
    else:
        for index, asset in enumerate(reproduction["polyhaven_assets"]):
            prefix = f"reproduction.polyhaven_assets[{index}]"
            if not isinstance(asset, dict):
                errors.append(f"{prefix} must be an object")
                continue
            for key in ("id", "resolution", "retrieved_on"):
                _require(asset, key, prefix, errors)

    gates = manifest.get("gates")
    if not isinstance(gates, dict):
        errors.append("manifest.gates is required")
        gates = {}
    for gate_name, gate_phase in GATE_PHASES.items():
        gate = gates.get(gate_name)
        if not isinstance(gate, dict):
            errors.append(f"gates.{gate_name} is required")
            continue
        required_now = PHASE_ORDER[gate_phase] <= PHASE_ORDER[through]
        if not required_now and gate.get("status") == "pending":
            continue
        for key in ("status", "reviewer", "evidence"):
            _require(gate, key, f"gates.{gate_name}", errors)
        status = gate.get("status")
        if status not in {"pass", "waived"}:
            errors.append(f"gates.{gate_name}.status must be pass or waived")
        if status == "waived":
            if gate_name not in WAIVABLE_GATES:
                errors.append(f"gates.{gate_name} cannot be waived")
            for key in ("reason", "impact", "approved_by"):
                if key not in gate or _is_blank(gate[key]):
                    errors.append(f"gates.{gate_name}.{key} is required for waived status")
        if gate.get("evidence") is not None:
            _validate_path(gate["evidence"], f"gates.{gate_name}.evidence", errors)
        if gate_name in HUMAN_REVIEW_GATES and status == "pass":
            _validate_review_package(gate, f"gates.{gate_name}", errors)

    for path, value in _walk(manifest):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if any(placeholder in normalized for placeholder in FORBIDDEN_PLACEHOLDERS):
                errors.append(f"{path} contains forbidden placeholder: {value}")

    video_value = artifacts.get("video")
    if isinstance(video_value, str):
        video_path = Path(video_value)
        expected_token = f"cool{cool_number}"
        if isinstance(cool_number, int) and expected_token not in video_path.stem.lower():
            errors.append(f"artifacts.video filename must contain {expected_token}")
        _validate_video(probe, video_path, errors)
    story_video_value = artifacts.get("story_video")
    if through == "app" and isinstance(story_video_value, str):
        if story_probe is None:
            errors.append("story_video metadata is required at app phase")
        else:
            _validate_video(story_probe, Path(story_video_value), errors, "story_video", False)
    return errors


def run_ffprobe(video_path: Path, ffprobe_bin: str) -> dict[str, Any]:
    command = [
        ffprobe_bin,
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-show_frames",
        "-of",
        "json",
        str(video_path),
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def run_decode_check(video_path: Path, ffmpeg_bin: str) -> None:
    command = [ffmpeg_bin, "-v", "error", "-i", str(video_path), "-f", "null", "-"]
    subprocess.run(command, check=True, capture_output=True, text=True)


def _tool_version(binary: str) -> str:
    try:
        result = subprocess.run([binary, "-version"], check=True, capture_output=True, text=True)
    except (FileNotFoundError, subprocess.CalledProcessError) as error:
        return f"unavailable:{error}"
    return (result.stdout or result.stderr).splitlines()[0] if (result.stdout or result.stderr).splitlines() else "unknown"


def _resolve_tool(binary: str) -> str:
    resolved = shutil.which(binary)
    if resolved:
        return str(Path(resolved).resolve())
    path = Path(binary)
    return str(path.resolve()) if path.is_file() else binary


def _render_validation_key(video_path: Path, through: str, ffprobe_bin: str, ffmpeg_bin: str, render_spec_revision: str) -> dict[str, Any]:
    return {
        "video_sha256": sha256_path(video_path),
        "render_spec_revision": render_spec_revision,
        "validator_sha256": sha256_path(Path(__file__).resolve()),
        "through": through,
        "ffprobe_path": str(Path(ffprobe_bin).resolve()),
        "ffmpeg_path": str(Path(ffmpeg_bin).resolve()),
        "ffprobe_version": _tool_version(ffprobe_bin),
        "ffmpeg_version": _tool_version(ffmpeg_bin),
    }


def _record_render_operational_failure(
    args: argparse.Namespace,
    key: dict[str, Any],
    cached: Any,
    error_code: str,
    detail: str,
) -> None:
    """Record probe/decode failures so an identical failure cannot loop forever."""

    if not args.ledger or args.through != "render":
        return
    error_report_path = args.ledger.parent / "render_validation_error.json"
    error_report_path.parent.mkdir(parents=True, exist_ok=True)
    error_report_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "status": "FAIL",
                "error_code": error_code,
                "detail": detail,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    previous_attempts = cached.get("attempts", []) if isinstance(cached, dict) else []
    if not isinstance(previous_attempts, list) or not all(isinstance(attempt, dict) for attempt in previous_attempts):
        previous_attempts = []
    fingerprints = [finding_fingerprint("render_validation", {"criterion": error_code})]
    output = output_entry(error_report_path)
    attempt = {
        "attempt": len(previous_attempts) + 1,
        "key": key,
        "status": "fail",
        "finding_fingerprints": fingerprints,
        "outputs": [output],
    }
    args.ledger.parent.mkdir(parents=True, exist_ok=True)
    args.ledger.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "ledger_type": "render_validation",
                "status": "fail",
                "key": key,
                "outputs": [output],
                "finding_fingerprints": fingerprints,
                "attempts": [*previous_attempts, attempt],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--ffprobe-bin", default="ffprobe")
    parser.add_argument("--ffmpeg-bin", default="ffmpeg")
    parser.add_argument("--through", choices=tuple(PHASE_ORDER), default="app")
    parser.add_argument("--json-only", action="store_true")
    parser.add_argument("--ledger", type=Path, help="optional RenderValidationLedger v1 path")
    parser.add_argument("--render-spec-revision", default="default")
    args = parser.parse_args()
    result_status = "fail"
    key: dict[str, Any] | None = None
    cached: Any = None

    try:
        manifest = json.loads(args.manifest.read_text())
        if not isinstance(manifest, dict):
            errors = ["manifest root must be an object"]
        else:
            artifacts = manifest.get("artifacts")
            video_value = artifacts.get("video") if isinstance(artifacts, dict) else None
            if not isinstance(video_value, str) or not video_value:
                errors = validate_manifest(manifest, {}, args.through)
            else:
                video_path = Path(video_value)
                ffprobe_bin = _resolve_tool(args.ffprobe_bin)
                ffmpeg_bin = _resolve_tool(args.ffmpeg_bin)
                render_spec_revision = manifest.get("render_spec_revision", args.render_spec_revision)
                if not isinstance(render_spec_revision, str) or not render_spec_revision:
                    render_spec_revision = args.render_spec_revision
                key = _render_validation_key(video_path, args.through, args.ffprobe_bin, args.ffmpeg_bin, render_spec_revision)
                cached = json.loads(args.ledger.read_text()) if args.ledger and args.ledger.is_file() else None
                if cached and args.through == "render" and rerun_decision(cached) == "needs_parent_decision":
                    result_status = "needs_parent_decision"
                    errors = ["same render validation finding repeated twice; parent decision required"]
                    raise RuntimeError(errors[0])
                decision = cache_decision(cached, key, "render_validation") if cached and args.through == "render" else {"reuse": False}
                if decision["reuse"] and isinstance(cached.get("probe"), dict):
                    probe = cached["probe"]
                else:
                    try:
                        probe = run_ffprobe(video_path, args.ffprobe_bin)
                    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError, TypeError, ValueError) as error:
                        raise RenderValidationOperationalError("ffprobe_failed", str(error)) from error
                    try:
                        run_decode_check(video_path, args.ffmpeg_bin)
                    except (OSError, subprocess.CalledProcessError) as error:
                        raise RenderValidationOperationalError("ffmpeg_decode_failed", str(error)) from error
                story_probe = None
                if args.through == "app":
                    story_value = artifacts.get("story_video")
                    if isinstance(story_value, str) and story_value:
                        story_path = Path(story_value)
                        try:
                            story_probe = run_ffprobe(story_path, args.ffprobe_bin)
                        except (OSError, subprocess.CalledProcessError, json.JSONDecodeError, TypeError, ValueError) as error:
                            raise RenderValidationOperationalError("story_ffprobe_failed", str(error)) from error
                        try:
                            run_decode_check(story_path, args.ffmpeg_bin)
                        except (OSError, subprocess.CalledProcessError) as error:
                            raise RenderValidationOperationalError("story_ffmpeg_decode_failed", str(error)) from error
                errors = validate_manifest(manifest, probe, args.through, story_probe)
                result_status = "pass" if not errors else "fail"
                if args.ledger and args.through == "render":
                    previous_attempts = cached.get("attempts", []) if isinstance(cached, dict) else []
                    if not isinstance(previous_attempts, list):
                        previous_attempts = []
                    fingerprints = sorted({
                        finding_fingerprint("render_validation", {"criterion": error})
                        for error in errors
                    })
                    attempt = {
                        "attempt": len(previous_attempts) + 1,
                        "key": key,
                        "status": "pass" if not errors else "fail",
                        "finding_fingerprints": fingerprints,
                        "outputs": [output_entry(video_path)],
                    }
                    args.ledger.parent.mkdir(parents=True, exist_ok=True)
                    args.ledger.write_text(json.dumps({
                        "schema_version": 1,
                        "ledger_type": "render_validation",
                        "status": "pass" if not errors else "fail",
                        "key": key,
                        "outputs": [output_entry(video_path)],
                        "finding_fingerprints": fingerprints,
                        "attempts": [*previous_attempts, attempt],
                        "probe": probe,
                    }, ensure_ascii=False, indent=2) + "\n")
    except RenderValidationOperationalError as error:
        if key is not None:
            _record_render_operational_failure(args, key, cached, error.code, error.detail)
        errors = [f"{error.code}: {error.detail}"]
    except RuntimeError as error:
        errors = [str(error)]
    except (OSError, TypeError, ValueError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        if key is not None:
            _record_render_operational_failure(args, key, cached, "render_validation_exception", str(error))
        errors = [f"validation could not run: {error}"]

    result = {"valid": not errors, "status": result_status, "manifest": str(args.manifest), "errors": errors}
    if not args.json_only:
        print("PASS: story package is valid" if not errors else "FAIL: story package is invalid")
        for error in errors:
            print(f"- {error}")
    print(json.dumps(result, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())

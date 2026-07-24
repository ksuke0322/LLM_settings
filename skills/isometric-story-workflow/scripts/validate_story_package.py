#!/usr/bin/env python3
"""Validate one cool manifest and its rendered delivery artifacts."""

from __future__ import annotations

import argparse
from fractions import Fraction
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--ffprobe-bin", default="ffprobe")
    parser.add_argument("--ffmpeg-bin", default="ffmpeg")
    parser.add_argument("--through", choices=tuple(PHASE_ORDER), default="app")
    parser.add_argument("--json-only", action="store_true")
    args = parser.parse_args()

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
                probe = run_ffprobe(video_path, args.ffprobe_bin)
                run_decode_check(video_path, args.ffmpeg_bin)
                story_probe = None
                if args.through == "app":
                    story_value = artifacts.get("story_video")
                    if isinstance(story_value, str) and story_value:
                        story_path = Path(story_value)
                        story_probe = run_ffprobe(story_path, args.ffprobe_bin)
                        run_decode_check(story_path, args.ffmpeg_bin)
                errors = validate_manifest(manifest, probe, args.through, story_probe)
    except (OSError, TypeError, ValueError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        errors = [f"validation could not run: {error}"]

    result = {"valid": not errors, "manifest": str(args.manifest), "errors": errors}
    if not args.json_only:
        print("PASS: story package is valid" if not errors else "FAIL: story package is invalid")
        for error in errors:
            print(f"- {error}")
    print(json.dumps(result, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())

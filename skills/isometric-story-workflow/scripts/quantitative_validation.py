"""Shared deterministic validators for story-production contracts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any, Callable


def _require(mapping: dict[str, Any], key: str, label: str, errors: list[str]) -> Any:
    value = mapping.get(key)
    if value is None or value == "":
        errors.append(f"{label}.{key} is required")
    return value


def _find_cool(contract: dict[str, Any], number: Any) -> dict[str, Any] | None:
    return next((cool for cool in contract.get("cools", []) if cool.get("number") == number), None)


def _path_error(raw_path: Any, label: str) -> str | None:
    if not isinstance(raw_path, str) or not raw_path:
        return f"{label} is required"
    path = Path(raw_path)
    if not path.is_absolute():
        return f"{label} must be an absolute path"
    if not path.is_file():
        return f"{label} does not exist: {path}"
    return None


def validate_story_contract(contract: Any) -> list[str]:
    if not isinstance(contract, dict):
        return ["story contract must be an object"]
    errors: list[str] = []
    for key in ("schema_version", "theme_id", "story_id", "source", "frames_per_second", "stage_extent", "common_environment", "cools", "objects"):
        _require(contract, key, "contract", errors)
    if contract.get("schema_version") != 1:
        errors.append("contract.schema_version must be 1")
    source = contract.get("source")
    if not isinstance(source, dict):
        errors.append("contract.source must be an object")
    else:
        for key in ("notion_url", "revision"):
            _require(source, key, "contract.source", errors)
    fps = contract.get("frames_per_second")
    if fps != 30:
        errors.append("contract.frames_per_second must be 30")
    if not isinstance(contract.get("stage_extent"), (int, float)) or contract.get("stage_extent", 0) <= 0:
        errors.append("contract.stage_extent must be a positive number")

    objects = contract.get("objects")
    object_by_id: dict[str, dict[str, Any]] = {}
    if not isinstance(objects, list) or not objects:
        errors.append("contract.objects must contain at least one object")
    else:
        for index, obj in enumerate(objects):
            label = f"objects[{index}]"
            if not isinstance(obj, dict):
                errors.append(f"{label} must be an object")
                continue
            for key in ("id", "category", "first_cool", "tier", "size_ratio", "entry_type", "motion_kind", "signature_details"):
                _require(obj, key, label, errors)
            object_id = obj.get("id")
            if isinstance(object_id, str):
                if object_id in object_by_id:
                    errors.append(f"{label}.id must be unique: {object_id}")
                object_by_id[object_id] = obj
            if obj.get("category") not in {"hero", "peripheral", "scale"}:
                errors.append(f"{label}.category must be hero, peripheral, or scale")
            if obj.get("tier") not in {"hero", "midground", "background"}:
                errors.append(f"{label}.tier must be hero, midground, or background")
            if not isinstance(obj.get("signature_details"), list) or not obj.get("signature_details"):
                errors.append(f"{label}.signature_details must contain at least one item")

    cools = contract.get("cools")
    if not isinstance(cools, list) or not cools:
        errors.append("contract.cools must contain at least one cool")
        return errors
    for index, cool in enumerate(cools):
        label = f"cools[{index}]"
        if not isinstance(cool, dict):
            errors.append(f"{label} must be an object")
            continue
        for key in ("number", "start_frame", "end_frame", "duration_seconds", "hero", "emotional_reward", "concurrent_motion_limit", "technical_risks", "spike_required", "transitions", "background"):
            _require(cool, key, label, errors)
        if cool.get("number") != index + 1:
            errors.append(f"{label}.number must be {index + 1}")
        start, end, duration = cool.get("start_frame"), cool.get("end_frame"), cool.get("duration_seconds")
        if isinstance(start, int) and isinstance(end, int) and isinstance(duration, (int, float)) and fps == 30:
            if end < start or abs(((end - start + 1) / fps) - duration) > 0.001:
                errors.append(f"{label} frame range must match duration_seconds at 30fps")
        if cool.get("hero") not in object_by_id or object_by_id.get(cool.get("hero"), {}).get("category") != "hero":
            errors.append(f"{label}.hero must reference a hero object")
        if cool.get("concurrent_motion_limit") not in {1, 2}:
            errors.append(f"{label}.concurrent_motion_limit must be 1 or 2")
        risks = cool.get("technical_risks")
        if isinstance(risks, list) and risks and cool.get("spike_required") is not True:
            errors.append(f"{label}.spike_required must be true")
        background = cool.get("background")
        if not isinstance(background, dict):
            errors.append(f"{label}.background must be an object")
        else:
            visible_count = background.get("visible_count")
            if not isinstance(visible_count, int) or not 15 <= visible_count <= 30:
                errors.append(f"{label}.background.visible_count must be between 15 and 30")
            types = background.get("types")
            if not isinstance(types, list) or len(set(types)) < 5:
                errors.append(f"{label}.background.types must contain at least 5 unique types")
        transitions = cool.get("transitions")
        if not isinstance(transitions, list) or not transitions:
            errors.append(f"{label}.transitions must contain at least one transition")
        elif isinstance(start, int) and isinstance(end, int):
            for transition_index, transition in enumerate(transitions):
                transition_label = f"{label}.transitions[{transition_index}]"
                if not isinstance(transition, dict):
                    errors.append(f"{transition_label} must be an object")
                    continue
                for key in ("object_id", "start_frame", "end_frame", "easing", "entry_type"):
                    _require(transition, key, transition_label, errors)
                object_id = transition.get("object_id")
                if object_id not in object_by_id:
                    errors.append(f"{transition_label}.object_id must reference an object")
                elif transition.get("entry_type") != object_by_id[object_id].get("entry_type"):
                    errors.append(f"{transition_label}.entry_type must match object contract")
                transition_start, transition_end = transition.get("start_frame"), transition.get("end_frame")
                if not isinstance(transition_start, int) or not isinstance(transition_end, int) or not start <= transition_start <= transition_end <= end:
                    errors.append(f"{transition_label} frame range must be inside the cool")
    return errors


def validate_scene_contract(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return ["scene input must be an object"]
    contract, scene = payload.get("contract"), payload.get("scene")
    errors = validate_story_contract(contract)
    if not isinstance(scene, dict):
        return errors + ["scene must be an object"]
    cool = _find_cool(contract, scene.get("cool_number")) if isinstance(contract, dict) else None
    if cool is None:
        return errors + ["scene.cool_number must reference a contract cool"]
    if contract.get("common_environment") not in scene.get("collections", []):
        errors.append("scene.collections must include common_environment")
    coverage = scene.get("camera", {}).get("hero_safe_area_coverage") if isinstance(scene.get("camera"), dict) else None
    if not isinstance(coverage, (int, float)) or coverage < 0.6:
        errors.append("scene.camera.hero_safe_area_coverage must be at least 0.6")
    assets = scene.get("assets")
    asset_by_id = {asset.get("id"): asset for asset in assets if isinstance(asset, dict)} if isinstance(assets, list) else {}
    for obj in contract.get("objects", []):
        if obj.get("first_cool", 0) > scene.get("cool_number", 0):
            continue
        asset = asset_by_id.get(obj.get("id"))
        if asset is None:
            errors.append(f"scene.assets missing required object: {obj.get('id')}")
            continue
        if asset.get("tier") != obj.get("tier"):
            errors.append(f"scene.assets.{obj.get('id')}.tier must match contract")
        if asset.get("material_kind") not in {"image", "procedural"}:
            errors.append(f"scene.assets.{obj.get('id')}.material_kind must be image or procedural")
        if obj.get("tier") in {"hero", "midground"} and asset.get("crafted") is not True:
            errors.append(f"scene.assets.{obj.get('id')}.crafted must be true")
        if asset.get("grounded") is not True:
            errors.append(f"scene.assets.{obj.get('id')}.grounded must be true")
        if asset.get("bounds_within_stage") is not True:
            errors.append(f"scene.assets.{obj.get('id')}.bounds_within_stage must be true")
        if abs(float(asset.get("size_ratio", -1)) - float(obj.get("size_ratio", -2))) > 0.001:
            errors.append(f"scene.assets.{obj.get('id')}.size_ratio must match contract")
    background = scene.get("background")
    if not isinstance(background, dict) or not 15 <= background.get("visible_count", 0) <= 30:
        errors.append("scene.background.visible_count must be between 15 and 30")
    if not isinstance(background, dict) or background.get("type_count", 0) < 5:
        errors.append("scene.background.type_count must be at least 5")
    return errors


def validate_cool_continuity(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return ["continuity input must be an object"]
    contract, previous, current = payload.get("contract"), payload.get("previous"), payload.get("current")
    errors = validate_story_contract(contract)
    if not isinstance(previous, dict) or not isinstance(current, dict):
        return errors + ["previous and current scene snapshots are required"]
    if current.get("cool_number") != previous.get("cool_number", 0) + 1:
        errors.append("current.cool_number must immediately follow previous.cool_number")
        return errors
    previous_assets = {asset.get("id"): asset for asset in previous.get("assets", []) if isinstance(asset, dict)}
    current_assets = {asset.get("id"): asset for asset in current.get("assets", []) if isinstance(asset, dict)}
    approved = set(payload.get("approved_changes", []))
    for obj in contract.get("objects", []) if isinstance(contract, dict) else []:
        if obj.get("first_cool", 0) >= current.get("cool_number", 0):
            continue
        object_id = obj.get("id")
        if object_id not in previous_assets or object_id not in current_assets:
            errors.append(f"inherited asset {object_id} must exist in both scenes")
            continue
        if f"{object_id}.dimensions" not in approved and previous_assets[object_id].get("dimensions") != current_assets[object_id].get("dimensions"):
            errors.append(f"inherited asset {object_id} dimensions changed without approval")
        if obj.get("shared_material") and f"{object_id}.material_id" not in approved and previous_assets[object_id].get("material_id") != current_assets[object_id].get("material_id"):
            errors.append(f"inherited asset {object_id} material changed without approval")
    if previous.get("world") != current.get("world") and "world" not in approved:
        errors.append("world changed without approval")
    return errors


def validate_timeline(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return ["timeline input must be an object"]
    contract, timeline = payload.get("contract"), payload.get("timeline")
    errors = validate_story_contract(contract)
    if not isinstance(timeline, dict):
        return errors + ["timeline must be an object"]
    cool = _find_cool(contract, timeline.get("cool_number")) if isinstance(contract, dict) else None
    if cool is None:
        return errors + ["timeline.cool_number must reference a contract cool"]
    expected = {(item.get("object_id"), item.get("start_frame"), item.get("end_frame"), item.get("easing"), item.get("entry_type")) for item in cool.get("transitions", [])}
    actual_items = timeline.get("transitions")
    if not isinstance(actual_items, list):
        return errors + ["timeline.transitions must be a list"]
    actual = {(item.get("object_id"), item.get("start_frame"), item.get("end_frame"), item.get("easing"), item.get("entry_type")) for item in actual_items if isinstance(item, dict)}
    if actual != expected:
        errors.append("timeline.transitions must exactly match contract transitions")
    max_concurrent = 0
    for frame in range(cool.get("start_frame", 0), cool.get("end_frame", -1) + 1):
        max_concurrent = max(max_concurrent, sum(item.get("start_frame", 1) <= frame <= item.get("end_frame", 0) for item in actual_items if isinstance(item, dict)))
    if max_concurrent > cool.get("concurrent_motion_limit", 0):
        errors.append(f"timeline.concurrent_motion_count exceeds {cool.get('concurrent_motion_limit')}")
    return errors


def validate_review_evidence(payload: Any) -> list[str]:
    if not isinstance(payload, dict) or not isinstance(payload.get("reviews"), dict):
        return ["reviews must be an object"]
    errors: list[str] = []
    supported_gates = {"animatic", "still_human_review", "story_final_review"}
    required_gates = payload.get("required_gates", ["animatic", "still_human_review", "story_final_review"])
    if not isinstance(required_gates, list) or not required_gates or not set(required_gates).issubset(supported_gates):
        return ["required_gates must be a non-empty subset of human review gates"]
    for gate in required_gates:
        review = payload["reviews"].get(gate)
        label = f"reviews.{gate}"
        if not isinstance(review, dict):
            errors.append(f"{label} is required")
            continue
        path_error = _path_error(review.get("package"), f"{label}.package")
        if path_error:
            errors.append(path_error)
        assets = review.get("primary_assets")
        if not isinstance(assets, list) or not assets:
            errors.append(f"{label}.primary_assets must contain at least one path")
            continue
        for index, asset in enumerate(assets):
            path_error = _path_error(asset, f"{label}.primary_assets[{index}]")
            if path_error:
                errors.append(path_error)
    return errors


def validate_theme_integration(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return ["theme integration input must be an object"]
    contract = payload.get("contract")
    errors = validate_story_contract(contract)
    if payload.get("session_seconds") != 1500:
        errors.append("session_seconds must be 1500")
    app_root = payload.get("app_root")
    if not isinstance(app_root, str) or not Path(app_root).is_dir():
        return errors + ["app_root must be an existing directory"]
    content = Path(app_root) / "Content"
    catalog_path = content / "themes.json"
    if not catalog_path.is_file():
        return errors + [f"themes catalog does not exist: {catalog_path}"]
    try:
        catalog = json.loads(catalog_path.read_text())
    except json.JSONDecodeError:
        return errors + ["themes catalog must be valid JSON"]
    theme = next((item for item in catalog.get("themes", []) if item.get("id") == contract.get("theme_id")), None) if isinstance(contract, dict) else None
    if theme is None:
        return errors + ["theme_id is missing from themes catalog"]
    story = next((item for item in theme.get("stories", []) if item.get("id") == contract.get("story_id")), None)
    if story is None:
        return errors + ["story_id is missing from themes catalog"]
    cools = sorted(story.get("cools", []), key=lambda item: item.get("order", -1))
    if len(cools) != len(contract.get("cools", [])):
        errors.append("catalog cool count must match story contract")
        return errors
    for index, cool in enumerate(cools, start=1):
        artwork = cool.get("artwork", {})
        expected_name = f"{contract.get('theme_id')}-cool{index}"
        if artwork.get("type") != "video" or artwork.get("name") != expected_name:
            errors.append(f"catalog cool {index} must reference video {expected_name}")
            continue
        video_path = content / "Videos" / f"{expected_name}.mp4"
        if not video_path.is_file():
            errors.append(f"missing bundled video: {expected_name}.mp4")
    return errors


VALIDATORS: dict[str, Callable[[Any], list[str]]] = {
    "validate_story_contract.py": validate_story_contract,
    "validate_scene_contract.py": validate_scene_contract,
    "validate_cool_continuity.py": validate_cool_continuity,
    "validate_timeline.py": validate_timeline,
    "validate_review_evidence.py": validate_review_evidence,
    "validate_theme_integration.py": validate_theme_integration,
}


def main_for(script_name: str) -> int:
    parser = argparse.ArgumentParser(description=script_name)
    parser.add_argument("input", type=Path)
    parser.add_argument("--json-only", action="store_true")
    args = parser.parse_args()
    try:
        payload = json.loads(args.input.read_text())
        errors = VALIDATORS[script_name](payload)
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        errors = [f"validation could not run: {error}"]
    result = {"valid": not errors, "input": str(args.input), "errors": errors}
    if not args.json_only:
        print("PASS" if not errors else "FAIL")
        for error in errors:
            print(f"- {error}")
    print(json.dumps(result, ensure_ascii=False))
    return 0 if not errors else 1

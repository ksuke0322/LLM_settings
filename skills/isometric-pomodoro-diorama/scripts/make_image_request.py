"""Build a codex-delegate request that generates ONE image with Codex's built-in image generation.

Usage:
  python3 make_image_request.py ASSET_DIR KIND [REF.png ...] > req.json
  rtk proxy node ~/.agents/bin/codex-delegate.mjs < req.json > out.json

ASSET_DIR  absolute path of one asset folder inside the repo's .tmp/ (codex exec refuses folders outside
           a git checkout). It must hold prompt.txt (the exact prompt) and the reference images.
KIND       master | base | part | backdrop | cloud  (decides output size and transparency checks)
REF.png    file names inside ASSET_DIR passed as colour / art-style references (none for a master)

The image is saved as ASSET_DIR/<asset>-v1.png (retries -v2, -v3) with <asset>-gen-log.json. Codex also
auto-saves every image to ~/.codex/generated_images/; that copy is expected and is not a failure.
"""
import json
import os
import sys
import uuid

KINDS = {
    "master": ("a square 1024x1024 opaque output", False),
    "base": ("a square 1024x1024 output with a TRANSPARENT background", True),
    "part": ("a square 1024x1024 output with a TRANSPARENT background", True),
    "backdrop": ("a portrait 1024x1536 opaque output", False),
    "cloud": ("a landscape 1536x1024 output with a TRANSPARENT background", True),
}
CHECKS = {
    "master": "the whole diorama is visible with margins; no text, labels or watermark",
    "base": "only the plinth; nothing stands on the top; the top is flat; no floor or shadow",
    "part": "exactly one object, complete, nothing cut off; no ground patch, base or shadow",
    "backdrop": "no diorama, island, building or character; the centre is calm; no text or border",
    "cloud": "only a cloud; no island, objects, sky or text",
}

asset_dir, kind = os.path.abspath(sys.argv[1]), sys.argv[2]
refs = sys.argv[3:]
asset = os.path.basename(asset_dir)
size, transparent = KINDS[kind]
text = open(os.path.join(asset_dir, "prompt.txt")).read().strip()
ref_step = ("1. View " + ", ".join(refs) + " in this folder and pass them to the image generation tool as reference "
            "images (colour and art-style reference only; do NOT copy their layout unless the prompt says so).\n"
            if refs else "1. No reference image is used.\n")
alpha = ("- read the PNG with Python: report mode, size, alpha min/max and the four corners' alpha (must be 0); a "
         "painted checkerboard or white backdrop is NOT transparent and needs a retry\n" if transparent else "")
prompt = (
    "You are generating one image. The parent agent judges the result; do only this task and do not delegate.\n\n"
    f"Working folder: {asset_dir}\nWrite only inside this folder (Codex's own automatic copy in "
    "~/.codex/generated_images/ is fine).\n\nSteps:\n" + ref_step
    + f"2. Generate ONE image with your built-in image generation tool using exactly the prompt below. Request {size}.\n"
    f"3. Copy it into this folder as {asset}-v1.png (if a check fails, retry as -v2, -v3; at most 3 attempts).\n"
    f"4. Check at full size:\n- {CHECKS[kind]}\n" + alpha
    + "An output size different from the requested one is acceptable and is NOT a reason to retry.\n"
    f"5. Write {asset}-gen-log.json with tool, attempts, sha256, size, mode and per-check results.\n\n"
    f"prompt:\n{text}\n"
)
json.dump({
    "cwd": asset_dir, "continuationId": str(uuid.uuid4()),
    "purpose": f"Diorama image: generate {asset} ({kind}) with Codex image generation and self-check it",
    "acceptanceCriteria": [f"{asset}-v1.png (or a later attempt) exists and is a real image file",
                           f"{asset}-gen-log.json records tool, attempts, sha256, size, mode and per-check results",
                           "No file outside the working folder is changed, except Codex's automatic copy in "
                           "~/.codex/generated_images/"],
    "prohibitedOperations": ["writing outside the working folder",
                             "paid API calls or any service other than the built-in image generation tool",
                             "git operations", "delegating to another agent"],
    "permission": "approved-write", "allowedPaths": [asset_dir], "timeoutMs": 1800000, "prompt": prompt,
}, sys.stdout, ensure_ascii=False, indent=1)

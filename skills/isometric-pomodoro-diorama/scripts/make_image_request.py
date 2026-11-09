"""Build a codex-delegate request that generates ONE image with Codex's built-in image generation.

Usage:
  python3 make_image_request.py ASSET_DIR KIND [REF.png ...] > req.json
  rtk proxy node ~/.agents/bin/codex-delegate.mjs < req.json > out.json
  python3 collect_image.py ASSET_DIR KIND

ASSET_DIR  absolute path of one asset folder inside the repo's .tmp/ (codex exec refuses folders outside
           a git checkout). It must hold prompt.txt (the exact prompt) and the reference images.
KIND       master | base | part | backdrop | cloud  (decides output size and transparency checks)
REF.png    file names inside ASSET_DIR passed as colour / art-style references (none for a master)

Codex only generates: it saves the image to ~/.codex/generated_images/<sessionId>/. Afterwards run
collect_image.py, which copies that session's image into ASSET_DIR. Sessions never share a folder, so
several requests can run at once.
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
asset_dir, kind = os.path.abspath(sys.argv[1]), sys.argv[2]
refs = sys.argv[3:]
asset = os.path.basename(asset_dir)
size = KINDS[kind][0]
text = open(os.path.join(asset_dir, "prompt.txt")).read().strip()
ref_step = ("1. View " + ", ".join(refs) + " in this folder and pass them to the image generation tool as reference "
            "images (colour and art-style reference only; do NOT copy their layout unless the prompt says so).\n"
            if refs else "1. No reference image is used.\n")
prompt = (
    "You are generating one image. The parent agent collects and judges the result; do only this task and do not "
    f"delegate.\n\nReference folder: {asset_dir}\nDo not create or change any file yourself.\n\nSteps:\n" + ref_step
    + f"2. Call your built-in image generation tool exactly ONCE using exactly the prompt below. Request {size}.\n"
    "3. Do not copy the image, do not retry, and do not look inside ~/.codex/generated_images/. Codex saves it "
    "automatically. Report DONE once the tool call succeeded.\n\n"
    f"prompt:\n{text}\n"
)
json.dump({
    "cwd": asset_dir, "continuationId": str(uuid.uuid4()),
    "purpose": f"Diorama image: generate {asset} ({kind}) with Codex image generation and self-check it",
    "acceptanceCriteria": ["The built-in image generation tool was called exactly once and succeeded",
                           "No file is created or changed by the agent"],
    "prohibitedOperations": ["creating or changing any file",
                             "paid API calls or any service other than the built-in image generation tool",
                             "git operations", "delegating to another agent"],
    "permission": "approved-write", "allowedPaths": [asset_dir], "timeoutMs": 1800000, "prompt": prompt,
}, sys.stdout, ensure_ascii=False, indent=1)

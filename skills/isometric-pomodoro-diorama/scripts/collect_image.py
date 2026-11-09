#!/usr/bin/env python3
"""Copy the image of one Codex run into its asset folder and record it.

Usage:
  ~/work/image-to-3d/trellis2mlx/.venv/bin/python collect_image.py ASSET_DIR KIND

Reads ASSET_DIR/out.json (the codex-delegate result), takes the only PNG in
~/.codex/generated_images/<sessionId>/, copies it to ASSET_DIR/<asset>-vN.png (next free N) and appends to
<asset>-gen-log.json. For KIND base, part or cloud, the four corners' alpha must be 8 or less (a real image can have 1 or 2 there). The folder is named
after the session, so parallel runs cannot pick up each other's image.
Prints COLLECTED <path> and exits 0; prints REJECTED and exits 1 for an image that needs regenerating; exits 2
when the run produced nothing to collect.
"""
import hashlib
import json
import os
import shutil
import sys

from PIL import Image

asset_dir, kind = os.path.abspath(sys.argv[1]), sys.argv[2]
asset = os.path.basename(asset_dir)
text = open(os.path.join(asset_dir, "out.json")).read()
session = json.loads(text[text.index("{"):text.rindex("}") + 1]).get("sessionId")
src_dir = os.path.expanduser(f"~/.codex/generated_images/{session}")
pngs = sorted(f for f in os.listdir(src_dir) if f.endswith(".png")) if session and os.path.isdir(src_dir) else []
if len(pngs) != 1:
    print(f"NOTHING session={session} images={len(pngs)}")
    sys.exit(2)

src = os.path.join(src_dir, pngs[0])
n = 1
while os.path.exists(os.path.join(asset_dir, f"{asset}-v{n}.png")):
    n += 1
dst = os.path.join(asset_dir, f"{asset}-v{n}.png")
shutil.copy2(src, dst)

img = Image.open(dst)
entry = {"file": os.path.basename(dst), "source_path": src, "session": session, "size": img.size, "mode": img.mode,
         "sha256": hashlib.sha256(open(dst, "rb").read()).hexdigest()}
ok = True
if kind in ("base", "part", "cloud"):
    w, h = img.size
    alpha = img.convert("RGBA").getchannel("A")
    corners = [alpha.getpixel(c) for c in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    entry["alpha_corners"] = corners
    ok = img.mode == "RGBA" and max(corners) <= 8
entry["passed"] = ok

log_path = os.path.join(asset_dir, f"{asset}-gen-log.json")
log = json.load(open(log_path)) if os.path.exists(log_path) else {"attempts": []}
log.setdefault("attempts", []).append(entry)
json.dump(log, open(log_path, "w"), indent=1)
print(("COLLECTED " if ok else "REJECTED ") + dst)
sys.exit(0 if ok else 1)

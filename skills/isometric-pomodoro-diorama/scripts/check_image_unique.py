#!/usr/bin/env python3
"""Confirm that no two asset folders hold the same generated image (parallel-generation collision check).

Usage:
  python3 check_image_unique.py DIR [DIR ...]

DIR  folders to scan recursively, e.g. every worktree's .tmp/diorama. Each asset folder's <asset>-vN.png is
     hashed. If the same image appears under two different asset folders, the run collided: print both and
     exit 1. Exit 0 when every image is unique.
"""
import hashlib
import os
import re
import sys

seen, bad = {}, 0
for root in sys.argv[1:]:
    for d, _, files in os.walk(os.path.abspath(root)):
        asset = os.path.basename(d)
        for f in sorted(files):
            if not re.fullmatch(re.escape(asset) + r"-v\d+\.png", f):
                continue
            p = os.path.join(d, f)
            h = hashlib.sha256(open(p, "rb").read()).hexdigest()
            prev = seen.get(h)
            if prev and os.path.dirname(prev) != d:
                print(f"DUPLICATE {h[:12]}\n  {prev}\n  {p}")
                bad += 1
            seen.setdefault(h, p)
print(f"checked {len(seen)} images, {bad} duplicates")
sys.exit(1 if bad else 0)

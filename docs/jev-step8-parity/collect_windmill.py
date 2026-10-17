"""Windmill opus5 の Step 8 証跡から比較用データセット行を作る（読み取りのみ）。

現在の output/ 画像は attempt 2 のレビュー直前（08-15 15:03）にレンダーされ、
attempt 2 レポート（15:11）より前、attempt 1 レポート（11:28）より後。
そのため attempt 2 のみ画像と判定を対応付けられる。attempt 1 は画像が上書き済み。
"""

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path("/Users/sawairikeisuke/Documents/Blender/isometric/pomodoro_assets/windmill-hill_story-01-windmill_opus5")
EVIDENCE = ROOT / "evidence"


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def image_refs(paths):
    return [{"path": p, "sha256": sha256(p)} for p in paths]


def rows_8b(report):
    for i, f in enumerate(report["findings"]):
        yield {
            "id": f"windmill-c3-a2-8b-{i:02d}",
            "story": "windmill-hill_story-01-windmill_opus5",
            "cool": 3,
            "attempt": 2,
            "review_type": "8B",
            "kind": f["kind"],
            "criterion": f["criterion"],
            "location": f.get("location"),
            "opus_verdict": "fail" if f["severity"] in ("high", "medium") else f["severity"],
            "opus_severity": f["severity"],
            "opus_note": f.get("note"),
            "images": image_refs(f["evidence_images"]),
            "pairing": "verified_by_mtime",
        }


def rows_8c(report):
    checks = ("signature_realization", "class_readable", "existence_reason_readable")
    for i, k in enumerate(report["kinds"]):
        for c in checks:
            yield {
                "id": f"windmill-c3-a2-8c-{i:02d}-{c}",
                "story": "windmill-hill_story-01-windmill_opus5",
                "cool": 3,
                "attempt": 2,
                "review_type": "8C",
                "kind": k["kind"],
                "criterion": c,
                "location": None,
                "opus_verdict": k.get(c),
                "opus_severity": None,
                "opus_note": k.get("note"),
                "images": image_refs(k["evidence_images"]),
                "pairing": "verified_by_mtime",
            }


def main(out):
    b = json.loads((EVIDENCE / "cool3_step8_8b_2.json").read_text())
    c = json.loads((EVIDENCE / "cool3_step8_8c_2.json").read_text())
    rows = [*rows_8b(b), *rows_8c(c)]
    with open(out, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(len(rows))


if __name__ == "__main__":
    main(sys.argv[1])

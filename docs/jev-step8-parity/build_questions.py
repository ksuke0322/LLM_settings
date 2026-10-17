"""dataset.jsonl の各行から Jev 用の問い（Noul）を作る。API は呼ばない。

各行に 2 種類の問いを付ける。
- specific: 記録された指摘・条件そのものを問う（Opus との直接比較用）。
- generic : 8B 向け。指摘内容を知らない本番を想定し、分類ごとの定型の問いを kind に当てる。
            8A/8C も同じ分類で付け、指摘を知らない状態での検出力を測る。

polarity:
- "yes_is_pass"  : Yes なら条件を満たす（Windmill の 8B 条件、8C の各チェック）
- "yes_is_defect": Yes なら欠陥がある（Beehive の指摘文、generic の問い）

画像は state の `scene`（完成 state 静止画）と `closeup_N` に置く。実行時に SDK の image() へ差し替える。
"""

import json
import sys

CATEGORIES = {
    "support_contact": {
        "keywords": ["浮", "貫通", "めり込", "接続", "接合", "達していない", "支持", "固定", "隙間", "棚が回る"],
        "generic": "`{kind}` の部品のどこかが、支えなしに宙に浮いている、他の部品を突き抜けている、"
                   "または本来つながるべき部品とつながっていないように見えますか。",
    },
    "class_readable": {
        "keywords": ["読め", "読みにく", "見える", "区別", "クラス", "として"],
        "generic": "`{kind}` は、実物の何であるかがひと目で分からない、または別の物（破片・板・塊など）に見えますか。",
    },
    "proportion_shape": {
        "keywords": ["比率", "大きさ", "偏", "厚み", "弓なり", "不揃い", "片流れ", "切妻"],
        "generic": "`{kind}` の形や各部の比率・左右の釣り合いが、実物として不自然に見えますか。",
    },
    "layout_reason": {
        "keywords": ["理由", "設置場所", "境界", "輪郭", "1箇所", "置かれ方"],
        "generic": "`{kind}` の配置や広がり方に、実際の暮らしや作業から説明できない不自然さがありますか。",
    },
    "material_style": {
        "keywords": ["材質", "色", "質感", "リッチ", "トイクレイ", "陰影"],
        "generic": "`{kind}` の色・質感・陰影が、作品のトイクレイ調の表現として不足または不自然に見えますか。",
    },
}

ORDER = ["support_contact", "proportion_shape", "layout_reason", "material_style", "class_readable"]

C8_TEXT = {
    "signature_realization": "`{kind}` の特徴的な部品（署名パーツ）が、画像の中で形として作り込まれていますか。",
    "class_readable": "`{kind}` は、実物の何であるかがひと目で分かりますか。",
    "existence_reason_readable": "`{kind}` がその場所にある理由（使い道や作業とのつながり）が画像から読み取れますか。",
}

COMMON = (
    "画像はアイソメトリック視点の 3D レンダーで、`scene` は全体、`closeup_*` は対象の拡大です。"
    "トイクレイ調の簡略化そのものは欠陥とみなしません。画像から確認できないことは推測せず、"
    "見えている内容だけで答えてください。"
)


def categorize(text):
    for cat in ORDER:
        if any(k in text for k in CATEGORIES[cat]["keywords"]):
            return cat
    return "class_readable"


def state_for(row):
    imgs = row["images"]
    state = {"scene": imgs[0]["path"]}
    for i, img in enumerate(imgs[1:]):
        state[f"closeup_{i}"] = img["path"]
    return state


def specific(row):
    kind, crit = row["kind"], row["criterion"]
    if row["review_type"] == "8C":
        return C8_TEXT[crit].format(kind=kind), "yes_is_pass"
    if row["story"].startswith("windmill"):
        return f"`{kind}` について、次の条件を満たしていますか。条件: {crit}", "yes_is_pass"
    return f"`{kind}` について、次の問題が画像に見えますか。問題: {crit}", "yes_is_defect"


def build(row):
    text = row["criterion"] if row["review_type"] != "8C" else row["criterion"]
    cat = "class_readable" if row["review_type"] == "8C" else categorize(text)
    spec_q, spec_pol = specific(row)
    kind = row["kind"]
    return {
        "id": row["id"],
        "review_type": row["review_type"],
        "category": cat,
        "state": state_for(row),
        "context": COMMON,
        "questions": {
            "specific": {"type": "noul", "instructions": spec_q, "polarity": spec_pol},
            "generic": {"type": "noul", "instructions": CATEGORIES[cat]["generic"].format(kind=kind), "polarity": "yes_is_defect"},
        },
    }


def main(src, out):
    rows = [json.loads(l) for l in open(src, encoding="utf-8")]
    with open(out, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(build(r), ensure_ascii=False) + "\n")
    print(len(rows))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

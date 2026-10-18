"""改善案 1〜3 を反映した問い（v2）を、正解ラベルのある 25 行について作る。API は呼ばない。

- 案 1: 指摘を「満たすべき状態」の肯定形 1 文に書き換え、向きをすべて yes_is_pass に揃える。
- 案 2: バッククォートは state のキー（scene, closeup_N）にだけ使う。kind 名は普通の言葉で書く。
- 案 3: 見るべき画像（主に closeup_0）を問いで直接指し、各画像が何を写すかを notes で添える。

notes は文字列として state に入れる（run-lib の buildRequest が画像と区別して扱う）。
"""

import json
import sys

POSITIVE = {
    "windmill-c3-a2-8b-00": "`closeup_0` の小麦畑の内側で、作物が植わっていない部分は、道・畦・刈り跡など理由の分かる形になっていますか。",
    "windmill-c3-a2-8b-01": "`closeup_0` の小麦の株は、細い茎の先に穂がふくらんだ、麦らしい比率に見えますか。",
    "windmill-c3-a2-8b-02": "`closeup_0` の荷車の積荷は、刈り取った麦を束ねた麦束に見えますか。",
    "windmill-c3-a2-8c-00-signature_realization": "`closeup_0` の小麦の列は、畝ごとに茎の束が並ぶ形として作り込まれていますか。",
    "windmill-c3-a2-8c-00-class_readable": "`closeup_0` に写っているものは、ひと目で畝に並んだ小麦畑だと分かりますか。",
    "windmill-c3-a2-8c-00-existence_reason_readable": "`scene` で、小麦の列が畑の区画に沿って植えられていることが読み取れますか。",
    "windmill-c3-a2-8c-01-signature_realization": "`closeup_0` の荷車は、車輪・荷台・引き手がそろった荷車の形として作り込まれていますか。",
    "windmill-c3-a2-8c-01-class_readable": "`closeup_0` に写っているものは、ひと目で穀物を運ぶ荷車だと分かりますか。",
    "windmill-c3-a2-8c-01-existence_reason_readable": "`scene` で、荷車が畑の収穫物を運ぶためにそこにあることが読み取れますか。",
    "windmill-c3-a2-8c-02-signature_realization": "`closeup_0` の案山子は、杭・腕木・頭・衣服がそろった案山子の形として作り込まれていますか。",
    "windmill-c3-a2-8c-02-class_readable": "`closeup_0` に写っているものは、ひと目で案山子だと分かりますか。",
    "windmill-c3-a2-8c-02-existence_reason_readable": "`scene` で、案山子が畑を守るために畑の中に立っていることが読み取れますか。",
    "beehive-c1-8a-r1-ref-00": "`closeup_0` の巣箱の屋根は、中央の棟から左右へ傾く切妻屋根ですか。",
    "beehive-c1-8a-r1-ref-01": "`closeup_0` の巣箱の屋根は、箱の上端の上に載っていますか。",
    "beehive-c1-8a-r3-con-00": "`closeup_0` の巣箱の四隅に、側面の縦の板とは区別できる角の部材が見えますか。",
    "beehive-c1-8a-r3-con-01": "`closeup_0` の巣箱の側面の縦の板の継ぎ目は、上から下まで通り、間隔がそろっていますか。",
    "beehive-c1-8a-r3-con-02": "`closeup_0` の燻煙器のふいごは、折り目のある革の蛇腹に見えますか。",
    "beehive-c1-8a-r3-con-03": "`closeup_0` の燻煙器の保護ケージと煙突は、それぞれ籠と煙出しに見えますか。",
    "beehive-c1-8a-r3-con-04": "`scene` 全体の配色と質感は、色数と素材感が豊かで、見ごたえがありますか。",
    "beehive-c1-8a-r3-con-05": "`closeup_0` の落ち葉は、草の上に接して置かれ、落ち葉だと分かりますか。",
    "beehive-c1-8a-r3-mt-00": "`closeup_0` の巣箱の上段と下段は同じ幅で、側面が段差なくそろっていますか。",
    "beehive-c1-8a-r3-mt-01": "`closeup_0` の道具箱の端板は、下端が箱の底まで届いていますか。",
    "beehive-c1-8a-r3-ref-00": "`closeup_0` の道具箱の左右の端板は、同じ大きさと高さですか。",
    "beehive-c1-8a-r3-ref-01": "`closeup_0` の道具箱の握り棒は、両側の端板につながっていますか。",
    "beehive-c1-8a-r3-ref-02": "`closeup_0` の巣箱の屋根の棟は中央にあり、手前と奥の屋根の長さが同じですか。",
}

IMAGE_NOTES = {
    "cool1_final_still": "巣箱のある草地の場面全体",
    "cu_hive": "巣箱の拡大",
    "cu_smoker": "燻煙器の拡大",
    "cu_tool_box": "道具箱の拡大",
    "cu_dry_leaf": "落ち葉の拡大",
    "cu3_field_context": "小麦畑とその周囲",
    "cu3_wheat_field": "小麦畑の拡大",
    "cu3_wheat_row": "小麦の列の拡大",
    "cu3_wheat_stalk": "小麦の株の拡大",
    "cu3_wheat_stalk_side": "小麦の株の側面からの拡大",
    "cu3_cart": "荷車の拡大",
    "cu3_cart_side": "荷車の側面",
    "cu3_scarecrow": "案山子の拡大",
    "cu3_scarecrow_side": "案山子の側面",
}

CONTEXT = (
    "画像はアイソメトリック視点の 3D レンダーです。各画像が何を写しているかは `notes` にあります。"
    "トイクレイ調の簡略化そのものは欠陥とみなしません。見えている内容だけで答えてください。"
)


def stem(path):
    return path.rsplit("/", 1)[-1].removesuffix(".png")


def build(row):
    notes = "。".join(f"{key} は{IMAGE_NOTES[stem(path)]}" for key, path in row["state"].items())
    return {
        "id": row["id"],
        "review_type": row["review_type"],
        "category": row["category"],
        "state": row["state"],
        "notes": {"notes": notes},
        "context": CONTEXT,
        "questions": {
            "specific": {"type": "noul", "instructions": POSITIVE[row["id"]], "polarity": "yes_is_pass"},
        },
    }


def main(src, out):
    rows = [json.loads(l) for l in open(src, encoding="utf-8")]
    picked = [build(r) for r in rows if r["id"] in POSITIVE]
    assert len(picked) == len(POSITIVE), "missing rows"
    with open(out, "w", encoding="utf-8") as fh:
        for r in picked:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(len(picked))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

"""Beehive opus5 クール1 の Step 8 記録から比較用データセット行を作る（読み取りのみ）。

記録（Markdown）のハッシュは現存画像と一致しないため、日付とラウンド記録で対応を推定する。

- step8_pre_r8/（08-22 14:01、render_set 1e2b8e…）
  ↔ cool1_step8_advisories.md（8A 第1ラウンド、08-22 14:34、run A・B は同一セット）: pairing=inferred_medium
  ↔ cool1_step8a_majority_round3.md（08-22 21:31、render_set 6ac8c3… で別セット）: pairing=inferred_low
- step8/（09-03 15:36〜45）は 8A 第37・8B 第13ラウンドの合格記録より後のレンダー: pairing=inferred_low

ground_truth は記録上の親の実測結果がある場合だけ入れる（measured_true / measured_false）。
"""

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path("/Users/sawairikeisuke/Documents/Blender/isometric/pomodoro_assets/creature-watching_story-02-beehive-opus5")
PRE = ROOT / "evidence" / "step8_pre_r8"
FINAL = ROOT / "evidence" / "step8"
STORY = "creature-watching_story-02-beehive-opus5"

CLOSEUPS = {
    "hive": ["cu_hive.png", "cu_corner_PP.png", "cu_handhold_super.png"],
    "smoker": ["cu_smoker.png"],
    "tool_box": ["cu_tool_box.png"],
    "hive_stand": ["cu_hive_stand.png", "cu_wedge.png"],
    "tree_stump": ["cu_tree_stump.png"],
    "dry_leaf": ["cu_dry_leaf.png"],
    "fallen_twig": ["cu_fallen_twig.png"],
    "scene": [],
}

# (source, kind, criterion, opus_verdict, ground_truth)
PRE_ADVISORIES = [
    ("hive", "持ち手のくぼみの陰影が薄く、彫り込みに読みにくい", "split"),
    ("hive", "観察窓の額縁が壁面より奥にあり、参照の張り出した太い額縁に届かない", "single"),
    ("hive", "入口スリットが暗い開口に読めない", "single"),
    ("hive", "着地板の側桟が三角のチップ状で破片に見える", "improvable"),
    ("hive", "屋根の留め具が面から浮いた L 字タブで、面一のビス頭に読めない", "improvable"),
    ("smoker", "ふいごが同心の直方体を重ねた階段状で、革の蛇腹に読めない", "split"),
    ("smoker", "保護ワイヤが2本の細いヘアピンに減っている", "single"),
    ("tool_box", "妻板頂部の切り欠きに棒が入っておらず、握れる取っ手に読めない", "single"),
    ("tool_box", "ハイブツールのフック端が手前側板を貫通して見える", "single"),
    ("hive_stand", "楔が右手前1箇所だけで、水平出しの意図が片側にしか読めない", "single"),
    ("tree_stump", "根張りが厚みのない板状で、根ではなく泥の広がりに見える", "improvable"),
]

PRE_REFUTED = [
    ("hive", "屋根が切妻ではなく片流れ1面である"),
    ("hive", "屋根が継箱天端より低く壁にめり込んでいる"),
]

ROUND3_CONFIRMED = [
    ("hive", "四隅の留め継ぎ角材が読めない / 面内の縦リブと区別できない"),
    ("hive", "縦の板の継ぎ目3本が途中終端・長さ不揃いで規則が読めない"),
    ("smoker", "燻煙器のふいご(平板2枚・テーパー無し・鋲無し)が蛇腹に読めない"),
    ("smoker", "燻煙器の保護ケージと煙突が籠・煙出しに読めない"),
    ("scene", "配色・質感のリッチさが目標に届かない"),
    ("dry_leaf", "落ち葉が草の上に浮き、クラスに読めない"),
]
ROUND3_MEASURED_TRUE = [
    ("hive", "継箱と深箱の幅が一致せず、四周に幅広の棚が回る"),
    ("tool_box", "端板の下端が箱の内床に達していない"),
]
ROUND3_REFUTED = [
    ("tool_box", "道具箱の端板が左右で大きさ・高さが違う"),
    ("tool_box", "握り棒が手前端板と接続していない"),
    ("hive", "屋根の棟が奥へ偏り、手前の流れが長く垂れる"),
]

FINAL_8B_MINORS = [
    ("smoker", "燻煙器のふいごが薄い板に見え、缶体との接合(送風首)が画面に出ない"),
    ("hive", "巣箱側面の手掛け溝が、奥行きの見えない黒いスリットとして貫通穴に読める"),
    ("tree_stump", "切り株の根の裾が地面で薄い縁として終わり、土に潜る感じが出ない"),
    ("dry_leaf", "枯葉の厚みが幅の2割ほどあり、薄い葉というより莢に見える"),
    ("fallen_twig", "落ち枝が弓なりで、影との隙間が全長に出る"),
    ("scene", "除外ゾーンの輪郭が裸地の縁として見える"),
    ("tool_box", "ハイブツールが手前の三角側板に隠れて置かれ方を判定できない"),
]


def images(base, kind):
    names = ["cool1_final_still.png", *CLOSEUPS[kind]]
    out = []
    for n in names:
        p = base / n
        if p.exists():
            out.append({"path": str(p), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()})
    return out


def row(rid, review_type, kind, criterion, verdict, base, pairing, source, ground_truth=None, severity=None):
    return {
        "id": rid,
        "story": STORY,
        "cool": 1,
        "attempt": source,
        "review_type": review_type,
        "kind": kind,
        "criterion": criterion,
        "location": None,
        "opus_verdict": verdict,
        "opus_severity": severity,
        "opus_note": None,
        "ground_truth": ground_truth,
        "images": images(base, kind),
        "pairing": pairing,
    }


def build():
    rows = []
    # advisories は多数決で未確定（1本のみ / improvable）。Opus 判定は「単発の指摘」として扱う
    for i, (kind, crit, agree) in enumerate(PRE_ADVISORIES):
        rows.append(row(f"beehive-c1-8a-r1-adv-{i:02d}", "8A", kind, crit, f"unconfirmed_{agree}", PRE, "inferred_medium", "8A-round1"))
    for i, (kind, crit) in enumerate(PRE_REFUTED):
        rows.append(row(f"beehive-c1-8a-r1-ref-{i:02d}", "8A", kind, crit, "fail", PRE, "inferred_medium", "8A-round1", ground_truth="measured_false"))
    for i, (kind, crit) in enumerate(ROUND3_CONFIRMED):
        rows.append(row(f"beehive-c1-8a-r3-con-{i:02d}", "8A", kind, crit, "fail", PRE, "inferred_low", "8A-round3"))
    for i, (kind, crit) in enumerate(ROUND3_MEASURED_TRUE):
        rows.append(row(f"beehive-c1-8a-r3-mt-{i:02d}", "8A", kind, crit, "unconfirmed_single", PRE, "inferred_low", "8A-round3", ground_truth="measured_true"))
    for i, (kind, crit) in enumerate(ROUND3_REFUTED):
        rows.append(row(f"beehive-c1-8a-r3-ref-{i:02d}", "8A", kind, crit, "fail", PRE, "inferred_low", "8A-round3", ground_truth="measured_false"))
    for i, (kind, crit) in enumerate(FINAL_8B_MINORS):
        rows.append(row(f"beehive-c1-8b-r13-min-{i:02d}", "8B", kind, crit, "minor", FINAL, "inferred_low", "8B-round13", severity="minor"))
    return rows


def main(out):
    rows = build()
    with open(out, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(len(rows))


if __name__ == "__main__":
    main(sys.argv[1])

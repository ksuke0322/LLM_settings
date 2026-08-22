# Step 8 review control contract

Step 8の独立レビューを、短い返却・入力差分・親判断の3点で制御する正本。詳細な判定基準は
`quality-gates.md`、署名パーツは`worksheet-rules.md`と設計書、起動文面は
`step8-review-prompts.md`に置く。

## 目次

- [ReviewReport v1](#reviewreport-v1)
- [多数決 v1](#多数決-v1)
- [Advisory記録](#advisory記録)
- [ReviewLedger v1](#reviewledger-v1)
- [`step8_parent_baseline`](#step8_parent_baseline)
- [再実行制御](#再実行制御)
- [validator](#validator)

## ReviewReport v1

返却はJSONオブジェクトだけとし、Markdownコードフェンス、前置き、作業経緯、前回指摘、
修正履歴、反論、実装手順を含めない。画像パスはすべて絶対パスで、存在する通常ファイルを指す。
ReviewReport v1は閉じたJSON契約であり、定義されていないトップレベルキー・findingキー・kindキーは
`validate_step8_review.py`が拒否する。`history`、前回レビュー、修正履歴、反論などを別名のキーで返してはならない。

共通の必須項目は次のとおり。

```json
{
  "schema_version": 1,
  "review_type": "8A|8B|8C",
  "status": "pass|fail|needs_parent_decision",
  "input_images": ["/absolute/path/overall.png"],
  "findings": [],
  "conclusion": "必須条件を確認した。"
}
```

`8C`は`findings`の代わりに`kinds`を持つ。`conclusion`と各指摘の`note`は1行240文字以内、
指摘メモは1件1文とする。`evidence_images`は各指摘またはkindに必須である。

8Aの`findings`は次の項目を持つ。`classification`は
`required_match`、`allowed_difference`、`improvable`、`waiver`のいずれかで、`kind`、
`criterion`、`location`、`evidence_images`、`note`を必須とする。`required_match`の未解決件数が
0件の場合だけpassにできる。`waiver`をpassに含めるには、トップレベルの`waiver`に
`reason`、`impact`、`approved_by`をすべて記録し、既存manifestの承認記録と一致させる。

8Bの`findings`は`severity`（`high`、`medium`、`minor`、`waiver`）、`kind`、`location`、
`evidence_images`、`note`を必須とする。任意の`criterion`を指定できるが、指摘fingerprintで
省略した場合はseverityを使う。`high`と`medium`が0件の場合だけレビュー判定はpassになる。
`waiver`は記録できるが、`common_sense_review` gateの完了には使えない。

8Cの`kinds`は1件以上とし、各要素に`kind`、`signature_realization`、`class_readable`、
`existence_reason_readable`（各`pass|fail`）、`evidence_images`を持つ。全kindの3項目がすべて
passの場合だけpassになる。いずれかがfail、読めない、またはwaiverの場合は完了にしない。

## 多数決 v1

8A/8B/8Cは、同一の現行レンダー、同一の入力画像集合、同一のプロンプトrevisionで、独立した3本の
レビューを起動する。各起動は他の起動結果、親の既知課題、過去の指摘を受け取らない。

- **項目単位の確定**: 3本のうち2本以上が同じ項目を挙げた場合だけ、確定した指摘として扱う。
- **8A**: `required_match`の`kind + criterion + location`単位で数える。`allowed_difference`と`improvable`は確定指摘にしない。
- **8B**: `high`/`medium`の`kind + criterion/location`単位で数える。`minor`はadvisoryとして記録する。
- **8C**: `kind`単位で3つのpass/fail結果を集約する。1本でもfailを挙げた場合の扱いは、項目の2/3多数決とゲート条件を分けて記録する。
- レンダー、入力画像、プロンプトrevisionのいずれかが変わったら、新しい3本を起動する。異なるレンダーの結果を同じ多数決へ混ぜてはならない。
- 2/3未満の単発指摘は、親が実測で真偽を確認する場合を除き修正対象にしない。

### `evidence/cool<N>_step8_majority.md` の記録様式

```markdown
# Cool <N> Step 8 Majority v1

- render_sha256: <64桁>
- prompt_revision: <revision>
- run_count: 3
- decision_rule: item-level 2 of 3

## 8A required_match
| item | run A | run B | run C | votes | decision |
|---|---|---|---|---:|---|

## 8B high/medium
| item | run A | run B | run C | votes | decision |
|---|---|---|---|---:|---|

## 8C kind
| kind | run A | run B | run C | votes | decision |
|---|---|---|---|---:|---|

## 実測で反証した指摘
| item | 単発レビューの指摘 | 親の実測事実 | 判定 |
|---|---|---|---|
| tool_handle_bar | world bboxだけでは断面が扁平に見える | 回転を打ち消した断面は0.060 x 0.060 | 修正しない |
| stand_stone_R1 | 天端が他の石より低く楔が無荷重に見える | 天端zは0.2862、楔が隙間を埋める | 修正しない |
| hive_deep handhold | 持ち手が貫通している | 面z=0.500、底z=0.440、貫通なし | 修正しない |
```

このファイルは3本の入力が同一であることを証明する証跡であり、レビュー結果を後から都合よく
合成するためのメモではない。各runのJSON絶対パスとSHA-256も実ファイル側へ併記する。

## Advisory記録

8Aの`improvable`、8Bの`minor`、8Cのnote欄はゲート条件ではない。その場で修正せず、次の様式で
`evidence/cool<N>_step8_advisories.md`へ保存し、ステップ9の人間レビュー用パケットへ添付する。

```markdown
# Cool <N> Step 8 Advisories

- render_sha256: <64桁>
- majority_path: /absolute/path/evidence/cool<N>_step8_majority.md
- human_review_owner: Step 9

| source | item | note | gate_effect | step9_decision |
|---|---|---|---|---|
| 8A improvable / 8B minor / 8C note | ... | ... | none | pending |
```

`advisory`が存在しても8A/8B/8Cのhard gateを緩めない。採否はステップ9で人間が決め、ステップ8の
再実行理由にしてはならない。

## ReviewLedger v1

台帳は親が更新する正本であり、レビューエージェントは編集しない。最小構造は次のとおり。

```json
{
  "schema_version": 1,
  "attempts": [
    {
      "review_type": "8A",
      "attempt": 1,
      "candidate_sha256": "64桁のSHA-256 hex",
      "render_set_sha256": "64桁のSHA-256 hex",
      "acceptance_matrix_revision": "quality-gates@rev-1",
      "measurement_revision": "snapshot@rev-2",
      "report_path": "/absolute/path/evidence/cool1_step8_8a_1.json",
      "finding_fingerprints": [],
      "parent_action": "fix|pause|waiver|pass"
    }
  ]
}
```

`report_path`は絶対パスで存在するJSONを指す。`parent_action=waiver`を記録する場合は、
8Aの既存manifestにも`reason`、`impact`、`approved_by`を残し、台帳entryにも同じ3項目を持つ`waiver`オブジェクトを
記録する。8B/8Cのgateをwaiverで完了扱いにしない。

指摘fingerprintは次を空白正規化・casefoldして`|`で連結する。

`review_type + kind + criterion + location`

8Cはfailになった3項目の名称を`criterion`、kind名をlocationにも使う。8Bでcriterionが無い場合は
severityを使う。同一fingerprintが直前の試行と連続して現れた時点で、次の自動再実行を起動せず
`needs_parent_decision`に切り替える。

## `step8_parent_baseline`

8Aを起動する前に親が自分で次を確認し、`evidence/cool<N>_step8_baseline.json`へ保存する。

- 当該クールの基準参照画像1枚と現行完成stateレンダー1枚
- 守る視覚アンカー3〜5個
- 参照画像と設計・物理妥当性が衝突する箇所
- Acceptance Matrixへ反映した許容差とwaiver候補

baselineと親の既知課題は独立レビュアーへ渡さない。レビュアーへ渡すのは、親が確定した判定基準、
必要な画像、実測値だけである。基準画像が読めない、優先関係が未確定、必須/許容分類が曖昧、または
現行レンダーが対象と一致しない場合は、8Aを起動せず親判断で停止する。

baselineの最小形は次のとおり。

```json
{
  "schema_version": 1,
  "cool": 1,
  "reference_image": "/absolute/path/cool_reference.png",
  "current_render": "/absolute/path/cool1_final_still.png",
  "current_render_sha256": "64桁のSHA-256 hex",
  "candidate_sha256": "64桁のSHA-256 hex",
  "render_set_sha256": "64桁のSHA-256 hex",
  "visual_anchors": ["主役の輪郭", "素材感", "装飾密度"],
  "conflicts": [],
  "accepted_tolerances": [],
  "waiver_candidates": []
}
```

`validate_step8_review.py`の8A検証では`--baseline`を省略できない。baselineはschema version、正のcool番号、異なる2枚の既存画像、現行レンダーのSHA-256、candidate/render setのSHA-256、3〜5個の視覚アンカー、`conflicts`・`accepted_tolerances`・`waiver_candidates`の配列を満たす必要がある。`current_render`はReviewReportの`input_images`に含め、実ファイルのSHA-256と一致させる。CLIへ渡したcandidate/render set revisionもbaselineと一致させる。欠落・相対パス・画像未読・入力不備・revision不一致は`status=fail`かつ`rerun_allowed=false`で停止する。8B/8Cにはこの親baselineを要求しない。

## 再実行制御

- candidate `.blend`とrender setの両方が前回から不変で、`measurement_revision`も更新されていない場合は再レビューしない。
- 再レビューには新しいrender、または親が`measurement_revision`として記録した更新済み実測値を要求する。
- 同一finding fingerprintの連続再発は、2回目の報告を記録した時点で親へ戻す。
- `needs_parent_decision`、JSON不正、画像未読、入力不足、タイムアウトは成功扱いにしない。
- 8Aのwaiverはmanifestの`reason`、`impact`、`approved_by`が揃う場合だけ成立する。
- 8B/8Cのwaiverは記録専用で、gateをpassまたはwaivedへ変更しない。

## validator

次のvalidatorはJSON構文、画像、gate別pass条件、revision差分、fingerprint再発、waiver範囲を検証する。

```bash
python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_step8_review.py \
  --report /absolute/path/report.json \
  --baseline /absolute/path/cool1_step8_baseline.json \
  --ledger /absolute/path/cool1_step8_review_ledger.json \
  --review-type 8A --attempt 2 \
  --candidate-sha256 <sha256> --render-set-sha256 <sha256> \
  --manifest /absolute/path/cool1_manifest.json \
  --acceptance-matrix-revision quality-gates@rev-1 \
  --measurement-revision snapshot@rev-2
```

出力は次の5キーだけを持つ。`status=pass`以外は成功とみなさず、`rerun_allowed=false`なら自動再実行
を起動しない。

```json
{
  "status": "pass|fail|needs_parent_decision",
  "rerun_allowed": true,
  "errors": [],
  "warnings": [],
  "finding_fingerprints": []
}
```

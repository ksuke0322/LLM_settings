# Step 8 review control contract

Step 8の独立レビューを、短い返却・入力差分・親判断の3点で制御する正本。詳細な判定基準は
`quality-gates.md`、署名パーツは`worksheet-rules.md`と設計書、起動文面は
`step8-review-prompts.md`に置く。

## 目次

- [ReviewReport v1](#reviewreport-v1)
- [ReviewLedger v1](#reviewledger-v1)
- [`step8_parent_baseline`](#step8_parent_baseline)
- [再実行制御](#再実行制御)
- [validator](#validator)

## ReviewReport v1

返却はJSONオブジェクトだけとし、Markdownコードフェンス、前置き、作業経緯、前回指摘、
修正履歴、反論、実装手順を含めない。画像パスはすべて絶対パスで、存在する通常ファイルを指す。

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
  "visual_anchors": ["主役の輪郭", "素材感", "装飾密度"],
  "conflicts": [],
  "accepted_tolerances": [],
  "waiver_candidates": []
}
```

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
  --ledger /absolute/path/cool1_step8_review_ledger.json \
  --review-type 8A --attempt 2 \
  --candidate-sha256 <sha256> --render-set-sha256 <sha256> \
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

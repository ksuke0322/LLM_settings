# 委任の境界と結果

この文書は、`isometric-story-workflow`内で委任できる作業の境界と結果形式を定める。委任経路、モデル、reasoning effort、権限、resume、再委任の条件は `~/.agents/AGENTS.md`、`~/.agents/references/delegate-flow.md`、`~/.agents/references/delegate-policy.md` を正本とする。この文書と依頼テンプレートはそれらを独自に上書きしない。経路・モデル・effort・権限を確認できない場合は親が担当し、別経路へフォールバックしない。

## 親と委任先の作業境界

- 親は要件、ストーリーと視覚の設計、Blender実装・修正、素材の採否、指摘の解釈、優先順位、waiver、人間レビュー、横断的な統合、正本採用を担う。
- 制作フローの親は候補`.blend`の実装を担当する。必要なBlender用コード、`bpy`を使うPython、GNノードグラフ、実装用スクリプト、実測スクリプト、レンダー設定の作成・修正も親の担当である。
- 委任先が実行できるのは、対象と受入れ条件を親が固定した読み取り検査、既存validator・既存のscene/timeline抽出・定量QAスクリプトの実行、固定済み入力の画像一次確認、固定済み仕様のレンダーに限る。新規スクリプト、実測スクリプト、レンダー設定、候補`.blend`を作成・変更しない。
- Step 8の8A・8B・8Cは、`references/step8-review-prompts.md`に定める独立レビューとして別々に実行する。委任先による画像一次確認や実行結果は、独立レビュー、最終判定、指摘の採否、修正方針、waiver判断を代替しない。
- 親は毎回、対象の絶対パス、固定入力、許可された出力先、既存コマンド、検証条件を明示する。候補`.blend`、正本`.blend`、manifest、state、設計書、レビュー判定の変更は委任しない。

## ExecutionReport v1

実行結果は次の形のJSONで返し、`scripts/validate_execution_report.py`で入力・出力の存在、絶対パス、SHA-256、statusと終了コードの整合を確認する。`needs_parent_decision`、出力不足、不正JSON、入力不一致は成功として扱わない。

```json
{
  "schema_version": 1,
  "status": "pass|fail|needs_parent_decision",
  "operation": "render|validate|snapshot|quantitative_qa|evidence_check",
  "step": "7d|7.5|8|9.5|10",
  "inputs": [{"path": "/absolute/path", "sha256": "..."}],
  "outputs": [{"path": "/absolute/path", "sha256": "..."}],
  "command": ["..."],
  "exit_code": 0,
  "duration_ms": 0,
  "warnings": []
}
```

## 画像一次確認の出力

親が順序と絶対パスを固定した画像の候補整理に限る。結果は次の情報を含むJSONにし、最終判定や設計判断を含めない。

```json
{
  "purpose": "step8_review_preflight",
  "input_images": ["/absolute/path/image.png"],
  "observations": [
    {
      "item": "possible_missing_part",
      "evidence_image": "/absolute/path/image.png",
      "confidence": 0.72,
      "note": "署名パーツの判読に追加確認が必要である。"
    }
  ],
  "uncertainties": [],
  "failure": null
}
```

`observations[]`には`item`、絶対パスの`evidence_image`、`confidence`、`note`を含める。画像未読、JSON不正、タイムアウト、低確信度、根拠画像の一意性不明、または構造確認に必要な視点の欠落は成功扱いにしない。入力を省略・削減する場合の判断、最終レビューへの画像セット、レビューの合否は親が担う。

## Step 8画像セットの保持

- 初回の一次解析には、8A・8B・8Cごとに親が固定した必須画像を省略せず渡す。16kコンテキストに収まらない場合は画像を削らず、固定したサブケースに分けて実行する。
- 画像未読、JSON不正、タイムアウト、低確信度、根拠画像の一意性不明、構造確認に必要な視点の不足、または応答の`failure`が`null`以外なら、画像を削減せず元の入力セットを本番の独立レビューへ渡す。
- 8Aは各Coolの代表ref、制作レンダー、重要差分の根拠画像を保持し、重複するrefやclose-upだけを削減する。
- 8Bは制作レンダー、軸・ハブ・羽根・ステイ・接地を確認できるclose-up、構造確認に必要な実物写真を保持する。生成参考画像は渡さない。
- 8Cは対象Coolの全景とスコア対象の各署名パーツclose-upを保持し、同じ情報を示す重複画像だけを削減する。生成参考画像は渡さない。

独立レビューの画像要件と起動文は `references/step8-review-prompts.md`、保持・削減の最終判断は `references/review-publication.md` を参照する。一次解析結果だけで本番レビューの画像を確定しない。

## 委任の前後確認と候補採用

- 親は各委任の直前と直後に、正本・候補`.blend`、`design/`、`ref/`、`review/`内のファイル、`story_contract.json`、`cool<N>_manifest.json`のmtimeとSHA-256を比較する。委任先が変更できるのは指定された`output/`と`evidence/`だけとする。
- 想定外の変更があれば候補の採用を停止し、状態と証跡を保全して親の判断へ戻す。
- 親が候補`.blend`の実装と修正を担い、7a→7b→7c→7d/7e/7.5→8A/8B/8Cがすべて通過した後に限り、親だけが候補を正本として採用する。Step 8の独立レビューは `references/step8-review-prompts.md` に従う。

## 依頼文の項目

親は上位規約に沿って依頼を作り、次の項目を埋める。依頼文テンプレートで実行経路、モデル、effort、権限、承認状態を新たに指定しない。

```text
Objective:
<この依頼で完了する作業と受入れ条件>

Inputs:
<固定した入力とrevision>

Allowed paths:
<対象の絶対パスと、必要な場合だけ出力先>

Prohibited operations:
<禁止操作と親に残す判断>

Expected result:
<状態、根拠、確認したファイル、出力した証跡>

Verification:
<実行する既存validatorまたは検査>

Completion criteria:
<完了条件と、入力・権限・許可範囲が不明な場合に親へ戻す条件>
```

# クール成果物manifest schema

各新規クールの作業ディレクトリ直下に`cool<N>_manifest.json`を置く。`design/story_design.md`・`design/prompt_notes.md`を設計の正本とし、manifestはローカル成果物・再現情報・品質ゲート証跡のsidecarとする。

## 最終完成時の必須構造

以下は`--through app`時点の完成形である。ステップ6では未生成artifactのキーを省略し、未実施gateを`{"status": "pending"}`で作成する。`--through render`ではクール動画まで、`--through motion`ではMotion/連続性証跡まで、`--through app`では`story_video`を含む全項目が実在必須になる。

```json
{
  "schema_version": 1,
  "design_doc_path": "/absolute/path/pomodoro_assets/<theme>_<story>/design/story_design.md",
  "prompt_notes_path": "/absolute/path/pomodoro_assets/<theme>_<story>/design/prompt_notes.md",
  "cool_number": 1,
  "artifacts": {
    "blend": "/absolute/path/story_cool1.blend",
    "world_reference": "/absolute/path/ref/world_reference.png",
    "cool_reference": "/absolute/path/ref/cool1_reference.png",
    "reference_pack": ["/absolute/path/ref/cool1_front.png"],
    "animatic": "/absolute/path/output/cool1_animatic.mp4",
    "final_still": "/absolute/path/output/cool1_final.png",
    "video": "/absolute/path/output/cool1.mp4",
    "story_video": "/absolute/path/output/story_complete.mp4"
  },
  "reproduction": {
    "blender_version": "4.3.0",
    "render_engine": "BLENDER_EEVEE_NEXT",
    "color_management": "AgX Medium High Contrast",
    "seed": 42,
    "polyhaven_assets": [
      {"id": "asset-id", "resolution": "2k", "retrieved_on": "YYYY-MM-DD"}
    ]
  },
  "gates": {
    "story_beat": {"status": "pass", "reviewer": "name", "evidence": "/absolute/path/evidence/story_beat.md"},
    "animatic": {"status": "pass", "reviewer": "name", "evidence": "/absolute/path/evidence/animatic.md", "review_package": {"path": "/absolute/path/review/story_design_review.md", "primary_assets": ["/absolute/path/output/cool1_animatic.mp4"], "presentation": "codex_inline_ui"}},
    "technical_spike": {"status": "waived", "reviewer": "name", "evidence": "/absolute/path/evidence/spike.md", "reason": "known structure", "impact": "none", "approved_by": "owner"},
    "visual_acceptance": {"status": "pass", "reviewer": "independent-agent", "evidence": "/absolute/path/evidence/visual.md"},
    "common_sense_review": {"status": "pass", "reviewer": "independent-agent", "evidence": "/absolute/path/evidence/common_sense.md"},
    "signature_realization": {"status": "pass", "reviewer": "independent-agent", "evidence": "/absolute/path/evidence/cool1_signature_realization.md"},
    "still_human_review": {"status": "pass", "reviewer": "name", "evidence": "/absolute/path/evidence/still.md", "review_package": {"path": "/absolute/path/review/cool1_still_review.md", "primary_assets": ["/absolute/path/output/cool1_final.png"], "presentation": "claude_artifact"}},
    "motion_qa": {"status": "pass", "reviewer": "name", "evidence": "/absolute/path/evidence/motion.md"},
    "story_final_review": {"status": "pass", "reviewer": "name", "evidence": "/absolute/path/evidence/story_final.md", "review_package": {"path": "/absolute/path/review/story_final_review.md", "primary_assets": ["/absolute/path/output/story_complete.mp4"], "presentation": "standalone_file"}},
    "app_integration_qa": {"status": "pass", "reviewer": "name", "evidence": "/absolute/path/evidence/app.md"}
  }
}
```

## Step 8 reviewの任意sidecar

Step 8の親baselineと再実行台帳はmanifestの品質gateそのものとは分離し、必要な場合だけ次の任意フィールドへ記録する。
新規作成時の標準名は`step8_review_ledger`で、`step8_review`は既存運用との互換aliasとして同じ形式を受け付ける。
指定した値はすべて絶対パスで、対象ファイルが存在する通常ファイルでなければならない。旧manifestにこのフィールドが
無くても後方互換で検証に通る。

```json
{
  "step8_review_ledger": {
    "baseline": "/absolute/path/evidence/cool1_step8_baseline.json",
    "ledger": "/absolute/path/evidence/cool1_step8_review_ledger.json",
    "report": "/absolute/path/evidence/cool1_step8_8a_latest.json"
  }
}
```

単一の絶対パス文字列も指定できる。`baseline`は親が8A開始前に確認した基準画像・現行レンダー・視覚アンカー・
許容差を含むJSON、`ledger`はReviewLedger v1、`report`/`report_path`は直近のReviewReport v1を指す。
このsidecarの存在は既存gateの`pass`/`waived`判定を変更しない。8A/8B/8CのJSON契約と再実行制御は
`references/step8-review-control.md`、機械検証は`scripts/validate_step8_review.py`を参照する。

## 人間レビュー用`review_package`

`animatic`、`still_human_review`、`story_final_review`が`pass`の場合、各gateは次の`review_package`を必須とする。

```json
{
  "path": "/absolute/path/review/cool1_still_review.md",
  "primary_assets": ["/absolute/path/output/cool1_final.png"],
  "presentation": "codex_inline_ui"
}
```

- `path`: 成果物本体、絶対パス、確認観点、承認/修正記録欄を含む独立Markdownレビュー・パケットの絶対パス。実在する通常ファイルでなければならない。
- `primary_assets`: レビュー時にUIで提示する静止画または動画の絶対パスを1件以上。すべて実在する通常ファイルでなければならない。
- `presentation`: `codex_inline_ui`（Codexの会話内インライン表示）、`claude_artifact`（Claude CodeのArtifact）、`standalone_file`（UIが使えない場合の独立ファイル）のいずれか。
- `status: pending`の将来gateに`review_package`は不要。`evidence`はレビュー後の判定証跡であり、レビュー依頼用の`review_package`とは別に記録する。

## 記入規則

- `design_doc_path`は設計書ファイル`design/story_design.md`(設計内容の正本)、`prompt_notes_path`は本番制作差分メモ`design/prompt_notes.md`(本番制作差分)への絶対パスを指す。フィールド名は移行前(Notion運用時代)の`story_page_url`/`prompt_page_url`から改名したもので、バリデータは後方互換のため旧フィールド名も一時的に許容するが、新規作成時は必ず新フィールド名を使う。既存の完成済みストーリー(`windmill-hill`等)は遡及修正しない。
- パスはすべて絶対パスとし、対象ファイルが存在していなければならない。
- 空欄、`TBD`、`後で決める`、`未定`は禁止する。
- gateの`status`は`pending`、`pass`、`waived`のいずれか。未実施の将来gateだけ`pending`を使い、完了済みgateを`pending`へ戻さない。
- `waived`を許可するのは`technical_spike`、`visual_acceptance`、`motion_qa`のみで、`reason`、`impact`、`approved_by`が必須。Story Beat、animatic、8B常識レビュー(`common_sense_review`)、8C仕様実現レビュー(`signature_realization`)、静止画人間レビュー、ストーリー最終レビュー、App Integration QAは必ず`pass`にする(waiver不可)。
- クール間連続性の検査は`motion_qa`ゲートに統合済み(独立した`continuity_review`ゲートは廃止)。連続性証跡は`motion_qa`の`evidence`に含める。
- `reference_pack`は最低1枚を指定する。
- PolyHavenを使わない場合のみ`polyhaven_assets`を空配列にできる。
- クール動画名には`cool<N>`を含める。本編通し動画は`story_video`へ同じ絶対パスを全クールmanifestから記録する。
- 動画仕様は1080×1920、30fps CFR、H.264/yuv420p、MP4、音声なし、7〜12秒、3〜5MBとする。

## 検証コマンド

```bash
python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_story_package.py /absolute/path/cool1_manifest.json --through render
python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_story_package.py /absolute/path/cool1_manifest.json --through motion
python3 /Users/sawairikeisuke/.agents/skills/isometric-story-workflow/scripts/validate_story_package.py /absolute/path/cool1_manifest.json --through app
```

`render`は静止画人間承認まで、`motion`はMotion QAとクール間連続性まで、`app`は通し動画・最終レビュー・App Integration QAまでを要求する。将来段階のgateは`pending`でよい。validatorはffprobeの全frame timestampによるCFR確認とffmpeg全frame decodeを行い、人間向け要約に続いてJSONを出力する。合格時`0`、不合格時`1`。JSONだけが必要な場合は`--json-only`を付ける。

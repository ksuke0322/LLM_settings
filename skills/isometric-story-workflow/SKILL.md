---
name: isometric-story-workflow
description: アイソメトリックポモドーロアプリ用に新しいテーマ・ストーリー・クールを設計・制作する際に必ず参照する。Story Beat、animatic、参考収集、設計表、Blender制作、静止画・Motion QA、アプリ統合確認、成果物manifestまでの品質ゲートを扱う。「新しいテーマを作って」「ストーリーを設計して」「クール1/クール2を作って」のようなタスクで必ず読む。Blenderでの具体的な実装ルールは blender-isometric-rules スキルを併用する。
---

# テーマ制作ワークフロー

## 位置づけ

- 本スキルは工程の入口と適用範囲を示す。ストーリー設計は `references/design-workflow.md`、クール制作は `references/production-workflow.md`、レビュー・公開は `references/review-publication.md` を読む。
- 「Blenderでどう正しく作るか」は `blender-isometric-rules` スキルを参照する。ステップ6以降は必ず併用する。
- 用語の階層はテーマ > ストーリー > クール > 映像。クール1はゼロから完成させ、同じストーリー内の次クールは前クールの完成形を引き継いで発展させる。
- 物語・animatic・Acceptance Matrix・Motion QA・App Integration QAの詳細は `references/quality-gates.md` を参照する。クール成果物manifestは `references/manifest-schema.md` に従い、`scripts/validate_story_package.py`で検証する。
- `story_contract.json`の構造と更新規則は `references/story-contract-schema.md` を正本とする。Step 8の独立レビュー返却、親baseline、再実行台帳は `references/step8-review-control.md` と `scripts/validate_step8_review.py` を正本とする。
- 画像・動画をユーザーに提示するときは絶対パスを記し、表示できる場合は会話内に表示する。

## 工程の案内

| 工程 | 対象 | 手順 |
|---|---|---|
| 設計 | ステップ1〜5、ワークシート、ステップ4前の曖昧さ確認 | `references/design-workflow.md` |
| 制作 | ステップ6〜7.5 | `references/production-workflow.md` |
| レビュー・公開 | ステップ8〜12、レビュー成果物の提示 | `references/review-publication.md` |

ステップ1〜5はストーリーごとに一度行い、ステップ6〜12はクール単位のループとして進める。詳しい順序、停止点、品質条件は各工程ガイドと正本を参照する。

## 反復実行の制御

Step 7d/7e/7.5、Step 8の画像一次確認、Step 9.5の動画検証、Step 10 Motion QAは `references/repetition-control.md` と各ledgerを使う。同一入力・同一validator条件の `pass` だけを再利用し、入力revisionが変わったら再実行する。

同一finding fingerprintが連続2回出た場合は3回目を自動起動せず `needs_parent_decision` で停止する。キャッシュ、timeout、JSON不正、画像・動画未読は品質gateのpassに変換しない。Step 10の修正後はblendまたは動画のrevisionを更新してから再検査する。Step 9.5はmanifest構造を毎回確認し、動画のffprobe/full decodeだけをledgerから再利用できる。

## 委任と権限の上位規約

委任経路、モデル、effort、権限、resume、再委任の条件は `~/.agents/AGENTS.md`、`~/.agents/references/delegate-flow.md`、`~/.agents/references/delegate-policy.md` を正本とする。このスキルと工程別の依頼テンプレートはそれらを独自に上書きしない。経路・モデル・effort・権限が利用不能または `unknown` なら親が担当し、別経路へ切り替えない。制作内の作業境界は `references/codex-delegation.md` に従う。

## ローカルファイルとの役割分担

- 本スキルは「手続き的な手順・記入ルール」を扱う。実際に各ストーリーで埋めた表・生成された設計書・本番制作差分メモの実体は、`pomodoro_assets/<theme>_<story>/design/`配下のローカルファイル(`story_design.md`・`prompt_notes.md`)が正本である。ストーリー案は`docs/story-ideas/`配下のローカルファイルが正本である。Notionの旧「ストーリー案の置き場」DB・「設計書」DB・「Blender用プロンプト」DBはいずれも以後更新しない参照アーカイブとする。
- 本移行はフォワードオンリーとする。既に完成しNotion URLがmanifest等に残っている既存ストーリー(例: `windmill-hill`)は遡及修正しない。新規に着手するストーリーから`design/story_design.md`・`design/prompt_notes.md`をローカル正本として使う。
- ステップ6以降のBlender実装ルールは`blender-isometric-rules`スキルを必ず併用する。

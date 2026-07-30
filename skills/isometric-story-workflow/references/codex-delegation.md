# Claude Code → Codex 委任規約

## 適用範囲

この規約は、`isometric-story-workflow`でClaude Code親がCodex委任を選ぶ場合の標準である。Codexは読み取り専用の検査だけを行い、Claude Code親が設計、Blender本制作、レンダー、人間レビュー、waiver、統合、正本更新を行う。8A・8B・8Cは既存どおり`subagent_type: isometric-story-review`（Opus / medium）のClaude専用独立レビューであり、Codexへ置き換えない。

## モデルとeffort

- 既定: `5.6-luna` / `medium`。
- 複数の設計書、契約、manifest、QA証跡をまたぐ原因追跡だけ: `5.6-terra` / `medium`。
- Terraでも原因を特定できない技術的根因だけ: `5.6-sol` / `medium`。
- 設計変更、世界観の採否、例外・waiver、人間レビュー判断が必要なら、モデルを上げずClaude Code親へ`needs_parent_decision`として返す。
- 実際のCodex MCPパラメータ名と利用可否は現行MCP定義に従う。

## 共通依頼文

次のテンプレートへ「ステップ別依頼文」を差し込み、`Allowed paths`を対象の絶対パスだけに置換して依頼する。

```text
本タスクはClaude Code親が承認済みです。y/n確認を求めず、読み取り専用で実行してください。

Objective:
<ステップ別依頼文>

Allowed paths:
<対象ファイルまたは対象ディレクトリの絶対パスのみ>

Prohibited operations:
- ファイル変更、Blender操作、レンダー、外部サービス・ネットワーク操作
- ユーザー意図の補完、設計判断、waiver判断、人間レビューの代行
- git操作、正本ファイル・manifest・stateの更新、指定外パスの読み取り

Expected result:
- 判定: pass / fail / needs_parent_decision
- 根拠: 不一致、不足、validator失敗項目だけ
- 確認したファイルの絶対パス
- 親が適用できる最小限の修正案（必要な場合だけ）
生データ全文や不要な再要約は返さないこと。

Verification:
<ステップ別Verification>

Completion criteria:
必須確認を終え、設計判断を含めずに結果を返した時点で完了。範囲外、または上位指示・権限・安全制約と競合する場合は、操作せず理由を報告して終了すること。
```

## ステップ別の起動規約

| ステップ | 起動タイミング | ステップ別依頼文 | 標準Verification | 標準モデル |
|---|---|---|---|---|
| 1 | ストーリー案と`_theme.md`のRead後 | 入力資料から、設計開始を妨げる未記入項目・矛盾候補だけを抽出する。世界観や技術リスクを新規に判断しない。 | 必須入力ファイルの存在と記載項目を照合 | 5.6-luna / medium |
| 2〜3 | ワークシート草案後、3.25前 | 空欄/TBD、30fps換算、比率、初出クール、重複を検査する。内容の採否は決めない。 | ワークシートと曖昧さチェックリストを照合 | 5.6-luna / medium |
| 3.25 | `story_contract.json`生成後 | contractのschema、参照パス、mtime、validator失敗項目を検査する。契約の意味を変えない。 | `validate_story_contract.py --json-only` | 5.6-luna / medium |
| 3.5 | 世界観画像とReference Pack生成後 | 既存画像、Reference Pack、設計書内の絶対パス記載の不足を抽出する。画像の採否を判断しない。 | ファイル存在と設計書参照を照合 | 5.6-luna / medium |
| 4 | 人間レビュー依頼の直前 | animatic/spike review packageの主要成果物、確認観点、承認欄、必要gateの不足を抽出する。 | review packageの必須項目と現行gateを照合 | 5.6-luna / medium |
| 5 | `prompt_notes.md`草案後 | 差分メモが設計書を重複せず、テンプレート、相互参照、絶対パスを満たすか検査する。 | prompt-db-templateと設計書参照を照合 | 5.6-luna / medium |
| 6 | クール準備後、Blender制作前 | 設計書/prompt notesとcontractのmtime、manifest骨格、既存成果物パスの不整合を抽出する。 | contract validatorとmanifest schemaを照合 | 5.6-luna / medium |
| 7d/7.5 | Claude Codeが定量QAを完了した後、8前 | 既存QAレポートからFAIL/WARN、gate状態、証跡パスの不整合を抽出する。Blender実測や修正は行わない。 | quantitative QA reportとmanifestを照合 | 5.6-luna / medium |
| 8の前処理 | 8A〜8Cの入力準備後 | 独立レビューに必要な静止画、close-up、資料、evidenceの不足だけを抽出する。レビュー判定はしない。 | 8A/8B/8Cの入力要件を照合 | 5.6-luna / medium |
| 9 | 人間レビュー依頼の直前 | review package、主要静止画、animatic証跡、絶対パスの不足を抽出する。 | `validate_review_evidence.py` | 5.6-luna / medium |
| 9.5 | Claude Codeが動画検証を完了した後 | 動画、manifest、render段階validator結果の仕様・パス・gate状態を照合する。 | `validate_story_package.py --through render` の既存出力を照合 | 5.6-luna / medium |
| 10 | Claude CodeがMotion QAを完了した後 | Motion QA・連続性・動画仕様の証跡不足を抽出する。waiverの採否は決めない。 | `validate_story_package.py --through motion` の既存出力を照合 | 5.6-luna / medium |
| 12 | 最終人間レビューとApp Integration QAの直前 | `themes.json`、動画、全manifest、統合証跡の対応漏れを抽出する。完成・status更新の判断はしない。 | `validate_theme_integration.py --json-only` と全manifestを照合 | 5.6-luna / medium |

同一タスクで複数成果物をまたぐFAILの因果を追う必要がある場合だけTerraへ上げる。Terraの結果でも技術根因を絞れない場合だけSolへ上げ、設計判断が必要になった時点で親へ返す。

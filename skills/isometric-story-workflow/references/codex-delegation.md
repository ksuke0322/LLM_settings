# Claude Code → Codex 委任規約

この規約は、`isometric-story-workflow`でClaude Code親がCodex委任を選ぶ場合の正本である。Claude Code親は設計、Blender実装・修正、優先順位、waiver、人間レビュー、統合判断、正本採用を担当する。Codexは、Lunaによる検査・既存スクリプトでの読取証跡取得・レンダー実行、またはTerraによる技術的な原因追跡だけを行う。**8A・8B・8Cの判定**は既存どおり`subagent_type: isometric-story-review`（Opus / medium）のClaude専用独立レビューであり、Codexへ置き換えない。

## モデルとeffort

- 既定: `gpt-5.6-luna` / `max`。検査、証跡整合、既存validator・既存定量QAスクリプトの実行、animatic・spike・静止画・動画のレンダー実行に使う。
- `gpt-5.6-terra` / `medium`: 複数validator・複数クール・複数成果物をまたぐ、再現可能な技術原因追跡だけに使う。
- `gpt-5.6-sol`はCodex委任に使用しない。設計変更、世界観・視覚品質・素材の採否、例外・waiver、人間レビュー、修正方針が必要なら、モデルを上げずClaude Code親へ`needs_parent_decision`として返す。
- CodexはBlender用スクリプト、実測スクリプト、レンダー設定を新規作成・修正しない。既存ファイルを指定どおり実行するだけに限定する。
- 実際のCodex MCPパラメータ名と利用可否は現行MCP定義に従う。

## 共通依頼文

### 読み取り検査用

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
- git操作、正本ファイル・候補`.blend`・manifest・stateの更新、指定外パスの読み取り

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

### Blender読取証跡取得用

既存のscene / timeline抽出・定量QA・asset auditスクリプトを実行する場合だけ使う。親が実装した候補`.blend`は読み取り専用であり、Codexはスクリプト・候補`.blend`・レンダー設定を変更しない。

```text
本タスクはClaude Code親が承認済みです。y/n確認を求めず、指定済みの既存スクリプトによる読取証跡取得だけを実行してください。

Objective:
<実行する既存スクリプト、対象cool、必要なsnapshot・validator出力を明記>

source_blend:
<親が実装済みの候補`.blend`の絶対パス。読み取り専用>

Existing commands or scripts:
<既存スクリプトまたは固定済みコマンドの絶対パス・引数。新規作成・修正禁止>

Allowed paths:
- <source_blend: 読み取り専用>
- <既存script・contract・validator入力: 読み取り専用>
- <指定済みevidenceディレクトリ: snapshot・既存validator出力だけを書込み可>

Prohibited operations:
- source_blend、正本`.blend`、script、manifest、state、設計書、review package、判定証跡の変更
- Blenderシーン、カメラ、素材、アニメーション、レンダー設定の変更・保存
- 新規スクリプト・実測スクリプト・レンダー設定の作成または修正
- 指定外のファイル・ディレクトリへの変更、外部サービス・ネットワーク操作、git操作、削除、依存関係追加
- 設計判断、validator結果の解釈、waiver・人間レビュー・修正方針の判断

Expected result:
- 判定: pass / fail / needs_parent_decision
- 実行した既存コマンド、終了コード、所要時間
- 出力したsnapshot・validator結果の絶対パス
- 未実行または停止した理由（ある場合だけ）

Verification:
<必要な既存validator・snapshot・asset auditを明記>

Completion criteria:
Allowed pathsを守り、指定された既存スクリプトの実行と証跡出力を完了して結果を返した時点で完了。候補`.blend`やスクリプトの変更、設計判断、範囲外の変更が必要なら、何も変更せず`needs_parent_decision`で終了すること。
```

### レンダー実行用

対象工程は4のanimatic・完成済みspikeレンダー、8の完成state静止画・close-up、9.5の動画レンダーだけである。親が実装済みの候補`.blend`を読み取り専用で使い、Codexはレンダー出力だけを行う。

```text
本タスクはClaude Code親が承認済みです。y/n確認を求めず、指定済み候補`.blend`のレンダー実行だけを実行してください。

Objective:
<対象phase、対象stateまたは完成済みspike、frame範囲、出力仕様を明記>

source_blend:
<親が実装済みのwork/cool<N>_candidate.blendの絶対パス。読み取り専用>

Target phase:
<4_animatic | 4_spike_render | 8_render | 9.5_video>

Render spec:
<出力先絶対パス、frame範囲、解像度、fps、codec、実行方式(MCP同期またはblender -b -aのバックグラウンド起動)>

Allowed paths:
- <source_blend: 読み取り専用>
- <指定済みoutputディレクトリ: animatic・静止画・動画だけを書込み可>
- <指定済みevidenceディレクトリ: レンダー実行記録だけを書込み可。必要な場合だけ>

Prohibited operations:
- source_blend、正本`.blend`、manifest、state、設計書、review package、判定証跡の変更
- Blenderシーン、カメラ、構図、素材、アニメーション、レンダー設定の変更・保存
- 修正実装、素材の検索・取得・選定・代替、外部サービス・ネットワーク操作
- 指定外のレンダー実行または出力仕様の独自変更
- 8A/8B/8Cの判定・再判定、指摘の採否や解釈の代行
- git操作、削除、依存関係追加、waiver・人間レビュー・修正方針の判断

Expected result:
- 判定: pass / fail / needs_parent_decision
- 実行コマンド、終了コード、所要時間、出力frame数
- 出力した静止画・動画・レンダー実行記録の絶対パス
- 未実行または停止した理由（ある場合だけ）

Verification:
<指定静止画・動画・出力仕様を明記>

Completion criteria:
Allowed pathsと固定済みRender specを守り、指定されたレンダー出力を完了して結果を返した時点で完了。候補`.blend`またはレンダー設定の変更、設計判断、範囲外の変更が必要なら、何も変更せず`needs_parent_decision`で終了すること。
```

## 親の候補採用手順

1. 親が正本から`work/cool<N>_candidate.blend`を作成し、7a→7b→7cおよび8A/8B/8C指摘の修正を候補へ直接実装する。
2. Codexへの依頼は、検査、既存スクリプトによる読取証跡取得、またはレンダーのいずれか1件に限定する。Codexに候補`.blend`の変更を許可しない。
3. 親がCodex委任の前後で正本・候補`.blend`、`design/`、`ref/`、`review/`、`story_contract.json`、`cool<N>_manifest.json`のmtimeと、`output/`・`evidence/`だけが変更されたことを確認する。
4. 7a→7b→7c→7d/7.5→8A〜8Cを通過した後だけ、親が候補を正本として採用する。8A/8B/8Cの判定は必ずClaude側の独立レビューで行い、修正実装も親が行う。

## ステップ別の起動規約

| ステップ | 種別 | 起動タイミングとCodexの担当 | 親が固定または判断する事項 | 標準Verification | 標準モデル |
|---|---|---|---|---|---|
| 1 | 検査 | ストーリー案と`_theme.md`のRead後。未記入項目・矛盾候補を抽出する。 | 参考の採否、世界観、技術リスク | 必須入力ファイルの存在と記載項目 | gpt-5.6-luna / max |
| 2〜3 | 検査 | ワークシート草案後。空欄/TBD、30fps換算、比率、初出クール、重複を検査する。 | Story Beat、構図、寸法、カメラ、演出 | ワークシートと曖昧さチェックリスト | gpt-5.6-luna / max |
| 3.25 | 検査 | contract生成後。schema、参照パス、mtime、validator失敗項目を検査する。 | 契約の意味と失敗の解決 | `validate_story_contract.py --json-only` | gpt-5.6-luna / max |
| 3.5 | 検査 | 世界観画像とReference Pack生成後。画像・設計書内の絶対パス不足を抽出する。 | 画像品質、世界観への適合、Pack要否 | ファイル存在と設計書参照 | gpt-5.6-luna / max |
| 4 | レンダー | 親が実装済みのanimaticまたはspikeを、固定済みstate順序・尺・frame・カメラでレンダーする。 | 物語・時間設計、spike実装、技術リスクの選定、waiver、人間レビュー | 指定`output/`のanimatic・spike成果物の絶対パス | gpt-5.6-luna / max |
| 4 | 検査 | 人間レビュー直前。animatic/spike packageの成果物・gate不足を抽出する。 | パケット内容、提示方式、承認の解釈 | review package必須項目とgate | gpt-5.6-luna / max |
| 5 | 検査 | `prompt_notes.md`草案後。テンプレート、相互参照、絶対パスを検査する。 | 本番制作差分 | prompt-db-templateと設計書参照 | gpt-5.6-luna / max |
| 6 | 検査 | クール準備後。mtime、manifest骨格、既存成果物パスの不整合を抽出する。 | クール構成、素材採否、正本更新 | contract validatorとmanifest schema | gpt-5.6-luna / max |
| 7a〜7c | 読取証跡取得 | 親の各実装後。既存scene / timeline抽出・定量QAを実行し、evidenceへ出力する。 | ブロックアウト精緻化、kindごとの作り込み、テクスチャリング、修正方針 | 指定snapshotと既存validator出力 | gpt-5.6-luna / max |
| 7d/7.5 | 検査 | 定量QA後。FAIL/WARN、gate、証跡パスを整理する。 | 修正方針、WARN/waiverの採否 | quantitative QA reportとmanifest | gpt-5.6-luna / max |
| 8の前処理 | レンダー | 親が撮影対象kindと構図を固定した後。完成state静止画、密集エリアclose-up、kind単位close-upをレンダーする。 | 撮影対象kind、構図、レンダー要否 | 指定`output/`の静止画一式の絶対パス | gpt-5.6-luna / max |
| 8の前処理 | 検査 | 8A〜8Cの入力準備後。静止画、close-up、資料、evidence不足を抽出する。 | 8A〜8Cの独立レビュー起動と判定 | 入力要件 | gpt-5.6-luna / max |
| 8の修正 | 親実装後の読取証跡・レンダー | 親が候補`.blend`を修正した後。既存定量QAを実行し、必要な静止画を再レンダーする。 | 指摘の解釈・採否、設計側の見直し、候補修正、収束判断 | 修正後の静止画とscene snapshot | gpt-5.6-luna / max |
| 9 | 検査 | 人間レビュー直前。review package、主要静止画、animatic証跡、絶対パスを検査する。 | 人間レビューと指摘の解釈 | `validate_review_evidence.py` | gpt-5.6-luna / max |
| 9.5 | レンダー | ステップ9承認後。`blender -b <file.blend> -a`をバックグラウンド起動し、指定`output/`へ動画を出力する。 | レンダー指示、出力品質の判断、ユーザー提示 | 実行コマンド、終了コード、出力動画の絶対パスとframe数 | gpt-5.6-luna / max |
| 9.5 | 検査 | 親が動画検証を完了後。動画、manifest、render validator結果を照合する。 | 完了判定、manifest更新、validator結果の解釈 | `validate_story_package.py --through render`の既存出力 | gpt-5.6-luna / max |
| 10 | 検査 | 親がMotion QAを完了後。証跡・gate・動画仕様の不足を抽出する。 | 動き、演出、連続性、修正判断 | `validate_story_package.py --through motion`の既存出力 | gpt-5.6-luna / max |
| 12 | 検査 | 最終人間レビューとApp Integration QAの直前。動画、全manifest、統合証跡の対応漏れを抽出する。 | App Integration QA、完成・status更新、正本採用 | `validate_theme_integration.py --json-only`と全manifest | gpt-5.6-luna / max |

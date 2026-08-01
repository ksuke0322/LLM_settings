# Claude Code → Codex 委任規約

この規約は、`isometric-story-workflow`でClaude Code親がCodex委任を選ぶ場合の正本である。Claude Code親は設計、優先順位、waiver、人間レビュー、統合判断、正本採用を担当する。Codexは、Lunaによる検査・限定候補実装・レンダー実行、またはTerraによる技術的な原因追跡だけを行う。**8A・8B・8Cの判定**は既存どおり`subagent_type: isometric-story-review`（Opus / medium）のClaude専用独立レビューであり、Codexへ置き換えない。Codexが担うのはその前後のレンダーと、親が確定した指摘の修正実装だけである。

## モデルとeffort

- 既定: `gpt-5.6-luna` / `max`。検査、証跡整合、validator結果の整理、親が設計を固定した候補`.blend`の限定実装、animatic・spike・静止画・動画のレンダー実行に使う。
- `gpt-5.6-terra` / `medium`: 複数validator・複数クール・複数成果物をまたぐ、再現可能な技術原因追跡だけに使う。
- `gpt-5.6-sol`はCodex委任に使用しない。設計変更、世界観・視覚品質・素材の採否、例外・waiver、人間レビュー、修正方針が必要なら、モデルを上げずClaude Code親へ`needs_parent_decision`として返す。
- 実際のCodex MCPパラメータ名と利用可否は現行MCP定義に従う。

## 共通依頼文

### 読み取り用

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

### 候補`.blend`実装・レンダー実行用

親は正本`.blend`を変更せずに`candidate_blend`を作成し、次のテンプレートの全項目を埋めてから、1工程・1対象`kind`ずつ依頼する。対象工程は 4(animatic / spike)、7a、7b、7c、8(レンダー / 指摘修正)、9.5(動画レンダー)。レンダーだけを依頼する場合も`candidate_blend`を使い、正本は読み取り専用のまま保つ。

```text
本タスクはClaude Code親が承認済みです。y/n確認を求めず、指定済み候補`.blend`の実装またはレンダー実行だけを実行してください。

Objective:
<実装内容またはレンダー内容。対象kind、署名パーツ、ティア、数値制約、frame範囲、出力仕様を明記>

source_blend:
<親が不変確認する正本`.blend`の絶対パス。読み取り専用>

candidate_blend:
<pomodoro_assets/<theme>_<story>/work/cool<N>_candidate.blendの絶対パス。変更可>

Target phase and kind:
- phase: <4_animatic | 4_spike | 7a | 7b | 7c | 8_render | 8_fix | 9.5_video>
- kind: <7a/7c/8_renderでは対象範囲、7b/8_fixでは単一kind、4/9.5では対象state範囲>

Render spec:
<4 / 8_render / 9.5 のみ。出力先絶対パス、frame範囲、解像度、fps、codec、実行方式(MCP同期 or `blender -b -a`のバックグラウンド起動)。他フェーズではnone>

Fix instructions:
<8_fix のみ。親が確定した修正指示だけを列挙する。独立レビューの原文をそのまま渡さない。他フェーズではnone>

Design locks:
<承認済みブロックアウト、寸法、カメラ、署名パーツ、ティア、配色、マテリアル、変更禁止箇所>

Pre-fetched local assets:
<7cで使う親が事前取得したローカル素材の絶対パス。不要ならnone>

Allowed paths:
- <source_blend: 読み取り専用>
- <candidate_blend: 読み書き>
- <指定済みevidenceディレクトリ: 静止画・定量snapshotの出力だけ>
- <指定済みoutputディレクトリ: animatic・静止画・動画の出力だけ。レンダー工程のみ>
- <実行に必要な既存validator・入力の絶対パス: 読み取り専用>

Prohibited operations:
- `bpy.ops.wm.read_homefile` / `bpy.ops.wm.open_mainfile`によるMCP経由のファイルロード(実装前に`bpy.data.filepath`がcandidate_blendと一致することを確認し、不一致ならneeds_parent_decisionで返す)
- 正本`.blend`、manifest、state、設計書、review package、判定証跡の更新
- 指定外の`.blend`、ファイル、ディレクトリへの変更
- カメラ、構図、設計固定事項、変更禁止箇所の変更
- 素材の検索・取得・選定・代替、外部サービス・ネットワーク操作
- 指定外のレンダー実行、出力仕様の独自変更
- 8A/8B/8Cの判定・再判定、指摘の採否や解釈の代行
- git操作、削除、依存関係追加、waiver・人間レビュー・修正方針の判断

Expected result:
- 判定: pass / fail / needs_parent_decision
- 変更したcandidate_blendの絶対パス
- 出力した確認用静止画・動画・定量snapshot・validator結果の絶対パス
- レンダー工程では実行コマンド、終了コード、所要時間、出力frame数
- 実装した対象と、未実行または停止した理由（ある場合だけ）
不要な設計提案や生データ全文は返さないこと。

Verification:
<工程ごとに親が指定する静止画、動画、snapshot、validator。7a・7c・8_render・9.5は確認用成果物の絶対パス提示を必須にする>

Completion criteria:
設計固定事項とAllowed pathsを守り、指定された候補実装とVerificationを完了して結果を返した時点で完了。設計の欠落、素材不適合、validator結果の解釈、範囲外の変更が必要になった場合は候補をそれ以上変更せず、needs_parent_decisionで終了すること。
```

## 親の候補採用手順

1. 親が設計を固定し、正本から`work/cool<N>_candidate.blend`を作成する。
2. 親が工程別実装パケットを固定し、Lunaへ1工程・1対象`kind`ずつ委任する。レンダー工程(4 / 8_render / 9.5)も同じパケット形式で1件ずつ依頼する。
3. 親が正本`.blend`の不変性、候補の変更範囲、指定済み静止画・動画、定量QAを確認する。
4. 7a→7b→7c→7d/7.5→8A〜8Cを通過した後だけ、親が候補を正本として採用する。8A/8B/8Cの判定は必ずClaude側の独立レビューで行い、その指摘を親が解釈・確定してから`8_fix`として委任する。

## ステップ別の起動規約

| ステップ | 種別 | 起動タイミングとCodexの担当 | 親が固定または判断する事項 | 標準Verification | 標準モデル |
|---|---|---|---|---|---|
| 1 | 検査 | ストーリー案と`_theme.md`のRead後。未記入項目・矛盾候補を抽出する。 | 参考の採否、世界観、技術リスク | 必須入力ファイルの存在と記載項目 | gpt-5.6-luna / max |
| 2〜3 | 検査 | ワークシート草案後。空欄/TBD、30fps換算、比率、初出クール、重複を検査する。 | Story Beat、構図、寸法、カメラ、演出 | ワークシートと曖昧さチェックリスト | gpt-5.6-luna / max |
| 3.25 | 検査 | contract生成後。schema、参照パス、mtime、validator失敗項目を検査する。 | 契約の意味と失敗の解決 | `validate_story_contract.py --json-only` | gpt-5.6-luna / max |
| 3.5 | 検査 | 世界観画像とReference Pack生成後。画像・設計書内の絶対パス不足を抽出する。 | 画像品質、世界観への適合、Pack要否 | ファイル存在と設計書参照 | gpt-5.6-luna / max |
| 4 | レンダー実装 | 親がstate順序・尺・frame・カメラを固定した後。グレーanimaticをレンダーし、指定された検証項目だけのspikeを作る。 | 物語・時間設計、技術リスクの選定、waiver、人間レビュー | 指定`output/`のanimatic・spike成果物の絶対パス | gpt-5.6-luna / max |
| 4 | 検査 | 人間レビュー直前。animatic/spike packageの成果物・gate不足を抽出する。 | パケット内容、提示方式、承認の解釈 | review package必須項目とgate | gpt-5.6-luna / max |
| 5 | 検査 | `prompt_notes.md`草案後。テンプレート、相互参照、絶対パスを検査する。 | 本番制作差分 | prompt-db-templateと設計書参照 | gpt-5.6-luna / max |
| 6 | 検査 | クール準備後。mtime、manifest骨格、既存成果物パスの不整合を抽出する。 | クール構成、素材採否、正本更新 | contract validatorとmanifest schema | gpt-5.6-luna / max |
| 7a | 候補実装 | 設計固定後。承認済みブロックアウトを精緻化し、確認用静止画・定量snapshotを出力する。 | 構図、主役の見せ方、カメラ、比率、変更許容範囲 | 指定静止画とscene/timeline snapshot | gpt-5.6-luna / max |
| 7b | 候補実装 | 設計固定後。単一kindの署名パーツ・ティア・寸法制約を実装する。 | パーツ、手法、存在理由、修正方針 | 指定snapshotと対象kindの検査 | gpt-5.6-luna / max |
| 7c | 候補実装 | 設計固定後。指定済みローカル素材と配色・マテリアル仕様を適用し、確認用静止画・定量snapshotを出力する。 | 質感方向、素材採否、代替手段 | 指定静止画とmaterial/scene snapshot | gpt-5.6-luna / max |
| 7d/7.5 | 検査 | 定量QA後。FAIL/WARN、gate、証跡パスを整理する。 | 修正方針、WARN/waiverの採否 | quantitative QA reportとmanifest | gpt-5.6-luna / max |
| 8の前処理 | レンダー実装 | 親が撮影対象kindと構図を固定した後。完成state静止画、密集エリアclose-up、kind単位close-upをレンダーする。 | 撮影対象kind、構図、レンダー要否 | 指定`output/`の静止画一式の絶対パス | gpt-5.6-luna / max |
| 8の前処理 | 検査 | 8A〜8Cの入力準備後。静止画、close-up、資料、evidence不足を抽出する。 | 8A〜8Cの独立レビュー起動と判定 | 入力要件 | gpt-5.6-luna / max |
| 8の修正 | 候補実装 | 親が8A/8B/8Cの指摘を解釈し修正指示を確定した後。候補`.blend`へ修正を実装し再レンダーする。 | 指摘の解釈・採否、設計側の見直し、収束判断 | 修正後の静止画とscene snapshot | gpt-5.6-luna / max |
| 9 | 検査 | 人間レビュー直前。review package、主要静止画、animatic証跡、絶対パスを検査する。 | 人間レビューと指摘の解釈 | `validate_review_evidence.py` | gpt-5.6-luna / max |
| 9.5 | レンダー実装 | ステップ9承認後。`blender -b <file.blend> -a`をバックグラウンド起動し、指定`output/`へ動画を出力する。 | レンダー指示、出力品質の判断、ユーザー提示 | 実行コマンド、終了コード、出力動画の絶対パスとframe数 | gpt-5.6-luna / max |
| 9.5 | 検査 | 親が動画検証を完了後。動画、manifest、render validator結果を照合する。 | 完了判定、manifest更新、validator結果の解釈 | `validate_story_package.py --through render`の既存出力 | gpt-5.6-luna / max |
| 10 | 検査 | 親がMotion QAを完了後。証跡・gate・動画仕様の不足を抽出する。 | 動き、演出、連続性、修正判断 | `validate_story_package.py --through motion`の既存出力 | gpt-5.6-luna / max |
| 12 | 検査 | 最終人間レビューとApp Integration QAの直前。動画、全manifest、統合証跡の対応漏れを抽出する。 | App Integration QA、完成・status更新、正本採用 | `validate_theme_integration.py --json-only`と全manifest | gpt-5.6-luna / max |

# Claude Code → Codex 委任規約

この規約は、`isometric-story-workflow`でClaude Code親がdelegate先を選ぶ場合の正本である。Claude Code親は設計、Blender実装・修正、優先順位、waiver、人間レビュー、統合判断、正本採用を担当する。画像一次解析を含む限定された検査・既存スクリプトでの読取証跡取得・レンダー実行は、Codex MCPのLuna maxで行う。並列に独立実行できる読み取り調査はsubagentを候補にする。複数成果物をまたぐ原因追跡や設計判断は親が分解・統合する。**8A・8B・8Cの判定**は既存どおり`subagent_type: isometric-story-review`（Opus / medium）のClaude専用独立レビューであり、Codexへ置き換えない。

## モデルとeffort

- 実行時の標準経路はCodex MCPの完全一致ツール`mcp__codex__codex`で`gpt-5.6-luna` / `max`を起動する。検査、証跡整合、既存validator・既存定量QAスクリプトの実行、scene/timeline snapshot、animatic・spike・静止画・動画のレンダー実行に使う。

## ExecutionReport v1

Codex/Luna maxの実行結果は、親が機械的に検証できる次のJSONだけを返す。Markdownコードフェンス、過去経緯、前回指摘、長い実装説明は返さない。

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

`scripts/validate_execution_report.py`で絶対パス、存在、SHA-256、status/exit codeの整合を確認する。`needs_parent_decision`、出力不足、JSON不正、入力不一致は成功扱いにしない。
- このworkflowの画像一次解析は、Tier 1相当の短い分類・抽出であってもCodex MCPの`gpt-5.6-luna` / `max`を標準経路とする。画像・入力の読み取りと候補抽出に限定し、最終判定や設計判断を行わない。
- 並列に独立実行できる読み取り調査・探索・ログ確認はsubagentを候補にする。
- Tier 2以上、実装、コードレビュー、保存後の再検証を含むツール連鎖は`gpt-5.6-luna` / `max`または親を使う。複数validator・複数クール・複数成果物をまたぐ原因追跡は、親が分解して個別委任し、結果を統合する。
- Luna以外の追加モデルへは昇格しない。設計変更、世界観・視覚品質・素材の採否、例外・waiver、人間レビュー、修正方針が必要なら、親へ`needs_parent_decision`として返す。
- CodexはBlender用スクリプト、実測スクリプト、レンダー設定を新規作成・修正しない。既存ファイルを指定どおり実行するだけに限定する。
- `mcp__codex__codex`の可用性は、委任直前の動的ツール一覧で完全一致を確認する。継続対話が必要な場合だけ`mcp__codex__codex_reply`の完全一致を確認する。UI表示、設定ファイル、過去セッションの存在だけでは可用と判定しない。
- MCP可用性が`false`または`unknown`の場合はMinistralへフォールバックしない。親が担当するか、実行可否を確認済みのCodex CLI経路へ戻す。CLIへ戻す場合もモデル、read-only、許可出力先、既存スクリプト限定の境界を維持する。
- 実行後は親が既存どおりmtime、SHA-256、許可出力先、候補/正本`.blend`・manifest・state・設計書の不変性を確認する。Codexはこれらの正本やレビュー判定を変更しない。

### Codex MCP画像一次解析用

画像解析の前処理は、通常のCodex MCP delegateと同じ`mcp__codex__codex`経路で`gpt-5.6-luna` / `max`を使用する。これは8A/8B/8Cの独立レビューを置き換えない。Codexは、親が固定した画像を読み取り、短い`observations`・根拠・不確実点を返すだけである。

画像一次解析のv1設定は、profile名やproviderの暗黙解決を使わず、Codex MCPの明示設定を使う。

```json
{
  "model": "gpt-5.6-luna",
  "config": {
    "model_reasoning_effort": "max"
  },
  "sandbox": "read-only",
  "approval-policy": "never"
}
```

委任直前に動的ツール一覧で`mcp__codex__codex`の完全一致を確認する。継続対話が必要な場合だけ`mcp__codex__codex_reply`の完全一致を別途確認する。MCP可用性が`false`または`unknown`の場合はMinistralへフォールバックせず、親または可用性を確認済みのCodex CLI経路へ戻す。

#### 入力と実行

- 親が8A/8B/8Cのケース、画像順、絶対パス、SHA-256を固定してから起動する。
- 初回の一次解析では、重複削減前の必須画像を渡す。16kコンテキストに収まらない場合は画像を省略せず、固定したサブケースへ分割する。
- 8A/8B/8Cは、Codex MCPでは一次解析として走らせる。本番レビューは、一次解析結果と親が確認した削減後の必要画像を使い、既存の`isometric-story-review`独立レビューで実施する。
- Codexの結果を根拠に、親の確認なしで画像・manifest・review package・stateを変更しない。

#### 出力契約

応答は次の情報を含む構造化JSONへ正規化する。Markdownコードフェンスや説明文付きの応答は成功扱いにせず、ラッパー側で除去・検証できない場合は失敗として記録する。

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

`observations`は一次解析の候補であり、親が確認する。画像未読、JSON不正、タイムアウト、低確信度、根拠画像の一意性不明、または8Bの構造確認に必要な視点が失われる場合は、画像を削減せず元の入力セットを本番レビューへ渡す。`failure`がある応答は成功扱いにしない。

#### 8A/8B/8Cで保持する画像

- 8A: 各Coolの代表ref、制作レンダー、重要差分の根拠画像を保持し、重複するrefやclose-upだけを削減する。
- 8B: 制作レンダー、軸・ハブ・羽根・ステイ・接地を確認できるclose-up、構造確認に必要な実物写真を保持する。生成refは渡さない。
- 8C: 対象Coolの全景と、スコア対象の各署名パーツclose-upを保持し、同じ情報を示す重複画像だけを削減する。

Codex MCP画像一次解析は画像要約と候補抽出を担当するが、8A/8B/8Cの判定、指摘の採否、設計側の見直し、修正方針、waiver、収束判断は親または既存の独立レビューが担当する。Ministralはこのworkflowでは使用しない。

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

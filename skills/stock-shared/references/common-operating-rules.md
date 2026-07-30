# Stock Skill Common Operating Rules

stock 系 skill 共通の運用ルール。各 skill はこの文書を前提にし、lane 固有の差分だけを本文へ残す。

## Command Policy

- shell コマンドは原則 `rtk` 経由で実行する
- `rtk` を通すと目的を満たせない場合だけ例外にし、その理由を進捗共有または最終報告で明記する
- 小出力確認と書き込み系以外の read-heavy 操作は shell 直実行より `context-mode` を優先する

## Context-Mode Policy

- 単一 state file や JSON の検証は `ctx_execute_file` を使い、`as_of`、件数、欠落 field、stale 判定など必要項目だけ返す
- 複数 file の集計、複数 ticker の API fetch、候補圧縮、portfolio gate 判定は `ctx_execute` を使い、raw JSON や長表を会話へ流さない
- 外部 docs や長い補助資料は必要なら `ctx_fetch_and_index` → `ctx_search` で扱う
- Playwright/browser の長い返り値は file 保存後に `ctx_execute_file` で要約する
- 同じ file や同じ API response を会話中で再読・再掲しない

## State And Lane Discipline

- lane を混ぜない。`large_cap` `high_beta` `holdings review` `paper simulation` は別責務として扱う
- state の正本は各 skill が指定する file に従う。近い artifact や memory で代用しない
- stale や malformed を検出したら、その file と field を明記して停止する
- stale を見つけても勝手に fresh rerun や別 lane へ切り替えない
- `current_holdings.json` は watchlist と同じ当日性を原則要求しないが、必須 field 欠落や pending fill 疑いは停止する

## Automation Prompt Boundary

## Data Source Boundary

- Yahoo Finance は日足・分足の価格/出来高sourceとして使い、一次IR・決算時刻・breadthの正本にはしない
- breadthは公式市場統計、指数提供者の構造化ページ、対象universeの日足算出の順に使う。検索は公式sourceの発見に限定する
- 決算予定と一次IRは企業IR、TDnet等の公式Webを優先し、`source_kind` `source_url` `published_at` `fetched_at` `time_precision` `verification_status` を残す
- candidate単位で価格またはevent evidenceが欠ける場合は、そのcandidateの新規paper約定だけをfail-closeする

### Candidate Discovery And Attribution

- watch / reserve / entry 採否を検討する候補は、Yahoo!ファイナンス、株探、みんかぶをこの順で必ず探索する
- 各探索結果は `discovery_evidence` に `source_kind=yahoo_finance|kabutan|minkabu`、`source_url`、`title`、`fetched_at`、`discovery_status=official_document_found|reported_reason_only|no_relevant_lead|fetch_failed` を残す
- Yahoo!ファイナンス等で閲覧したTDnet PDF・企業決算短信・公式適時開示本文は一次資料として `official_verified` に使える。記事、AI解説、ニュース要約は一次資料ではない
- `catalyst_attribution.classification` は `officially_disclosed` `reported` `unexplained` のいずれかとし、資料事実の検証と値動き因果の推定を混同しない
- `adoption_basis=official_catalyst` で新規watch / reserve採用・昇格する場合だけ、採用根拠となる一次資料を `official_verified` にする。一次資料を確認できても値動きとの因果が不明なら `official_verified` と `unexplained` を併記してよい
- `reported` は材料点へ加算しない。`reported` しかない候補でも、`adoption_basis=technical_only`、`material_score=0`、`catalyst_attribution.classification=unexplained` とし、lane固有の完全な technical evidence があればテクニカル根拠だけで採否を評価できる
- technical evidence が欠ける場合は一次IR不足へ読み替えず、`technical_evidence_incomplete` として候補単位でfail-closeする
- legacy state は `discovery_policy_version` を持たない限り既存証跡を維持できるが、新規採用根拠には使わず、次回レビューで補完する

- automation prompt は run-specific wrapper として扱う
- prompt に残してよいのは、承認不要の指示、実行 mode、canonical input / output / sidecar path、補助 state / 補助 skill の参照、publish 実行、今回だけの override に限定する
- prompt で重複定義しないもの:
  - 閾値、探索順、件数目安
  - stale gate と malformed stop の詳細
  - 出力 field の意味
  - sidecar の必須列
  - trace / incomplete / allocator の恒久ルール
- これらの恒久ルールは shared / skill / reference を正本にする

## Producer Continuation Contract

- `continuation_review` では前回 state を先に再判定し、その後の補充探索は lane 固有 skill のルールに従う
- producer prompt は helper state や overlay skill を指定してよいが、score、priority、圧縮、採否基準は lane skill を正本にする
- `market-regime-assessment` は producer では overlay としてだけ使い、単独で除外判断をしない
- high_beta producer は継続監視価値を管理し、trade-v2 の当日 setup / oscillator / entry zone / RR を候補除外の hard gate にしない
- high_beta reserve の promote / demote / expire / remove は producer だけが確定し、consumer は reserve を decision state に混入させない

## Consumer / Sidecar Contract

- required sidecar path は prompt が指定してよい
- sidecar に何を残すか、stale / malformed / incomplete をどう表現するかは shared / skill / reference を正本にする
- state 更新を伴う lane で同日 sidecar が必須な場合、その incomplete 判定は skill 側の契約に従う
- prompt は sidecar の path だけを渡し、列定義や failure semantics は再記述しない

## Paper Simulation Contract

- paper lane は `current_holdings.json` と分離し、paper state だけを更新対象にする
- stale decision day では新規買いを止め、既存 paper 保有の hold / sell review 継続可否は lane skill の契約に従う
- stale guard や sell-only / hold-only の結果は sidecar へ残す
- 初期化時は canonical な空構造だけを作り、サンプル約定や例示データは作らない

## Write / Publish Policy

- `/Users/sawairikeisuke/Documents/stock-analysis` 配下の state / script / output を更新した場合は差分確認を行う
- commit / push するのは今回更新した file だけに限定する
- 差分がない場合は commit / push しない
- commit または push に失敗した場合はそこで停止して報告する
- `stock-analysis` への push 条件は `git-workflow-safety` の repo 例外に従う

## Output Policy

- 既定の chat 出力は `compact` とし、state 監査や保存用 artifact が必要なときだけ `full` を使う
- 長い表、全候補一覧、raw JSON、長文メモは state / sidecar / reference に残し、chat では件数と判断理由へ圧縮する

---
name: stock-investment-decision-support
description: "企業名だけを入力として、日本株の銘柄コードを特定し、固定の trend_viewer trade-v2 analysis API から短期向け recent 分析 JSON を取得して、短期の売買判断材料レポートを作る。手入力の企業名列挙だけでなく、large_cap と high_beta の watchlist state を読み込んで執行判断へ変換するときにも使用する。"
---

# Stock Investment Decision Support

企業名から銘柄コードを特定し、trend_viewer の trade-v2 analysis endpoint を使って短期（1ヶ月以内程度）の売買判断材料レポートを作る。

この skill は新規エントリー判断専用であり、保有後の管理は `stock-investment-position-review` へ分離する。`japan-top-companies-screening` と `japan-high-beta-breakout-screening` の出力を受けるときは、企業名の羅列へ潰さず、上流の thesis と execution 補助情報を残した state consumer として扱う。
通常の state consumer モードは、screening 側で既存保有銘柄が除外済みの未保有候補を前提にする。確定保有中の銘柄が入力に混ざった場合、新規エントリー判断としては扱わず、必要なら `stock-investment-position-review` へ振り分ける。

これは投資助言ではない。最終判断はユーザーが行う。断定的な売買指示は避け、根拠・反証条件・リスクを明示する。

## 固定設定

```text
API_BASE_URL=https://bfdkvlo2zi752fp5mhaq4koreq0ezvbd.lambda-url.ap-northeast-1.on.aws
ENDPOINT=/stock/{ticker}/analysis?range=recent&schema=trade-v2
投資スタイル=短期（1ヶ月以内程度）
```

## context-mode 運用

- 大きい I/O は原則 `context-mode` を使う。短い確認や書き込み系以外で、生の JSON や長い CLI 出力を会話へ流さない。
- watchlist / rules の検証は `ctx_execute_file` で行い、件数、欠落 field、stale 判定だけを出力する。
- trade-v2 API 取得は `ctx_execute` の `javascript` で `fetch(url)`、retry、JSON parse、必要項目抽出までをまとめて行う。
- 複数銘柄を処理するときも raw JSON 全量は返さず、`setup` `risk` `feature.metrics` の要約だけを返す。
- `ctx_execute` で取得不能な場合のみ Playwright/browser fetch に落とし、snapshot や長いレスポンスは必ず file 保存して `ctx_execute_file` で要約する。
- `curl` は診断専用 fallback とし、JSON 本取得の第一手段にしない。

## 入力

ユーザー入力は 2 系統を想定する。単一企業でも複数企業でもよい。

### 1. 手入力モード

企業名だけが渡される通常入力。

```text
任天堂
```

```text
任天堂、トヨタ、ソニー
```

保有中か未保有かは聞かない。必要なら出力側で「新規で入る場合」「すでに保有している場合の利確・撤退条件」を軽く分ける。

### 2. state consumer モード

watchlist state から次の情報を受け取る。

```text
ticker / company / bucket / decision_profile / thesis_type / selection_reason / event_risk
```

high_beta 系では、必要に応じて次も受け取る。

```text
catalyst / invalidation_hint / monitoring_valid_until
```

execution 補助情報があれば、次も受け取ってよい。

```text
regime_fit / execution_caution / liquidity_tier / slippage_risk / theme_cluster / event_freshness / crowding_risk / entry_style_hint
```

正本 state file は次を想定する。

- `/Users/sawairikeisuke/Documents/stock-analysis/large_cap_watchlist.json`
- `/Users/sawairikeisuke/Documents/stock-analysis/high_beta_watchlist.json`

state consumer モードでは、watchlist は未保有の新規監視候補だけを含む前提とする。保有中銘柄の追加投資可否や防衛判断は、この skill ではなく `stock-investment-position-review` で扱う。

## automation / state file 連携

- `auto2a` は `large_cap_watchlist.json` を読む large_cap 専用 consumer として運用する。
- `auto2b` は `high_beta_watchlist.json` を読む high_beta 専用 consumer として運用する。
- large_cap と high_beta を同じ run や同じ比較表に混ぜない。
- portfolio gate 用の補助設定は `/Users/sawairikeisuke/Documents/stock-analysis/portfolio_rules.json` を正本とする。
- `auto2b` では `current_holdings.json` を high_beta 新規エントリーの gate に使わない。real holdings と paper simulation を混ぜないため、`entry_ready -> watch` の格下げ根拠は watchlist / API / `portfolio_rules.json` に限定する。
- high_beta の保有数や theme overlap を実ポジション基準で抑制したい場合は、`auto2b` ではなく `auto-4` の paper lane で `paper_high_beta_positions.json` と allocator snapshot を使って扱う。
- `/Users/sawairikeisuke/Documents/stock-analysis` 配下の state / script / output を更新した場合は、作業後に差分確認を行い、今回更新したファイルだけを commit して push まで進める。
  - push 先はこの repo の `main` とし、許可条件は `git-workflow-safety` の `stock-analysis` 例外に従う。
  - 差分がない場合は commit / push しない。commit または push に失敗した場合はそこで停止して報告する。

## freshness gate

- `state consumer モード` では、参照する watchlist file に `as_of` が必須。automation run では lane ごとの freshness gate を適用する。
- `auto2a` で参照する `large_cap_watchlist.json` は `as_of` が当日を含む過去 7 日以内なら実行を許可し、それを超える場合だけ stale とみなして停止する。
- `auto2a` で参照する `large_cap_watchlist.json` は `ticker` `company` `bucket` `decision_profile` `thesis_type` `selection_reason` `event_risk` `priority` `status` が揃っていなければ malformed とみなして停止する。
- `auto2b` で参照する `high_beta_watchlist.json` は `as_of` が当日であることに加えて `catalyst` `invalidation_hint` `monitoring_valid_until` が必須で、1件でも `monitoring_valid_until < today` なら stale とみなして停止する。
- `portfolio_rules.json` を参照する場合は `max_new_entries_per_day_high_beta` `max_theme_overlap` `earnings_blackout_days` `max_positions_large_cap` `max_positions_high_beta` `max_risk_per_trade_pct` が揃っていなければ停止する。
- stale を検出した場合は、`stale_reason` を付けて続行するのではなく automation run 自体を停止する。`stale_reason` は fresh file を前提に個別銘柄の鮮度注意を書く用途に限る。

## execution decision contract

- top-level の状態は `watch` または `entry_ready` を維持する。
- ただし、二値だけで終わらせず `entry_quality` `entry_style` `execution_window` `position_risk_note` `stale_reason` を併記する。
- `entry_ready` は「今すぐ何も考えず買う」ではなく、「条件付きで執行検討に進める」の意味とする。
- `watch` は setup が弱い場合だけでなく、regime 不一致、slippage 懸念、theme 過密、材料鮮度劣化でも使う。

## entry quality tiers

- `A`: setup、RR、time stop、liquidity、regime が概ね揃う
- `B`: setup はあるが、執行タイミングや crowding で注意が必要
- `C`: 監視対象としては残すが、今は執行優先度が低い

## size-blind vs size-aware warning

- この skill は position sizing の最終決定をしない。
- ただし、`slippage_risk` や `liquidity_tier` から「サイズを大きく入れるべきではない」警告は出す。
- 最終サイズ決定は将来の `portfolio-risk-allocator` か、ユーザーの裁量へ委ねる。

## 手順

1. 入力モードを確定する。
   - 企業名だけなら `手入力モード`。
   - `ticker` `bucket` `decision_profile` などがあれば `state consumer モード`。
   - `state consumer モード` で確定保有中の銘柄が混入していると分かった場合は、新規候補として続行せず `stock-investment-position-review` へ切り分ける。
2. 各対象について銘柄コードを確定する。
   - 日本企業は原則として東証 ticker の `.T` を優先する。
   - 例: 任天堂 -> `7974.T`
   - `state consumer モード` では state 側の ticker を優先し、company は表示名と上流 thesis の確認に使う。
   - 候補が複数あり、どれか判断できない場合だけユーザーに確認する。
3. 各 ticker ごとに endpoint URL を組み立てる。
   - 形式: `${API_BASE_URL}/stock/${ticker}/analysis?range=recent&schema=trade-v2`
4. 各 URL から JSON を取得する。
   - 初回から `ctx_execute(language=\"javascript\")` を使い、`fetch(url)`、HTTP status、`response.ok`、JSON parse 成功、`asOf` を 1 回の sandbox 実行で確認する。
   - 一時的な timeout、HTTP 429、HTTP 5xx、JSON parse error があり得るため、sandbox 内で短い間隔の 2〜3 回 retry を実装する。HTTP 429 は少し長めに待って単独 retry する。
   - 出力は raw JSON ではなく、`setup` `risk` `feature.chartSummary` `feature.metrics` の必要項目に絞る。
   - `ctx_execute` で取得できない場合だけ、Playwright/browser fetch にフォールバックする。Playwright の返り値をそのまま会話へ出さず、file 保存して `ctx_execute_file` で要約する。
   - Playwright/browser fetch も失敗した場合だけ、診断・代替取得として `curl` にフォールバックする。
   - `curl` フォールバックで `curl: (6)` になった場合も、ただちに Lambda / API 障害と判断しない。Playwright/browser fetch の失敗内容と合わせて切り分ける。
   - `curl: (6) Could not resolve host` は AWS Lambda Function URL に到達する前の DNS / outbound egress 失敗として扱う。Lambda handler error、timeout、throttling とは切り分ける。
   - DNS 確認が必要な場合は DoH で A / AAAA レコードを補助確認してよい。ただし名前解決できても、実行環境からの direct connect が許可される保証にはならない。
5. 取得できない場合は、ticker と URL を示して失敗理由を簡潔に報告する。
   - Playwright/browser fetch の失敗理由と、`curl` フォールバックの結果を分けて示す。
   - Lambda Function URL へ届いていない可能性が高い失敗: DNS 解決失敗、接続失敗、TLS 接続前の timeout。
   - Lambda 側を疑う失敗: HTTP 5xx、HTTP 429、Function URL の 4xx、JSON 形式不正、Lambda timeout 由来の応答。
6. 取得に成功した企業ごとに、取得データだけで短期目線の分析を行う。
   - API が返す `feature`, `setup`, `risk` を主な根拠に使う。
   - skill / LLM の役割は、API 判定の説明、反証条件の補足、複数銘柄比較に限定する。
   - API が `setupType=no_trade` を返した場合、独自解釈で無理に買い候補へ寄せない。
   - `state consumer モード` では `selection_reason` `thesis_type` `event_risk` `catalyst` を API 判定の補助説明として引き継ぐ。ただし endpoint にない情報で API 判定を上書きしない。
7. 上流 execution 補助情報がある場合は、執行条件へ反映する。
   - `regime_fit=weak` なら `watch` を優先しやすい。
   - `liquidity_tier` や `slippage_risk` が悪い場合は `entry_quality` を落とす。
   - `max_theme_overlap` などの `portfolio_rules.json` 起点の gate は維持してよいが、`current_holdings.json` や実保有数を根拠に `entry_ready` を `watch` へ落とさない。
  - manual / ad-hoc run では `monitoring_valid_until` を過ぎた、または `event_freshness=stale` の場合は `stale_reason` に明記する。
  - automation run では freshness gate を優先し、期限切れ candidate を含む state file は停止する。
8. `portfolio_rules.json` が使える場合は、個別判断の前に `max_new_entries_per_day_high_beta` `max_theme_overlap` `earnings_blackout_days` を確認し、portfolio gate の警告を先に出す。
   - この確認も `ctx_execute_file` または `ctx_execute` で行い、rules 全文ではなく gate 結果だけを返す。
9. 複数企業入力時は、各企業について単一企業入力時と同じ粒度で `相場レジーム`, `セットアップ種別`, `setupScore / confidence`, `無効化条件`, `時間切れ条件`, `利確の目安`, `損切り・撤退の目安`, `リスク警告` まで必ず出したうえで、最後に分類サマリーを追加する。
10. 一部の企業だけ取得に失敗しても、成功した企業の分析は継続し、失敗した企業は別枠で報告する。

## 分析観点

- `setup.regime`, `setup.setupType`, `setup.setupScore`, `setup.confidence`
- `setup.reasons`, `setup.invalidations`
- `risk.entryZone`, `risk.stopPrice`, `risk.target1`, `risk.target2`, `risk.minimumRR`, `risk.timeStopDays`, `risk.riskWarnings`
- `feature.chartSummary`
- `feature.metrics`
  - `atr14`
  - `gapPercent`
  - `recentSwingHigh`, `recentSwingLow`
  - `distanceFrom20dHighPercent`, `distanceFrom20dLowPercent`, `distanceFrom60dHighPercent`
  - `volumeRatioVsMa20`
  - `ema10Slope`, `ema25Slope`, `ema60Slope`
  - `breakoutCandidate`
- `feature.indicatorState`
  - `superTrendDirection`
  - `sarDirection`
  - `macdDirection`
  - `dmiDirection`
  - `rsiState`
  - `stochasticState`
  - `bollingerState`
- `feature.eventRisk`

短期判断では、まず API の `setup` と `risk` を読む。`feature` はその理由説明と反証条件の補強に使う。analysis endpoint の recent trade-v2 は `6mo` の日足と、短期向けテクニカル指標に加えて setup/risk まで返す前提で扱う。

単独指標だけで判断しない。API 判定と feature の向きが矛盾する場合は `見送り` を優先する。

## 判定ラベルの正規化

- この skill の出力状態は `watch` または `entry_ready` を正とする。
- screening 段階の `watch` を、そのまま執行可能と読み替えない。
- `entry_ready` は `setupType`、`minimumRR`、`timeStopDays`、portfolio gate、liquidity、regime の 6 点を満たしたときだけ使う。

## 出力形式

単一企業入力でも複数企業入力でも、**各企業の個別分析は必ず Markdown テーブル形式で出す**。
左ほど優先して見るべき項目を置く。列が増えすぎるので、1表に詰め込まず、優先度順の 2 テーブル構成にする。

### 個別分析テーブル 1

```md
| 対象企業 | 銘柄コード | 状態 | entry_quality | entry_style | execution_window | 短期判断 | 相場レジーム | セットアップ種別 | setupScore / confidence | エントリーゾーン | 利確の目安 | 損切り・撤退の目安 | 時間切れ条件 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 任天堂 | 7974.T | watch | C | avoid_open | next_pullback | 様子見推奨 | range | no_trade | 42 / low | ... | ... | ... | ... |
```

### 個別分析テーブル 2

```md
| 対象企業 | 現状認識 | 上流 thesis | 強気材料 | 弱気材料 | 無効化条件 | position_risk_note | stale_reason | 見送る条件 | リスク警告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 任天堂 | ... | sector_leader / selection_reason 要約 | ... | ... | ... | ... | ... | ... | ... |
```

### 単一企業入力時の補足

- テーブルの前に `取得エンドポイント` を 1 行だけ置いてよい
- テーブルの後に `データ上の限界` を箇条書きで付ける

### 複数企業入力時の補足

- **各企業の詳細レポートは単一企業入力時と同じテーブル項目をすべて出す**
- 省略してよいのは最後の分類サマリーだけで、個別レポートの項目は減らさない
- そのうえで最後に分類サマリーを追加する

```text
分類サマリー:

売り転換シグナルあり:
- ...

下降中:
- ...

様子見推奨:
- ...

上昇中:
- ...

買い転換シグナルあり:
- ...

取得失敗:
- ...
```

## 判断ルール

- `買い`、`売り` と断定しない。
- 判定主体は API とし、skill は API 判定を説明する。
- `state consumer モード` でも、上流 thesis を根拠に API の `no_trade` を無視しない。
- 単一入力でも複数入力でも、各銘柄に対する判定項目は同一とする。複数入力だからという理由で `regime`, `setupType`, `invalidations`, `timeStopDays`, `riskWarnings` を省略しない。
- `setupType=no_trade`、`minimumRR` 不足、`riskWarnings` が強い場合は `様子見推奨` を優先する。
- データが矛盾する場合は `様子見推奨` を優先する。
- 判断期間は短期（1ヶ月以内程度）に限定し、中期・長期判断は出力しない。
- endpoint に含まれない情報を根拠にしない。必要なら「追加確認が必要」と明記する。
- `large_cap` と `high_beta` を同じ資金枠、同じ警戒水準、同じ優先度で比較しない。
- `auto2b` の high_beta 判定では real holdings の `current_holdings.json` を occupancy gate に使わない。high_beta paper simulation の実ポジション制約は downstream の `auto-4` に委ねる。
- high_beta で `monitoring_valid_until` を過ぎた候補は、manual / ad-hoc run では API が強気でも stale 候補として注意を明記する。automation run では停止を優先する。
- `entry_style_hint` があれば尊重し、API setup が強くても `avoid_open` を上書きしない。
- `liquidity_tier=thin_for_large_size` や `slippage_risk=high` の場合、`entry_ready` にしても `entry_quality` は原則 `B` 以下に留める。
- 各企業の個別出力は、単一入力でも複数入力でも同じテーブル列を使う。
- `reasons`, `invalidations`, `riskWarnings` を要約して、人間が執行可否を判断しやすい順に並べる。
- エントリー条件では `entryZone`, `minimumRR`, `timeStopDays` を必ず確認する。
- 利確・撤退条件では `target1`, `target2`, `stopPrice`, `holdUntilCondition` を優先して説明する。

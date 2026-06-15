---
name: stock-investment-position-review
description: "保有中の日本株について、企業名または ticker と株数・平均取得単価を入力に、固定の trend_viewer trade-v2 analysis API から recent 分析 JSON を取得し、review_profile により大型株寄りと高ボラ短期値幅寄りの重み付けを切り替えながら、短期の保有継続・一部利確・撤退・追加買い条件レポートを作る。current_holdings state を正本として、保有後の防衛判断だけを行う。"
---

# Stock Investment Position Review

保有中の日本株を、短期（1ヶ月以内程度）のポジション管理目線でレビューする。新規候補の横比較ではなく、既存ポジションに対する `保有継続 / 一部利確 / 撤退条件 / 追加買い可否` を先に出す。

この skill は保有後レビュー専用であり、watchlist から新規候補を拾わない。新規エントリー判断は `stock-investment-decision-support`、候補抽出は screening 系 skill に分離する。
確定保有中の銘柄に対する追加投資可否、利確、縮小、防衛、撤退の判断はこの skill の責務とし、screening 系 skill や `stock-investment-decision-support` 側で再採用しない。

これは投資助言ではない。最終判断はユーザーが行う。断定的な売買指示は避け、根拠・反証条件・リスクを明示する。

## 使う場面 / 使わない場面

- 使う:
  - ユーザーが `銘柄名 / 株数 / 平均取得単価` を渡している
  - 既存ポジションの利確、撤退、買い増し可否を知りたい
  - `current_holdings.json` や automation memory に保有情報があり、保有前提で継続レビューしたい
  - 大型株と短期値幅株で、防衛優先度や追加買い条件の重み付けを切り替えたい
- 使わない:
  - 新規で買う候補を横並び比較したいだけ
  - 保有情報がなく、新規エントリーの執行可否を中心に見たい
  - 上記は `stock-investment-decision-support` を使う
  - すでに保有している銘柄を screening の新規候補として入れ直したい

## 固定設定

```text
API_BASE_URL=https://bfdkvlo2zi752fp5mhaq4koreq0ezvbd.lambda-url.ap-northeast-1.on.aws
ENDPOINT=/stock/{ticker}/analysis?range=recent&schema=trade-v2
投資スタイル=短期（1ヶ月以内程度）
review_profile の既定値=auto
```

## context-mode 運用

- 大きい I/O は原則 `context-mode` を使う。保有 state、portfolio rules、API JSON をそのまま会話へ流さない。
- `current_holdings.json` や `portfolio_rules.json` の確認は `ctx_execute_file` で行い、件数、欠落 field、stale 判定、対象 ticker だけを返す。
- trade-v2 API 取得は `ctx_execute` の `javascript` で `fetch(url)`、retry、JSON parse、要点抽出までをまとめて行う。
- 複数保有銘柄のレビューでは raw JSON 全量を返さず、保有判断に必要な `setup` `risk` `latestClose` などの派生値だけを返す。
- `ctx_execute` で取得不能な場合のみ Playwright/browser fetch に落とし、返り値は file 保存して `ctx_execute_file` で要約する。
- `curl` は診断専用 fallback とし、JSON 本取得の第一手段にしない。

## automation / state file 連携

- この skill は `auto3` 相当の保有レビュー consumer として扱う。
- 正本 state file は `/Users/sawairikeisuke/Documents/stock-analysis/current_holdings.json` を想定する。
- portfolio gate 用の補助設定は `/Users/sawairikeisuke/Documents/stock-analysis/portfolio_rules.json` を読む。
- watchlist state は読んでもよいが、新規候補採用のためには使わない。用途は保有銘柄の由来確認までに留める。
- `/Users/sawairikeisuke/Documents/stock-analysis` 配下の state / output を更新した場合は、作業後に差分確認を行い、今回更新したファイルだけを commit して push まで進める。
  - push 先はこの repo の `main` とし、許可条件は `git-workflow-safety` の `stock-analysis` 例外に従う。
  - 差分がない場合は commit / push しない。commit または push に失敗した場合はそこで停止して報告する。

## freshness gate

- automation run で `current_holdings.json` を参照する場合、`as_of` と `holdings` が必須。
- 各 holding は最低でも `ticker` `company` `shares` `average_cost` `bucket` `review_profile` を持つこと。欠けていれば malformed とみなして停止する。
- `portfolio_rules.json` を参照する場合は `max_positions_large_cap` `max_positions_high_beta` `max_new_entries_per_day_high_beta` `max_theme_overlap` `earnings_blackout_days` `max_risk_per_trade_pct` が揃っていなければ停止する。
- watchlist state を由来確認に使う場合も、その file の `as_of` が古ければ補助参照に使わず停止する。stale な watchlist を根拠補強に使わない。
- `current_holdings.json` は watchlist ほど当日性を要求しない。`as_of` が古いだけなら原則停止せず、`保有情報が古い可能性` を警告して続行してよい。
- 停止するのは、必須項目欠落、pending fill で holdings 未確定、または `source` / `note` などから約定反映待ちと判断できる場合を優先する。
- `source=memory_draft` だけを stale の根拠にはしない。dated draft でも保有内容が確定済みなら警告に留めてよい。

## review_profile

- `auto`
  - 既定値。明示指定がないときに、automation memory、銘柄群、短期ボラ特性から自動で選ぶ
- `large_cap`
  - 大型・主力・相対的に低ボラな銘柄向け。押し目継続をやや許容し、過熱単独では防衛へ寄せすぎない
- `high_beta`
  - 中小型、高ATR、高gap、出来高急増、テーマ性の強い短期値幅銘柄向け。ブレイク失敗と time stop を重く見る

## 入力

入力は保有銘柄を前提にする。理想形は `銘柄名 / 株数 / 平均取得単価`。必要なら `review_profile` を明示指定してよい。

```text
トヨタ自動車 / 100株 / 2616円
任天堂 / 75株 / 10200円
ソフトバンクグループ / 180株 / 1743円
```

```text
トヨタ自動車 / 100株 / 2616円 / review_profile=large_cap
データセクション / 100株 / 5140円 / review_profile=high_beta
```

複数銘柄でもよい。automation memory に保有情報があれば、それを使ってよい。平均取得単価や株数が欠けている場合は、損益率の計算を省略し、`未共有` と明記する。

state file を使う場合の最小項目は `ticker` `company` `shares` `average_cost` `bucket` `review_profile`。`source` や `thesis_type` があれば補助情報として使ってよい。

`review_profile` を省略した場合は `auto` とし、次の順で決める。

- ユーザーの明示指定
- automation memory や継続レビュー文脈
- 銘柄特性
  - 大型・主力・gap が比較的小さく、押し目管理が中心なら `large_cap`
  - 高ATR、高gap、出来高急増、ブレイク監視が中心なら `high_beta`
- 判定が割れる場合は、防衛寄りの `high_beta` を優先し、その旨を出力で明記する

## action sizing

- top-level ラベルは `hold` `trim` `defend` `exit` を維持する。
- ただし、可能なら `trim_25` `trim_50` `defend_tight` `exit_now` のように行動量を補助表示する。
- 量は厳密な自動算出より、過熱度、Pnl、time stop、出来高失速の組み合わせで段階化する。

## time-based defense

- `timeStopDays` は high-beta で特に重く扱う。
- `large_cap` では time stop 単独より trend 崩れとの併発を重視する。
- `防衛優先日数` を出し、次の review をいつ厳格化すべきかを示す。

## pnl context

- 平均取得単価と株数がある場合は、評価損益額と損益率を必ず出す。
- 可能なら `R倍数文脈` として「stop までの距離に対してどれだけ利益が乗っているか」を簡潔に説明する。
- `trim` は単なる過熱ではなく、含み益保全や最大含み益からの押しも踏まえて出す。

## 手順

1. 各企業の銘柄コードを特定する。
   - 日本企業は原則として東証 ticker の `.T` を優先する。
   - 候補が複数あり、どれか判断できない場合だけ確認する。
2. 各銘柄の `review_profile` を決める。
   - 明示指定があればそれを採用する。
   - 未指定なら `auto` として、automation memory、銘柄群、直近ボラ特性から `large_cap` か `high_beta` を選ぶ。
   - profile は出力にも明記する。
3. 各 ticker ごとに endpoint URL を組み立てる。
   - 形式: `${API_BASE_URL}/stock/${ticker}/analysis?range=recent&schema=trade-v2`
4. 各 URL から JSON を取得する。
   - 初回から `ctx_execute(language=\"javascript\")` で取得する。
   - sandbox 内で HTTP status、`response.ok`、JSON parse 成功、`asOf` を確認する。
   - timeout、HTTP 429、HTTP 5xx、JSON parse error は sandbox 内で短い間隔の 2〜3 回 retry を行う。HTTP 429 は少し長めに待って単独 retry する。
   - 出力は raw JSON ではなく、保有レビューに必要な `setup` `risk` `latestClose` `feature.metrics` の要点に絞る。
   - `ctx_execute` が失敗した場合だけ Playwright/browser fetch にフォールバックし、返り値は file 保存して `ctx_execute_file` で要約する。
   - Playwright/browser fetch も失敗した場合だけ、診断用に `curl` へフォールバックする。
   - `curl: (6) Could not resolve host` は Lambda 未到達の DNS / outbound egress 失敗として扱い、API 障害と混同しない。
5. 取得に失敗した銘柄は、ticker と URL と失敗理由を簡潔に示す。
6. 成功した銘柄ごとに、`setup` と `risk` を主根拠に保有レビューを作る。
   - `feature` は理由説明と反証条件の補強に使う。
   - `setupType=no_trade` の場合、新規追加を無理に肯定しない。
   - `review_profile=large_cap` では trend 継続と支持線維持をやや重く見る。
   - `review_profile=high_beta` では `gapPercent`, `volumeRatioVsMa20`, `breakoutCandidate`, `timeStopDays` をやや重く見る。
7. `portfolio_rules.json` が使える場合は、個別レビューの前に portfolio gate を確認する。
   - gate 確認は `ctx_execute_file` または `ctx_execute` で行い、rules 全文ではなく警告だけを返す。
   - `max_positions_high_beta`
   - `max_theme_overlap`
   - `earnings_blackout_days`
   - `max_risk_per_trade_pct`
   - 枠超過、テーマ集中、決算接近は個別判断とは別に警告する。
8. 平均取得単価と株数がある場合は、少なくとも次を計算する。
   - `評価損益額 = (latestClose - averageCost) * shares`
   - `損益率 = (latestClose / averageCost - 1) * 100`
9. 複数銘柄入力時も、各銘柄について同じ粒度で `保有判断`, `追加投資判断`, `利確の目安`, `撤退の目安`, `追加買い条件`, `リスク警告` を出す。

## 分析観点

- `setup.regime`, `setup.setupType`, `setup.setupScore`, `setup.confidence`
- `setup.reasons`, `setup.invalidations`
- `risk.entryZone`, `risk.stopPrice`, `risk.target1`, `risk.target2`, `risk.minimumRR`, `risk.timeStopDays`, `risk.holdUntilCondition`, `risk.riskWarnings`
- `feature.chartSummary.latestClose`
- `feature.metrics`
  - `atr14`
  - `gapPercent`
  - `recentSwingHigh`, `recentSwingLow`
  - `distanceFrom20dHighPercent`, `distanceFrom60dHighPercent`
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

短期レビューでは、まず API の `setup` と `risk` を読む。保有中の判断では、`今から入るならどうか` より先に、`持ち続ける根拠が残っているか`、`どこから防衛優先に切り替えるか`、`追加は追いかけ買いになるか` を優先する。

## 判定ラベルの正規化

- この skill の出力状態は `hold` `trim` `defend` `exit` を正とする。
- `watch` や `entry_ready` は保有後ラベルとして使わない。
- `large_cap` と `high_beta` で同じラベルを使ってよいが、`defend` と `trim` へ切り替える閾値は profile に応じて変える。

## 出力形式

単一銘柄でも複数銘柄でも、**各銘柄の個別分析は必ず Markdown テーブル 2 枚で出す**。保有前提の判断を左に寄せる。

各銘柄のテーブル直前に、`review_profile: high_beta (auto)` のように、採用した profile と決め方を 1 行で明記する。

### 個別分析テーブル 1

```md
| 対象企業 | 銘柄コード | 状態 | 保有判断 | 追加投資判断 | 推奨アクション量 | 最新終値 / 平均取得単価 | 損益率 | 相場レジーム | セットアップ種別 | 利確・縮小の目安 | 撤退・防衛の目安 | 防衛優先日数 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ソフトバンクグループ | 9984.T | hold | 保有継続優先 | 追加見送り | trim_25_if_extended | 8541 / 1743 | +390.0% | trend_up | breakout_long | target1 接近や過熱継続で一部利確検討 | EMA25割れや出来高失速で警戒 | 10日 |
```

### 個別分析テーブル 2

```md
| 対象企業 | 現状認識 | 保有継続の根拠 | 一部利確を検討する条件 | 追加を見送る理由 | 追加を検討できる条件 | 撤退を急ぐ条件 | R倍数文脈 | peak_to_current_drawdown_note | リスク警告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ソフトバンクグループ | 高値圏・過熱 | ... | ... | ... | ... | ... | ... | ... | ... |
```

### 複数銘柄入力時の分類サマリー

最後に次を追加する。

```text
保有判断サマリー:

保有継続優先:
- ...

一部利確検討:
- ...

撤退条件警戒:
- ...

追加投資サマリー:

追加買い条件付き:
- ...

追加見送り:
- ...

取得失敗:
- ...
```

## 判断ルール

- `買い`, `売り` と断定しない。
- 判定主体は API とし、この skill は API 判定を保有前提へ翻訳する。
- portfolio gate の警告は、個別銘柄の強気判定より優先して併記する。
- `setupType=no_trade`、`minimumRR` 不足、`riskWarnings` が強い場合、`追加投資判断` は `追加見送り` を優先する。
- `setupType=rally_fade_short`、`regime=trend_down`、または弱気指標が揃い stop に近い場合、`保有判断` は `撤退条件警戒` を優先する。
- `breakout_long` または `rebound_long` で `confidence=high` でも、`RSI / stochastic / bollinger` の複数が `overbought` なら、`追加見送り` または `条件付き` に留める。
- `target1` や `target2` に近く、かつ含み益が大きく、過熱が強い場合は `一部利確検討` を優先する。
- `pullback_long` や `breakout_long` で `confidence=high`、`minimumRR` が十分、過熱が強すぎない場合だけ `追加買い条件付き` にできる。
- データが矛盾する場合は、`追加見送り` と `保有防衛優先` を選ぶ。
- 平均取得単価や株数が未共有なら、損益率・評価額は作らない。代わりにチャート上の利確・撤退条件だけを出す。
- 判断期間は短期（1ヶ月以内程度）に限定する。中長期の評価やファンダメンタルズ判断は書かない。
- endpoint に含まれない情報を根拠にしない。必要なら `追加確認が必要` と明記する。
- watchlist に載っていること自体を、保有継続や追加買いの根拠にしない。

profile 別の重み付けは次の通り。

- `review_profile=large_cap`
  - `timeStopDays` は単独で強い撤退根拠にせず、EMA、invalidations、出来高失速の併発を優先して見る
  - `overbought` 単独では `一部利確検討` や `追加見送り` へ直行させず、`target1` 接近や trend 鈍化も合わせて確認する
  - `pullback_long/high` なら、出来高が極端に痩せていなければ `追加買い条件付き` を認めやすい
- `review_profile=high_beta`
  - `gapPercent`, `volumeRatioVsMa20`, `breakoutCandidate`, `timeStopDays` を通常より重く扱う
  - `overbought` 複数点灯、出来高失速、ブレイク失敗のどれかが見えたら、`追加見送り`、`一部利確検討`、`撤退条件警戒` を優先しやすい
  - `pullback_long` でも、高値圏に張り付きすぎ、gap が大きすぎる、支持確認前の追いかけ買いなら防衛優先に寄せる
  - `timeStopDays` 到来が近い場合は `防衛優先日数` を短くし、`defend_tight` や `trim_25` を検討する
- `review_profile=auto`
  - 大型・主力・比較的低gap なら `large_cap`
  - 中小型・高ATR・高gap・出来高急増の順張り銘柄なら `high_beta`
  - 判断が割れる場合は、防衛寄りの `high_beta` を採用する

## 保有判断ラベルの正規化

- `保有継続優先`:
  - `regime=trend_up` で、`setupType=breakout_long|pullback_long|rebound_long` のどれか
  - かつ致命的な `riskWarnings` がない
  - `high_beta` では、出来高失速やブレイク失敗の兆候がないことも追加で確認する
- `一部利確検討`:
  - `target1` 接近、または `overbought` が複数点灯
  - かつ既存保有で含み益が大きい
  - `high_beta` では、`target1` 未到達でも高gap の伸び切りやブレイク失敗予兆があれば優先度を上げる
- `撤退条件警戒`:
  - `setupType=rally_fade_short`
  - または `regime=trend_down` かつ `setupType=no_trade`
  - または `stopPrice` / `invalidations` が現在値に近い
  - `high_beta` では、`timeStopDays` 到来や出来高失速も警戒根拠に加えてよい

## 追加投資判断ラベルの正規化

- `追加買い条件付き`:
  - `setupType=breakout_long|rebound_long|pullback_long`
  - かつ `confidence=high`
  - かつ `minimumRR` が不足していない
  - かつ過熱シグナルが強すぎない
  - `high_beta` では、`pullback_long` に加える条件として支持確認、出来高維持、過大 gap 不在を重視する
- `追加見送り`:
  - `setupType=no_trade`
  - または `minimumRR` 不足
  - または `overbought` が強い
  - または指標が矛盾している
  - `large_cap` では、過熱単独より trend 崩れや RR 不足を優先理由にする
  - `high_beta` では、過熱、gap 拡大、出来高失速のいずれかで優先しやすい

## データ上の限界

- 取得データは short-term recent (`6mo` 日足と短期向けテクニカル指標) に限定される
- 決算、業績予想、ニュース、為替、金利、需給、地合いは含まれない
- `review_profile` は API 以外の追加データを入れるものではなく、同じ API 出力に対する重み付けの違いを表す
- これは投資助言ではなく、提供データに基づく分析支援

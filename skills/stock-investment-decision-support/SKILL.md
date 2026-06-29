---
name: stock-investment-decision-support
description: "日本株の未保有候補について、trade-v2 recent analysis を使って短期の新規エントリー判断材料を作るときに使う。"
---

# Stock Investment Decision Support

企業名または watchlist state から ticker を確定し、trade-v2 recent analysis を使って短期の新規エントリー判断材料を返す。保有後の防衛判断は `stock-investment-position-review` に分離する。

共通運用は [../stock-shared/references/common-operating-rules.md](../stock-shared/references/common-operating-rules.md) を前提にする。詳細な出力列は [references/output-contract.md](references/output-contract.md) を使う。

## 固定設定

```text
API_BASE_URL=https://bfdkvlo2zi752fp5mhaq4koreq0ezvbd.lambda-url.ap-northeast-1.on.aws
ENDPOINT=/stock/{ticker}/analysis?range=recent&schema=trade-v2
投資スタイル=短期（1ヶ月以内程度）
```

## 基本方針

- この skill は未保有候補の新規エントリー判断専用
- `large_cap` と `high_beta` を同じ比較表や同じ資金枠で混ぜない
- 上流 thesis は補助説明に使うが、API の `setup` 判定を上書きしない
- `watch` `entry_ready` は執行可否の入口であり、 sizing の最終決定ではない

## 入力

### 手入力モード

- 企業名だけが渡される通常入力

### state consumer モード

- watchlist から次を受け取る
  - `ticker`
  - `company`
  - `bucket`
  - `decision_profile`
  - `thesis_type`
  - `selection_reason`
  - `event_risk`
- high_beta では必要に応じて
  - `catalyst`
  - `invalidation_hint`
  - `monitoring_valid_until`
- execution 補助情報があれば
  - `regime_fit`
  - `execution_caution`
  - `liquidity_tier`
  - `slippage_risk`
  - `theme_cluster`
  - `event_freshness`
  - `crowding_risk`
  - `entry_style_hint`

## 正本 state

- large_cap watchlist: `/Users/sawairikeisuke/Documents/stock-analysis/large_cap_watchlist.json`
- high_beta watchlist: `/Users/sawairikeisuke/Documents/stock-analysis/high_beta_watchlist.json`
- portfolio rules: `/Users/sawairikeisuke/Documents/stock-analysis/portfolio_rules.json`

## lane 固有 freshness / schema

- `auto2a` は `large_cap_watchlist.json` を読む large_cap 専用 consumer
- `auto2b` は `high_beta_watchlist.json` を読む high_beta 専用 consumer
- `large_cap_watchlist.json` は `as_of` が当日を含む過去 7 日以内で、`ticker` `company` `bucket` `decision_profile` `thesis_type` `selection_reason` `event_risk` `priority` `status` が必須
- `high_beta_watchlist.json` は `as_of` が当日で、`catalyst` `invalidation_hint` `monitoring_valid_until` が必須
- `monitoring_valid_until < today` の high_beta candidate が 1 件でもあれば stale とみなして停止する
- `portfolio_rules.json` は `max_new_entries_per_day_high_beta` `max_theme_overlap` `earnings_blackout_days` `max_positions_large_cap` `max_positions_high_beta` `max_risk_per_trade_pct` が必須
- `auto2b` では `current_holdings.json` を occupancy gate に使わない

## automation / sidecar contract

- `auto2a`
  - required sidecar path は automation prompt が指定する
  - sidecar の固定 field は `decision_date` `watchlist_as_of` `age_days` `freshness_rule` `classification_summary` `fetch_failures` `earnings_blackout_check` `lane_discipline` `contract_breach`
  - `earnings_blackout_check` は `pass` `not_applicable` `observational_exception` の 3 値に正規化し、`daysToEarnings` 欠損時は `observational_exception` と理由を 1 行で残す
  - `age_days > 7` のときは state 更新へ進まず、`contract_breach` を明示した no-op sidecar を残す
- `auto2b`
  - required sidecar path は automation prompt が指定する
  - stale day / 休場日 / upstream 未更新日でも required sidecar は必須で、`publish_mode=stale_day_noop` の no-op publish を残す
  - sidecar の固定 field は `decision_date` `audit_date` `snapshot_as_of` `same_day_freshness_ok` `stale_day` `entry_ready_tickers` `watch_tickers` `entry_style_summary` `execution_window_summary` `monitoring_valid_until` `publish_mode` `contract_breach`
  - `same_day_freshness_ok` と `stale_day` は監査日基準で評価し、snapshot 自己評価を残す場合は `snapshot_same_day_freshness_ok` に分離する
  - same-day freshness や `monitoring_valid_until` 不一致で state 更新を止める場合でも、`stale_day` `same_day_freshness_ok` `publish_mode` などの failure trace を sidecar に残す
  - decision state を更新した run では same-day sidecar も必須とし、state だけ更新して sidecar が欠ける run は incomplete 扱いにする
  - watchlist の `entry_style_hint` / `monitoring_comment` と decision の `entry_style` / `execution_window` の対応を 1 行 summary で残す

## execution decision contract

- top-level 状態は `watch` または `entry_ready`
- 併記項目:
  - `entry_quality`
  - `entry_style`
  - `execution_window`
  - `position_risk_note`
  - `stale_reason`
- high_beta decision consumer では automation 向け補助項目として次も持てる
  - `auto4_buy_allowed`
  - `auto4_block_reason`
- `entry_ready` は「条件付きで執行検討に進める」の意味とする
- `auto4_buy_allowed` は「同日の auto-4 paper 約定を許可するか」を表す automation 向け gate とする
- `auto4_block_reason` は `avoid_open` `needs_open_retest` `needs_freshness_recheck` `aging_event_freshness` `crowding_high` `needs_fresh_catalyst_check` などの短い正規化 code を使う
- high_beta consumer では `entry_ready` と `auto4_buy_allowed` を分離し、human-facing の執行候補と機械約定可否を混同しない
- auto2b sidecar の `publish_mode` は `normal` `stale_day_noop` `hard_stop` の 3 値に正規化する

## 手順

1. 入力モードを確定する。
2. 各対象の ticker を確定する。
3. `ctx_execute` の `javascript` で API をまとめて取得し、retry と JSON parse を sandbox 内で完結させる。
4. `ctx_execute` で失敗した場合だけ Playwright/browser fetch、さらに失敗した場合だけ診断用 `curl` へ落とす。
5. `setup` `risk` `feature.metrics` を主根拠に短期判断を作る。
6. 上流 execution 補助情報があれば、`entry_quality` や `watch / entry_ready` の説明へ反映する。
7. high_beta automation では `entry_ready` と `auto4_buy_allowed` を分離し、human review 上は前向きでも機械約定に不向きな候補を `auto4_buy_allowed=false` にする。
8. `portfolio_rules.json` があれば個別判断の前に portfolio gate 警告を出す。
9. 既定は `compact` で返し、長い表は `full` 要求時だけ出す。

## 分析観点

- `setup.regime` `setup.setupType` `setup.setupScore` `setup.confidence`
- `setup.reasons` `setup.invalidations`
- `risk.entryZone` `risk.stopPrice` `risk.target1` `risk.target2` `risk.minimumRR` `risk.timeStopDays` `risk.riskWarnings`
- `feature.chartSummary`
- `feature.metrics`
  - `atr14`
  - `gapPercent`
  - `distanceFrom20dHighPercent`
  - `distanceFrom60dHighPercent`
  - `volumeRatioVsMa20`
  - `ema10Slope` `ema25Slope` `ema60Slope`
  - `breakoutCandidate`
- `feature.indicatorState`
- `feature.eventRisk`

## 判定ラベルの正規化

- 出力状態は `watch` または `entry_ready`
- `entry_ready` は `setupType` `minimumRR` `timeStopDays` `portfolio gate` `liquidity` `regime` を満たしたときだけ使う
- `setupType=no_trade`、`minimumRR` 不足、強い `riskWarnings` では `watch` を優先する
- `auto4_buy_allowed=true` は `entry_ready` のうち、当日終値ベースの機械約定でも意図が崩れない候補に限定する
- `entry_style=avoid_open`、`execution_window=after_open_retest|after_freshness_recheck`、`event_freshness=aging`、`crowding_risk=high`、fresh catalyst 再確認要件がある場合は `entry_ready` を維持しても `auto4_buy_allowed=false` を優先する

## 出力形式

- 既定は `compact`
- `compact`:
  - 単一企業は状態、短期判断、entry 条件、利確 / 損切り / 無効化条件、リスク警告を返す
  - 複数企業は各企業 1 行サマリーと `分類サマリー` `取得失敗` `portfolio gate 警告` を返す
- `full`:
  - [references/output-contract.md](references/output-contract.md) の 2 表構成を使う

## 判断ルール

- `買い` `売り` と断定しない
- API 判定と feature が矛盾する場合は `watch` を優先する
- 上流 thesis を根拠に `no_trade` を無視しない
- `entry_style_hint=avoid_open` は API setup が強くても上書きしない
- `slippage_risk=high` や `liquidity_tier` 悪化時は `entry_quality` を落とす
- `entry_ready` を `watch` へ落とさずに残す場合でも、auto-4 自動約定が不適切なら `auto4_buy_allowed=false` と `auto4_block_reason` を必ず併記する

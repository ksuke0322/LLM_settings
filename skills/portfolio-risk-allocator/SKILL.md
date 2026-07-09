---
name: portfolio-risk-allocator
description: "watchlist、decision、holdings review を受けて、portfolio 全体の採用可否と配分警告を返すときに使う。"
---

# Portfolio Risk Allocator

個別銘柄の良し悪しではなく、portfolio 全体の過熱、theme 集中、bucket 偏り、新規採用余地を止める最終ゲートを返す。

共通運用は [../stock-shared/references/common-operating-rules.md](../stock-shared/references/common-operating-rules.md) を前提にする。判定原則は [references/rules.md](references/rules.md) を使う。

## 基本方針

- 個別銘柄 skill の判定を置き換えず、最終採用制約だけを返す
- `portfolio_rules.json` を正本にする
- `large_cap` と `high_beta` の枠、theme overlap、日次新規採用数を優先管理する

## 入力

- `large_cap_watchlist.json`
- `high_beta_decisions.json`
- `current_holdings.json`
- `portfolio_rules.json`
- 必要なら `paper_high_beta_positions.json` `paper_high_beta_history.json` `paper_high_beta_metrics.json`
- sidecar 運用では `paper_high_beta_allocator_snapshot.json`

## lane 固有 freshness / schema

- `high_beta_decisions.json` は `as_of` `decisions` が必須
- automation run では `high_beta_decisions.json` の `as_of` が当日でなければ停止する
- active candidate は `ticker` `company` `status` `monitoring_valid_until` を持つこと
- `status=watch|entry_ready` の candidate に `monitoring_valid_until < today` があれば停止する
- `portfolio_rules.json` は `max_positions_large_cap` `max_positions_high_beta` `max_new_entries_per_day_high_beta` `max_theme_overlap` `earnings_blackout_days` `max_risk_per_trade_pct` `max_position_value_jpy_high_beta` が必須
- `current_holdings.json` や `paper_high_beta_*.json` を同時参照する場合は `as_of` 整合を確認する
- auto-4 の paper lane では allocator 入力を `high_beta_decisions.json` `paper_high_beta_positions.json` `paper_high_beta_history.json` `portfolio_rules.json` に限定し、`current_holdings.json` は参照しない

## 出力契約

- `adopt`
- `defer`
- `block`
- `max_new_entries_today`
- `theme_overlap_warning`
- `bucket_exposure_warning`
- `suggested_size_tier`
- `portfolio_heat`
- `available_slots`
- `rules_source`
- `adopted_count`
- `rejected_count`

## auto-4 paper lane contract

- 新規買い候補は `status=entry_ready` を出発点にしてよい
- ただし実際に採用候補として通すのは `auto4_buy_allowed=true` のものだけとする
- allocator の最終結果は `adopt` `defer` `block` とし、auto-4 側は `adopt` だけを新規 paper 約定候補に使う
- allocator snapshot には少なくとも `available_slots` `rules_source` `adopted_count` `rejected_count` を残す

## 手順

1. holdings と paper / decision を bucket 別に読む。
2. `portfolio_rules.json` の上限を確認する。
3. theme overlap、bucket 過密、決算接近、high_beta 過多を確認する。
4. 新規採用余地を `max_new_entries_today` で整理する。
5. 各候補を `adopt` `defer` `block` へ寄せる。
6. `suggested_size_tier` と `portfolio_heat` を返す。

## 判断ルール

- `entry_ready` でも portfolio 制約で `defer` `block` にしてよい
- high_beta は同時保有数と同日新規採用数の制限を強く見る
- 判断が割れる場合は `defer` を優先する

## 出力形式

- 既定は `compact`
- `compact` は最終ゲート、主要 warning、size tier、heat を短く返す
- `full` は bucket 別件数や theme overlap 明細を追加してよい

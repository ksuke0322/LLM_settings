---
name: portfolio-risk-allocator
description: "日本株の watchlist、decision、holdings review の結果を受けて、同時保有数、テーマ集中、bucket 偏り、日次の新規採用数を整理し、最終の採用可否と配分警告を返す。個別銘柄の分析を置き換えるのではなく、全体の資本配分ゲートとして使う。"
---

# Portfolio Risk Allocator

watchlist、decision、holdings review の結果を受けて、ポートフォリオ全体の過熱や偏りを止めるための最終ゲートを返す。個別銘柄の良し悪しより、「今どれだけ新規に入れてよいか」「同テーマが過密ではないか」を優先して見る。

## 基本方針

- 個別銘柄 skill の判定を上書きするのではなく、最終採用制約を返す。
- `portfolio_rules.json` を正本にする。
- `large_cap` と `high_beta` の枠、同テーマの重なり、日次新規採用数を管理する。
- sizing の精密計算までは行わず、tier と警告に留める。

## 入力

- `large_cap_watchlist.json`
- `high_beta_decisions.json`
- `current_holdings.json`
- `portfolio_rules.json`
- 必要なら `paper_high_beta_positions.json` `paper_high_beta_history.json` `paper_high_beta_metrics.json`
- sidecar を使う運用では `paper_high_beta_allocator_snapshot.json`
- 必要なら `stock-investment-position-review` の最新要約

## freshness gate

- `high_beta_decisions.json` は `as_of` と `decisions` が必須。automation run では `as_of` が当日でなければ stale とみなして停止する。
- `high_beta_decisions.json` の active candidate は `ticker` `company` `status` `monitoring_valid_until` を持つこと。`status=watch|entry_ready` の候補に 1 件でも `monitoring_valid_until < today` があれば stale とみなして停止する。
- `portfolio_rules.json` は `max_positions_large_cap` `max_positions_high_beta` `max_new_entries_per_day_high_beta` `max_theme_overlap` `earnings_blackout_days` `max_risk_per_trade_pct` が揃っていなければ停止する。
- `current_holdings.json` や `paper_high_beta_*.json` を参照する場合は `as_of` が必須。複数 file を同時に使うなら `as_of` が相互に矛盾していないことを確認し、明らかに古い file があれば停止する。
- stale を検出した場合は `defer` に丸めて続行しない。`どの file のどの date / field が stale か` を明記して停止する。

## 出力契約

- `adopt`
- `defer`
- `block`
- `max_new_entries_today`
- `theme_overlap_warning`
- `bucket_exposure_warning`
- `suggested_size_tier`
- `portfolio_heat`

## 手順

1. current holdings と paper / decision の bucket を分けて読む。
2. `portfolio_rules.json` の上限を確認する。
3. 同テーマ重複、同 bucket 過密、決算接近、high-beta 過多を確認する。
4. 新規採用余地を `max_new_entries_today` で整理する。
5. 各候補を `adopt` `defer` `block` のどれかへ寄せる。
6. `suggested_size_tier` と `portfolio_heat` を返す。

## 判断ルール

- `entry_ready` でも、theme overlap や bucket 上限で `defer` や `block` にしてよい。
- high-beta は同時保有数と同日新規採用数の制限を強く見る。
- 大きな含み益ポジションが多く、地合い悪化なら `portfolio_heat` を高めに出す。
- 判断が割れる場合は `defer` を優先する。

## 出力形式

```md
portfolio allocation:
- adopt: 6779.T
- defer: 4047.T
- block: 同テーマ3本目
- max_new_entries_today: 1
- theme_overlap_warning: AI半導体に偏り
- bucket_exposure_warning: high_beta が上限付近
- suggested_size_tier: half
- portfolio_heat: elevated
```

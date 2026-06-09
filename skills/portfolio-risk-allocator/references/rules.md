# Portfolio Allocation Rules

## Core Controls

- `max_positions_large_cap`
- `max_positions_high_beta`
- `max_new_entries_per_day_high_beta`
- `max_theme_overlap`
- `earnings_blackout_days`
- `max_risk_per_trade_pct`

## Allocation Outputs

- `full`
  - 制約に余裕があり、bucket と theme の偏りも小さい
- `half`
  - 採用余地はあるが、heat がやや高い
- `starter_only`
  - 試し玉レベル。追加入りは後続確認前提
- `block`
  - 今回は採用しない

## Heat Heuristics

- `calm`
  - 枠に余裕があり、テーマ分散もある
- `elevated`
  - どちらかの bucket やテーマに偏り始めている
- `hot`
  - high-beta 過密、同テーマ集中、イベント接近が重なっている

## Decision Discipline

- 良い setup でも portfolio 制約で止める
- 迷う場合は `defer`
- 個別 skill の強気判定より全体のドローダウン耐性を優先する

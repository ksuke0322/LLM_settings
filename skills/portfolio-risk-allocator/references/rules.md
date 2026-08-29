# Portfolio Allocation Rules

## Core Controls

- `max_positions_large_cap`
- `max_positions_high_beta`
- `max_new_entries_per_day_high_beta`
- `max_theme_overlap`
- `earnings_blackout_days`
- `max_risk_per_trade_pct`
- `max_position_value_jpy_high_beta`

`earnings_blackout_days` は既存設定との互換性とreadbackのために残すが、これだけで配分を止めたり数量を下げたりする条件には使わない。決算・イベントの `known` `unknown` `fetch_failed` `malformed`、未確認、接近は `event_advisory` として記録する。決算情報だけで `block` や `hot` にせず、実際の配分停止は保有枠、テーマ集中、現金、損失上限などのポートフォリオ制約で判断する。

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
  - high-beta 過密、同テーマ集中、その他のポートフォリオ上の懸念が重なっている。イベント情報だけで `hot` にはしない

## Decision Discipline

- 良い setup でも portfolio 制約で止める
- 迷う場合は `defer`
- 個別 skill の強気判定より全体のドローダウン耐性を優先する

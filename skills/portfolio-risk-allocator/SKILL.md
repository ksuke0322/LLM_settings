---
name: portfolio-risk-allocator
description: 候補のeligibilityとpaper portfolio stateから採用可否と実数量を決める。portfolio制約とrisk sizingだけに使う。
---

# Portfolio Risk Allocator

## 責務

`eligible`候補、paper positions/orders、`portfolio_rules.json`だけを入力にし、次を返す。

- `allocation_status`: `approve | defer | reject`
- `size_jpy`、`quantity`、`risk_jpy`
- `reason_codes`

signalの質を再判定せず、market regimeを独立した拒否ゲートにしない。

## high-beta paper rules

- capital: 1,000,000円
- lot: 10株
- 1銘柄上限: 100,000円
- 1取引risk上限: capitalの0.7%
- 1日新規: 2件まで
- 既存position、pending order、利用可能cashを控除する

数量はrisk上限、金額上限、cash上限の最小値をlot単位で切り下げる。最小lot未満は`reject`。`approve`は実数量を必須とし、downstreamで必ず`pending_order`を作る。approve後の追加ゲートや黙ったskipは禁止する。

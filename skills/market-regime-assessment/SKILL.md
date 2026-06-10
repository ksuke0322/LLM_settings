---
name: market-regime-assessment
description: "日本株の短期運用に向けて、指数、業種相対強度、為替、金利、商品市況などから market regime を整理し、large_cap と high_beta のどちらに有利な地合いかを前段で判定する。個別銘柄の売買指示ではなく、watchlist と decision skill の前提条件整理に使う。"
---

# Market Regime Assessment

日本株の短期運用に向けて、当日の地合いを `risk_on` `neutral` `risk_off` などの regime で整理する。個別銘柄の採用を決める skill ではなく、screening と decision の前提条件を揃える補助 skill である。

## 基本方針

- 役割は market context の整理であり、個別銘柄の選定を上書きしない。
- 指数、業種相対強度、為替、金利、商品市況、政策テーマを組み合わせて判断する。
- 完全なマクロ分析ではなく、短期運用で監視優先度がどちらへ寄るかを出す。
- large_cap と high_beta のどちらが有利かを雑でもよいので明示する。
- 過去 run の regime メモや stale snapshot を current regime として流用しない。参照 date が古い補助情報しかない場合は、その情報を current 判定に使わず停止または current data で再確認する。

## 入力

- 指定がなければ日本株短期運用全体の地合い判定として扱う。
- 必要なら以下を補助入力として使ってよい。
  - TOPIX、日経平均、グロース市場指数
  - 業種指数または代表銘柄
  - USD/JPY
  - 日本金利、米金利
  - 原油、銅などの主要コモディティ

## 出力契約

- `regime`
- `favored_buckets`
- `avoid_buckets`
- `sector_leaders`
- `macro_risks`
- `execution_caution`

## 手順

1. 主要指数の方向感を確認する。
2. 業種 relative strength を確認する。
3. 為替、金利、資源価格の向きを確認する。
4. `risk_on` `neutral` `risk_off` のどれかに寄せる。
5. `large_cap` と `high_beta` の優先度を決める。
6. sector leaders と macro risks を短くまとめる。
7. 後段 skill が参照しやすい形で出力する。

## 判断ルール

- 単一指標だけで regime を決めない。
- グロース指数だけ強く TOPIX が弱い場合は `high_beta` 優位寄りに寄せてよい。
- 金利上昇と円安が同時進行する場合、金融や外需の large-cap に追い風になりやすい。
- 指数横ばいでもテーマ性と業種 leadership が明確なら `neutral but selective` としてよい。
- 判断が割れる場合は `neutral` に留め、過剰な断定を避ける。

## 出力形式

```md
market regime:
- regime: risk_on
- favored_buckets: large_cap, high_beta
- avoid_buckets: defensive_chasing
- sector_leaders: 半導体, 機械, 金融
- macro_risks: 米金利上昇, 円高反転
- execution_caution: high_beta は寄り付きギャップ追随を抑制
```

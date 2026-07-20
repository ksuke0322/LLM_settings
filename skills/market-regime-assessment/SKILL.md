---
name: market-regime-assessment
description: "日本株短期運用の market regime を整理し、large_cap と high_beta の優先度を前段で決めるときに使う。"
---

# Market Regime Assessment

日本株短期運用の地合いを `risk_on` `neutral` `risk_off` などで整理する。個別銘柄の採用を決める skill ではなく、screening と decision の前提条件を揃える補助 skill である。

共通運用は [../stock-shared/references/common-operating-rules.md](../stock-shared/references/common-operating-rules.md) を前提にする。判断軸は [references/framework.md](references/framework.md) を使う。

## 基本方針

- 個別銘柄の売買指示はしない
- favored / avoid は bucket 単位に留める
- stale snapshot や古い regime メモを current 判定へ流用しない

## 入力

- 指定がなければ日本株短期運用全体の地合い判定として扱う
- 補助入力:
  - TOPIX / 日経平均 / グロース市場指数
  - 業種 relative strength
  - USD/JPY
  - 日本金利 / 米金利
  - 原油 / 銅など

## 出力契約

- `regime`
- `favored_buckets`
- `avoid_buckets`
- `sector_leaders`
- `macro_risks`
- `execution_caution`

## 手順

1. 指数方向を確認する。
2. 業種 leadership を確認する。
3. 為替、金利、商品市況の向きを確認する。
4. `risk_on` `neutral` `risk_off` のどれかへ寄せる。
5. `large_cap` と `high_beta` の優先度を決める。
6. sector leaders と macro risks を短くまとめる。

## 判断ルール

- 単一指標だけで regime を決めない
- グロース優位で TOPIX が弱い場合は `high_beta` 優位寄りにしてよい
- 金利上昇と円安が同時進行する場合、金融や外需 large-cap に追い風になりやすい
- 判断が割れる場合は `neutral` に留める

## Breadth Evidence

- breadthは `definition` `universe` `advancers` `decliners` `unchanged` `source_url` `published_at` `fetched_at` `data_completeness` を残す
- 公式市場統計、指数提供者の構造化ページ、対象universeの日足算出の順に使う。Web検索は公式source URLの発見だけに使う
- breadth欠損時は推測せず `data_incomplete=true` として execution caution を強める。producerの候補棚を空にする根拠には使わない

## 出力形式

- 既定は `compact`
- `compact` は bucket 優先度と execution caution を短く返す
- `full` は指数や金利の補助列を追加してよい

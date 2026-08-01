---
name: japan-high-beta-breakout-screening
description: 日本株high-betaの短期候補を発見し、証跡付きwatchlistへ整理する。auto1bのdiscovery、evidence、rankingに限定して使う。
---

# Japan High Beta Breakout Screening

## 責務

`high_beta_watchlist.json`の`active`と`reserve`を、発見根拠と失効条件つきで更新する。売買可否、注文価格、portfolio配分は決めない。

## 探索

- 通常scanは40〜50銘柄を上限にする。
- 十分な質のactive候補が8〜12件集まったら探索を止める。
- reserveは3〜5件までとし、active昇格条件が具体的なものだけ残す。
- theme分散を保ち、同一themeへの偏りを避ける。scoreは順位付けと説明補助でありhard gateにしない。

## 採用根拠

- `official_catalyst`: 公式IR・TDnet等の一次資料を必須とする。
- `technical_only`: IR不在だけで落とさず、流動性、値動き、出来高、位置の4証跡をすべて確認する。欠落時はfail-close。
- reported情報は発見には使えるが、公式確認なしに材料点を加算しない。

thesisは`catalyst_breakout | technical_continuation | pullback | theme_momentum`に正規化する。

## 出力

各候補に`ticker`、`status`、`priority`、`adoption_basis`、`thesis_type`、`first_seen_date`、`monitoring_valid_until`、`invalidation`、evidenceのsource/as_ofを残す。期限切れ・否定された候補は`expired | rejected`へ遷移し、削除で履歴を隠さない。

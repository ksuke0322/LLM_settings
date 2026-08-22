---
name: japan-high-beta-breakout-screening
description: 日本株high-betaの短期候補を発見し、証跡付きwatchlistへ整理する。auto1bのdiscovery、evidence、rankingに限定して使う。
---

# Japan High Beta Breakout Screening

## 責務

`high_beta_watchlist.json`の`active`と`reserve`を、発見根拠と失効条件つきで更新する。売買可否、注文価格、portfolio配分は決めない。

共通のtrend_viewer API契約は `../stock-shared/references/trend-viewer-analysis-contract.md` を参照する。
このskillはauto1bのdiscovery / evidence / ranking consumerであり、trade-v2の観測値をwatchlist証跡へ変換するところまでを責務とする。

## trend_viewer consumer境界

観測値が必要な場合だけ、次の日足endpointを使う。

`GET /stock/{ticker}/analysis?range=recent&schema=trade-v2`

auto1bで利用してよいのは、`feature.chartSummary`と`feature.metrics`の価格・出来高・位置に関する観測値だけである。

- `chartSummary` / `metrics`は、`schemaVersion`、`dataQuality`、`readiness`、`source`、`asOf`、`fetchedAt`、`timezone`、全`reasonCodes`と一緒に保存する。
- `dataQuality != complete`、必須field欠落、`asOf=null`、またはAPI取得不能の場合、その値を確認済みtechnical evidenceへ昇格させず、`technical_evidence_incomplete`または`未確認`として残す。`readiness`は別fieldとして保存し、1bの観測値を執行readyへ昇格させる根拠にはしない。
- null、空配列、欠落バー、古い`asOf`を0、neutral、現在値、休日判定へ推測変換しない。
- `readiness=blocked|unknown`、`feature.trendState`、`feature.indicatorState`、`setup`、`risk`、`eventRisk`はauto1bのentry・RR・注文ゲートへ持ち込まない。`setupType=no_trade`も1bの除外条件にしない。
- `entryZone`、`minimumRR`、stop / target、`confidenceScore`をwatchlist採用のhard gateやentry-ready判定に使わない。これらはauto2bのdecision laneで扱う。
- `intraday-v1`のバー、coverage、日中のgap判定はhigh-beta daily flowの責務であり、auto1bのtechnical evidenceへ混在させない。
- 1bで採用を決める根拠は、公式材料、価格構造、出来高持続、相対強度、流動性、撤退条件の証跡であり、APIのsetup出力ではない。

API証跡には、少なくとも実際のendpointとquery、schema、source、asOf、fetchedAt、dataQuality、readiness、reasonCodesを候補の`technical_evidence`またはsidecarへ紐づける。

`technical_evidence`の4項目は、`distance_from_20d_high_pct`と`volume_ratio_20d`をtrade-v2の`feature.metrics`から優先取得し、`relative_strength_20d_pct`と`average_daily_turnover_yen`は候補銘柄と日経平均ベンチマークの同一as_of時点の日足時系列から導出する。導出定義は「候補20営業日リターン−ベンチマーク20営業日リターン」と「20営業日の終値×出来高の平均」とする。

analysis/chart/benchmarkの取得は各endpointにつき最大2回まで再試行し、`technical_evidence.attempts`、`retry_count`、各source、HTTP失敗理由を残す。再試行後も欠けるfieldは`missing_fields`へ列挙し、0、neutral、現在値で補完しない。4項目が同一as_ofで揃った場合だけ`verification_status=complete`とし、それ以外は`technical_evidence_incomplete`でfail-closeする。

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

## 日次producer

発見・一次資料確認の結果は、まず当日JSTの`market_evidence.json`へ記録する。`adoption_decision="adopted"`にする候補には、`watchlist_candidate`として`priority`、`status`、`thesis_type`、`selection_reason`、`invalidation_hint`、`monitoring_valid_until`を必ず添える。

証跡を検証した後、次のproducerで`high_beta_watchlist.json`を生成する。

```sh
node auto1b_high_beta_producer.js --as-of YYYY-MM-DD
```

producerは当日`market_evidence.json`が`publish_mode="normal"`かつ`evidence_review.status="complete"`でない場合、exit code 2で停止し、既存watchlistを変更しない。この場合は後段へ進めない。

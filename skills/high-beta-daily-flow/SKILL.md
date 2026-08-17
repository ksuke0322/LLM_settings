---
name: high-beta-daily-flow
description: 日本株high-beta paper運用の日次処理を、intraday解決、候補更新、売買判断、配分、注文state更新の順に一本化して実行する。b系の日次automation、単一manifest、fail-close制御に使う。
---

# High Beta Daily Flow

目的は、月次純利益10万円を安定して目指せるか検証可能なpaper運用を、重複ゲートなしで毎営業日一度だけ進めること。実売買は行わない。

## 正本

- 候補: `high_beta_watchlist.json`
- 判断: `high_beta_decisions.json`
- paper state: `paper_high_beta_positions.json`、`paper_high_beta_orders.json`、`paper_high_beta_history.json`
- KPI: `paper_high_beta_metrics.json`
- 配分: `paper_high_beta_allocator_snapshot.json`
- 実行証跡: `outputs/b-daily-run-YYYY-MM-DD.json`
- API共通契約: `stock-shared/references/trend-viewer-analysis-contract.md`

## 実行順序

1. 18:30 snapshotを優先し、既存pending orderとopen positionのfill/exitを先に解決する。
2. `node b_daily_high_beta_pipeline.js --as-of YYYY-MM-DD`を実行する。orchestratorはAuto1b収集器で当日の市場breadth・Yahooランキング40銘柄・Yahoo/Kabutan/Minkabu・TDnet・trade-v2を取得し、`market_evidence.json`を生成して`node validate_market_evidence.mjs`を通す。
3. validator通過後にだけauto1b watchlist、auto2bのlive trade-v2判断、allocator、paper state更新を直列実行する。`approve`は必ず`pending_order`になる。
4. orchestratorが全stageの入力revision、出力revision、reason_codesを単一manifestへ記録する。
5. Auto1bの `ranked → quote_available → evidence_current/evidence_stale → candidate_evidence → adopted → watchlist/reserve → eligible → orders` を当日 `as_of` の `period_funnel` としてmanifestへ保存し、候補別 `block_reason` を `block_reason_counts` へ集計する。過去履歴の約定・決済は `cumulative_funnel` に分離し、当日候補数と混ぜない。

前段が`failed`または`incomplete`なら後段は実行せず、manifestに停止理由を書く。休日・休場日はstateを進めず`market_closed`を記録する。

## trend_viewer API / quality gate

日次flowは、候補・日付単位で次の2 endpointを使い、レスポンスの品質をmanifestへ保存する。

- 日中足: `GET /stock/{ticker}/intraday?date=YYYY-MM-DD&interval=5m`。必要な検証用途だけ`interval=1m`を使う。
- 日足短期判断: `GET /stock/{ticker}/analysis?range=recent&schema=trade-v2`。

共通のフィールド定義は`stock-shared/references/trend-viewer-analysis-contract.md`を正本とする。

### intradayの解決

- `date`は`as_of`のJST暦日をそのまま使い、UTC日付へ変換しない。`timezone=Asia/Tokyo`を必須証跡とする。
- `dataQuality`、`readiness`、`reasonCodes`、`asOf`、`fetchedAt`、`coverage`（`expectedBarCount`、`returnedBarCount`、`missingBarCount`、`gapIntervals`、`missingOhlcBarCount`）を保存する。
- `dataQuality != complete`、`readiness != ready`、欠落バー、gap、OHLC欠落、またはcoverageの整合性不成立は、当日candidateを`intraday_incomplete`としてfail-closeする。後段のeligible・allocator・paper orderへ進めない。
- `no_data`、`unknown`、空の`bars`、`expectedBarCount=null`を休日・休場と推測しない。市場カレンダーまたは明示された市場状態が確認できた場合だけ`market_closed`としてstate no-opにする。

### trade-v2の判断

- `schemaVersion=trade-v2`、`dataQuality=complete`、`readiness=ready`、必須field、`asOf`、`reasonCodes`、provenanceが揃う候補だけを判断へ渡す。
- `feature.trendState`の`regime`、`direction`、`strength`、`persistence`、`confirmation`、`reasonCodes`を正本とする。`indicatorState`の多数決や単一指標でtrendを上書きしない。
- `regime=range|transition`、confirmation未成立、persistence不足、direction/strength unknownは、短期entryの根拠にしない。
- `feature.eventRisk.eventRiskLevel=unknown`、`hasUpcomingEvent=true`、または`high`は、イベントなしと補完せず`event_risk_blocked`としてeligible・paper orderを止める。
- `confidenceScore`は`confidenceSemantics=qualitative`の定性的証拠強度であり、確率・勝率として扱わない。

### manifestのAPI証跡

候補またはstage recordに、少なくとも次を保持する。

- `endpoint`、query（`schema`、`range`、`date`、`interval`）、`schemaVersion`
- `source`、`asOf`、`fetchedAt`、`timezone`
- `dataQuality`、`readiness`、全`reasonCodes`
- intradayの`coverage`
- `trendState`の要約、`eventRisk`の要約、consumer gateの`block_reason`

API取得成功だけではstage成功としない。品質、coverage、event、trendのgateが通った場合だけ次段へ進め、失敗・未完了・確認不能は推測で補完しない。

## 単一eligibility契約

```json
{
  "trade_state": "eligible",
  "reason_codes": [],
  "valid_until": "YYYY-MM-DD",
  "order_plan": {
    "limit_price": 7000,
    "stop_price": 6650,
    "target_price": 7700
  },
  "trigger_condition": null
}
```

`needs_open_retest`は別ゲートではなく`trigger_condition=open_retest`としてpending orderに保持する。`auto4_buy_allowed`、`execution_ready`、`manual_execution_ready`は生成しない。

## paper sizing

- `paper_capital_jpy=1,000,000`
- `paper_lot_size=10`
- `max_position_value_jpy=100,000`
- `max_risk_per_trade_pct=0.7`
- `max_new_entries_per_day=2`
- fill/exitはslippageと`paper_transaction_cost_bps_high_beta`を反映する。現行0bpsはpaper zero-fee仮定として明示する
- 新しくpaper orderまたはhistory recordを生成するときは、同一runで参照した`rule_version`、`rules_source`、`max_position_value_jpy`、`paper_lot_size`をrecord単位に保存する。これらが取得できない場合は、推測で補完せず`legacy_rule_unconfirmed`としてfail-closeし、現行ルール準拠の成功例として扱わない
- 既存履歴にrule provenanceがない場合は`legacy_risk_sizing_reconstruction.mjs`で観測notionalだけを再構成する。現行`max_position_value_jpy`を過去取引へ遡及適用してstateや判断を変更してはならない

実資金への移行は対象外。証券会社の単元未満株の注文・手数料・約定モデルが確定するまでpaper専用とする。

## KPI

`paper_high_beta_metrics.json`だけを正本とし、月次純実現損益、10万円達成率、直近3か月中央値、直近4か月達成比率、投下資本利益率、最大ドローダウン、期待値、profit factor、funnel、block reason件数を更新する。月次サンプルが4か月未満なら `sample_status=insufficient_sample` とし、中央値・達成比率・安定達成判定を安定性根拠に使わない。`period_metrics` と `cumulative_metrics` を分離して記録する。

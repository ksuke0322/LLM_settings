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
- run品質時系列: `outputs/b-daily-quality-history.json`
- 日次地合いcontext: `market_regime_snapshot.json`
- 見送り候補の事後観測: `opportunity_shadow_ledger.json`
- 観測入力（任意、caller-supplied dated observations）: `shadow_observations.json`
- API共通契約: `stock-shared/references/trend-viewer-analysis-contract.md`

## 実行順序

0. deployment preflightとして、`b_daily_high_beta_pipeline.js`、`verify_b_daily_run.mjs`、`record_b_daily_quality.mjs`、`b_daily_quality.js`、`opportunity_shadow_ledger.js`、`market_regime_snapshot.js`、`holdings_governance.json`の存在、構文、新manifest契約（`run_key`、`input_as_of`、`publish_scope`、`duplicate_guard`）を読み取り専用で確認する。1つでも欠ける場合は`IMPLEMENTATION_NOT_DEPLOYED`として停止し、pipeline・state・manifest・quality history・gitを変更しない。旧形式4-stage manifestを新品質runへ加算しない。
1. 18:30 snapshotを優先し、既存pending orderとopen positionのfill/exitを先に解決する。
2. `node b_daily_high_beta_pipeline.js --as-of YYYY-MM-DD`を実行する。orchestratorはAuto1b収集器で当日の市場breadth・Yahooランキング40銘柄・Yahoo/Kabutan/Minkabu・TDnet・trade-v2を取得し、`market_evidence.json`を生成して`node validate_market_evidence.mjs`を通す。
3. market evidenceの成否にかかわらず`daily_market_regime_snapshot`を生成し、同一`as_of`のbreadthだけをcurrent contextへ採用する。`market_regime_snapshot.json`の`data_status`、各axisのstate、`reason_codes`、出力revisionをmanifestへ保存する。
4. snapshotとvalidatorが通過した場合だけauto1b watchlist、auto2bのlive trade-v2判断、allocator、paper state更新を直列実行する。`approve`は必ず`pending_order`になる。
5. orchestratorが全stageの入力revision、出力revision、reason_codesを単一manifestへ記録する。
6. auto2bの後、paper state更新前にread-onlyの`shadow_observations.json`を生成し、その観測だけで`opportunity_shadow_ledger`を更新する。screened、candidate evidence、watch、reserve、blockedをpaper stateと別sidecarへ記録する。`opportunity_id`、source manifest、candidate as_of、1/3/5/10営業日窓、block理由を必須にし、注文・ポジションstateへの参照を持たせない。観測source失敗、基準価格欠落、観測バー不足は候補単位で`incomplete`とし、paper stateを更新しない。
7. Auto1bの `ranked → quote_available → evidence_current/evidence_stale → candidate_evidence → adopted → watchlist/reserve → eligible → orders` を当日 `as_of` の `period_funnel` としてmanifestへ保存し、`adopted`（候補棚採用）と`execution_blocked`（実行不可）を分離する。`adoption_block_reason_counts`と`execution_block_reason_counts`を候補別に集計し、過去履歴の約定・決済は `cumulative_funnel` に分離して当日候補数と混ぜない。`adopted`はeligibleやpaper注文を意味しない。
8. manifestの`run_key=b-daily-YYYY-MM-DD`、`input_as_of`、`publish_scope`、`duplicate_guard`を検証する。同じas_ofのcompleted manifestが既にあれば、pipelineを再実行せず`duplicate_skipped`として終了する。
9. runnerと`verify_b_daily_run.mjs`の後に`node record_b_daily_quality.mjs --as-of YYYY-MM-DD`を実行し、stage status、verifier valid、input freshness、retry、technical/event/regime品質、候補単位block理由を`outputs/b-daily-quality-history.json`へ追加する。同じrun_keyの追加は拒否する。
10. quality historyへの追加後、今回の`as_of`と`run_key`に一致する最新entryを再読込し、`daily_check`を日次運用点検として通知する。`passed`は正常、`market_closed`は明示された休場、`attention_required`は運用異常として扱い、`reason_codes`と`monitoring_points`を併記する。

## 日次運用点検

- 毎回の実行で、quality historyの最新entryが今回のrunと一致すること、`daily_check.status`、verifier、manifest、stage完了、input freshness、safety、consumer alignment、候補品質をreadbackする。これは追加のpipeline実行やstate変更を伴わない。
- `daily_check`がない、quality historyが欠落・不正、または最新entryの`as_of`/`run_key`が今回と一致しない場合は`DAILY_CHECK: CONFIRMATION_UNAVAILABLE`として通知し、正常・休場・異常を推測しない。
- `daily_check.status=passed`は`DAILY_CHECK: PASSED`、`market_closed`は`DAILY_CHECK: MARKET_CLOSED`、`attention_required`は`DAILY_CHECK: ATTENTION_REQUIRED`として、対象日・run key・reason codesを出力する。
- `technical/event`の候補品質不足やregimeのpartialは、運用異常と混同せず`monitoring_points`と`block_reason_counts`に残す。candidateのblockを理由にgateを緩和しない。
- 5営業日・10営業日の確認は、日次点検に加えて行う深掘りレビューであり、削除しない。quality historyで5回の有効run受入れと10回cadence判定を分離し、どちらかが不足する場合は`incomplete`または`observation_required`として記録する。fixtureや過去runの再構成だけで運用受入れ完了としない。

前段が`failed`または`incomplete`なら後段は実行せず、manifestに停止理由を書く。休日・休場日はstateを進めず`market_closed`を記録する。

## 実行頻度の判断

- 品質履歴が10 run未満の間は`current_cadence`を維持し、paused中の単独high-beta automationを再開しない。
- 10 runすべてでverifier valid、同日input、duplicate publishなし、lane混在なし、stale state消費なし、upstream incomplete後のpaper mutationなしを確認できたときだけ、追加のread-only shadow passを候補にする。
- 条件未達時は`keep_current_cadence`として記録し、分析回数・探索銘柄数・gateを自動で緩和しない。

## Opportunity shadow ledger

- ledgerは見送りの妥当性を測る観測専用であり、`paper_high_beta_orders.json`、`paper_high_beta_positions.json`、`paper_high_beta_history.json`、実保有stateを変更しない。
- 価格観測は`candidate_as_of`より後の日付を持つcaller-supplied observationだけを使う。過去日付、重複日付、不正値は無視または診断へ残し、forward-fill・proxy・推測で埋めない。
- 基準価格がない候補、観測バーが不足した候補は`incomplete`へ遷移し、`entry_reference_price_unavailable`または`insufficient_observation_bars`を残す。
- `missed_gain_pct`は観測終値returnの最大正値、`avoided_loss_pct`は観測MAEの最大負値の絶対値、`net_outcome_pct`は両者の差としてblock理由別に集計する。MFE/MAEやvolume/regimeが欠けた場合はnullのままにする。

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

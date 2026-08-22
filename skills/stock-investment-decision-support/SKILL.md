---
name: stock-investment-decision-support
description: 未保有の日本株候補について、trade-v2と公式証跡を用いて短期signalと注文計画を作る。auto2a/auto2bの判断laneに使う。
---

# Stock Investment Decision Support

## 責務

watchlistのactive候補だけを評価し、`signal_status`と単一`eligibility`を出す。候補発見、portfolio配分、paper約定は行わない。

## API入力契約

日足の短期分析は、次の`trade-v2` endpointを候補ごとに取得する。

`GET /stock/{ticker}/analysis?range=recent&schema=trade-v2`

共通フィールドの意味とfail-close条件は、`stock-shared/references/trend-viewer-analysis-contract.md`を正本とする。
`schema`を省略したlegacy `1.0`を、短期setupの入力へ読み替えない。

最低限、次をstate / sidecarへ保存する。

- `schemaVersion`、`source`、`asOf`、`fetchedAt`、`timezone`
- `dataQuality`、`readiness`、APIから返された全`reasonCodes`
- `feature.trendState`の`direction`、`strength`、`persistence`、`confirmation`、`regime`、`reasonCodes`
- `feature.eventRisk`の`eventRiskLevel`、`hasUpcomingEvent`、`daysToEarnings`
- 上流の`earnings_event_evidence`の`source_kind`、`source_url`、`published_at`、`fetched_at`、`time_precision`、`verification_status`、`earnings_date`、`failure_reason`
- setupとriskの入力に使ったrevisionまたはrun reference
- `market_regime_snapshot.json`の`snapshot_id`、`as_of`、`data_status`、`regime`をまとめた`regime_snapshot_ref`

## 判定

1. watchlistの期限とinvalidationを確認する。
2. `market_regime_snapshot.json`を読み、consumerの`regime_snapshot_ref`を同日`snapshot_id`へ固定する。snapshotがstale・unavailable・不一致の場合、regimeを推測せずconsumerをfail-closedする。
3. `trade-v2`の品質エンベロープを検証する。`schemaVersion=trade-v2`、`dataQuality=complete`、`readiness=ready`、必須フィールド、`asOf`、`reasonCodes`が揃わない候補は、価格やsetupを推測せず`blocked`にする。
4. `feature.trendState`をトレンドの正本として確認する。`regime`、`confirmation.confirmed`、`persistence`、`strength`を優先し、`indicatorState`の過半数や単一指標だけでtrendを再判定しない。`range`、`transition`、`direction|strength=unknown`、確認未成立は新規entryの根拠にしない。
5. `feature.eventRisk`を確認する。`eventRiskLevel=unknown`、`hasUpcomingEvent=true`、`eventRiskLevel=high`は、イベントなしと補完せず候補を`blocked`にする。
6. `earnings_event_evidence`を確認する。`verification_status=official_verified`、`time_precision=date`、ISO日付、`earnings_date>=asOf`を満たさない候補は、候補棚に残せても実行可能とは扱わない。`month_window`、`unverified`、過去日付、欠落は推測せず候補単位で`blocked`にする。
7. `confidenceScore`は`confidenceSemantics=qualitative`の定性的な証拠合成値として扱う。確率、勝率、期待収益率へ変換しない。`evidenceGroups`に`contradictory`、`partial`、`insufficient`があれば、reason codeとともに不確実性を残す。
8. 公式証跡、setup、risk、品質・イベント・トレンドのゲートが揃い、limit/stop/targetが検証できる場合だけ`trade_state=eligible`にする。
9. 取得失敗・欠落・staleはその候補だけ`blocked`にし、APIの全`reasonCodes`とconsumer側のblock reasonを残す。run全体を止めるのは、必要候補の大半を評価できず判断集合が信頼できない場合だけ。

### 固定block reason

APIの`reasonCodes`とは別に、decision側では次の意味を安定したreason codeで残す。

- `ANALYSIS_SCHEMA_UNEXPECTED`
- `ANALYSIS_DATA_QUALITY_INSUFFICIENT`
- `ANALYSIS_READINESS_BLOCKED`
- `ANALYSIS_AS_OF_MISSING`
- `TREND_STATE_UNCONFIRMED`
- `TREND_STATE_UNKNOWN`
- `TREND_REGIME_NON_TREND`
- `EVENT_RISK_UNKNOWN`
- `EVENT_RISK_HIGH_OR_UPCOMING`
- `EVENT_EVIDENCE_UNVERIFIED`
- `EVENT_DATE_NOT_EXACT`
- `EVENT_EVIDENCE_STALE`
- `EVENT_EVIDENCE_MISSING`
- `ANALYSIS_REQUIRED_FIELD_MISSING`

同じ候補の複数理由は削らず、API由来とconsumer由来を区別して保存する。

## 出力契約

```json
{
  "ticker": "6525",
  "signal_status": "actionable",
  "eligibility": {
    "trade_state": "eligible",
    "reason_codes": [],
    "valid_until": "YYYY-MM-DD",
    "order_plan": {
      "limit_price": 7000,
      "stop_price": 6650,
      "target_price": 7700
    },
    "trigger_condition": null
  },
  "event_risk": {
    "api_state": "known_safe",
    "evidence_state": "official_exact",
    "api_reason_codes": [],
    "evidence_reason_codes": [],
    "reason_codes": [],
    "execution_ready": true
  },
  "latest_close": 7000,
  "latest_close_provenance": {
    "status": "present",
    "field_path": "feature.chartSummary.latestClose",
    "source": "trade-v2 recent analysis",
    "as_of": "YYYY-MM-DD",
    "fetched_at": "YYYY-MM-DDTHH:MM:SS+09:00",
    "input_reference": "GET /stock/{ticker}/analysis?range=recent&schema=trade-v2"
  },
  "price_reason_codes": [],
  "outcome_trace": {
    "execution_status": "not_submitted",
    "not_filled_reason": "auto2a_decision_only",
    "decision_reference_price": {
      "value": 7000,
      "as_of": "YYYY-MM-DD",
      "source": "trade-v2 recent analysis"
    },
    "next_1_3_business_days": [
      {
        "date": "YYYY-MM-DD",
            "limit_status": "not_observed",
            "stop_status": "not_observed",
            "target_status": "not_observed",
            "first_hit_type": "none",
            "first_hit_date": null,
        "first_hit_price": null,
        "observation_status": "not_observed"
      }
    ],
    "signal_expiry_reason": "YYYY-MM-DD valid_until reached without fill"
  },
  "evidence_refs": []
}
```

open確認が必要なら`trigger_condition=open_retest`とする。`entry_ready`、`auto4_buy_allowed`、`execution_ready`、`execution_window`を重ねて生成しない。説明不能なfree textだけでblockingせず、安定した`reason_codes`を使う。

`trade_state=eligible` の候補は、判定時点の `decision_reference_price` と、次の1〜3営業日の各日について limit / stop / target の到達状態、最初に到達した種別・日・価格、`observation_status`、`signal_expiry_reason` を必ず `outcome_trace` に残す。auto2aは注文を送信しないため、独立した約定証跡がない限り `execution_status=not_submitted`、`not_filled_reason=auto2a_decision_only` とする。価格や到達結果を取得できない場合は `unknown` または `not_observed` とし、推測で埋めない。`blocked` / `no_trade` 候補は `outcome_trace=null` とし、`reason_codes` のみで説明する。

各候補には `latest_close` と `latest_close_provenance`（`status`、`field_path`、`source`、`as_of`、`fetched_at`、`input_reference`）および `price_reason_codes` を必ず保存する。価格が欠落した場合は `latest_close=null`、provenanceの`status=missing`、`field_path=null` とし、`TRADE_V2_UNAVAILABLE`、`PRICE_FIELD_MISSING`、`PRICE_FIELD_INVALID` のいずれかを残す。`EVENT_RISK_UNKNOWN` と `EVENT_EVIDENCE_MISSING` も固定reason codeとして保持する。HTTP 200や`dataQuality=complete`だけで価格取得成功とは扱わない。eligible候補の`decision_reference_price`のvalue・as_of・sourceは、同じ候補のprice provenanceと一致させる。

`outcome_trace.next_1_3_business_days` は決定日より後の1〜3営業日を昇順・重複なしで保存し、`first_hit_type` は各日のreach statusと一致させる。複数の到達順序が観測できない場合は`unknown`とし、未観測値を推測しない。

sidecar metadataには `run_status`（`completed` / `not_run` / `incomplete` / `failed`）と `no_run_reason` を固定 field として残す。`completed` は `no_run_reason=null`、それ以外は `market_closed`、`holiday`、`automation_not_scheduled`、`upstream_incomplete`、`reason_unconfirmed` のいずれかを必須とし、候補レコードを出さない。非稼働理由が確認できない場合も推測せず `reason_unconfirmed` と記録する。正常公開前に `/Users/sawairikeisuke/Documents/stock-analysis/validate_auto2a_decision.mjs` を実行し、必須 trace または no-run理由が欠ける場合は fail-close する。

auto2a/auto2bのlane差は入力watchlistとprofileのみ。high-betaでは`high_beta_watchlist.json`から`high_beta_decisions.json`を更新する。

`trade_state=eligible`はAPI取得成功の別名ではない。`dataQuality`、`readiness`、trend、API event risk、候補のexactな公式event evidence、setup、risk、portfolio前段の条件がすべて満たされた場合だけ付与し、どれか一つでも確認不能なら`blocked`を維持する。eventの候補証跡は`event_risk.evidence_state`、API由来の状態は`event_risk.api_state`へ分離して保存する。

# Decision Support Output Contract

## Compact

- 単一企業:
  - `対象企業 / 銘柄コード / 状態 / 短期判断`
  - `setupScore / confidence`
  - `entry_quality / entry_style / execution_window`
  - `エントリーゾーン / 利確目安 / 損切り目安 / 無効化条件`
  - `リスク警告 / stale_reason / portfolio gate 警告`
- 複数企業:
  - 各企業 1 行サマリー
  - `分類サマリー`
  - `取得失敗`

## trend_viewer input contract

auto2a / auto2bの短期判断は、候補ごとに次のendpointを取得した証跡を持つ。

`GET /stock/{ticker}/analysis?range=recent&schema=trade-v2`

共通のフィールド定義は`stock-shared/references/trend-viewer-analysis-contract.md`を参照する。
出力には、少なくとも次の入力証跡を保持する。

| 領域 | 固定field | 判定 |
| --- | --- | --- |
| provenance | `analysis_schema` `analysis_source` `analysis_as_of` `analysis_fetched_at` `analysis_timezone` | endpoint、schema、基準日、取得時刻を再現できること |
| quality | `analysis_data_quality` `analysis_readiness` `analysis_reason_codes` | `complete`かつ`ready`以外はeligibleにしない |
| trend | `trend_regime` `trend_direction` `trend_strength` `trend_persistence` `trend_confirmation` `trend_reason_codes` | `regime`とconfirmation/persistenceを正本とし、個別指標の多数決で上書きしない |
| event | `event_risk_level` `event_has_upcoming_event` `event_days_to_earnings` | `unknown`、upcoming、highはentry・追加・paper注文をblockする |
| event evidence | `event_evidence_state` `event_evidence_reason_codes` `event_evidence_source` `event_evidence_as_of` | `official_exact`以外は候補棚に残せてもeligibleにしない |
| consumer gate | `analysis_contract_status` `analysis_block_reason_codes` | `eligible`または`blocked`を機械判定できること |

`analysis_reason_codes`と`trend_reason_codes`はAPIの値を保持し、`analysis_block_reason_codes`にはdecision側の固定block reasonを別に記録する。
`confidenceScore`は`confidenceSemantics=qualitative`を保存し、確率や勝率として出力しない。

### consumer gate

`analysis_contract_status=eligible`を許可する条件は、次の全条件である。

- `schemaVersion=trade-v2`
- `dataQuality=complete`かつ`readiness=ready`
- `asOf`、必須field、reason code、provenanceが揃っている
- `trendState.regime`がsetupと整合し、`confirmation.confirmed=true`、必要な`persistence`、利用可能な`strength`を満たす
- `eventRiskLevel`が既知で、upcoming/highではない
- `event_evidence_state=official_exact`で、exact ISO dateが判定時点以降である
- 公式証跡、setup、risk、limit/stop/targetが揃っている

それ以外は`analysis_contract_status=blocked`とし、欠落・unknown・partialを別値や推測値で補完しない。

## Full

### Table 1

```md
| 対象企業 | 銘柄コード | 状態 | entry_quality | entry_style | execution_window | 短期判断 | 相場レジーム | セットアップ種別 | setupScore / confidence | エントリーゾーン | 利確の目安 | 損切り・撤退の目安 | 時間切れ条件 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

### Table 2

```md
| 対象企業 | 現状認識 | 上流 thesis | 強気材料 | 弱気材料 | 無効化条件 | position_risk_note | stale_reason | 見送る条件 | リスク警告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

## State / Sidecar

- `selection_reason` `thesis_type` `catalyst` などの長文は chat へ全文展開せず、state / sidecar へ残す
- `compact` では 1 行要約へ圧縮する
- `auto2a` sidecar では `decision_date` `watchlist_as_of` `age_days` `freshness_rule` `classification_summary` `fetch_failures` `earnings_blackout_check` `lane_discipline` `contract_breach` `run_status` `no_run_reason` を固定 field として残す
- `auto2a` の `eligible` 候補では `outcome_trace` を固定 field として残す。`execution_status` `not_filled_reason`、`decision_reference_price`（`value` `as_of` `source`）、`next_1_3_business_days`（各日の `date`、`limit_status`、`stop_status`、`target_status`、`first_hit_type`、`first_hit_date`、`first_hit_price`、`observation_status`）、`signal_expiry_reason` を含める。auto2aは注文を送信しないため、約定証跡がない場合は `execution_status=not_submitted`、`not_filled_reason=auto2a_decision_only` とする
- 全候補で `latest_close`、`latest_close_provenance`（`status=present|missing`、`field_path`、`source`、`as_of`、`fetched_at`、`input_reference`）、`price_reason_codes` を固定 field として残す。`source` は `trade-v2 recent analysis` に固定し、価格欠落時は `latest_close=null`、`status=missing`、`field_path=null` とする。reason codeは `TRADE_V2_UNAVAILABLE`、`PRICE_FIELD_MISSING`、`PRICE_FIELD_INVALID`、`EVENT_RISK_UNKNOWN`、`EVENT_EVIDENCE_MISSING` を使用する
- eligible候補の`decision_reference_price`の`value`、`as_of`、`source`は、同一recordの`latest_close`およびprice provenanceと一致させる。trace観測日はdecision dateより後の1〜3営業日、昇順、重複なしとし、reach statusと`first_hit_type`が矛盾する場合は公開しない
- `outcome_trace` の未取得値は `unknown` / `not_observed` とし、価格・到達日を推測しない。`blocked` / `no_trade` は `outcome_trace=null` とする
- `run_status=completed` の `no_run_reason` は `null` とし、`not_run` / `incomplete` / `failed` では `market_closed` `holiday` `automation_not_scheduled` `upstream_incomplete` `reason_unconfirmed` の固定コードを必須とする。非稼働理由を確認できないときは `reason_unconfirmed` と記録し、候補を推測生成しない
- `auto2b` sidecar では `decision_date` `audit_date` `snapshot_as_of` `same_day_freshness_ok` `stale_day` `entry_ready_tickers` `watch_tickers` `entry_style_summary` `execution_window_summary` `monitoring_valid_until` `publish_mode` `contract_breach` を固定 field として残す
- `auto2b` の `publish_mode` は `normal` `stale_day_noop` `hard_stop` の 3 値に正規化する
- `auto2b` sidecar では `stale_day` `same_day_freshness_ok` と、`auto4_buy_allowed=false` 候補の block reason を残す
- `auto2b` sidecar / report では、`needs_open_retest` を block ではなく条件付き許可として扱う場合、`auto4_execution_caution` または Notes 文面で残す
- `auto2b` sidecar では `input_watchlist_count` `reserve_count` `reserve_tickers` `reserve_handling` `source_lifecycle_summary` `fetch_failures` を固定 field として残す
- `auto2b` decision itemでは `event_risk` を固定fieldとして残し、`api_state`、`evidence_state`、`api_reason_codes`、`evidence_reason_codes`、統合`reason_codes`、`execution_ready`を含める
- `event_evidence_state` は `official_exact`、`unverified`、`stale`、`missing`、`invalid` のいずれかとし、月・上旬・中旬などの幅表現をexact dateへ変換しない
- `reserve_handling` は `producer_managed_not_evaluated` に固定し、reserve は decision table と API fetch 対象に含めない
- high_beta decision item は `source_first_seen_date` `source_stage_entered_date` `source_shelf_age_trading_days` `source_transition_reason_code` を持つ

# Position Review Output Contract

## Compact

- 単一銘柄:
  - `対象企業 / 銘柄コード / 状態 / 保有判断 / 追加投資判断`
  - `review_profile`
  - `最新終値 / 平均取得単価 / 損益率`
  - `利確・縮小目安 / 撤退・防衛目安 / 追加条件`
  - `リスク警告`
- 複数銘柄:
  - 各銘柄 1 行サマリー
  - `保有判断サマリー`
  - `追加投資サマリー`
  - `取得失敗`
  - summary 内の銘柄列挙は `対象企業` 名を既定とし、必要な場合だけ `対象企業 (銘柄コード)` を使う

## trend_viewer input / advisory contract

短期reviewの入力は、保有銘柄ごとに次のendpointを取得したものとする。

`GET /stock/{ticker}/analysis?range=recent&schema=trade-v2`

共通フィールドの意味は`stock-shared/references/trend-viewer-analysis-contract.md`を参照する。

| 領域 | 固定field | 用途 |
| --- | --- | --- |
| provenance | `analysis_endpoint` `analysis_schema` `analysis_source` `analysis_as_of` `analysis_fetched_at` `analysis_timezone` | どの時点・schemaの分析かを再現する |
| quality | `analysis_data_quality` `analysis_readiness` `analysis_reason_codes` | 品質不足を`advisory_only` / `確認不能`として表示する。ただし決算理由だけのraw停止はconsumerの追加投資判定を止めない |
| trend | `trend_regime` `trend_direction` `trend_strength` `trend_persistence` `trend_confirmation` `trend_reason_codes` | `trendState`を正本にし、個別indicatorの多数決で上書きしない |
| event | `event_risk_level` `event_has_upcoming_event` `event_days_to_earnings` `event_advisory` | unknown/upcoming/highは未確認・注意情報として表示し、決算情報だけでは追加をブロックしない |
| review | `short_term_advisory` `analysis_quality_status` `review_status` `analysis_warning_codes` | 短期判断と長期保有ガバナンスを分離する |

### status / gate

- `analysis_quality_status=complete`は、`schemaVersion=trade-v2`、`dataQuality=complete`、`readiness=ready`、必須field、`asOf`、provenanceが揃う場合だけ付与する。
- 品質不足、`trendState`の確認不能は、`review_status=advisory_only`または`blocked`とし、追加・paper注文・自動執行を許可しない。ただし決算理由だけによるrawの品質停止は、`event_advisory`へ分けて追加投資のconsumer判定を続ける。`eventRiskLevel=unknown`、upcoming/highは注意情報として記録するが、決算情報だけでreviewを止めない。
- `eventRiskLevel=unknown`はイベントなしと表示せず、`analysis_warning_codes`に`EVENT_RISK_UNKNOWN`を残す。
- `trend_regime=range|transition`、confirmation未成立、persistence不足は短期advisoryの不確実性であり、保有継続や自動売却の根拠へ直結させない。
- `short_term_advisory`の`hold` `trim` `defend` `exit`は保有レビューの提案ラベルで、長期4項目やユーザー操作を上書きしない。

## Full

### Table 1

```md
| 対象企業 | 銘柄コード | 状態 | 保有判断 | 追加投資判断 | 推奨アクション量 | 最新終値 / 平均取得単価 | 損益率 | 相場レジーム | セットアップ種別 | 利確・縮小の目安 | 撤退・防衛の目安 | 防衛優先日数 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

### Table 2

```md
| 対象企業 | 現状認識 | 保有継続の根拠 | 一部利確を検討する条件 | 追加を見送る理由 | 追加を検討できる条件 | 撤退を急ぐ条件 | R倍数文脈 | peak_to_current_drawdown_note | リスク警告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

## State / Sidecar

- 長い保有継続理由、R倍数文脈、drawdown 補足は state / sidecar を優先する
- `compact` では行動判断に必要な要約だけを返す
- `auto3` では `as_of` `age_days` `execution_trace_incomplete` を sidecar / report から再確認できるように残す
- 予定実行日のreport metadataには `run_status`（`completed` / `not_run` / `incomplete` / `failed`）と `no_run_reason` を固定fieldとして残す。`completed` は`no_run_reason=null`、それ以外は`market_closed`、`holiday`、`automation_not_scheduled`、`upstream_incomplete`、`reason_unconfirmed`のいずれかを必須とし、`not_run`では候補・holding recordを生成しない。欠落日を成功や休日として推測しない
- 各 holding は短期 `short_term_advisory`（`decision` と state / note 参照）と分離した `long_hold_rationale`、`thesis_invalidation_or_review_trigger`、`next_review_date`、`trim_conditions`、`long_hold_governance_status` を持つ。短期 advisory を長期保有理由へ転用しない
- `long_hold_governance_status` は `complete` または `needs_user_confirmation`。未入力を短期 `thesis` から推測せず、`needs_user_confirmation` のまま記録する
- `trim_conditions` は `status=none` または `status=defined`（`trigger` `percentage` `rationale`）を必須とし、未確認時は `status=needs_user_confirmation` とする。`needs_user_confirmation` の場合は trigger / percentage / rationale を null にする
- 連続 `exit` 銘柄には `未対応` `対応済み` `保有継続理由あり` の 1 行 trace を残す
- `current_holdings.json` では各 holding の `last_user_action` `last_action_date` `last_review_decision` `decision_reason_note` を execution-aware field として優先する
- reversal がある銘柄は sidecar でも `reversal` と切替理由を 1 行で残し、state の `decision_reason_note` と対応づける
- `short_term_advisory`には、短期trade-v2のsetup/risk根拠、品質・event警告、trendStateの要約を保持する。`long_hold_rationale`などの長期項目へ短期advisoryをコピーしない
- 新規の`short_term_advisory.event_advisory`は`policy=advisory_only`、`blocking=false`、状態、rawの取得結果、`reason_codes`、`source`を持つ。`additional_investment_decision`を必ず記録し、決算reason codeは`additional_investment_reason_codes`へ入れない

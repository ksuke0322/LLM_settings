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
- `auto2a` sidecar では `decision_date` `watchlist_as_of` `age_days` `freshness_rule` `classification_summary` `fetch_failures` `earnings_blackout_check` `lane_discipline` `contract_breach` を固定 field として残す
- `auto2b` sidecar では `decision_date` `audit_date` `snapshot_as_of` `same_day_freshness_ok` `stale_day` `entry_ready_tickers` `watch_tickers` `entry_style_summary` `execution_window_summary` `monitoring_valid_until` `publish_mode` `contract_breach` を固定 field として残す
- `auto2b` の `publish_mode` は `normal` `stale_day_noop` `hard_stop` の 3 値に正規化する
- `auto2b` sidecar では `stale_day` `same_day_freshness_ok` と、`auto4_buy_allowed=false` 候補の block reason を残す
- `auto2b` sidecar / report では、`needs_open_retest` を block ではなく条件付き許可として扱う場合、`auto4_execution_caution` または Notes 文面で残す

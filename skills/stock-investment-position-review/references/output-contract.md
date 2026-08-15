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
- 各 holding は短期 `short_term_advisory`（`decision` と state / note 参照）と分離した `long_hold_rationale`、`thesis_invalidation_or_review_trigger`、`next_review_date`、`trim_conditions`、`long_hold_governance_status` を持つ。短期 advisory を長期保有理由へ転用しない
- `long_hold_governance_status` は `complete` または `needs_user_confirmation`。未入力を短期 `thesis` から推測せず、`needs_user_confirmation` のまま記録する
- `trim_conditions` は `status=none` または `status=defined`（`trigger` `percentage` `rationale`）を必須とし、未確認時は `status=needs_user_confirmation` とする。`needs_user_confirmation` の場合は trigger / percentage / rationale を null にする
- 連続 `exit` 銘柄には `未対応` `対応済み` `保有継続理由あり` の 1 行 trace を残す
- `current_holdings.json` では各 holding の `last_user_action` `last_action_date` `last_review_decision` `decision_reason_note` を execution-aware field として優先する
- reversal がある銘柄は sidecar でも `reversal` と切替理由を 1 行で残し、state の `decision_reason_note` と対応づける

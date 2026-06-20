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

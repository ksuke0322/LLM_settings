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

## 実行順序

1. 18:30 snapshotを優先し、既存pending orderとopen positionのfill/exitを先に解決する。
2. `$japan-high-beta-breakout-screening`でwatchlistを更新する。
3. `$stock-investment-decision-support`でactive候補だけを判断し、単一eligibilityを出す。
4. `$portfolio-risk-allocator`で`approve | defer | reject`と実数量を同時に確定する。
5. `update_paper_high_beta.js`でpaper stateを更新する。`approve`は必ず`pending_order`になる。
6. 全stageの入力revision、出力revision、件数、reason_codesを単一manifestへ記録する。

前段が`failed`または`incomplete`なら後段は実行せず、manifestに停止理由を書く。休日・休場日はstateを進めず`market_closed`を記録する。

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

実資金への移行は対象外。証券会社の単元未満株の注文・手数料・約定モデルが確定するまでpaper専用とする。

## KPI

`paper_high_beta_metrics.json`だけを正本とし、月次純実現損益、10万円達成率、直近3か月中央値、直近4か月達成比率、投下資本利益率、最大ドローダウン、期待値、profit factor、funnel、block reason件数を更新する。

---
name: stock-investment-decision-support
description: 未保有の日本株候補について、trade-v2と公式証跡を用いて短期signalと注文計画を作る。auto2a/auto2bの判断laneに使う。
---

# Stock Investment Decision Support

## 責務

watchlistのactive候補だけを評価し、`signal_status`と単一`eligibility`を出す。候補発見、portfolio配分、paper約定は行わない。

## 判定

1. watchlistの期限とinvalidationを確認する。
2. trade-v2の価格・出来高・trendと決算日証跡を候補単位で確認する。
3. signalが具体化し、limit/stop/targetが揃う場合だけ`trade_state=eligible`にする。
4. 取得失敗・欠落はその候補だけ`blocked`にし、`reason_codes`へ明記する。run全体を止めるのは、必要候補の大半を評価できず判断集合が信頼できない場合だけ。

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
  "evidence_refs": []
}
```

open確認が必要なら`trigger_condition=open_retest`とする。`entry_ready`、`auto4_buy_allowed`、`execution_ready`、`execution_window`を重ねて生成しない。説明不能なfree textだけでblockingせず、安定した`reason_codes`を使う。

auto2a/auto2bのlane差は入力watchlistとprofileのみ。high-betaでは`high_beta_watchlist.json`から`high_beta_decisions.json`を更新する。

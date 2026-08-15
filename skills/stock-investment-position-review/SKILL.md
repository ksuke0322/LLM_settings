---
name: stock-investment-position-review
description: "保有中の日本株について、trade-v2 recent analysis を使って短期の保有継続・利確・防衛・追加条件をレビューするときに使う。"
---

# Stock Investment Position Review

保有中の日本株を、短期ポジション管理目線でレビューする。新規候補の比較ではなく、`保有継続 / 一部利確 / 防衛 / 撤退条件 / 追加可否` を先に出す。

共通運用は [../stock-shared/references/common-operating-rules.md](../stock-shared/references/common-operating-rules.md) を前提にする。詳細な出力列は [references/output-contract.md](references/output-contract.md) を使う。

## 使う場面 / 使わない場面

- 使う:
  - `銘柄名 / 株数 / 平均取得単価` がある
  - 既存ポジションの利確、撤退、買い増し可否を見たい
  - `current_holdings.json` を正本に継続レビューしたい
- 使わない:
  - 未保有候補の新規エントリー比較
  - watchlist の再採用判断

## 固定設定

```text
API_BASE_URL=https://bfdkvlo2zi752fp5mhaq4koreq0ezvbd.lambda-url.ap-northeast-1.on.aws
ENDPOINT=/stock/{ticker}/analysis?range=recent&schema=trade-v2
投資スタイル=短期（1ヶ月以内程度）
review_profile の既定値=auto
```

## 正本 state

- holdings: `/Users/sawairikeisuke/Documents/stock-analysis/current_holdings.json`
- portfolio rules: `/Users/sawairikeisuke/Documents/stock-analysis/portfolio_rules.json`

## lane 固有 freshness / schema

- この skill は `auto3` 相当の holdings review consumer
- `current_holdings.json` は `as_of` `holdings` が必須
- 各 holding は `ticker` `company` `shares` `average_cost` `bucket` `review_profile` が必須
- execution-aware field として `last_user_action` `last_action_date` `last_review_decision` `decision_reason_note` を持てる
- `last_user_action` は `kept` `trimmed` `exited` `ignored` に正規化する
- `last_review_decision` は `hold` `trim` `defend` `exit` に正規化する
- `portfolio_rules.json` は `max_positions_large_cap` `max_positions_high_beta` `max_new_entries_per_day_high_beta` `max_theme_overlap` `earnings_blackout_days` `max_risk_per_trade_pct` が必須
- watchlist state を補助参照に使うなら stale file を根拠補強に使わない
- `current_holdings.json` は watchlist ほど当日性を要求しないが、pending fill や必須 field 欠落は停止する
- `auto3` では same-day 必須でなくても `as_of` と `age_days` を report / sidecar へ露出する
- `thesis` `review_action` `status` または execution-aware field が欠ける holding は `execution_trace_incomplete` として扱う
- 長期保有を `kept` とする場合は、短期 trade-v2 の `thesis` と分離して `long_hold_rationale`、`thesis_invalidation_or_review_trigger`、ISO形式の `next_review_date`、`trim_conditions` を持つ
- `trim_conditions` は `none`（検討済みで縮小条件なし）または `defined`（trigger / percentage / rationale を明記）とし、値が不明なら `needs_user_confirmation` として扱う
- 長期4項目が未入力のときは、既存の短期 `thesis` から推測補完せず、`long_hold_governance_status=needs_user_confirmation` と `execution_trace_incomplete=true` を sidecar / report に残す
- 各 holding の sidecar record は短期 `short_term_advisory`（`decision` と state / note 参照）と長期4項目を分離して持つ。短期 `exit` / `defend` / `hold` は長期保有理由の代用にしない
- `long_hold_governance_status=complete` のときだけ長期4項目を値付きで公開し、`needs_user_confirmation` のときは `long_hold_rationale`、`thesis_invalidation_or_review_trigger`、`next_review_date`、trimの trigger / percentage / rationale を null のまま残す
- 連続 `exit` holding には `未対応` `対応済み` `保有継続理由あり` のいずれか 1 行 trace を残す
- `exit -> defend` など前日から top-level が変わった reversal では `decision_reason_note` に切替理由を 1 行残す
- earnings blackout 判定は `next_earnings_date` を正本 field として参照し、`earnings_date` 欠落を未検証理由に使わない

## review_profile

- `auto`: 文脈と銘柄特性から自動判定
- `large_cap`: 大型・主力・比較的低ボラ向け
- `high_beta`: 中小型、高ATR、高gap、テーマ性の強い短期値幅株向け

## 入力

- 基本形は `銘柄名 / 株数 / 平均取得単価`
- 必要なら `review_profile=large_cap|high_beta` を明示指定してよい
- 平均取得単価や株数が欠けている場合は、損益率を省略して `未共有` と明記する

## action sizing

- top-level ラベルは `hold` `trim` `defend` `exit`
- 補助表示として `trim_25` `trim_50` `defend_tight` `exit_now` を使ってよい

## 手順

1. ticker を確定する。
2. 各銘柄の `review_profile` を決める。
3. `ctx_execute` の `javascript` で API をまとめて取得し、retry と JSON parse を sandbox 内で完結させる。
4. `ctx_execute` で失敗した場合だけ Playwright/browser fetch、さらに失敗した場合だけ診断用 `curl` へ落とす。
5. `setup` と `risk` を主根拠に保有レビューを作る。
6. `portfolio_rules.json` があれば個別レビューの前に portfolio gate 警告を出す。
7. 平均取得単価と株数がある場合は評価損益額と損益率を計算する。
8. 既定は `compact` で返し、長い表は `full` 要求時だけ出す。

## 分析観点

- `setup.regime` `setup.setupType` `setup.setupScore` `setup.confidence`
- `setup.reasons` `setup.invalidations`
- `risk.entryZone` `risk.stopPrice` `risk.target1` `risk.target2` `risk.minimumRR` `risk.timeStopDays` `risk.holdUntilCondition` `risk.riskWarnings`
- `feature.chartSummary.latestClose`
- `feature.metrics`
  - `atr14`
  - `gapPercent`
  - `recentSwingHigh` `recentSwingLow`
  - `distanceFrom20dHighPercent` `distanceFrom60dHighPercent`
  - `volumeRatioVsMa20`
  - `ema10Slope` `ema25Slope` `ema60Slope`
  - `breakoutCandidate`
- `feature.indicatorState`

## 判定ラベルの正規化

- 出力状態は `hold` `trim` `defend` `exit`
- `watch` `entry_ready` は保有後ラベルとして使わない
- `large_cap` と `high_beta` で同じラベルを使ってよいが、切り替え閾値は profile ごとに変える

## 出力形式

- 既定は `compact`
- `compact`:
  - 単一銘柄は保有判断、追加投資判断、損益率、利確 / 防衛 / 追加条件、リスク警告を返す
  - 複数銘柄は各銘柄 1 行サマリーと `保有判断サマリー` `追加投資サマリー` `取得失敗` を返す
  - summary で銘柄を列挙するときは `ticker` ではなく `company` を優先し、必要な場合だけ `company (ticker)` を使う
- `full`:
  - [references/output-contract.md](references/output-contract.md) の 2 表構成を使う

## 判断ルール

- `買い` `売り` と断定しない
- API 判定を保有前提へ翻訳する
- `setupType=no_trade`、`minimumRR` 不足、強い `riskWarnings` では `追加見送り` を優先する
- `target1` 接近や過熱が強く、含み益が大きい場合は `trim` を優先してよい
- `high_beta` では `gapPercent` `volumeRatioVsMa20` `breakoutCandidate` `timeStopDays` を通常より重く扱う
- `large_cap` では time stop 単独より trend 崩れや invalidation を重く見る
- paper lane で使う場合も review の根拠と hold / sell 判定を sidecar から追えるように残す

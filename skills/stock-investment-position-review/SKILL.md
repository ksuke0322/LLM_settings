---
name: stock-investment-position-review
description: "保有中の日本株について、trade-v2 recent analysis を使って短期の保有継続・利確・防衛・追加条件をレビューするときに使う。"
---

# Stock Investment Position Review

保有中の日本株を、短期ポジション管理目線でレビューする。新規候補の比較ではなく、`保有継続 / 一部利確 / 防衛 / 撤退条件 / 追加可否` を先に出す。

共通運用は [../stock-shared/references/common-operating-rules.md](../stock-shared/references/common-operating-rules.md) を前提にする。詳細な出力列は [references/output-contract.md](references/output-contract.md) を使う。
trend_viewerの品質、trend、event、provenanceの意味は [../stock-shared/references/trend-viewer-analysis-contract.md](../stock-shared/references/trend-viewer-analysis-contract.md) を正本とする。

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
- long-hold governance sidecar: `/Users/sawairikeisuke/Documents/stock-analysis/holdings_governance.json`

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
- `holdings_governance.json` は `refresh_holdings_governance.mjs` で `current_holdings.json` と最新Auto3 reportから生成し、8/8など全保有件数のcoverageをreadbackする
- 公式IRの将来exact dateだけを `event_evidence.verification_status=official_exact` として採用する。月だけ、未確認、過去日付、出典なしの `next_earnings_date` は current dateへ推測更新せず、`unverified` / `stale` とreason codeを残す
- `holdings_governance.json` は `state_update_policy=sidecar_only` とし、保有数量、paper order、paper position、実注文を変更しない。validatorがpaper linkageの空配列と全mutation flag=falseを確認する
- `thesis` `review_action` `status` または execution-aware field が欠ける holding は `execution_trace_incomplete` として扱う
- 長期保有を `kept` とする場合は、短期 trade-v2 の `thesis` と分離して `long_hold_rationale`、`thesis_invalidation_or_review_trigger`、ISO形式の `next_review_date`、`trim_conditions` を持つ
- `trim_conditions` は `none`（検討済みで縮小条件なし）または `defined`（trigger / percentage / rationale を明記）とし、値が不明なら `needs_user_confirmation` として扱う
- 長期4項目が未入力のときは、既存の短期 `thesis` から推測補完せず、`long_hold_governance_status=needs_user_confirmation` と `execution_trace_incomplete=true` を sidecar / report に残す
- 予定実行日のreport metadataには `run_status` と `no_run_reason` を必ず残す。正常実行は `completed` / `no_run_reason=null`、入力不足・休場は `not_run`、部分生成は `incomplete`、実行失敗は `failed` とし、非completedでは `market_closed`、`holiday`、`automation_not_scheduled`、`upstream_incomplete`、`reason_unconfirmed` の固定理由を使う。`not_run` はholding recordを推測生成しない
- 各 holding の sidecar record は短期 `short_term_advisory`（`decision` と state / note 参照）と長期4項目を分離して持つ。短期 `exit` / `defend` / `hold` は長期保有理由の代用にしない
- `long_hold_governance_status=complete` のときだけ長期4項目を値付きで公開し、`needs_user_confirmation` のときは `long_hold_rationale`、`thesis_invalidation_or_review_trigger`、`next_review_date`、trimの trigger / percentage / rationale を null のまま残す
- 連続 `exit` holding には `未対応` `対応済み` `保有継続理由あり` のいずれか 1 行 trace を残す
- `exit -> defend` など前日から top-level が変わった reversal では `decision_reason_note` に切替理由を 1 行残す
- earnings blackout 判定は `next_earnings_date` を正本 field として参照し、`earnings_date` 欠落を未検証理由に使わない

## API入力契約

短期レビューは、保有銘柄ごとに次の`trade-v2` endpointを取得する。

`GET /stock/{ticker}/analysis?range=recent&schema=trade-v2`

取得後、少なくとも次をsidecar / reportへ残す。

- `schemaVersion`、`source`、実際のpathとquery、`asOf`、`fetchedAt`、`timezone`
- `dataQuality`、`readiness`、APIの全`reasonCodes`
- `feature.trendState`の`direction`、`strength`、`persistence`、`confirmation`、`regime`、`reasonCodes`
- `feature.eventRisk`の`eventRiskLevel`、`hasUpcomingEvent`、`daysToEarnings`

### 短期advisoryの品質ゲート

- `schemaVersion`が`trade-v2`でない、`dataQuality`が`complete`でない、`readiness`が`ready`でない、必須fieldや`asOf`が欠ける場合は、レビューを`advisory_only` / `確認不能`として出す。ただし`readiness`の停止理由が決算理由だけなら、rawの停止状態を保存しつつ決算理由をconsumerの停止理由から外し、追加投資を含むレビュー判定を続ける。
- 上記の品質不足は保有継続・利確・防衛の長期ガバナンスを自動変更する根拠にしない。追加投資・新規執行の可否は必ず見送る。
- `eventRiskLevel=unknown`はイベントなしと解釈せず、「イベントリスク未確認」として`event_advisory`へ保存する。保有レビューは続け、決算情報だけでレビューやrunを停止しない。
- `hasUpcomingEvent=true`または`eventRiskLevel=high`も注意情報として表示する。決算情報だけで追加・保有継続・防衛・縮小を止めず、レビュー結果を自動注文へ変換しない。
- `confidenceScore`は`confidenceSemantics=qualitative`の定性的な証拠強度であり、確率・勝率・期待収益率として表示しない。

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
4. レスポンスの`trade-v2`、品質、provenance、必須fieldを検証し、欠落・unknown・partialを推測補完しない。
5. `feature.trendState`の`regime`、`confirmation`、`persistence`、`strength`を確認する。`indicatorState`の多数決や単一指標で状態を上書きせず、短期advisoryと追加可否を分ける。
6. `feature.eventRisk`を確認し、unknown / upcoming / highを注意情報として記録する。決算情報だけでレビューを止めない。
7. `ctx_execute` で失敗した場合だけ Playwright/browser fetch、さらに失敗した場合だけ診断用 `curl` へ落とす。
8. `setup` と `risk` を主根拠に短期advisoryを作る。保有継続の長期理由とは別欄にする。
9. `portfolio_rules.json` があれば個別レビューの前に portfolio gate 警告を出す。
10. 平均取得単価と株数がある場合は評価損益額と損益率を計算する。
11. 既定は `compact` で返し、長い表は `full` 要求時だけ出す。

## 分析観点

- `setup.regime` `setup.setupType` `setup.setupScore` `setup.confidence`
- `setup.trendState`の`direction` `strength` `persistence` `confirmation` `regime` `reasonCodes`
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

個別indicatorは補助説明として表示してよいが、`trendState`の`regime`、confirmation、persistenceを再計算して上書きしない。

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
- `dataQuality`不足、`readiness`不一致は追加見送りの根拠にする。ただし決算reason codeだけによる`readiness`不一致は例外とし、rawの状態を残しても決算だけで追加見送りや保有判断を固定しない。`eventRiskLevel=unknown|high`、`hasUpcomingEvent=true`は`event_advisory`へ残し、unknownを安全・イベントなしへ変換しない。
- `trendState.regime=range|transition`、confirmation未成立、persistence不足、direction/strength unknownは短期advisoryの不確実性として残し、新規の追加根拠にしない。
- `target1` 接近や過熱が強く、含み益が大きい場合は `trim` を優先してよい
- `high_beta` では `gapPercent` `volumeRatioVsMa20` `breakoutCandidate` `timeStopDays` を通常より重く扱う
- `large_cap` では time stop 単独より trend 崩れや invalidation を重く見る
- paper lane で使う場合も review の根拠と hold / sell 判定を sidecar から追えるように残す
- `hold` `trim` `defend` `exit`はadvisoryラベルであり、保有stateや注文へ自動反映しない。長期保有の継続・縮小・撤退は`long_hold_governance_status`とユーザー判断を分離して扱う。

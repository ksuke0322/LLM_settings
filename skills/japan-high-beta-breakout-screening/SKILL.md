---
name: japan-high-beta-breakout-screening
description: "日本株の短期 high_beta 候補を抽出し、high_beta watchlist state を作るときに使う。"
---

# Japan High Beta Breakout Screening

短期で値幅が出やすい日本株の順張り候補を抽出し、`high_beta` watchlist まで圧縮する。安定大型株の母集団作成ではなく、`1〜2週間` の短期値幅と監視鮮度を優先する。

共通運用は [../stock-shared/references/common-operating-rules.md](../stock-shared/references/common-operating-rules.md) を前提にする。スクリーニング基準は [references/criteria.md](references/criteria.md) を使う。

## 基本方針

- 未保有の新規監視候補だけを扱う
- large_cap と同じ cadence や防衛基準で扱わない
- 候補には必ず `selection_reason` と `invalidation_hint` を付ける
- 判断材料が未確認なら採用理由に使わず、`保留` 以下へ落とす
- 既存保有の防衛判断は `stock-investment-position-review` に委ねる

## 正本 state

- watchlist: `/Users/sawairikeisuke/Documents/stock-analysis/high_beta_watchlist.json`
- 保有除外参照: `/Users/sawairikeisuke/Documents/stock-analysis/current_holdings.json`

## lane 固有 freshness / schema

- この skill は `auto1b` 相当の watchlist producer として扱う
- `high_beta_watchlist.json` は `as_of` `review_mode` `watchlist` が必須
- `reserve_watchlist` は任意だが、使う場合は `status=reserve` で分離し、`watchlist` と混在させない
- automation run では `as_of` が 3 calendar days を超えたら stale とみなして停止する
- candidate に `monitoring_valid_until` が欠けていたら stale 契約違反として停止する
- `current_holdings.json` を保有除外に使う場合、`holdings[].ticker` を正本に除外する

## state 出力契約

- 最小項目:
  - `ticker`
  - `company`
  - `bucket=high_beta`
  - `decision_profile=high_beta`
  - `thesis_type=breakout|pullback|theme_momentum`
  - `selection_reason`
  - `catalyst`
  - `event_risk`
  - `invalidation_hint`
  - `monitoring_valid_until`
  - `priority`
  - `status=watch`
- `reserve_watchlist` の最小項目:
  - `ticker`
  - `company`
  - `bucket=high_beta`
  - `decision_profile=high_beta`
  - `reserve_reason`
  - `promotion_triggers`
  - `invalidation_hint`
  - `monitoring_valid_until`
  - `priority`
  - `status=reserve`
- 追記互換:
  - `liquidity_tier`
  - `slippage_risk`
  - `theme_cluster`
  - `event_freshness`
  - `crowding_risk`
  - `entry_style_hint`

## 入力解釈

- 指定がなければ日本株全体を対象にする
- 前回 watchlist が渡された場合は `継続 / 除外 / 保留 / 新規追加` を判定する
- 監視候補は既定で `5〜10社` に圧縮する
- `reserve_watchlist` を使う場合、既定で `15社以内` に圧縮する
- 確定保有中の銘柄は新規候補に含めない

## 実行モード

### 初回抽出

- 値上がり率、出来高急増、高値接近、テーマ性から広く拾う
- 最後に短期監視 `5〜10社` へ圧縮する
- `70〜74点` の惜しい候補は、条件を満たす場合だけ `reserve_watchlist` へ分離してよい

### 継続レビュー

- 前回 watchlist を先に `継続 / 除外 / 保留` へ分類する
- `reserve_watchlist` があれば `昇格 / 継続reserve / 失効` も判定する
- 継続理由が弱くなった枠だけ新規候補で補う

## 手順

1. 実行モードと対象範囲を確定する。
2. `current_holdings.json` を検証し、確定保有銘柄を ticker ベースで除外する。
3. 価格位置、出来高、相対強度、材料継続性、流動性を確認する。
4. `liquidity_tier` `slippage_risk` `crowding_risk` `entry_style_hint` を付ける。
5. [references/criteria.md](references/criteria.md) の配点で候補を評価する。
6. `75点以上` は `watchlist`、`70〜74点` で出来高・価格位置がどちらも 0 点でないものは `reserve_watchlist` 候補として分離する。
7. 初回抽出なら `watchlist=5〜10社`、`reserve_watchlist<=15社`、継続レビューなら残留候補を優先して圧縮する。
8. 候補ごとに採用理由、高リスク理由、監視条件、撤退目安を整える。

## 出力形式

- 既定は `compact`
- `compact`:
  - `対象範囲`
  - `短期監視候補`
  - `reserve候補` の件数と代表理由
  - `保留候補` の件数と代表理由
  - `screening 対象外` の件数と代表理由
  - `次に見るべき項目`
  - `短期監視銘柄名`
- `full`:
  - 候補表、除外表、保留表、state 出力表を出してよい
  - 長い state 行は必要時だけ再掲し、既定では JSON 正本を優先する

## 注意

- high_beta は高リスク前提で扱う
- 急落、ギャップダウン、材料剥落、流動性低下のリスクを必ず併記する

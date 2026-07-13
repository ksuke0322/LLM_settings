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
- `watchlist` / `reserve_watchlist` は当日ランキングではなく、数日〜数週間再評価する候補棚として扱う
- 1b は継続監視価値を判定し、trade-v2 の当日 entry setup 判定は 2b に委ねる
- 候補には必ず `selection_reason` と `invalidation_hint` を付ける
- 判断材料が未確認なら採用理由に使わず、`保留` 以下へ落とす
- 既存保有の防衛判断は `stock-investment-position-review` に委ねる

## 正本 state

- watchlist: `/Users/sawairikeisuke/Documents/stock-analysis/high_beta_watchlist.json`
- 保有除外参照: `/Users/sawairikeisuke/Documents/stock-analysis/current_holdings.json`

## lane 固有 freshness / schema

- この skill は `auto1b` 相当の watchlist producer として扱う
- `high_beta_watchlist.json` の `schema_version` は `2`
- `high_beta_watchlist.json` は `as_of` `review_mode` `watchlist` が必須
- `reserve_watchlist` は任意だが、使う場合は `status=reserve` で分離し、`watchlist` と混在させない
- automation run では `as_of` が 3 calendar days を超えたら stale とみなして停止する
- candidate に `monitoring_valid_until` が欠けていたら stale 契約違反として停止する
- candidate に `first_seen_date` `stage_entered_date` `last_reviewed_date` `continuation_reason` `transition_reason_code` `validity_extension_count` が欠けていたら schema 契約違反として停止する
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
  - `first_seen_date`
  - `stage_entered_date`
  - `last_reviewed_date`
  - `continuation_reason`
  - `transition_reason_code=carry|promote|demote|expire|remove|new`
  - `validity_extension_count`
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
  - `first_seen_date`
  - `stage_entered_date`
  - `last_reviewed_date`
  - `continuation_reason`
  - `transition_reason_code=carry|promote|demote|expire|remove|new`
  - `validity_extension_count`
- 追記互換:
  - `liquidity_tier`
  - `slippage_risk`
  - `theme_cluster`
  - `event_freshness`
  - `crowding_risk`
  - `entry_style_hint`
- top-level incomplete 表現:
  - `state_note` には毎回 `screened_count` と `minimum_required_count=40` が読み取れる文面を残す
  - `review_summary` には `screening_incomplete=true|false` と `screening_shortfall_reason` を残す
- top-level `continuity_summary`:
  - `previous_shelf_count` `current_shelf_count`
  - `carried_count` `promoted_count` `demoted_count` `expired_count` `removed_count` `new_count`
  - `shelf_turnover_rate` `median_candidate_age_trading_days` `horizon_extensions`
  - `shortfall_reason`

## 候補棚 lifecycle

- `carry`: thesis、材料、価格構造、出来高、流動性に hard invalidation がなく継続監視する
- `promote`: reserve が `高値更新/接近` `出来高再加速` `支持線維持後の反発` `一次材料継続確認` のうち2つ以上を満たして watch へ移る
- `demote`: thesis は残るが、出来高、価格構造、材料確認のいずれかが弱化して reserve へ移る
- `expire`: 監視期限までに延長根拠を確認できない
- `remove`: 材料失効、支持線割れ、流動性破綻、保有化などの hard invalidation で棚から外す
- 単日の押し、過熱、trade-v2 の `setupType=no_trade`、新規候補との相対順位低下だけでは demote / expire / remove しない
- watch は標準10営業日、reserve は標準5営業日とし、毎日の再評価だけで `monitoring_valid_until` を延長しない
- 新規一次材料、または `出来高再加速` と `支持線維持/reclaim` の組み合わせを確認した場合だけ5営業日延長できる
- 同一 thesis cycle は `first_seen_date` から最大20営業日とする。別の一次材料で再採用する場合は `new` として新しい cycle を開始する
- `stage_entered_date` は promote / demote / new のときだけ更新し、`last_reviewed_date` は各 review で更新する

## 入力解釈

- 指定がなければ日本株全体を対象にする
- 前回 watchlist が渡された場合は `継続 / 除外 / 保留 / 新規追加` を判定する
- 毎回の確認対象は原則 `40〜50銘柄` とし、`40件` を最低必要件数にする
- `40件未満` で run を終える場合、その run は `incomplete` として扱う
- `incomplete` でも watch/reserve の採否判定と state 更新は行い、`state_note` と `review_summary` に件数不足を明記する
- soft target は `watchlist=5〜8社、最大10社`、`reserve_watchlist=8〜12社、最大15社`、棚全体 `13〜20社、最大25社` とする
- soft target 未達でも採用基準を緩めず、`continuity_summary.shortfall_reason` を必須にする
- 確定保有中の銘柄は新規候補に含めない

## 実行モード

### 初回抽出

- 値上がり率、出来高急増、高値接近、テーマ性から広く拾う
- 最後に `watchlist=5〜8社、最大10社`、`reserve_watchlist=8〜12社、最大15社` を目安に圧縮する
- `70〜74点` の惜しい候補は、条件を満たす場合だけ `reserve_watchlist` へ分離してよい
- score は順位付け・説明補助として使い、watch / reserve の最終採否を score だけで固定しない

### 継続レビュー

- 前回 watchlist を先に `継続 / 除外 / 保留` へ分類する
- `reserve_watchlist` があれば `昇格 / 継続reserve / 失効` も判定する
- 継続理由が弱くなった枠だけ新規候補で補う
- 新規候補の探索順は `previous watchlist / reserve_watchlist の再判定` → `active themes` → `exploratory themes` → `theme universe 外の補助探索` とする
- `active themes` は各テーマ `4〜6銘柄`、`exploratory themes` は合計 `8〜12銘柄`、`theme universe 外の補助探索` は `2〜4銘柄` を目安に確認する
- 上の探索順を守ったうえで、原則 `screened_count >= 40` に届くまで追加探索を継続する
- `theme universe 外の補助探索` まで完了しても `40件未満` の場合に限り、その日の run を `incomplete` として close してよい
- `aging` でも出来高と price action が維持される候補は watch候補に残してよい
- `crowding_risk=high` でも low-float chase でなければ即 reserve/除外に落とさず、watch候補として比較してよい
- 完全 reclaim 前でも、下値維持と出来高改善、day2 以降の継続性が揃うなら watch候補として扱ってよい
- theme分散は soft guidance とし、同テーマが増えても hard gate にせず warning/comment を残して採否判断する
- 新規候補は空き枠を埋める。watch が10社ある場合、既存 watch に producer 根拠の弱化があるときだけ demote して昇格枠を作る
- `shelf_turnover_rate > 0.40` は hard stop にせず、`continuity_summary` と sidecar に入替理由を残す

## 手順

1. 実行モードと対象範囲を確定する。
2. `current_holdings.json` を検証し、確定保有銘柄を ticker ベースで除外する。
3. `previous watchlist / reserve_watchlist` を先に再判定し、不足分を `active themes` → `exploratory themes` → `theme universe 外の補助探索` の順で埋める。
4. 価格位置、出来高、相対強度、材料継続性、流動性を確認し、`screened_count` を集計する。
5. `liquidity_tier` `slippage_risk` `crowding_risk` `entry_style_hint` を付ける。
6. [references/criteria.md](references/criteria.md) の配点で候補を評価する。
7. score は順位付け・説明補助として使う。既定では `75点以上` を watch 優先、`70〜74点` を reserve 優先の目安にするが、`aging` `crowding_risk` `support/reclaim` `theme分散` を含む tape quality を合わせて最終採否を決める。
8. 初回抽出でも継続レビューでも、確認対象は原則 `40〜50銘柄` としつつ、`watchlist=5〜8社、最大10社`、`reserve_watchlist=8〜12社、最大15社`、棚全体最大25社へ圧縮する。
9. `screened_count < 40` の場合でも基準未達銘柄を無理に採用せず、run を `incomplete` として `review_summary.screening_incomplete=true`、`review_summary.screening_shortfall_reason`、`state_note` の件数不足説明を必ず残す。
10. 候補ごとに採用理由、高リスク理由、監視条件、撤退目安を整える。

## automation / sidecar contract

- required sidecar path は automation prompt が指定する
- state を更新する run、stale day、休場日、upstream 未更新日のすべてで same-day sidecar を残す
- `publish_mode` は `normal` `stale_day_noop` `hard_stop` の3値に正規化する
- 固定 field は `review_date` `snapshot_as_of` `publish_mode` `screened_count` `minimum_required_count` `watchlist_count` `reserve_count` `carried_count` `promoted_count` `demoted_count` `expired_count` `removed_count` `new_count` `shelf_turnover_rate` `median_candidate_age_trading_days` `horizon_extensions` `shortfall_reason` `contract_breach`
- `shelf_turnover_rate = 1 - 前回棚との共通 ticker 数 / previous_shelf_count` とし、previous shelf が空なら `null` とする
- state 更新後に same-day sidecar が無い run は incomplete とする

## 出力形式

- 既定は `compact`
- `compact`:
  - `対象範囲` (`確認件数 N/40` を必ず含める)
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

---
name: japan-top-companies-screening
description: "東証33業種を基準に、日本株の large_cap 候補を洗い出し、large_cap watchlist state を作るときに使う。"
---

# Japan Top Companies Screening

東証33業種ベースで large_cap 候補を機械的に絞り、重点監視 `10〜15社` まで圧縮する。短期高ボラ候補は扱わず、`large_cap` 側の母集団形成と watchlist 更新に専念する。

共通運用は [../stock-shared/references/common-operating-rules.md](../stock-shared/references/common-operating-rules.md) を前提にする。評価基準は [references/criteria.md](references/criteria.md) を使う。

## 基本方針

- 未保有の新規監視候補だけを扱う
- `japan-high-beta-breakout-screening` と lane を混ぜない
- 候補抽出は定量で絞り、最後に業界地位や regime で補正する
- daily で使うのは全33業種の再生成ではなく、重点監視の維持と入れ替えである
- 既存保有の防衛判断は `stock-investment-position-review` に委ねる

## 正本 state

- watchlist: `/Users/sawairikeisuke/Documents/stock-analysis/large_cap_watchlist.json`
- 保有除外参照: `/Users/sawairikeisuke/Documents/stock-analysis/current_holdings.json`
- regime参照: `/Users/sawairikeisuke/Documents/stock-analysis/market_regime_snapshot.json`

## lane 固有 freshness / schema

- この skill は `auto1a` 相当の watchlist producer として扱う
- `large_cap_watchlist.json` は `as_of` `review_mode` `watchlist` が必須
- automation run では `as_of` が 7 calendar days を超えたら stale とみなして停止する
- `current_holdings.json` を保有除外に使う場合、`holdings[].ticker` を正本に除外する

## state 出力契約

- 最小項目:
  - `ticker`
  - `company`
  - `bucket=large_cap`
  - `decision_profile=large_cap`
  - `thesis_type`
  - `selection_reason`
  - `event_risk`
  - `priority`
  - `status=watch`
- 追記互換:
  - `macro_sensitivity`
  - `sector_cycle`
  - `liquidity_tier`
  - `execution_caution`
  - `regime_fit`
  - `regime_snapshot_ref`（`snapshot_id`、`as_of`、`data_status`、`regime`）

## 入力解釈

- 指定がなければ全33業種を対象にする
- 前回重点監視が渡された場合は `継続 / 除外 / 保留 / 新規追加` を判定する
- 母集団は各業種 `1〜3社`、重点監視は `10〜15社` を基本にする
- `market-regime-assessment` は補助情報として使ってよいが、この skill の正本判定を置き換えない

## 実行モード

### 初回抽出

- 業種ごとに候補を作り、最後に重点監視まで圧縮する

### 継続レビュー

- 前回重点監視を先に `継続 / 除外 / 保留` へ分類する
- 空いた枠だけ新規候補で補う
- `market-regime-assessment` を使う場合も overlay として扱い、単独で除外判断をしない
- `review_summary` `focus_names` `screening_excluded` が追える state / sidecar を残す

## 手順

1. 実行モードと対象範囲を確定する。
2. JPX の東証33業種を基準にする。
3. [references/criteria.md](references/criteria.md) の定量条件で候補を絞る。
4. `current_holdings.json` を検証し、確定保有銘柄を ticker ベースで除外する。
5. `market_regime_snapshot.json`を読み、`snapshot_id`と`as_of`をstate/sidecarへ保存する。snapshotがstale・unavailable・不一致なら、regimeを推測せず、候補のregime overlayと実行判断を未確認として扱う。
6. 財務安全性、収益力、業界地位、regime 適合を確認する。
7. 母集団を作り、重点監視 `10〜15社` へ圧縮する。
8. 継続レビュー時は残留理由と差し替え理由を明示する。
9. 今回の run で採用なしでも、見送った業種や候補が `review_summary` `focus_names` `screening_excluded` から追えるようにする。

## 出力形式

- 既定は `compact`
- `compact`:
  - `対象範囲`
  - `market regime`
  - `重点監視`
  - `screening 対象外` の件数と代表理由
  - `継続 / 除外 / 保留 / 新規追加` の件数サマリー
  - `次に見るべき項目`
  - `重点監視銘柄名`
- `full`:
  - 母集団表、前回監視レビュー表、新規追加候補表、state 出力表を出してよい
  - 長い表は必要時だけ再掲し、既定では JSON 正本を優先する

## 注意

- 候補抽出の根拠は `定量` と `定性` を分けて書く
- 良い会社であることより、今の regime で監視価値が高いかを優先する

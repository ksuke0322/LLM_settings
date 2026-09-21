---
name: japan-top-companies-screening
description: "日本株の large_cap watchlist を、機械の順位表どおりに更新するときに使う。顔ぶれと priority は判定しない。"
---

# Japan Top Companies Screening

**この skill は候補の顔ぶれを決めない。** 顔ぶれ・順位・priority は producer が決め、`outputs/large-cap-screening-rank-<対象日>.json` を正本とする。skill の仕事は、その結果を `large_cap_watchlist.json` へ写し、文章欄を書き、検査を通すことである。

共通運用は [../stock-shared/references/common-operating-rules.md](../stock-shared/references/common-operating-rules.md) を前提にする。

## なぜこうしたか

この lane の名簿は、文章で継続・除外を決めていた期間に **11週間ひとつも入れ替わらなかった**。数字のしきい値も検査も無かったため、母集団を見る節が静かに消えても誰も気づけなかった。判定を機械へ移し、裁量は理由付きの `override` だけに残す。

## 正本

- 名簿: `$WORKTREE/large_cap_watchlist.json`
- **顔ぶれの正本**: `$WORKTREE/outputs/large-cap-screening-rank-<対象日>.json`
- 母集団: `$WORKTREE/outputs/large-cap-universe-<基準日>.json`
- 設定: `$WORKTREE/large_cap_screening_config.json`（重み・枠・入れ替え上限・帯。`config_hash` が成果物に残る）
- 保有除外参照: `$WORKTREE/current_holdings.json`
- regime 参照: `$WORKTREE/market_regime_snapshot.json`

## 手順

1. **対象日を決める**。直近の営業日（=前週金曜など、日足が確定している日）を `AS_OF` とする。
2. **母集団**。`outputs/large-cap-universe-<基準日>.json` が今月ぶん無ければ作る。
   `node large_cap_universe_producer.mjs --as-of <AS_OF> --root "$WORKTREE"`
   月が変わっていなければ作り直さない。所要はおよそ7分。
3. **順位表**。
   `node large_cap_screening_producer.mjs --as-of <AS_OF> --root "$WORKTREE"`
   fail-close で止まったら、名簿は**前週のまま据え置き**、理由を報告して終わる。勝手に条件を緩めない。
4. **名簿を書く**。順位表の `watchlist` を**そのまま**使う。
   - **写す欄（1文字も変えない）**: `ticker` `company` `bucket` `decision_profile` `status` `priority` `liquidity_tier`
   - **書く欄（ここが skill の仕事）**: `thesis_type` `selection_reason` `event_risk` `macro_sensitivity` `sector_cycle` `execution_caution` `regime_fit` `regime_snapshot_ref`
   - 名簿の `as_of` は `AS_OF`、`consecutive_unchanged_weeks` は順位表と同じ値にする
   - `screening_rank_ref` に順位表のパスを書く
   - `company` は JPX の英語名で入る。日本語名を知っている銘柄は日本語に直してよい。**`ticker` と順番と `priority` は動かさない**
5. **検査**。
   `node validate_large_cap_watchlist.mjs --as-of <AS_OF> --root "$WORKTREE"`
   `valid: false` のまま commit しない。直せないときは名簿を据え置き、理由コードをそのまま報告する。
6. **報告**（既定は `compact`）。順位表の数字から作る。

## override

機械の答えから外したいときだけ、その行に `override: { reason, decided_by }` を付ける。**理由が空なら検査が落とす。** 件数は `override_count` として数えられるので、裁量がどれだけ使われたかが後から測れる。

## 文章欄の書き方

- 定量の根拠は順位表の数字（`rank` `score` `return_20d` `trend_alignment` `turnover_median_jpy`）を引いて書く。**自分で計算し直さない**
- `event_risk` は確認できた決算・イベントの補助情報（`event_advisory`）であり、決算情報が未確認・欠落・取得失敗でも候補を外したり処理を止めたりしない。公式の日付が無いのに「決算直前」と推測しない
- regime は overlay として扱う。`market_regime_snapshot.json` の readiness が `ready` で要求 AS_OF と一致する場合だけ使い、stale・不一致なら未確認として扱う。**regime 単独で銘柄を外さない**（外すなら `override` として理由を残す）
- 日次 market evidence と root の `market_regime_snapshot.json` を作る責務は auto-b にある。この run で代替生成しない

## 出力形式

- 既定は `compact`:
  - `対象日` と `config_hash`
  - `母集団`（件数・基準日・取れなかった件数）
  - `順位表`（件数・帯の順位・実保有除外の件数）
  - `入れ替え`（追加・除外の銘柄と件数、上限）
  - `連続して変わらない週数`
  - `重点監視`（順位・銘柄・score）
  - `override`（件数と理由）
  - `検査結果`（valid と理由コード）
- `full` では順位表の上位と母集団の表を出してよい。長い表は既定では出さず、JSON 正本を優先する

## やらないこと

- 顔ぶれ・順位・`priority` を自分で決め直す
- 枠・入れ替え上限・帯・重みをその場で変える（変えるなら `large_cap_screening_config.json` を直し、`config_hash` が変わる）
- 検査が落ちたまま main を更新する
- `japan-high-beta-breakout-screening` と lane を混ぜる
- 既存保有の防衛判断（`stock-investment-position-review` の担当）

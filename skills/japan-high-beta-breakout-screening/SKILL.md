---
name: japan-high-beta-breakout-screening
description: "日本株の中から、1〜2週間程度で値幅が出やすい順張り候補を抽出し、短期監視リストまで圧縮する。大型安定株に限定せず、中型株、テーマ株、高ボラティリティ銘柄も対象にし、出来高急増、直近高値接近・更新、相対強度、ATR、材料継続性を重視する。安定企業の母集団形成ではなく、high_beta watchlist state を作る高リスク高リターン候補抽出に使う。"
---

# Japan High Beta Breakout Screening

日本株から、短期で値幅が出やすい順張り候補を抽出する。既存の `japan-top-companies-screening` が安定大型株の監視母集団を作るのに対し、この skill は `1〜2週間程度の短期値幅` を優先する。財務安全性は最低限の確認に留め、出来高、価格モメンタム、テーマ性、材料継続性、リスク管理、実際の売買可能性を重視する。

この skill は `high_beta` 系の候補抽出専用であり、large_cap 系候補と同じ cadence や同じ防衛基準で扱わない。後段の `stock-investment-decision-support` へ渡すときは、鮮度、売買可能性、無効化条件を state に残す前提で使う。

## 基本方針

- 目的は投資助言ではなく、短期監視候補の抽出支援である。
- 安定性よりも、今まさに資金が入り、値幅が出る可能性を優先する。
- 候補は高リスク前提で扱い、必ずリスク理由と撤退条件を併記する。
- 出来高が薄い銘柄、板が極端に薄い銘柄、悪材料起点の乱高下は避ける。
- 判断に使う主要データを確認できない場合は推測で補わず、`未確認` として保留以下にする。
- 後段の個別売買判断には `stock-investment-decision-support` の利用を検討する。
- スクリーニング基準は [references/criteria.md](references/criteria.md) を使う。
- 鮮度切れを避けるため、候補は毎営業日 review し、前日候補を惰性で残さない。

## automation / state file 連携

- この skill は `auto1b` 相当の watchlist producer として扱う。
- 正本 state file は `/Users/sawairikeisuke/documents/stock-analysis/high_beta_watchlist.json` を想定する。
- 後続 automation は automation 定義の書き換えではなく、この state file を読む。
- この skill 自身は `high_beta` 候補だけを出力し、large_cap 候補や保有レビュー対象は扱わない。
- `/Users/sawairikeisuke/Documents/stock-analysis` 配下の state file を更新した場合は、作業後に差分確認を行い、今回更新したファイルだけを commit して push まで進める。
  - push 先はこの repo の `main` とし、許可条件は `git-workflow-safety` の `stock-analysis` 例外に従う。
  - 差分がない場合は commit / push しない。commit または push に失敗した場合はそこで停止して報告する。

## state 出力契約

- 後続へ渡す最小項目は `ticker` `company` `bucket=high_beta` `decision_profile=high_beta` `thesis_type=breakout|pullback|theme_momentum` `selection_reason` `catalyst` `event_risk` `invalidation_hint` `monitoring_valid_until` `priority` `status=watch`。
- 追記互換で `liquidity_tier` `slippage_risk` `theme_cluster` `event_freshness` `crowding_risk` `entry_style_hint` を持たせてよい。
- `catalyst` は単なる好材料有無ではなく、資金流入継続の仮説を短く残す。
- `invalidation_hint` は `出来高失速` `高値更新失敗` `支持割れ` など、翌日 review で真っ先に潰す条件を書く。
- `monitoring_valid_until` は通常 1〜3 営業日程度の鮮度管理に使う。
- `liquidity_tier` は実際の size を入れられるかの粗い tier を残す。
- `slippage_risk` は `low` `medium` `high` 程度でよい。
- `theme_cluster` は `AI半導体` `防衛` `量子` のように、同テーマ集中の把握に使う。
- `event_freshness` は `fresh` `aging` `stale` 程度でよい。
- `crowding_risk` は同テーマの過密、連続急騰、寄り付き偏重を短く残す。
- `entry_style_hint` は `breakout_only` `pullback_only` `avoid_open` のように、執行補助に使う。

## 入力解釈

- 入力は通常、日本株全体からの短期順張り候補抽出とみなす。
- ユーザーがテーマ、業種、時価総額帯、市場区分を指定した場合は、その範囲に絞る。
- 前回監視銘柄が渡された場合は、継続レビューとして `継続` `除外` `保留` `新規追加` を判定する。
- ユーザー指定がなければ、監視候補は `5〜10社` に圧縮する。
- 決算直前、重要イベント直前、急騰直後の銘柄は、採用しても注意度を明記する。

## 実行モード

### 1. 初回抽出モード

- 前回の監視銘柄が渡されていない場合に使う。
- 値上がり率、出来高急増、直近高値更新、テーマ性から候補を広く拾う。
- 最後に `5〜10社` の短期監視候補へ圧縮する。

### 2. 継続レビュー モード

- 前回の監視銘柄が渡されている場合に使う。
- 前回銘柄を `継続` `除外` `保留` に分類する。
- 継続理由が弱くなった枠だけ、新規候補で補う。

## tape / flow quality

- 値上がり率だけでは採用しない。高値接近時の出来高維持、押し目時の売り圧、反発時の再加速を分けて見る。
- 同じテーマに複数銘柄がある場合、先導株と二軍銘柄を分ける。
- ギャップアップ後に売買代金が細る銘柄は、材料が良くても `crowding_risk` を上げる。

## slippage / board risk

- board data を完全に取得できない場合でも、売買代金と出来高継続性から大まかな `slippage_risk` を付ける。
- 板が薄く寄り付きだけで値が飛ぶ銘柄は `entry_style_hint=avoid_open` を検討する。
- 想定 size で入りにくい銘柄は、スコアが高くても保留以下へ落としてよい。

## event freshness

- 材料は `発表直後` `継続確認済み` `連想のみ` を分けて扱う。
- TDnet や会社IRで一次確認できたものを優先する。
- 数日経過し、価格だけ残って材料の鮮度が落ちたものは `event_freshness=aging` か `stale` にする。

## 手順

1. 実行モードを確定する。
2. 対象範囲を確定する。
   - 指定がなければ日本株全体を対象にする。
   - テーマ指定があれば、テーマ関連銘柄を優先する。
3. 一次スクリーニングを行う。
   - 株探などで `値上がり率` `出来高急増` `ストップ高` `材料ニュース` `決算速報` を確認する。
   - TradingView などで `高値接近/更新` `出来高` `相対強度` `ATR` を確認する。
4. 材料確認を行う。
   - TDnet、会社IR、ニュースで材料の種類と継続性を確認する。
   - 上方修正、自社株買い、大型受注、政策テーマ、セクター物色は加点する。
5. リスク確認を行う。
   - 出来高失速、急騰しすぎ、決算直前、増資懸念、赤字継続、低流動性を確認する。
6. flow と execution の確認を行う。
   - 同テーマ内での先導株か、板と売買代金が想定売買に耐えるか、寄り付き偏重でないかを見る。
   - `liquidity_tier` `slippage_risk` `crowding_risk` `entry_style_hint` を付ける。
7. 候補をスコアリングする。
   - `モメンタム` `出来高` `ボラティリティ` `材料継続性` `流動性` `リスク` を分けて見る。
   - 配点と採用基準は [references/criteria.md](references/criteria.md) の `スコアリング` を使う。
8. 監視候補へ圧縮する。
   - 初回抽出では `5〜10社` にする。
   - 継続レビューでは、前回銘柄の継続可否を先に判定してから差し替える。
9. 出力を整える。
   - 候補ごとに、採用理由、高リスク理由、監視条件、撤退目安を出す。
   - automation 連携を意識する場合は、各候補に `decision_profile=high_beta` `catalyst` `invalidation_hint` `monitoring_valid_until` を付ける。
   - 最後に、企業名だけをカンマ区切りで1行にする。

## 評価ルール

- `出来高急増` は最重要条件として扱う。
- `直近高値接近/更新` または `明確な上昇トレンド` を重視する。
- 財務安全性は足切りに使うが、安定大型株ほど厳しく見ない。
- 赤字企業や低自己資本でも候補に残してよいが、継続企業注記、増資・希薄化懸念、低流動性、材料未確認がある場合は除外を優先する。
- 急騰後に出来高が失速している銘柄は優先度を下げる。
- テーマ性は、単発ニュースではなく市場内で資金が継続しているかを見る。
- 材料の一次確認は TDnet または会社IRを優先する。
- 確認できない項目は採用理由に使わない。
- 迷う場合は、採用ではなく `保留` にする。
- 出力ラベルは screening 段階では `watch` を正とし、執行判断の代わりに使わない。

## データソースの優先順

1. 株探などの値上がり率、出来高急増、材料ニュース、決算速報
2. TradingView などのチャート、出来高、相対強度、ATR
3. TDnet、会社IR、決算資料
4. みんかぶ、Yahoo!ファイナンスなどの補助データ

単一サイトだけで決めず、価格・出来高・材料・流動性を分けて確認する。

## 出力形式

### 初回抽出モード

```md
対象範囲:
抽出基準:

短期監視候補:
| 企業 | 証券コード | スコア | 採用理由 | 高リスク理由 | 監視条件 | 撤退目安 |
| --- | --- | --- | --- | --- | --- | --- |

保留候補:
| 企業 | 証券コード | 保留理由 | 再確認ポイント |
| --- | --- | --- | --- |

除外ルール:

- ...

次に見るべき項目:

- ...

短期監視銘柄名:
企業A, 企業B, 企業C

state 出力:
| 企業 | 証券コード | bucket | decision_profile | thesis_type | selection_reason | catalyst | event_risk | invalidation_hint | monitoring_valid_until | liquidity_tier | slippage_risk | theme_cluster | event_freshness | crowding_risk | entry_style_hint | priority | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

### 継続レビュー モード

```md
対象範囲:
前回選定日:
抽出基準:

前回監視銘柄レビュー:
| 企業 | 証券コード | 判定 | 理由 | 対応 |
| --- | --- | --- | --- | --- |

新規追加候補:
| 企業 | 証券コード | 追加理由 | 高リスク理由 | 監視条件 |
| --- | --- | --- | --- | --- |

今回の短期監視:
| 企業 | 証券コード | スコア | 採用理由 | 高リスク理由 | 監視条件 | 撤退目安 |
| --- | --- | --- | --- | --- | --- | --- |

除外ルール:

- ...

次に見るべき項目:

- ...

短期監視銘柄名:
企業A, 企業B, 企業C

state 出力:
| 企業 | 証券コード | bucket | decision_profile | thesis_type | selection_reason | catalyst | event_risk | invalidation_hint | monitoring_valid_until | liquidity_tier | slippage_risk | theme_cluster | event_freshness | crowding_risk | entry_style_hint | priority | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

## 注意

- これは高リスク高リターン候補の抽出であり、安定投資向けではない。
- 候補には急落リスク、ギャップダウン、材料剥落、流動性低下のリスクがある。
- データが古い、欠落している、サイト間で差異がある場合は明記する。

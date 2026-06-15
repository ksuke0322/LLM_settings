---
name: japan-top-companies-screening
description: "東証33業種を基準に、日本株の各業種で短中期の売買候補になりうるトップ企業を洗い出し、daily trigger check 用の重点監視候補まで圧縮する。日本企業の業種別リーダー候補、時価総額上位かつ財務安全性の高い企業、短中期で監視する候補群を抽出したいときに使用する。株価のテクニカル売買判定そのものではなく、候補銘柄の母集団形成と large_cap watchlist state 作成に使う。"
---

# Japan Top Companies Screening

東証33業種ベースで候補企業を機械的に絞り、最後に定性補正を入れて各業種1〜3社へ落とす。さらに重点監視用に 10〜15社まで圧縮する。初回は母集団から新規抽出し、2回目以降は前回の重点監視銘柄をレビューして `継続` `除外` `新規追加` を判定する。知名度や売上順位だけではなく、時価総額、流動性、収益力、財務安全性、業界地位、相場 regime への適合度を組み合わせて判断する。

この skill は `large_cap` 系の候補抽出専用であり、`japan-high-beta-breakout-screening` の短期高ボラ候補と混ぜない。後段の `stock-investment-decision-support` へ渡すときは、企業名だけでなく選定理由と regime 補助情報を維持した state を残す前提で使う。

## 基本方針

- まず評価軸を固定し、その軸で機械的に絞る。
- 候補抽出はみんかぶなどのスクリーニング画面や財務ランキングを使ってよいが、最終確定は一次情報寄りのデータで確認する。
- 業種分類は東証33業種を正とする。
- 最新株価、時価総額、財務指標は変わるので、毎回 current data を確認する。
- ここでは候補抽出まで行う。チャートの買いシグナル判定は別タスクとして分ける。
- 毎日監視の対象は全33業種をそのまま追わず、母集団から重点監視リストへ圧縮する。
- daily で行うのは full rerun ではなく `trigger check` を前提にした監視候補の維持である。
- 重点監視の更新では、毎回 1 から全銘柄を作り直すより、前回銘柄の残留可否を先に判定する。
- 後段でテクニカル分析に進む場合は `stock-investment-decision-support` の利用を検討する。
- ここで扱うのは未保有の新規監視候補だけとし、確定保有中の銘柄は `stock-investment-position-review` 側へ分離する。

## automation / state file 連携

- この skill は `auto1a` 相当の watchlist producer として扱う。
- 正本 state file は `/Users/sawairikeisuke/Documents/stock-analysis/large_cap_watchlist.json` を想定する。
- 保有除外の参照元として `/Users/sawairikeisuke/Documents/stock-analysis/current_holdings.json` も想定する。
- 後続 automation は automation 定義の書き換えではなく、この state file を読む。
- この skill 自身は `large_cap` 候補だけを出力し、`high_beta` 候補や保有レビュー対象は扱わない。
- `current_holdings.json` の `holdings[].ticker` に含まれる確定保有銘柄は、母集団と重点監視の両方から除外する。
- `/Users/sawairikeisuke/Documents/stock-analysis` 配下の state file を更新した場合は、作業後に差分確認を行い、今回更新したファイルだけを commit して push まで進める。
  - push 先はこの repo の `main` とし、許可条件は `git-workflow-safety` の `stock-analysis` 例外に従う。
  - 差分がない場合は commit / push しない。commit または push に失敗した場合はそこで停止して報告する。

## context-mode 運用

- `large_cap_watchlist.json` と `current_holdings.json` の検証は `ctx_execute_file` で行い、`as_of`、件数、欠落 field、保有除外 ticker だけを返す。
- 業種ごとの候補集計、継続/除外/新規追加の集計、重点監視への圧縮も `ctx_execute` で中間計算し、長い表をそのまま会話へ出さない。
- 外部サイトや docs を補助参照するときは、必要なら `ctx_fetch_and_index` → `ctx_search` を使い、ページ全文を会話へ載せない。

## freshness gate

- `継続レビュー モード` で既存 `large_cap_watchlist.json` を参照する場合、`as_of` `review_mode` `watchlist` が欠けていたら stale / malformed とみなして停止する。
- automation run で参照する `large_cap_watchlist.json` の `as_of` が 7 calendar days を超えて古い場合は stale とみなし、継続レビューを続けず停止する。
- `current_holdings.json` を保有除外に使う場合、`as_of` `holdings` が欠けていたり、各 holding に `ticker` `company` `shares` `average_cost` `bucket` `review_profile` が欠けていたりすれば malformed とみなして停止する。
- `current_holdings.json` は watchlist と同じ当日性を要求しない。`as_of` が古いだけなら warning に留め、pending fill や約定未確定の疑いがある場合だけ停止する。
- stale を検出した場合は fresh screening に勝手に切り替えない。`どの file のどの date が古いか` を明記して停止する。

## state 出力契約

- 後続へ渡す最小項目は `ticker` `company` `bucket=large_cap` `decision_profile=large_cap` `thesis_type` `selection_reason` `event_risk` `priority` `status=watch`。
- 追記互換で `macro_sensitivity` `sector_cycle` `liquidity_tier` `execution_caution` `regime_fit` を持たせてよい。
- `selection_reason` は `定量` と `定性` を混ぜず、短くてもよいので後段で再利用できる形にする。
- `thesis_type` は `sector_leader` `quality_large_cap` `relative_strength` など、large_cap 側で再利用しやすいラベルへ正規化する。
- `event_risk` は決算接近、資本政策、業界イベントなど、daily trigger check で見直すべき項目を優先して書く。
- `macro_sensitivity` は `円安追い風` `金利上昇逆風` `資源価格感応` のように、監視の前提を短く残す。
- `sector_cycle` は `半導体循環上向き` `金融地合い良化` のように業種サイクルを要約する。
- `liquidity_tier` は `top_tier` `adequate` `thin_for_large_size` などで書く。
- `execution_caution` は「大型株でも寄り天やイベント跨ぎで注意が必要か」を短く書く。
- `regime_fit` は `strong` `neutral` `weak` 程度の粗い適合度でよい。

## 入力解釈

- 入力は通常、日本企業全体または一部業種を対象にした「トップ企業の洗い出し」依頼とみなす。
- ただし、前回の重点監視銘柄が与えられた場合は、「前回銘柄のレビューと入れ替え提案」依頼として扱う。
- ユーザー指定がなければ、各業種の候補数は `1〜3社` を基本にする。
- ユーザーが特定サイトを指定した場合、そのサイトは一次スクリーニングに使ってよい。ただし、そのサイトだけを正本にしない。
- ユーザーが短中期利益狙いと明示した場合、長期の名門企業でも流動性や資本効率が弱いものは優先度を下げる。
- ユーザーが毎日監視を前提にしている場合、全33業種の候補をそのまま渡さず、`母集団` から `重点監視` へ圧縮して出す。
- 確定保有中の銘柄は新規候補に含めず、買い増し可否や防衛判断は `stock-investment-position-review` に委ねる。
- 前回銘柄レビューでは、入力は `前回選定日` と `前回監視銘柄` を基本形とする。
- `前回選定日` がない場合でも進めてよいが、何が変わったかの説明はやや弱くなるのでその旨を明記する。
- `market-regime-assessment` の出力がある場合は補助情報として参照してよいが、この skill の正本判定を置き換えない。

## 実行モード

### 1. 初回抽出モード

- 前回の重点監視銘柄が渡されていない場合に使う。
- 東証33業種または指定範囲から母集団を作り、重点監視まで圧縮する。

### 2. 継続レビュー モード

- 前回の重点監視銘柄が渡されている場合に使う。
- まず前回銘柄を `継続候補` `除外候補` `保留` に分類する。
- 次に不足枠だけを新規候補で埋める。
- 出力の主眼は「前回から何を残すか、何を外すか、何を追加するか」に置く。

## market regime 前提

- large-cap は企業品質だけでなく、今の相場地合いで監視価値が高いかを判定する。
- `risk_on` では半導体、機械、グローバル景気敏感の優先度が上がりやすい。
- `risk_off` ではディフェンシブ、キャッシュ創出力、業界内地位の強さをより重く見る。
- `円安 / 円高`、`金利上昇 / 低下`、`資源高 / 資源安` の影響を、業種ごとに雑でもよいので state に残す。

## sector cycle / macro exposure

- 電機、自動車、機械は海外売上比率、為替耐性、設備投資循環を確認する。
- 金融は金利、クレジット、資本政策の感応度を確認する。
- 商社、資源、海運は商品市況と還元方針の変化を確認する。
- 製薬はパイプラインや特許イベントの偏りを、テクニカル前段の event risk として残す。
- 業種内比較では「良い会社」より「今この cycle で残す合理性」を優先してよい。

## liquidity / execution feasibility

- 大型株でも event day や決算跨ぎでは execution risk が上がるため、常に `execution_caution` を確認する。
- 1日売買代金が厚くても、寄り付きギャップ主導で監視価値が薄い場合は priority を落とす。
- TOPIX コア銘柄でも、直近で相対弱さが続くなら `regime_fit=weak` として残す。
- 後段は執行判断 skill に委ねるが、「大型だから執行しやすいはず」という雑な前提は置かない。

## 手順

1. 実行モードを確定する。
   - 前回の重点監視銘柄が入力されていれば `継続レビュー モード` で進める。
   - なければ `初回抽出モード` で進める。
2. 対象範囲を確定する。
   - 全33業種か、ユーザー指定の一部業種かを確認する。
   - 指定がなければ全33業種で進める。
3. 東証33業種の定義を確認する。
   - JPX の業種分類を基準にする。
4. 一次スクリーニングを行う。
   - みんかぶ等で `時価総額` `ROE` `自己資本比率` `営業利益率` `売買代金` などを用いて候補を絞る。
   - 使う閾値は [references/criteria.md](references/criteria.md) を基準にする。
5. `current_holdings.json` を参照して確定保有銘柄を除外する。
   - state file 検証と除外判定は `ctx_execute_file` で行い、ticker ベースの除外結果だけを使う。
   - 除外判定は企業名ではなく `ticker` を正本にする。
   - pending fill や約定未確定注文は保有確定として扱わない。
   - 除外した銘柄は、後で `既存保有のため対象外` として出力できるように控える。
6. 二次確認を行う。
   - 候補企業の直近決算、営業CF、フリーCF、有利子負債、利益安定性を確認する。
   - 明らかな一過性利益、赤字転落、過度な財務悪化があれば除外する。
7. 定性補正を行う。
   - 国内シェア、世界シェア、ブランド力、価格決定力、参入障壁、海外競争力を確認する。
   - 定量で僅差なら、業界内地位が高い方を上位に置く。
8. regime 補正を行う。
   - 相場 regime、業種相対強度、為替・金利・資源価格感応度を見て `regime_fit` を付ける。
   - 監視価値は高いが current regime と逆風なら、除外ではなく priority を落として残してよい。
9. `初回抽出モード` なら各業種で `1〜3社` に絞る。
   - 役割が似た銘柄ばかりに偏らないようにする。
   - 過熱感の強い銘柄は「有力だが要注意」と注記して残してよい。
10. `継続レビュー モード` なら前回銘柄をレビューする。
   - review_mode、watchlist 件数、stale 判定は `ctx_execute_file` で先に機械確認する。
   - 各銘柄を `継続` `除外` `保留` に分類する。
   - 判定理由は `定量変化` `定性変化` `regime 変化` に分けて書く。
   - `継続` を優先して残し、除外や保留で空いた枠だけ新規候補を補う。
11. daily 監視用に圧縮する。
   - `初回抽出モード` では母集団 33社前後から、重点監視 `10〜15社` を選ぶ。
   - `継続レビュー モード` では `継続` を先に残し、その後に新規追加候補を入れて重点監視 `10〜15社` に整える。
   - 圧縮基準は [references/criteria.md](references/criteria.md) の daily monitoring を使う。
12. 出力を整える。
   - `初回抽出モード` では従来どおり候補企業名、証券コード、選定理由、留意点を添える。
   - `継続レビュー モード` では `前回からの継続 / 除外 / 保留 / 新規追加` を分けて出す。
   - `current_holdings.json` に基づいて除外した銘柄があれば、`既存保有のため対象外` として明示する。
   - automation 連携を意識する場合は、各候補に `decision_profile=large_cap` `thesis_type` `regime_fit` を付ける。
   - 最後に、今回の重点監視へ残した企業名だけをカンマ区切りで1行出す。

## 評価ルール

- 売上高1位や知名度だけでトップ企業と判定しない。
- `時価総額` と `売買代金` を短中期売買の前提条件として強く重視する。
- `ROE` `営業利益率` `自己資本比率` `営業CF` を満たさない大型株は、候補から外すか優先度を落とす。
- `PER` `PBR` は単独採用条件ではなく、極端な割高を除くためのフィルタとして扱う。
- 金融、商社、資源、製薬など業種特性で一般閾値が歪む場合は、業種内相対評価を優先する。
- 候補抽出の根拠は「定量」と「定性」を分けて書く。
- daily 監視への圧縮では、`流動性` `相対強さ` `決算距離` `テーマ性` `regime_fit` を優先する。
- 母集団の分散より、重点監視段階では「今見ても意味があるか」を優先する。
- 継続レビューでは、新規発掘より先に `前回銘柄を残すべき理由が維持されているか` を判定する。
- `除外` は強い根拠があるときに限り、判断に迷う場合は `保留` を使う。
- 重点監視の入れ替えは毎回大きく動かさず、合理的な理由がある銘柄だけを差し替える。
- 出力ラベルは screening 段階では `watch` を正とし、後段の執行判断に先回りして `entry_ready` を乱発しない。

## データソースの優先順

1. JPX の業種分類
2. 会社の直近決算資料・IR・有価証券報告書
3. みんかぶ等のスクリーニング・ランキングページ
4. 補助的な市場データサイト

みんかぶは「候補を機械的に絞る」用途に使う。みんかぶだけで決め打ちしない。

## 出力形式

以下の形式で簡潔に出す。

### 初回抽出モード

```md
対象範囲:
抽出基準:
market regime:

母集団:
| 業種 | 候補企業 | 証券コード | 選定理由 | 留意点 |
| --- | --- | --- | --- | --- |

screening 対象外:
| 企業 | 証券コード | 理由 |
| --- | --- | --- |

重点監視:
| 企業 | 証券コード | 採用理由 | 監視ポイント |
| --- | --- | --- | --- |

除外ルール:

- ...

次に見るべき項目:

- ...

重点監視銘柄名:
企業A, 企業B, 企業C

state 出力:
| 企業 | 証券コード | bucket | decision_profile | thesis_type | selection_reason | event_risk | macro_sensitivity | sector_cycle | liquidity_tier | execution_caution | regime_fit | priority | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

### 継続レビュー モード

```md
対象範囲:
前回選定日:
抽出基準:
market regime:

前回監視銘柄レビュー:
| 企業 | 証券コード | 判定 | 理由 | 対応 |
| --- | --- | --- | --- | --- |

screening 対象外:
| 企業 | 証券コード | 理由 |
| --- | --- | --- |

新規追加候補:
| 企業 | 証券コード | 追加理由 | 監視ポイント |
| --- | --- | --- | --- |

今回の重点監視:
| 企業 | 証券コード | 採用理由 | 監視ポイント |
| --- | --- | --- | --- |

除外ルール:

- ...

次に見るべき項目:

- ...

重点監視銘柄名:
企業A, 企業B, 企業C

state 出力:
| 企業 | 証券コード | bucket | decision_profile | thesis_type | selection_reason | event_risk | macro_sensitivity | sector_cycle | liquidity_tier | execution_caution | regime_fit | priority | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

必要に応じて、各業種の「本命」「次点」を分けてよい。daily 監視を前提にする場合は、母集団だけで終わらず重点監視まで圧縮する。継続レビューでは、レビュー結果と入れ替え理由を必ず明示する。

## 注意

- これは投資助言ではなく、候補銘柄の抽出支援である。
- データが古い、欠落している、サイト間で差異がある場合は、その旨を明記する。
- 相場急変、決算直前直後、資本政策イベント直後は平常時より慎重に扱う。

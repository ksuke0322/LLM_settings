# trend_viewer analysis / intraday consumer contract

stock skillsがtrend_viewerの`analysis`と`intraday`を利用するときの共通契約を定める。
APIのフィールド名、品質値、トレンド判定の意味、fail-close条件はこの文書を参照し、lane固有の採用条件は各lane skillに残す。

## 正本と対象エンドポイント

### API正本

実装・契約の確認元は次の順序とする。

1. `trend_viewer/specs/001-repo-app-spec/contracts/openapi.yaml`
2. `trend_viewer/apps/backend/src/routes/stocks.ts`
3. `trend_viewer/packages/stock-analysis/src/contract.ts`
4. `trend_viewer/packages/stock-analysis/src/index.ts`

skills側でAPIのフィールドやenumを再定義する場合は、上記の差分を確認してから更新する。
この文書はconsumer向けの意味と運用ゲートを定めるものであり、API実装の代替ではない。

### 対象エンドポイント

| 用途 | エンドポイント | schema | 時間軸 |
| --- | --- | --- | --- |
| 日足の短期分析 | `GET /stock/{ticker}/analysis?range=recent&schema=trade-v2` | `trade-v2` | `Asia/Tokyo`、日足 |
| 日中足の品質・バー取得 | `GET /stock/{ticker}/intraday?date=YYYY-MM-DD&interval=1m\|5m` | `intraday-v1` | 指定したJST暦日 |

`analysis`で`schema`を省略したレスポンスはlegacy `1.0`であり、短期売買のsetup契約としては扱わない。
`intraday`の`date`はJSTの暦日であり、UTC日付へ変換して別日として扱わない。

## 共通品質エンベロープ

`analysis`と`intraday`は、少なくとも次のフィールドを返す。

| フィールド | 許容値・意味 | consumerの扱い |
| --- | --- | --- |
| `schemaVersion` | `1.0` / `trade-v2` / `intraday-v1` | 想定schema以外は利用停止し、理由を残す |
| `dataQuality` | `complete` / `partial` / `insufficient` / `no_data` / `unknown` | `complete`以外は品質不足として明示する |
| `readiness` | `ready` / `blocked` / `unknown` | `ready`以外を執行可能と解釈しない |
| `reasonCodes` | 安定した機械可読コードの配列 | 全件を保持し、欠落理由を推測しない |
| `source` | データ取得元 | provenanceに保存する |
| `asOf` | データの基準時点。取得不能時は`null` | stale判定に使用し、nullを現在値に補完しない |
| `fetchedAt` | 取得時刻のISO datetime | 実行時点の証跡として保存する |
| `timezone` | `Asia/Tokyo` | JST以外への暗黙変換をしない |

### 品質と執行のゲート

- `dataQuality=complete`、`readiness=ready`、必須フィールドが揃っている場合だけ、laneが定める採用判定へ進める。
- `partial`、`insufficient`、`no_data`、`unknown`、または`readiness=blocked|unknown`の場合、未保有銘柄のentry、追加、paper注文の根拠に使わない。
- 品質不足は候補単位で`fail-close`し、他の銘柄や別laneの成功を根拠に補完しない。
- `reasonCodes`が空、`asOf`が欠落、schemaが想定外、または必須フィールドの型が不正な場合は、API成功ステータスでも利用不能として扱う。
- `fetchedAt`が新しくても、`asOf`が古い・nullであることを解消したとはみなさない。

## `trade-v2` の構造と意味

`trade-v2`は次の主要領域を持つ。

| 領域 | 主なフィールド | 利用上の注意 |
| --- | --- | --- |
| `feature.chartSummary` | `latestClose`, `latestHigh`, `latestLow`, `latestVolume` | 最新バーの要約。nullは欠落であり、価格の推測は禁止 |
| `feature.indicatorState` | `superTrendDirection`, `sarDirection`, `macdDirection`, `dmiDirection`, `rsiState`, `stochasticState`, `bollingerState` | 個別指標は補助証拠。単独でtrendやentryを確定しない |
| `feature.trendState` | `direction`, `strength`, `persistence`, `confirmation`, `regime`, `reasonCodes` | 下記のトレンド契約を正本とする |
| `feature.metrics` | ATR、EMA傾き、MACD、出来高倍率、高値安値距離、`breakoutCandidate`等 | nullと0を区別し、欠落を中立値へ変換しない |
| `feature.eventRisk` | `daysToEarnings`, `hasUpcomingEvent`, `eventRiskLevel` | `unknown`を「イベントなし」と解釈しない |
| `setup` | `setupType`, `setupScore`, `confidence`, `confidenceScore`, `confidenceSemantics`, `evidenceGroups`, `reasons`, `invalidations` | APIが返したsetupを別laneの採用条件へ自動昇格しない |
| `risk` | entry、stop、target、R/R等 | 品質・イベント・ポートフォリオ制約を満たすまで注文値にしない |

### confidenceの意味

- `confidenceScore`は、trend・momentum・volatility・volumeの証拠グループを合成した定性的なスコアである。
- `confidenceSemantics=qualitative`を必須の意味付けとし、確率、期待収益率、勝率として表示・計算しない。
- `evidenceGroups`は各グループ最大25点の方向付き証拠であり、合計点の大きさだけで採用しない。
- `contradictory`、`partial`、`insufficient`の証拠が含まれる場合、reason codeとともに不確実性を保持する。

### event riskのfail-close

- `eventRiskLevel=unknown`は、イベント情報を確認できていない状態である。
- `unknown`、`hasUpcomingEvent=true`、または`eventRiskLevel=high`の場合、未保有銘柄のentry・追加・paper注文をブロックする。
- 保有銘柄レビューでは「イベントリスク未確認」として警告を表示してよいが、イベントなし・安全とは断定しない。
- `daysToEarnings=null`からイベントがない、または休日であるとは推測しない。

## インジケータのトレンド判定契約

`feature.trendState`は、単一のインジケータ方向ではなく、価格・EMA stack・DMI・ADX・継続性・確認窓を組み合わせた状態である。

### 判定要素

- 各バーの候補方向は、`close > EMA10 > EMA25 > EMA60`かつ`+DI > -DI`をbullish、反対をbearishとする。必要値が欠けるバーは候補なしとする。
- 最新候補だけで即時反転せず、直近の継続性を使ったhysteresisを適用する。1バーだけの反転は、既存方向を維持する場合がある。
- `confirmation`は直近3バー中2バー以上の候補方向を確認する。`confirmed=false`はトレンド確定ではない。
- `persistence`は採用方向の連続バー数であり、2バー未満は継続性不足として扱う。
- ADXはentry側の閾値20、exit側の閾値18を使うhysteresisで、ADXが低い場合は`range`または`transition`へ退避する。
- 必要な履歴が60バー未満、最新候補またはADXが取得不能の場合は、方向・強度を`unknown`として利用停止する。

### consumerの解釈

| 状態 | 意味 | 許可される扱い |
| --- | --- | --- |
| `regime=trend_up` + `direction=bullish` | 確認・継続性・ADX条件を満たした上昇レジーム | 上昇側setupの候補評価へ進める。entryは他の品質・イベント・lane条件も必要 |
| `regime=trend_down` + `direction=bearish` | 確認・継続性・ADX条件を満たした下降レジーム | 下降側setupの候補評価へ進める。ショート採用を自動決定しない |
| `regime=range` | ADX低下などでトレンド優位性がない | トレンドブレイク根拠にしない |
| `regime=transition` | 確認または継続性が保留 | 新規執行を確定しない |
| `direction=unknown` または`strength=unknown` | 必要なトレンド証拠が不足 | fail-closeし、reason codeを保持する |

`direction`がbullish/bearishでも、`regime`が`range|transition`、`confirmation.confirmed=false`、または`persistence`不足なら、確定トレンドとして扱わない。
`indicatorState`の過半数や`setupScore`だけでこのゲートを迂回しない。

## `intraday-v1` の品質・coverage契約

`intraday-v1`は日中足バーと取得範囲の品質を返す。

| 領域 | フィールド | 意味 |
| --- | --- | --- |
| 識別 | `ticker`, `date`, `interval` | 要求された銘柄、JST暦日、`1m|5m` |
| データ | `bars` | 取得できたバー。空配列はデータなしまたは取得不能の可能性を残す |
| coverage | `expectedBarCount` | 期待バー数。算出不能時はnull |
| coverage | `returnedBarCount` | 返却バー数 |
| coverage | `missingBarCount` | 欠落バー数。算出不能時はnull |
| coverage | `gapIntervals` | 欠落区間の配列 |
| coverage | `missingOhlcBarCount` | OHLC欠落バー数 |

- `date`はJSTの要求日であり、`asOf`や最終バー時刻が別日でも要求日を書き換えない。
- `no_data`、`unknown`、空の`bars`、`expectedBarCount=null`を、休日・休場・正常終了のいずれかへ推測変換しない。
- `missingBarCount > 0`、`gapIntervals`あり、`missingOhlcBarCount > 0`、または`dataQuality != complete`の場合、日中足を完全な観測として扱わない。
- 休場判定が必要な場合は、別途明示された市場カレンダーまたは市場状態証跡を使い、intradayレスポンスだけから決めない。

## lane境界

| lane | この契約から利用できるもの | この契約だけでは行わないこと |
| --- | --- | --- |
| auto1b / breakout discovery | `chartSummary`、`metrics`、品質・provenance | `setup`のentry/RRを候補発見へ逆流させない |
| auto2a / decision support | `trade-v2`の`trendState`、証拠、setup、risk | 品質・event unknownを無視した採用や注文計画を作らない |
| auto2b / high-beta flow | `intraday-v1`のcoverageと`trade-v2`の品質・event gate | 日中足欠落を推測補完し、後段を成功扱いにしない |
| auto3 / position review | `trade-v2`の短期advisoryと保有thesisの比較 | advisoryを自動売却・追加注文へ昇格させない |
| auto4 / allocator | 前段でeligibleになった候補とportfolio state | signal品質やmarket regimeを独自再判定しない |

lane間で同じレスポンスを共有しても、採用判定・注文権限・長期保有ガバナンスは混ぜない。

## provenanceの最低限

各consumerは、少なくとも次を同じ候補・同じrunに紐づけて保存する。

- `source`、実際に叩いたpathとquery（`schema`、`range`、`date`、`interval`を含む）
- `schemaVersion`、`dataQuality`、`readiness`、`reasonCodes`
- `asOf`、`fetchedAt`、`timezone`
- 採用・見送り・blockedの理由と、後段へ渡したrevisionまたはmanifest

chatやautomation memoryの要約だけを正本にせず、JSON stateまたはsidecarから再現可能にする。

## 契約変更時の確認

API側でenum、フィールド、閾値、reason code、品質ゲートを変更した場合は、次を同じ変更単位で確認する。

1. OpenAPIと実装の整合
2. 本文書と各consumer skillの整合
3. `dataQuality`、`readiness`、`reasonCodes`、provenanceの保存
4. unknown・partial・no_data・gapのfail-close
5. lane境界を越えるフィールド利用がないこと

不明な仕様は中立値や推測で埋めず、`確認不能`または明示的なblocked理由として残す。

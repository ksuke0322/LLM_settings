---
name: stock-investment-decision-support
description: 企業名だけを入力として、日本株の銘柄コードを特定し、固定の trend_viewer trade-v2 analysis API から短期向け recent 分析 JSON を取得して、短期（1ヶ月以内程度）の売買判断材料レポートを作る。任天堂、トヨタ、ソニーなど企業名から短期目線の銘柄分析を依頼されたときに使用する。
---

# Stock Investment Decision Support

企業名から銘柄コードを特定し、trend_viewer の trade-v2 analysis endpoint を使って短期（1ヶ月以内程度）の売買判断材料レポートを作る。

これは投資助言ではない。最終判断はユーザーが行う。断定的な売買指示は避け、根拠・反証条件・リスクを明示する。

## 固定設定

```text
API_BASE_URL=https://bfdkvlo2zi752fp5mhaq4koreq0ezvbd.lambda-url.ap-northeast-1.on.aws
ENDPOINT=/stock/{ticker}/analysis?range=recent&schema=trade-v2
投資スタイル=短期（1ヶ月以内程度）
```

## 入力

ユーザー入力は企業名を想定する。単一企業でも複数企業でもよい。

```text
任天堂
```

```text
任天堂、トヨタ、ソニー
```

保有中か未保有かは聞かない。必要なら出力側で「新規で入る場合」「すでに保有している場合の利確・撤退条件」を軽く分ける。

## 手順

1. 入力された各企業について企業名から銘柄コードを特定する。
   - 日本企業は原則として東証 ticker の `.T` を優先する。
   - 例: 任天堂 -> `7974.T`
   - 候補が複数あり、どれか判断できない場合だけユーザーに確認する。
2. 各 ticker ごとに endpoint URL を組み立てる。
   - 形式: `${API_BASE_URL}/stock/${ticker}/analysis?range=recent&schema=trade-v2`
3. 各 URL から JSON を取得する。
   - この固定 API 取得では、初回から権限付き `curl` で JSON を取得する。承認済みの `curl` prefix が利用できる場合は、通常 sandbox の事前試行を挟まず権限付き実行を優先する。
   - 権限付き実行が拒否された、または実行ポリシー上利用できない場合だけ、通常 sandbox の `curl` にフォールバックする。
   - 一時的な DNS / network 失敗があり得るため、権限付き `curl` で `curl: (6) Could not resolve host`、接続失敗、timeout が出てもすぐ失敗扱いにせず、短い間隔で 2〜3 回 retry する。
   - 通常 sandbox へフォールバックして `curl: (6)` になった場合も、ただちに Lambda / API 障害と判断しない。権限付き実行が利用可能な状態に戻ってから同じ URL を再確認して取得失敗として扱う。
   - `curl: (6) Could not resolve host` は AWS Lambda Function URL に到達する前の DNS / outbound egress 失敗として扱う。Lambda handler error、timeout、throttling とは切り分ける。
   - DNS 確認が必要な場合は DoH（例: `https://1.1.1.1/dns-query`）で A / AAAA レコードを補助確認してよい。ただし名前解決できても、実行環境からの direct connect が許可される保証にはならない。
4. 取得できない場合は、ticker と URL を示して失敗理由を簡潔に報告する。
   - Lambda Function URL へ届いていない可能性が高い失敗: DNS 解決失敗、接続失敗、TLS 接続前の timeout。
   - Lambda 側を疑う失敗: HTTP 5xx、HTTP 429、Function URL の 4xx、JSON 形式不正、Lambda timeout 由来の応答。
   - Lambda 側を疑う場合は、CloudWatch の `UrlRequestCount` / `Url4xxCount` / `Url5xxCount` / `UrlRequestLatency` と Lambda metrics の `Invocations` / `Errors` / `Throttles` / `Duration` 確認を推奨する。
5. 取得に成功した企業ごとに、取得データだけで短期（1ヶ月以内程度）目線の分析を行う。
   - API が返す `feature`, `setup`, `risk` を主な根拠に使う。
   - skill / LLM の役割は、API 判定の説明、反証条件の補足、複数銘柄比較に限定する。
   - API が `setupType=no_trade` を返した場合、独自解釈で無理に買い/売り候補へ寄せない。
6. 複数企業入力時は、各企業について単一企業入力時と同じ粒度で `相場レジーム`, `セットアップ種別`, `setupScore / confidence`, `無効化条件`, `時間切れ条件`, `利確の目安`, `損切り・撤退の目安`, `リスク警告` まで必ず出したうえで、最後に分類サマリーを追加する。
7. 一部の企業だけ取得に失敗しても、成功した企業の分析は継続し、失敗した企業は別枠で報告する。

## 分析観点

- `setup.regime`, `setup.setupType`, `setup.setupScore`, `setup.confidence`
- `setup.reasons`, `setup.invalidations`
- `risk.entryZone`, `risk.stopPrice`, `risk.target1`, `risk.target2`, `risk.minimumRR`, `risk.timeStopDays`, `risk.riskWarnings`
- `feature.chartSummary`
- `feature.metrics`
  - `atr14`
  - `gapPercent`
  - `recentSwingHigh`, `recentSwingLow`
  - `distanceFrom20dHighPercent`, `distanceFrom20dLowPercent`, `distanceFrom60dHighPercent`
  - `volumeRatioVsMa20`
  - `ema10Slope`, `ema25Slope`, `ema60Slope`
  - `breakoutCandidate`
- `feature.indicatorState`
  - `superTrendDirection`
  - `sarDirection`
  - `macdDirection`
  - `dmiDirection`
  - `rsiState`
  - `stochasticState`
  - `bollingerState`
- `feature.eventRisk`

短期判断では、まず API の `setup` と `risk` を読む。`feature` はその理由説明と反証条件の補強に使う。analysis endpoint の recent trade-v2 は `6mo` の日足と、短期向けテクニカル指標に加えて setup/risk まで返す前提で扱う。

単独指標だけで判断しない。API 判定と feature の向きが矛盾する場合は `見送り` を優先する。

## 出力形式

単一企業入力でも複数企業入力でも、**各企業の個別分析は必ず Markdown テーブル形式で出す**。
左ほど優先して見るべき項目を置く。列が増えすぎるので、1表に詰め込まず、優先度順の 2 テーブル構成にする。

### 個別分析テーブル 1

- 最優先の判定・執行判断をまとめる
- カラム順は固定する

```md
| 対象企業 | 銘柄コード | 短期判断（5分類） | 相場レジーム | セットアップ種別 | setupScore / confidence | エントリーゾーン | 利確の目安 | 損切り・撤退の目安 | 時間切れ条件 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 任天堂 | 7974.T | 様子見推奨 | range | no_trade | 42 / low | ... | ... | ... | ... |
```

### 個別分析テーブル 2

- 判定理由と反証条件をまとめる
- 長くなるセルは簡潔な句読点区切りで圧縮する

```md
| 対象企業 | 現状認識 | 強気材料 | 弱気材料 | 無効化条件 | エントリーを検討できる条件 | 見送る条件 | リスク警告 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 任天堂 | ... | ... | ... | ... | ... | ... | ... |
```

### 単一企業入力時の補足

- テーブルの前に `取得エンドポイント` を 1 行だけ置いてよい
- テーブルの後に `データ上の限界` を箇条書きで付ける

```text
取得エンドポイント:

データ上の限界:
- 取得データは short-term recent (`6mo` の日足と短期向けテクニカル指標) に限定される
- 決算、業績予想、ニュース、為替、金利、需給、地合いは含まれない
- これは投資助言ではなく、提供データに基づく分析支援
```

### 複数企業入力時の補足

- **各企業の詳細レポートは単一企業入力時と同じテーブル項目をすべて出す**
- 省略してよいのは最後の分類サマリーだけで、個別レポートの項目は減らさない
- そのうえで最後に分類サマリーを追加する

```text
分類サマリー:

売り転換シグナルあり:
- ...

下降中:
- ...

様子見推奨:
- ...

上昇中:
- ...

買い転換シグナルあり:
- ...

取得失敗:
- ...
```

## 判断ルール

- `買い`、`売り` と断定しない。
- 判定主体は API とし、skill は API 判定を説明する。
- 単一入力でも複数入力でも、各銘柄に対する判定項目は同一とする。複数入力だからという理由で `regime`, `setupType`, `invalidations`, `timeStopDays`, `riskWarnings` を省略しない。
- `setupType=no_trade`、`minimumRR` 不足、`riskWarnings` が強い場合は `様子見推奨` を優先する。
- データが矛盾する場合は `様子見推奨` を優先する。
- 判断期間は短期（1ヶ月以内程度）に限定し、中期・長期判断は出力しない。
- endpoint に含まれない情報を根拠にしない。必要なら「追加確認が必要」と明記する。
- 複数企業入力時の分類サマリーは、API 判定を次の補助ラベルへ正規化して要約する。
  - `買い転換シグナルあり`: `setupType=breakout_long` または `rebound_long` かつ `confidence=high`
  - `上昇中`: `regime=trend_up` かつ `setupType=pullback_long|breakout_long`
  - `様子見推奨`: `setupType=no_trade` または `minimumRR` 不足
  - `下降中`: `regime=trend_down` かつ `setupType=no_trade`
  - `売り転換シグナルあり`: `setupType=rally_fade_short`
- 各企業の個別出力は、単一入力でも複数入力でも同じテーブル列を使う。
- `reasons`, `invalidations`, `riskWarnings` を要約して、人間が執行可否を判断しやすい順に並べる。
- エントリー条件では `entryZone`, `minimumRR`, `timeStopDays` を必ず確認する。
- 利確・撤退条件では `target1`, `target2`, `stopPrice`, `holdUntilCondition` を優先して説明する。

---
name: stock-investment-decision-support
description: 企業名だけを入力として、日本株の銘柄コードを特定し、固定の trend_viewer analysis API から短期向け recent 分析 JSON を取得して、短期（1ヶ月以内程度）の売買判断材料レポートを作る。任天堂、トヨタ、ソニーなど企業名から短期目線の銘柄分析を依頼されたときに使用する。
---

# Stock Investment Decision Support

企業名から銘柄コードを特定し、trend_viewer の analysis endpoint を使って短期（1ヶ月以内程度）の売買判断材料レポートを作る。

これは投資助言ではない。最終判断はユーザーが行う。断定的な売買指示は避け、根拠・反証条件・リスクを明示する。

## 固定設定

```text
API_BASE_URL=https://bfdkvlo2zi752fp5mhaq4koreq0ezvbd.lambda-url.ap-northeast-1.on.aws
ENDPOINT=/stock/{ticker}/analysis?range=recent
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
   - 形式: `${API_BASE_URL}/stock/${ticker}/analysis?range=recent`
3. 各 URL から JSON を取得する。
   - Codex の通常 sandbox では Lambda Function URL への DNS / outbound egress が `curl: (6) Could not resolve host` で失敗することがあるため、API 取得は可能な限り権限付き実行で行う。
   - 通常 sandbox で `curl: (6)` になっても、ただちに Lambda / API 障害と判断しない。同じ URL を権限付き実行で再確認してから取得失敗として扱う。
   - 一時的な DNS / network 失敗があり得るため、`curl: (6) Could not resolve host`、接続失敗、timeout はすぐ失敗扱いにせず、短い間隔で 2〜3 回 retry する。
   - `curl: (6) Could not resolve host` は AWS Lambda Function URL に到達する前の DNS / outbound egress 失敗として扱う。Lambda handler error、timeout、throttling とは切り分ける。
   - DNS 確認が必要な場合は DoH（例: `https://1.1.1.1/dns-query`）で A / AAAA レコードを補助確認してよい。ただし名前解決できても、実行環境からの direct connect が許可される保証にはならない。
4. 取得できない場合は、ticker と URL を示して失敗理由を簡潔に報告する。
   - Lambda Function URL へ届いていない可能性が高い失敗: DNS 解決失敗、接続失敗、TLS 接続前の timeout。
   - Lambda 側を疑う失敗: HTTP 5xx、HTTP 429、Function URL の 4xx、JSON 形式不正、Lambda timeout 由来の応答。
   - Lambda 側を疑う場合は、CloudWatch の `UrlRequestCount` / `Url4xxCount` / `Url5xxCount` / `UrlRequestLatency` と Lambda metrics の `Invocations` / `Errors` / `Throttles` / `Duration` 確認を推奨する。
5. 取得に成功した企業ごとに、取得データだけで短期（1ヶ月以内程度）目線の分析を行う。
6. 複数企業入力時は、個別分析をすべて行ったうえで分類サマリーを追加する。
7. 一部の企業だけ取得に失敗しても、成功した企業の分析は継続し、失敗した企業は別枠で報告する。

## 分析観点

- 価格トレンド: 直近終値、上昇/下降傾向、高値・安値の切り上げ/切り下げ
- 移動平均: EMA 10 / 25 / 60。EMA 25 を主軸に、EMA 10 は初動、EMA 60 は地合い確認として使う
- トレンド系: SuperTrend、Parabolic SAR、DMI/ADX
- 過熱感: RSI、Slow Stochastic、Bollinger Bands
- モメンタム: MACD
- 出来高: volume と Volume MA20

短期判断では、1ヶ月前後の方向感と直近数日から数週間の転換シグナルを優先する。analysis endpoint の recent は短期プロファイルとして `6mo` の日足と、`EMA10/25/60`、`SuperTrend(7,2.5)`、`Parabolic SAR(0.02,0.2)`、`DMI/ADX(10)`、`RSI(9)`、`Slow Stochastic(14,3,3)`、`Bollinger Bands(20,2)`、`MACD(8,17,6)`、`Volume MA20` を返す前提で扱う。

単独指標だけで判断しない。複数指標が同じ方向を示す場合に重みを置く。

## 出力形式

単一企業入力時は以下の順で日本語で簡潔に出力する。

```text
対象企業:
銘柄コード:
取得エンドポイント:

現状認識:

短期判断（5分類）:

強気材料:
- ...

弱気材料:
- ...

エントリーを検討できる条件:
- ...

見送る条件:
- ...

利確の目安:
- ...

損切り・撤退の目安:
- ...

データ上の限界:
- 取得データは short-term recent (`6mo` の日足と短期向けテクニカル指標) に限定される
- 決算、業績予想、ニュース、為替、金利、需給、地合いは含まれない
- これは投資助言ではなく、提供データに基づく分析支援
```

複数企業入力時は、各企業の詳細レポートに加えて最後に分類サマリーを追加する。

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
- 短期判断の主分類は `売り転換シグナルあり`、`下降中`、`様子見推奨`、`上昇中`、`買い転換シグナルあり` のいずれかで表現する。
- データが矛盾する場合は `様子見推奨` を優先する。
- 判断期間は短期（1ヶ月以内程度）に限定し、中期・長期判断は出力しない。
- endpoint に含まれない情報を根拠にしない。必要なら「追加確認が必要」と明記する。
- 複数企業入力時の分類サマリーは、個別レポートの `短期判断（5分類）` を要約する補助ラベルとして扱う。分類サマリーだけで個別分析を省略しない。
- `買い転換シグナルあり` は、下落またはもみ合いから上方向へ転換し始めた場合に限る。終値の EMA 10 / 25 回復、EMA 10 の上向き転換、SuperTrend / Parabolic SAR の改善、MACD のシグナル上抜けまたはヒストグラム改善、+DI 優位、出来高増を伴う上昇のうち複数が直近で一致することを重視する。
- `上昇中` は、すでに上昇トレンドが継続している場合に使う。終値が EMA 10 / 25 を上回り、EMA 10 / 25 / 60 の並びや傾き、SuperTrend、Parabolic SAR、MACD、DMI の多くが強気方向を維持しているが、直近の転換初動ではない状態を指す。
- `様子見推奨` は、指標が割れている、過熱感が強い、出来高の裏付けが弱い、方向感が乏しい、または転換初動と判断する根拠が不足する場合に使う。
- `下降中` は、すでに下降トレンドが継続している場合に使う。終値が EMA 10 / 25 を下回り、EMA 10 / 25 / 60 の並びや傾き、SuperTrend、Parabolic SAR、MACD、DMI の多くが弱気方向を維持しているが、直近の下方向転換初動ではない状態を指す。
- `売り転換シグナルあり` は、上昇またはもみ合いから下方向へ転換し始めた場合に限る。終値の EMA 10 / 25 割れ、EMA 10 の下向き転換、SuperTrend / Parabolic SAR の悪化、MACD のシグナル下抜けまたはヒストグラム悪化、-DI 優位、出来高増を伴う下落のうち複数が直近で一致することを重視する。
- `買い転換シグナルあり` は購入推奨を意味しない。上方向への転換兆候が強いことを示す要約ラベルとして使う。
- `売り転換シグナルあり` は売り推奨を意味しない。弱い方向への転換兆候が強いことを示す要約ラベルとして使う。
- エントリー条件では、直近の反発初動だけでなく、出来高の伴い方と EMA 10 / EMA 25 / SuperTrend / MACD の改善が複数そろうかを優先する。
- 利確・撤退条件では、短期リバウンドの失速やボラティリティ拡大を踏まえ、利確目安と損切り目安を分けて書く。

# High Beta Breakout Criteria

短期順張り候補を抽出するときの既定基準。目的は `1〜2週間程度で値幅が出る可能性がある銘柄` を見つけること。

## 基本フィルタ

- `売買代金`: 短期売買に耐える厚さを優先する
- `出来高`: 5日平均比2倍以上、または20日平均比1.5倍以上を優先する
- `売買代金急増`: 5日平均比2倍以上なら出来高急増と同等に扱ってよい
- `価格位置`: 20営業日高値から3%以内、60営業日高値更新、年初来高値更新を優先する
- `相対強度`: TOPIX、日経平均、同業種に対して強い銘柄を優先する
- `ボラティリティ`: ATR や日中値幅が大きい銘柄を優先する
- `時価総額`: 大型に限定せず、中型株も許容する
- `材料`: 決算、上方修正、自社株買い、大型受注、政策テーマ、業界再編を加点する

## 1b / 2b 境界

- 1b は材料・thesis鮮度、価格構造、出来高持続、相対強度、流動性、撤退条件から継続監視価値を判定する
- 1bの観測APIは `GET /stock/{ticker}/analysis?range=recent&schema=trade-v2` とし、query、schema、source、as_of、fetched_at、data_quality、readiness、reason_codesをtechnical evidenceへ紐づける
- trade-v2 の `feature.chartSummary` / `feature.metrics` は価格・出来高の観測値として使ってよい
- `dataQuality`不足、必須field欠落、`asOf=null`、取得不能は `technical_evidence_incomplete` として残し、nullや欠落を0・neutral・現在値へ補完しない。`readiness`は保存するが、1b観測値を執行readyへ昇格させるゲートにはしない
- `setupType=no_trade` は 1b の除外や降格には使わない
- `readiness=blocked|unknown`、`feature.trendState` / `feature.indicatorState` / `setup` / `risk` / `eventRisk` は 1bのentry、RR、注文、採用hard gateへ使わない
- オシレータ、`entry zone`、`minimumRR` / RR、当日 setup は 2b の執行判定に限定する
- `intraday-v1`のバーとcoverageは日次high-beta flowの責務であり、1bのtechnical evidenceへ混在させない
- 単日の押しや過熱、相対順位低下だけでは既存候補を除外しない

## 優先順位

1. 出来高急増
2. 直近高値接近または更新
3. 相対強度
4. 材料継続性
5. 売買代金
6. ATR または値幅
7. リスクの管理しやすさ

## スコアリング

100点満点で評価する。確認できない項目は0点にし、推測で補わない。

| 評価軸 | 配点 | 満点条件 |
| --- | ---: | --- |
| 出来高・売買代金 | 30 | 出来高または売買代金が5日平均比2倍以上で、流動性も十分 |
| 価格位置 | 25 | 20営業日高値から3%以内、60営業日高値更新、または年初来高値更新 |
| 相対強度 | 20 | TOPIX、日経平均、同業種に対して明確に強い |
| 材料継続性 | 15 | TDnet、会社IR、決算、ニュースで材料を確認でき、資金流入が続いている |
| リスク管理 | 10 | 損切り位置を置きやすく、決算直前・希薄化・低流動性の懸念が薄い |

### 採用根拠の分離

- `adoption_basis=official_catalyst` は材料継続性を加点できるが、採用に使う一次IR・TDnet・決算証跡を `official_verified` にする
- `adoption_basis=technical_only` は `thesis_type=technical_continuation`、`material_score=0`、`catalyst_attribution.classification=unexplained` とする
- technical-only の `technical_evidence` には `distance_from_20d_high_pct`、`volume_ratio_20d`、`relative_strength_20d_pct`、`average_daily_turnover_yen`、`as_of`、`source_url` を残し、すべて確認できた場合だけ `verification_status=complete` にする
- technical evidence が一つでも欠ける候補は `technical_evidence_incomplete` とし、一次IRがないことではなくテクニカル採用根拠が不足していることを不採用理由にする
- 第三者記事の説明は発見補助に限定し、technical-only の材料点や因果説明へ流用しない

### 判定基準

- score は順位付け・説明補助として使い、watch / reserve を score だけで hard gate しない
- `採用`: 通常は 75点以上を優先し、出来高・価格位置のどちらも0点ではない
- `準採用`: 通常は 70〜74点を優先し、出来高・価格位置のどちらも0点ではない
- `保留`: 60〜74点、または主要根拠の一部が未確認
- `除外`: 59点以下、または除外候補に該当する
- `aging` でも出来高と price action が維持されるものは watch候補へ残してよい
- `crowding_risk=high` でも low-float chase でなければ即 reserve/除外にしない
- 完全 reclaim 前でも、下値維持 + 出来高改善 + day2 以降の継続性が揃うなら watch候補に上げてよい
- theme分散は soft guidance とし、同テーマが増えても hard gate にせず comment で理由を残す

### 準採用の扱い

- `準採用` は `watchlist` へは入れず、`reserve_watchlist` がある場合だけそちらへ分離する
- `reserve_watchlist` は `15銘柄以内` に圧縮する
- `準採用` でも、未確認項目が多いもの、材料確認なしの急騰、stop高初日で chase しにくいだけの銘柄は入れない
- `reserve_watchlist` の `monitoring_valid_until` は stage 進入から標準 `5営業日`、watch は `10営業日` とする
- 次回 review で `高値更新/接近` `出来高再加速` `支持線維持後の反発` `一次材料継続確認` のうち `2つ以上` を満たしたときだけ `watchlist` へ昇格させる

## 加点条件

- 出来高を伴って高値を更新している
- ギャップアップ後に出来高を保っている
- 決算や上方修正後も買いが継続している
- テーマ内で複数銘柄に資金が入っている
- 同業や指数より明確に強い
- 押し目で出来高が減り、反発で出来高が増えている

## 減点条件

- 急騰後に出来高が急減している
- 値上がりの理由が不明確
- 悪材料起点で乱高下している
- 決算直前でリスクが読みにくい
- 板が薄く、想定サイズで入りにくい
- 低位株で投機色が強すぎる
- 増資、希薄化、継続企業注記などの懸念がある

## 除外候補

- 流動性が低く、短期売買に向かない
- 材料が既に剥落している
- 上昇より乱高下が主因になっている
- 連続急騰後で損切り位置を置きにくい
- ニュースや開示の確認ができない
- 継続企業注記がある
- 増資、MSワラント、希薄化懸念が強い
- 主要な採用根拠が未確認のまま残っている

## Execution Reality

- `liquidity_tier` は売買代金と出来高継続性から決める
- board を直接見られなくても、寄り付き偏重、後場失速、急激なスプレッド拡大を示す値動きは減点する
- 想定サイズで入れない銘柄は、スコアが高くても採用しない

## Crowding and Theme Saturation

- 同一テーマに資金が集中しすぎている場合は `crowding_risk` を上げる
- 先導株より弱い二軍銘柄は、値幅だけで採用しない
- テーマ性は、単発ニュースではなく市場内で資金が継続しているかを見る

## Gap Quality

- ギャップアップ自体は加点にならない
- ギャップ後も出来高を保ち、押し戻されず、前日高値帯を維持できるかを見る
- gap が大きすぎて stop を置きにくい場合は減点する

## Freshness Decay

- `fresh`: 発表直後または継続確認直後
- `aging`: 材料は残るが、価格が先行して鮮度がやや落ちている
- `stale`: 価格だけ残り、材料と資金流入の再確認が弱い

## 監視候補への圧縮

- 毎回の確認対象は原則 `40〜50銘柄` とし、`40件` を最低必要件数にする
- `40件未満` で run を終える場合は `incomplete` として扱い、watch/reserve の採否判定と state 更新は継続したうえで、`state_note` に `screened_count` と `minimum_required_count=40`、`review_summary` に `screening_incomplete=true` と `screening_shortfall_reason` を残す
- `watchlist` の soft target は `5〜8社`、最大 `10社` とする
- `reserve_watchlist` の soft target は `8〜12社`、最大 `15社` とする
- 棚全体の soft target は `13〜20社`、最大 `25社` とする
- `active themes` は各テーマ `4〜6銘柄`、`exploratory themes` は合計 `8〜12銘柄`、`theme universe 外の補助探索` は `2〜4銘柄` を目安に確認する
- 同じテーマに偏りすぎる場合でも、母集団確認の段階では複数確認してよい。最終採用で偏りと crowding を評価する
- 値幅が出そうでも、撤退条件が作れない銘柄は保留にする
- 安定性よりも、今見る意味がある銘柄を優先する
- スコアが同程度なら、出来高・価格位置・撤退条件の明確さ・slippage を優先する
- 目標件数に届かない場合でも、watch/reserve の採用基準は緩めない
- soft target 未達時は `continuity_summary.shortfall_reason` を必須にする
- `previous watchlist / reserve_watchlist` → `active themes` → `exploratory themes` → `theme universe 外の補助探索` の順を完了しても `40件` に届かない場合に限り、その日の run を `incomplete` として close してよい

## 継続レビュー

- `継続`: 出来高、価格位置、材料、相対強度が維持されている
- `除外`: 出来高失速、材料剥落、支持線割れ、相対強度低下が明確
- `保留`: 形は崩れていないが、短期の優先度が落ちている
- `crowding_risk` が高まりすぎた場合は、材料が生きていても `保留` か `除外` を検討する
- `shelf_turnover_rate` が `40%` を超えた場合は hard stop にせず、sidecar に入替理由を残す
- `monitoring_valid_until` は日次 review だけでは延長しない。新規一次材料、または出来高再加速と支持線維持/reclaimを確認した場合だけ5営業日延長する
- 同一 thesis cycle は最大20営業日とする

## 未確認データの扱い

- 確認できない項目は `未確認` と書く
- 未確認項目は採用理由に使わない
- 出来高、価格位置、材料のうち2項目以上が未確認なら `保留` 以下にする
- 材料確認ができない急騰銘柄は、原則として `除外` にする

## 出力時に必ず書く項目

- スコア
- 採用理由
- 高リスク理由
- 監視条件
- 撤退目安
- 次に確認すべき材料またはチャート条件
- `liquidity_tier`
- `slippage_risk`
- `event_freshness`
- `crowding_risk`

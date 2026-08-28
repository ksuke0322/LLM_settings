# analysis / intraday consumer matrix

stock skillsがtrend_viewerの`analysis` / `intraday`をどのlaneで、どのフィールドまで使うかを監査した結果を残す。
この文書は実行コードの代替ではなく、skill間の責務境界と参照先を固定する監査証跡である。

- 監査日: `2026-08-17`
- API正本: `trend_viewer/specs/001-repo-app-spec/contracts/openapi.yaml`、backend route、`packages/stock-analysis/src/contract.ts` / `index.ts`
- 共通契約: `trend-viewer-analysis-contract.md`
- 共通運用: `common-operating-rules.md`
- 外部由来確認: `.skill-lock.json`

## 監査結果

### 問題一覧

| 種別 | 対象 | 確認結果 | 対応 |
| --- | --- | --- | --- |
| 正本不明 | APIフィールド・品質・trend・intraday | 共通契約がないとlaneごとに解釈が分かれる状態だった | `stock-shared/references/trend-viewer-analysis-contract.md`を正本化 |
| 責務境界 | auto1b / auto2b / auto3 / auto4 | discovery、判断、保有レビュー、配分で利用可能な情報が混ざる余地があった | 各consumerへ利用フィールドと禁止事項を明記 |
| fail-close | `dataQuality`、`readiness`、coverage gap | API成功と判断可能を同一視し得る | quality・coverageを後段gateへ接続し、event unknownは注意情報へ分離 |
| Trigger重複 | large_cap / high_beta / market regime / decision | 候補生成と前段regimeが同じ依頼で発火し得る | bucket、lane、実行順序をdescriptionとmatrixで分離 |
| 外部由来編集 | `.skill-lock.json`記録skill | stock skillsはlock記録なし | 自作skill候補として扱い、外部lock対象は直接編集しない |

重大な未解決のskill間矛盾は、今回の監査範囲では確認されなかった。
ただし、文書契約を実行stateへ保存するruntime producerの実装状況は、このskill監査だけでは保証しない。

## APIとフィールドの責務マトリクス

| フィールド / endpoint | 正本 | auto1a large_cap | auto1b breakout | auto2a / auto2b decision | auto3 position review | b daily flow | auto4 allocator |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dataQuality` / `readiness` / `reasonCodes` | 共通契約 | 自身のstate品質 | technical evidenceの品質証跡 | eligible gate | advisory品質表示 | stage停止・manifest | 前段結果を受け取る |
| `source` / `asOf` / `fetchedAt` / `timezone` | 共通契約 | state provenance | technical evidence provenance | decision sidecar | review sidecar | manifest | allocation trace |
| `GET .../analysis?...schema=trade-v2` | OpenAPI / route | 直接利用なし | `chartSummary` / `metrics`観測のみ | setup・risk・trend・eventの判断入力 | 短期advisory入力 | live trade-v2 gate | 直接利用なし |
| `feature.chartSummary` | trade-v2 | 直接利用なし | 価格・出来高・位置の観測 | setup / riskの補助 | 最新値・損益文脈 | stage証跡 | 直接再評価しない |
| `feature.metrics` | trade-v2 | 直接利用なし | technical evidence | setup / riskの補助 | review観点 | stage証跡 | 直接再評価しない |
| `feature.trendState` | trend契約 | 直接利用なし | 1bの採用hard gateへ使わない | trendの正本 | advisoryの正本 | entry gate | 直接再判定しない |
| `feature.eventRisk` | trade-v2 / 共通契約 | 直接利用なし | 1bへ混在させない | 注意情報として記録しblockしない | 警告として記録しblockしない | eligible / orderを決算情報だけではblockしない | eligible結果を受け取る |
| `setup` / `risk` / entry / RR | trade-v2 | 直接利用なし | 2b専用 | decision専用 | 保有advisoryの短期根拠 | decision stage | signal品質を再判定しない |
| `GET .../intraday?...` (`intraday-v1`) | OpenAPI / route | 直接利用なし | 1bへ混在させない | 必要なら2bの入力へ渡す | 直接の執行根拠にしない | JST / coverageの主担当 | 直接利用なし |
| `eligible` / paper state / rules | lane state contract | 生成しない | 生成しない | eligibilityを生成 | 直接変更しない | paper stateへ直列反映 | 採用可否・数量を決定 |

## consumerごとの監査結果

### `stock-shared`

- `common-operating-rules.md`はfreshness、failure、provenance、publishの共通規則を持つ。
- `trend-viewer-analysis-contract.md`はAPI endpoint、品質enum、trendState、event、intraday coverage、lane境界の正本である。
- shared referenceはlane固有の採用条件を持たず、各skillへ責務を戻している。

### `japan-high-beta-breakout-screening` / auto1b

- `trade-v2`は`feature.chartSummary` / `feature.metrics`の観測に限定する。
- `setup`、`risk`、`eventRisk`、`trendState`、entry、RR、intraday coverageを採用hard gateへ使わない。
- API品質不足は`technical_evidence_incomplete` / `未確認`として残し、推測で補完しない。
- `intraday-v1`はb daily flowへ委譲する。

### `stock-investment-decision-support` / auto2a・auto2b

- `trade-v2`の品質、trendState、eventRisk、setup、riskを候補単位で検証する。
- `dataQuality=complete`、`readiness=ready`、必要証跡、trend確認、setup/riskが揃わない候補は`blocked`。event riskのunknown・upcoming・highは注意情報として残すが、それだけでは`blocked`にしない。
- `analysis_contract_status`はdecision側の`eligible|blocked`を表し、position reviewのstatusとは共有しない。
- allocatorやpaper約定を直接担当しない。

### `stock-investment-position-review` / auto3

- `trade-v2`を短期advisoryに使う。
- `eventRisk=unknown|upcoming|high`は未確認・注意情報として記録する。決算情報だけで追加blockにせず、保有レビュー自体を自動売却へ変換しない。
- `trendState`はadvisoryの根拠だが、長期保有thesis・ユーザー判断・execution stateとは分離する。
- quality statusは`analysis_quality_status`、review側の状態は`review_status`とし、decision側の`analysis_contract_status`と衝突させない。

### `high-beta-daily-flow` / b daily orchestration

- `intraday-v1`のJST日付、coverage、gap、OHLC欠落、qualityを日次stageのgateとmanifestへ保存する。
- `trade-v2`のqualityとtrendをauto2b・allocator・paper stateの前段で確認する。eventは取得状態と注意情報をmanifestへ残すが、決算情報だけでは後段を止めない。
- `no_data` / `unknown`を休日・休場と推測せず、市場状態証跡がない場合は`incomplete`またはblockedで停止する。
- 前段`failed|incomplete`から後段を推測実行しない。

### `portfolio-risk-allocator` / auto4

- 入力は前段で`eligible`になった候補、paper positions/orders、portfolio rulesに限定する。
- `analysis` / `intraday`を直接叩かず、signal品質、trend、market regimeを独自再判定しない。
- 配分制約で止める責務は保持するが、前段の品質不足を採用へ戻さない。

## 今回変更しないskill

| skill | 変更しない理由 | 運用上の境界 |
| --- | --- | --- |
| `japan-top-companies-screening` | auto1aのlarge_cap母集団・watchlist producerで、`analysis` / `intraday`を直接利用しない | `market-regime-assessment`はoverlay、high-beta breakoutとはlane分離 |
| `market-regime-assessment` | 個別銘柄APIではなく指数・業種・為替・金利・breadthでbucket優先度を決める | 個別setup・entry・intraday coverageを判断しない |
| `portfolio-risk-allocator` | API consumerではなく、eligible候補とportfolio stateの数量・制約を決める | signal品質・regimeを再判定しない |

これらは今回の`analysis` / `intraday`契約同期の直接対象外だが、上表の責務境界と前段・後段関係を維持する。
将来これらがAPIを直接取得する場合は、個別のtaskで共通契約参照とfail-closeを追加する。

## Trigger / description監査

| trigger | 正常な発火範囲 | 境界 |
| --- | --- | --- |
| `japan-top-companies-screening` | large_cap母集団・watchlist | high-beta候補、entry判断、保有レビューを扱わない |
| `japan-high-beta-breakout-screening` | high-beta auto1b discovery/evidence/ranking | setup/RR/orderを扱わない |
| `market-regime-assessment` | screening / decision前のbucket優先度 | 個別採用・数量を決めない |
| `stock-investment-decision-support` | 未保有候補のtrade-v2短期判断 | discovery・allocation・paper約定を扱わない |
| `stock-investment-position-review` | 保有銘柄の短期advisory | 新規候補比較・自動執行を扱わない |
| `high-beta-daily-flow` | b系の一回限りの日次orchestration | 実売買を行わない |
| `portfolio-risk-allocator` | eligible候補のportfolio制約・数量 | signalを再評価しない |

description / default promptの範囲に重大な同一trigger競合はない。
複数skillが同じ依頼で候補になり得る場合は、bucket（large_cap / high_beta）、lane（discovery / decision / review / allocation）、実行順序で選択する。

## provenance / lock監査

- `.skill-lock.json`に記録されていたskillは、`auditing-wcag`、`ax`、`context-engineering`、`find-skills`、`grill-me`、`i-have-adhd`、`planning-a11y-improvement`、`planning-wcag-audit`、`playwright-skill`、`prompt-engineering`、`reviewing-a11y`、`ship-learn-next`、`swiftui-expert-skill`、`swiftui-pro`、`test-driven-development`、`test-fixing`である。
- stock skillsはlock記録に含まれないため、今回の監査では自作skill候補として扱った。
- lock記録のある外部由来skillは直接変更していない。
- 変更したstock skillはすべて共通契約への相対参照、対象endpoint、品質・lane境界を確認した。

## 検証

- stock skillのfrontmatter `name` / `description` を列挙し、重複・欠落を確認する。
- `.skill-lock.json`のキーとstock skillの対象を比較する。
- 内部Markdownリンクの参照先が存在することを確認する。
- `git diff --check`で空白エラーを確認する。
- API endpoint、schema、quality、trend、event、intraday、lane境界を`rg`で再確認する。

## 残リスクと次の扱い

- skills文書の同期は完了範囲だが、実行側のstate / sidecar / manifestが新fieldを保存するかはruntime監査が別途必要である。
- API側でフィールド、enum、閾値、reason codeを変更した場合は、共通契約と全consumerの差分監査を再実施する。
- 不明な値は`unknown` / `確認不能` / `incomplete`として残し、価格・イベント・休日・trendを推測しない。

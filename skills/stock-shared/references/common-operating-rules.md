# Stock Common Operating Rules

stock skill共通で必要な最小契約だけを定める。lane固有の探索・判断・配分ルールは各skillを正本とする。

## trend_viewer contract

`analysis` / `intraday` のschema、品質status、trendState、eventRisk、coverage、provenanceの意味は [trend-viewer-analysis-contract.md](trend-viewer-analysis-contract.md) を正本とする。
HTTP成功や値の存在だけで判断可能とはみなさず、`partial`、`insufficient`、`no_data`、`unknown`、`readiness=blocked|unknown`は執行へ進めない。ただし、決算・イベント情報だけの`unknown`はこの停止条件に含めず、注意情報として扱う。
lane固有の採用条件は各skillへ戻し、この共通referenceで重複定義しない。

## Freshness

- stateとevidenceには`as_of`または取得時刻を残す。
- stale入力から新しい売買判断を作らない。休日・休場日は`market_closed`としてno-opにする。
- live値を推測、forward-fill、別日の値で補完しない。

## Failure

- 候補単位の欠落は候補単位でfail-closeし、安定した`reason_codes`を残す。
- 主要入力が読めない、必要候補の大半を評価できない、出力整合性を保証できない場合はrunを`incomplete`にする。
- downstreamは前段`failed | incomplete`を推測で補完しない。

## Provenance

- 判断に使ったsource、as_of、入力revision、出力revisionを追跡可能にする。
- state/JSON sidecarを正本とし、automation memoryやchat proseを機械再利用の正本にしない。

## auto-e residual input

- auto-eの派生入力正本は`experimental_flows/state/shared/snapshots/auto_dg_residual_input_snapshot-{target_date}.json`とし、`auto_e_residual_input_contract.json`の計算窓・source identity・保存方針を読む。consumerはこのsnapshotをread-onlyで使い、raw market dataや別laneの出力から残差・基準値・出来高を推測しない。
- 共通入力bundleのstatusとauto-e派生入力のstatusを分けて保持する。派生入力の欠落、未来日付、effective mapping・TSE33構築業種ベンチマーク・基準値・出来高・source hashの不足は`incomplete`または`blocked`として理由を残し、`complete`や「候補なし」へ変換しない。
- `complete`で閾値に届かない場合の「候補なし」と、入力不足による`incomplete`を区別する。snapshot、manifest、validator、登録台帳の対象日・revision・hash・statusは同じ値をread-backし、atomic保存、同一source identityの重複拒否、既存completeの保護を満たす。
- この派生入力はpaper-only・read-onlyの境界にあり、auto-d〜gのstate、保有銘柄、注文、risk、regime、c-flow、b-flowを更新しない。fixture/manualの成功をscheduled runtimeの成功へ昇格させず、scheduled runtimeが未観測なら未観測のまま扱う。

## c-flow comparison input

- c-flowとauto-fの比較入力正本は`outputs/c-flow/c-flow-read-only-comparison-{target_date}.json`だけとし、c-flowのcandidate、candidate population、`c_flow/state`、注文、保有、評価stateをauto-fが直接読まない。snapshotのsource run key、revision、hash、as_of、対象日、signal status、read-only flagsを一緒にread-backする。
- c-flow collection/evaluationが未実行、未完了、契約読取り不能、未来日付、invalidの場合はsnapshotを`incomplete`（failure reason付き）として扱い、signalsを空にして、auto-fのcomparison input・acceptance・eligible・promotionだけをfail-closeする。auto-f自身の技術signal generationと、c-flow比較の未確認を混ぜない。
- `ticker + signal_date`でだけ突き合わせ、両方の完了した有限PnLだけを比較指標へ使う。完全な損益組が2件未満なら`CORRELATION_SAMPLE_INSUFFICIENT`を残し、相関成功や採用成功へ変換しない。0件のcompleteは全実行済みで実際に0件だった証跡がある場合だけ許可する。
- canonical snapshotは対象日ごとにatomicに一度だけ保存し、同じ対象日の重複・上書きを拒否する。後日観測は別revision/hash/as_ofの証跡として保存し、既存のcompleteを変更しない。比較はpaper-only・read-onlyで、auto-d〜gの共有stateや後段laneへ結果を伝播させない。

## auto-g sector feature input

- auto-gが読むセクター特徴量の正本は`experimental_flows/state/shared/snapshots/auto_dg_sector_feature_snapshot-{target_date}.json`だけとする。既存のuniverse/mapping snapshot、b-flow・c-flow・auto-e・auto-fの候補やstate、Task 08のregime値を特徴量の代用にしない。
- producerはtarget_date時点で有効なTSE33全sectorを対象にし、mappingの有効期間、memberの所属、benchmark、member price、turnover、sector weightを一つのsnapshotへ固定する。sectorの欠落、重複、future、stale、unknown、source hash不正が一つでもあれば、partialな順位やtop 3を作らず`incomplete`または`blocked`にする。
- 20日・60日returnは`simple_close_to_close`、breadthは同じas_ofのeligible memberを分母とする`advancing_count / eligible_count`、leaderは`average_turnover_jpy`降順の上位2件、concentrationは選定leaderのsector内weight合計を分母付きで記録する。各値とmapping、sectorにはas_of、source revision、source hash、必要な件数・除外理由を残す。
- `auto_dg_input_collectors.js`の共有入力収集は、4つの共通入力に加えてこのauto-g専用派生snapshotを別artifactとして生成・検証・canonical pathへatomic保存する。入力不足、契約不一致、対象日違い、既存completeへの上書き、同一対象日の重複は理由付きで停止する。
- auto-g consumerはsnapshotをread-onlyで検証し、全33 sectorから平均rank、breadth、top two leader、concentrationを計算する。snapshotの欠損、incomplete、stale、future、mapping不正、feature unknownは候補なしやneutral、0、部分ランキングへ変換せず、laneを`incomplete`または`blocked`にする。
- signalは`Asia/Tokyo`のMondayだけを対象とし、約定モデルは`next-session-open`、保有上限は20取引日とする。これらの閾値はauto-g契約とlane configから読み、特徴量snapshotのstatus・failure reason・method version・source lineageをmanifestとvalidatorへread-backする。consumerはpaper-only・read-onlyで、注文、保有、portfolio、regime、他lane stateを変更しない。
- fixture・単体テスト・手動実行の成功をscheduled runtimeの成功へ昇格させない。対象日のcanonical snapshot、入力bundle、auto-g artifact、manifest、validator、登録write setを個別に確認し、scheduled runtimeが未観測なら未観測のまま扱う。

## event evidence

- 候補棚では、公式exact dateがないイベント情報を`unverified`として保持してよい。
- 公式exact dateが取れた場合は、`verification_status=official_verified`、`time_precision=date`、ISO形式の`earnings_date`、判定時点以降の日付を満たす証拠として記録する。
- `month_window`、`unverified`、過去日付、欠落は`EVENT_EVIDENCE_UNVERIFIED`、`EVENT_DATE_NOT_EXACT`、`EVENT_EVIDENCE_STALE`、`EVENT_EVIDENCE_MISSING`などの候補単位reason codeを残す。ただし、決算情報だけでfail-closeせず、他の品質・技術・整合性の停止条件とは分ける。
- APIの`feature.eventRisk`と公式event evidenceは別証跡として保存し、どちらか一方の成功で他方を補完しない。

## holdings governance

- `current_holdings.json` は実保有の正本、`holdings_governance.json` は長期保有意図・イベント証跡を保持するsidecarとして分離する。
- sidecarは全保有銘柄をcoverageし、短期`short_term_advisory`と長期`long_hold_governance_status`を別フィールドで持つ。短期`hold` / `trim` / `defend` / `exit`を長期理由へ転用しない。
- 長期項目がユーザー確認前なら`needs_user_confirmation`、`execution_trace_incomplete=true`、長期理由・invalidation/review trigger・next review date・trim詳細はnullのままにする。
- sidecar生成は`state_update_policy=sidecar_only`で行い、`current_holdings.json`、paper state、注文を自動更新しない。

## Publish

- publish前にJSON parse、必須field、件数、lane境界をreadbackする。
- 日次b-flowは`outputs/b-daily-run-YYYY-MM-DD.json`一つにstage status、件数、reason codesをまとめる。
- 同じrunの重複Markdownやstate由来のコピーsidecarを作らない。

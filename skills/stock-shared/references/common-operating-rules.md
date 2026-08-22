# Stock Common Operating Rules

stock skill共通で必要な最小契約だけを定める。lane固有の探索・判断・配分ルールは各skillを正本とする。

## trend_viewer contract

`analysis` / `intraday` のschema、品質status、trendState、eventRisk、coverage、provenanceの意味は [trend-viewer-analysis-contract.md](trend-viewer-analysis-contract.md) を正本とする。
HTTP成功や値の存在だけで判断可能とはみなさず、`partial`、`insufficient`、`no_data`、`unknown`、`readiness=blocked|unknown`は執行へ進めない。
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

## event evidence

- 候補棚では、公式exact dateがないイベント情報を`unverified`として保持してよい。
- 実行可能性では、`verification_status=official_verified`、`time_precision=date`、ISO形式の`earnings_date`、判定時点以降の日付を満たす`official_exact`だけを許可する。
- `month_window`、`unverified`、過去日付、欠落は`EVENT_EVIDENCE_UNVERIFIED`、`EVENT_DATE_NOT_EXACT`、`EVENT_EVIDENCE_STALE`、`EVENT_EVIDENCE_MISSING`などの候補単位reason codeを残してfail-closeする。
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

# Stock Common Operating Rules

stock skill共通で必要な最小契約だけを定める。lane固有の探索・判断・配分ルールは各skillを正本とする。

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

## Publish

- publish前にJSON parse、必須field、件数、lane境界をreadbackする。
- 日次b-flowは`outputs/b-daily-run-YYYY-MM-DD.json`一つにstage status、件数、reason codesをまとめる。
- 同じrunの重複Markdownやstate由来のコピーsidecarを作らない。

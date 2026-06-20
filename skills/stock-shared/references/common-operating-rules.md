# Stock Skill Common Operating Rules

stock 系 skill 共通の運用ルール。各 skill はこの文書を前提にし、lane 固有の差分だけを本文へ残す。

## Command Policy

- shell コマンドは原則 `rtk` 経由で実行する
- `rtk` を通すと目的を満たせない場合だけ例外にし、その理由を進捗共有または最終報告で明記する
- 小出力確認と書き込み系以外の read-heavy 操作は shell 直実行より `context-mode` を優先する

## Context-Mode Policy

- 単一 state file や JSON の検証は `ctx_execute_file` を使い、`as_of`、件数、欠落 field、stale 判定など必要項目だけ返す
- 複数 file の集計、複数 ticker の API fetch、候補圧縮、portfolio gate 判定は `ctx_execute` を使い、raw JSON や長表を会話へ流さない
- 外部 docs や長い補助資料は必要なら `ctx_fetch_and_index` → `ctx_search` で扱う
- Playwright/browser の長い返り値は file 保存後に `ctx_execute_file` で要約する
- 同じ file や同じ API response を会話中で再読・再掲しない

## State And Lane Discipline

- lane を混ぜない。`large_cap` `high_beta` `holdings review` `paper simulation` は別責務として扱う
- state の正本は各 skill が指定する file に従う。近い artifact や memory で代用しない
- stale や malformed を検出したら、その file と field を明記して停止する
- stale を見つけても勝手に fresh rerun や別 lane へ切り替えない
- `current_holdings.json` は watchlist と同じ当日性を原則要求しないが、必須 field 欠落や pending fill 疑いは停止する

## Write / Publish Policy

- `/Users/sawairikeisuke/Documents/stock-analysis` 配下の state / script / output を更新した場合は差分確認を行う
- commit / push するのは今回更新した file だけに限定する
- 差分がない場合は commit / push しない
- commit または push に失敗した場合はそこで停止して報告する
- `stock-analysis` への push 条件は `git-workflow-safety` の repo 例外に従う

## Output Policy

- 既定の chat 出力は `compact` とし、state 監査や保存用 artifact が必要なときだけ `full` を使う
- 長い表、全候補一覧、raw JSON、長文メモは state / sidecar / reference に残し、chat では件数と判断理由へ圧縮する

---
name: monster-strike-material-farming
description: "Operate Monster Strike on a mirrored iPhone to solo-farm a user-specified evolution-material quest with screenshot-verified UI transitions, reward-screen retries, deck checks, and stamina checks. Apply only when the user asks to perform or resume the farming run; do not use for rankings, material calculations, or workbook edits."
---

# モンスト素材周回

## 目的と適用範囲

ユーザーがゲーム操作を明示的に依頼した場合にだけ、iPhoneミラーリング上のモンストで進化素材クエストをソロ周回する。

このスキル文書やIssueの承認は、ゲーム操作の依頼を代替しない。

対象は、SHORT CUTからの再開、デッキ確認、バトル、攻略ヒント、クリア情報、スペシャル報酬、クリア報酬、スタミナ確認である。

次の依頼には使用しない。

- 育成優先順位、必要素材数、GameWithランキングの調査
- Excelやログファイルの作成・更新
- マルチ参加、ガチャ、課金、オーブ消費
- スタミナ回復、コンティニュー、広告視聴などの追加リソース消費

自動検出はスキル選択のためのものであり、ユーザーの依頼なしにバックグラウンドでゲームを操作してはならない。

## 入力とデフォルト

ユーザーの明示指定を優先し、省略時は次を使う。

- target_quest: 指定されたクエスト名。省略時は現在画面で確認できるクエスト名を使う。画面で特定できなければ停止する。
- attribute: 任意の属性情報。クエスト名と画面確認が一致する場合に限り補助情報として使う。
- deck_number: 9。実際に使うデッキは画面で確認する。
- start_mode: 現在画面を確認して判断する。HOMEならSHORT CUT、周回途中なら現在状態から再開する。
- stop_condition: 次の周回に必要なスタミナが不足するまで。
- manual_intervention: なし。ユーザーが別途手動操作を指定した場合だけ変更する。

開始前に対象クエスト、ソロ状態、デッキ番号、開始時スタミナを画面で確認する。対象が違う場合は別クエストを推測で開かず、停止して報告する。

## 実行手順

UI制御経路の選定、画面別操作、パラメータ、再取得、状態遷移、停止条件は references/ui-transition-playbook.md を唯一の正本とする。実行時は同プレイブックの実行前確認と状態表に従う。

## 停止と報告

画面や操作の判定に迷う場合は、プレイブックの状態表にある stopped または blocked の扱いに従う。失敗、未確認の状態をクリア成功として数えない。

作業終了時は、ファイルを変更せず、チャットに次の項目を報告する。

- status: completed | stopped | blocked
- target_quest: 確認したクエスト名
- deck: 使用デッキ番号
- runs_completed: 完了周回数
- clear_count: クリア数
- failure_count: 失敗数
- stamina_before: 開始時スタミナ
- stamina_after: 終了時スタミナ
- stop_reason: 終了理由

素材増加量を報告する場合は、ゲーム画面で実際に確認できた値だけを使う。確認できない値は推測しない。

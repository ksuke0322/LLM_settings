---
name: monster-strike-material-farming
description: "Operate Monster Strike on a mirrored iPhone to solo-farm a user-specified evolution-material quest with screenshot-verified UI transitions, reward-screen retries, deck checks, and stamina checks. Apply only when the user asks to perform or resume the farming run; do not use for rankings, material calculations, or workbook edits."
---

# モンスト素材周回

## 目的と適用範囲

ユーザーが明示的に依頼したときだけ、iPhoneミラーリング上のモンストで進化素材クエストをソロ周回する。

このスキルの対象は、SHORT CUTからの再開、デッキ確認、バトル、攻略ヒント、クリア情報、スペシャル報酬、クリア報酬、スタミナ確認までのUI操作である。

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
- deck_number: 9
- start_mode: 現在画面を確認して判断する。HOMEならSHORT CUT、周回途中なら現在状態から再開する。
- stop_condition: 次の周回に必要なスタミナが不足するまで。
- manual_intervention: なし。ユーザーが別途手動操作を指定した場合だけ変更する。

開始前に対象クエスト、ソロ状態、デッキ番号、開始時スタミナを画面で確認する。対象が違う場合は別クエストを推測で開かず、停止して報告する。

## Computer Useの原則

- 既存の computer-use:computer-use スキルに従う。
- 直接のUI操作は node_repl と @oai/sky だけで行う。
- 対象アプリは通常 com.apple.ScreenContinuity（iPhoneミラーリング）とする。
- 新しい node_repl セッションでは @oai/sky を一度だけ初期化する。
- 操作後は必ず sky.get_app_state で最新状態を取得してから次の操作を決める。
- AXテキストが不十分なゲーム画面ではスクリーンショットを主情報源にする。
- 画面遷移後に以前の座標や要素インデックスを再利用しない。
- 画面状態が判別できないときはタップせず、再取得または停止する。

詳細な画面別処理と座標候補は references/ui-transition-playbook.md を参照する。

## 状態遷移

次の状態を画像で確認しながら遷移させる。

1. HOME: SHORT CUTをタップする。
2. DECK_SELECT: 対象クエストとデッキ9、ソロ状態を確認して出発する。
   - DECK_SELECT 以外の画面（クエスト一覧など）に遷移していた場合には下部タブの HOME を選択し `1` に戻る。
3. BATTLE: 現在のターンキャラと敵配置をスクリーンショットで確認し、状況に応じて1回弾く。固定座標のリプレイや火属性専用の戦略は使わない。
4. HINT: オレンジ色のOKを優先してタップする。進まなければリファレンスのフォールバックを使う。
5. CLEAR_INFO: 右下の終了をタップする。
6. SPECIAL_REWARD: 最新スクリーンショットで宝箱・報酬アイコンを避け、空欄から安全な候補を 5 箇所ランダムに選んでタップする。成功して結果画面へ遷移するまで、各タップ後に `sky.get_app_state` で最新状態を確認しながら最大10分間（600,000ms）繰り返す。成功判定前に結果画面のOKを押さない。
7. RESULT: オレンジ色のOKをタップする。
8. HOME_CHECK: HOMEに戻ったこととスタミナを確認する。次の周回に必要なスタミナがなければ正常終了する。

バトル中は、3回の弾き後に画面を再取得する。弾きの方向は右斜上 45 度に固定する。敵撃破、次バトル、ターン更新などの進展が確認できない場合は、画面を再分析しても最大2回までの補正操作にとどめる。クリア困難、全滅の可能性、想定外の画面がある場合はデッキ変更やコンティニューをせず停止する。

## 停止条件

次の場合は後続状態を推測せず、stopped または blocked として報告する。

- noWindowsAvailable、接続断、iPhoneミラーリングの取得不能
- 対象クエスト、ソロ状態、デッキ番号を確認できない
- 画面が想定状態のどれにも一致しない
- OK、確認、終了、またはスペシャル報酬の空欄タップを5分間続けても成功・遷移を確認できない
- デッキ9でクリアが困難、または失敗が確認された
- オーブ、スタミナ、コンティニューなどの追加消費を要求された
- マルチ参加画面、ガチャ画面、課金画面へ遷移した

失敗や未確認の状態をクリア成功として数えない。

## 実行結果

作業終了時は、ファイルを変更せず、チャットに次の項目を報告する。

```text
status: completed | stopped | blocked
target_quest: 確認したクエスト名
deck: 使用デッキ番号
runs_completed: 完了周回数
clear_count: クリア数
failure_count: 失敗数
stamina_before: 開始時スタミナ
stamina_after: 終了時スタミナ
stop_reason: 終了理由
```

素材増加量を報告する場合は、ゲーム画面で実際に確認できた値だけを使う。確認できない値は推測しない。

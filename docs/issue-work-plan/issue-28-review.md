# Issue #28 確認記録

## 対象と方針

- 2026-10-18 10:32 JST（shell `date`）。承認済みの「ツール能力を照合、不能な検査は理由付きNT」を実施。
- `auditing-wcag`、`reviewing-a11y`、`ship-learn-next` は台帳上で外部由来。本文と `allowed-tools` を直接編集せず、`docs/skill-capabilities.md` と台帳の明示参照で利用方針を補った。
- 文書の能力要求、動的metadataへの掲載、対象での実行確認、条件付き、未確認を区別。2026-10-18時点のmetadata snapshotであり、実行時点の再確認が必要。
- Read/Grep/Glob はこの環境の `exec_command` 経由の読取・検索に、Write は `apply_patch` に対応づけた。文字列の一致を同じ実行経路の証拠にしていない。
- ブラウザー移動・tree・click・入力・key・画像・resize・DOM評価、server任意コード、Chrome/Lighthouse、Web取得、Node/npm/CLI、画像/PDF/Figma、委任、保存を一覧化。外部plugin未掲載を不存在と断定しない。
- 正式監査のPass/Fail/NT/NAと証拠、通常レビュー、CLI部分検査を分離。キー実操作不足には理由と次owner付きNT。NAは非適用根拠を要する。
- 通常の承認済み範囲内のCLIは追加承認不要。未承認の導入・更新・環境変更は停止して扱う。コマンド・版・exit・出力を保持し、CLIだけで全A/AA適合としない。
- 草案と保存済みを分離し、承認済み保存先への書込みと読み戻しが揃うまで保存済みと報告しない。

## 委任と検証

- `gpt-6-luna / max` へ調査8分、文書作成7分、小修正3分、読み取り評価4分、表現修正1分の上限で順番に委任。各回1対象・問い3つ以内、絶対パス許可範囲、再委任・Git書込み禁止。
- 外部本文を変更せず、実監査・外部接続を実行していない。文書変更なので判定用resolverや実装ミラーテストは追加していない。
- 親が `/tmp/issue28-fixtures.md` に8つの仮報告案を用意し、期待結果を渡さず独立評価した。誤報告5件（metadataだけでPass、exit2を0へ変更して全適合、未掲載plugin不存在、readback失敗でも保存済み、unsafeをDOM参照と同一視）は全て不採用。正常3件（理由/owner付きNT、既存承認内実行、未保存草案）は全て採用可能だった。
- 上記は人による方針・誤判断fixture検証。実装コードの自動mutation scoreや、実サービスでの監査成功とは扱わない。
- 親レビューで環境能力への対応、unsafeとevaluateの区別、既存承認の維持、文書担当とIssue全体の実行範囲を補強した。
- 関連 `node --test bin/skill-inventory.test.mjs bin/workflow-policy.test.mjs` は7件成功。台帳のrouting以外の出所・版・unknown等は元JSONと一致。
- mainではテストせず、candidate / reference は `16e2999` を基準とした専用worktree。両者の `shared/jev` で既存lockに対する `npm ci --ignore-scripts --no-audit --no-fund` を実行した。これはa11y CLIやブラウザーの導入ではない。
- 非Archifyは112件成功。全件はbaseline/candidateとも1,045件 / 953成功 / 69失敗 / 23skip、exit 1。失敗名・正規化診断・skipが一致し、新規・悪化なし。承認済みの非Archify限定例外を適用する。全件成功とは扱わない。ログは `/tmp/issue28-{related,nonarch,baseline,candidate}.tap`。

## 限界と完了処理

- 実ページの正式監査、keyboard操作、a11y CLI、画像/PDF/Figma取得、利用者の学習計画保存を実行したとは扱わない。
- 外部 `allowed-tools` と実loaderを変更していない。台帳リンクからの明示参照が必要で、自動読込み・強制適用は未確認（#33）。
- stock系、Archify、#24は対象外。#22の判断保留は維持する。
- PR・main同期・内容保全・clean・branch保持・通常worktree削除の結果は実施後追記する。

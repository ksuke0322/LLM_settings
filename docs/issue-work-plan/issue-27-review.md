# Issue #27 確認記録

## 方針と対象

- 2026-10-18 10:20 JST（shell `date`）時点。承認済みの「依存準備を別工程に分離、実行単位の一時領域」を実施した。
- 外部由来の `skills/playwright-skill` 本文・runner・helper・package は変更していない。既存 runner は自動 npm / Chromium 導入、Skill 領域への一時ファイル作成、古い一時ファイルの走査削除を含むため、呼び出さないローカル入口を追加した。
- 対象は `bin/run-playwright-local.mjs`、その単体テスト、`docs/playwright-local-runner.md`、台帳の Playwright routing、当記録と進捗表示。stock 系・#24 は対象外。
- 台帳の出所・version・unknown 等、routing 以外の情報は元の JSON と一致することを確認した。

## 実行契約

- 初回準備・依存更新は通常実行と別承認。package と version、package root、browser path、通信範囲、準備コマンドを記録する。未準備なら非成功で停止し、承認済み準備の完了確認後だけ同じ明示コマンドを再実行する。
- 利用者が local CLI を明示的に呼ぶ。`.mjs` / `.cjs` の自己完結スクリプトと、準備済み `node_modules/playwright` の絶対パスを渡す。npm / npx / 外部 run.js / ブラウザー導入は呼ばない。
- 実行ごとに OS 一時領域を作り、スクリプトをコピーしてその cwd で実行する。通常終了・非成功・起動失敗・処理された SIGINT / SIGTERM 後に、自分の実行領域だけを削除する。古い領域を走査しない。
- 明示した basename の通常ファイルだけを指定出力先へコピーする。symlink を拒否し、既存出力を上書きしない。子の非成功終了コードは成果物コピー失敗時も保持する。
- 削除失敗は `cleanupError` として残し、成功扱いにしない。任意コードや継承環境への権限制限ではない。signal を無視する子の強制停止や runner の hard kill 後の削除は保証しない。

## 委任と親の確認

- 調査、実装、テスト補強、読み取りレビューを `gpt-6-luna / max` に1件ずつ委任した。各回1対象・問い3つ以内・12分以内、絶対パス許可範囲を指定し、子による再委任・Git 書き込みを禁止した。
- 初回 Red は runner 不在の `ERR_MODULE_NOT_FOUND`、実装後 Green。準備済み fake package を使い、ESM import / CommonJS require の実行も確認した。実 Playwright・実ブラウザー・npm 導入・ネットワーク操作は行っていない。
- 親の mutation: cleanup 無効化は7失敗、browser 準備確認無効化は2失敗で検出。いずれも元へ復元した。
- 上書き防止無効化は既存内容の破壊を検出したが、その実行全体は SIGTERM テスト待機で終了せず中断。該当実行の既知 PID だけを停止した。テストの期限・fixture PID / cwd 後始末を委任して補強した後、上書き対象だけ再実行し1失敗を確認し、元へ復元した。
- cleanup mutation 専用の `mktemp` 領域は、その実行で作った残骸のみ確認して削除した。通常の `/tmp` や古い実行領域の一括削除はしていない。
- 読み取りレビューで、無期限 signal 待機・cleanupError 時の説明・環境継承・外部 Skill / loader から自動切替されない限界を確認し、テストと利用案内に反映した。本体に新たな既定 timeout は加えていない。

## 検証

- cwd は専用 candidate / reference worktree。main checkout ではテストしていない。両者の基準は `b9315ec`、Node 22.12.0。
- `shared/jev` では既存 lock に対し `npm ci --ignore-scripts --no-audit --no-fund` を実行した。
- 関連: `node --test bin/run-playwright-local.test.mjs` → 11件成功。
- 非 Archify: `git ls-files -z '*.test.mjs' ':!:skills/archify/**' | xargs -0 node --test --test-reporter=tap` → 112件成功。
- 全件: baseline 1,034件 / 942成功 / 69失敗 / 23skip、candidate 1,045件 / 953成功 / 69失敗 / 23skip。双方 exit 1。失敗名・正規化診断・skip は一致し、新規・悪化した失敗はない。承認済みの非 Archify タスク限定例外を適用する。全件の非0終了を成功とは呼ばない。
- ログ: `/tmp/issue27-{related,nonarch,baseline,candidate}.tap`、`/tmp/issue27-mutation-{cleanup,browser,overwrite,overwrite-final}.tap`。

## 未確認と後続

- 実ブラウザーの起動・サイト操作・実依存導入、signal 無視スクリプト、任意絶対パスへの書き込み制限は検証していない。
- local CLI は自動選択・強制適用されない。外部 Skill 直呼びの既存副作用を変更したとは扱わない。実行例の環境適合は #32、実 loader の選択は #33 の確認範囲とする。
- PR #137 は merge commit `9439a2406742b051d46768a0bd46fe5d9d150328` で main へマージ済み。main を同期し、実装 commit `8e0f382` の包含・実装/参照 worktree の raw clean を確認した。
- 2026-10-18 10:22 JST、実装/参照 worktree を通常削除済み。`feature/prepared-playwright-runner` branch を保持した。TODO / HTML を12/19完了・次#28へ更新した。

# #18 参照検査の確認記録

確認日: 2026-10-17 JST。参照main: `e5944fe`。

## 実装と利用方法

- `bin/audit-skill-references.mjs` はAGENTS、references配下のMarkdown、skills配下のSKILL.mdを列挙する。株式系7ディレクトリとstock-sharedは読み取り前に除外する。
- `node bin/audit-skill-references.mjs --root . --json` で監査する。明確なローカルMarkdownリンク欠落は終了1、入力エラーは2、外部未確認・変数・コード例は警告とする。
- 任意の `--registry <JSONファイル>` で `{"references":["https://example.invalid/guide"]}` を与える。外部参照の原文と完全一致する登録だけexternal-known/infoとし、到達性は保証しない。未指定は空の登録集合で、依存を推測登録しない。JSON文字列も指定できる。
- クエリとフラグメントは存在検査時だけ除き、出力の原文は保持する。参照元ファイル、行、原文、構文、分類、理由、集計をJSONに残す。
- `${SKILL_DIR}` は入れ子を含む各SKILL.mdの所在ディレクトリを基準とする。未解決変数や欠落テンプレートを確定欠陥としない。

## 実測

登録集合が空の状態で402件を列挙し、error 0、warning 168。repository-local 29、skill-local 205、external-unknown 52、code-example-unknown 94、template-unknown 22。過去の53件/76件は今回の確定件数として使わない。警告は解決済み扱いにせず残す。

Markdown解析は簡易構文であり、入れ子括弧など複雑なリンク構文や自由文の曖昧なパスを網羅しない。fenced codeは対象外、インライン例の欠落は警告に留める。明確なMarkdownリンク欠落0件は、全ての参照が完全であることを意味しない。

## 検証

- Luna/maxへ、2ファイル以内の小委任を順次実施。起動不能Redと機能Redを区別し、旧候補のquery誤判定、正常終了の誤り、registry未対応、入れ子基準とinline外部分類の機能Redを確認後に修正。
- 関連fixture 9件、非Archify 77件は全件通過。
- 親のquery除去無効化、常時exit 0化、stock-shared除外除去はそれぞれテスト失敗で検出。全て復元し9件通過、staged差分との不一致なし。
- Node 22.12.0。参照と候補のshared/jevで同じ `npm ci --ignore-scripts --no-audit --no-fund`、Archify依存は双方未導入。main checkoutでテストしていない。
- 全件コマンド: `git ls-files -z '*.test.mjs' | xargs -0 node --test --test-reporter=tap`。参照1001件/909通過、候補1010件/918通過。双方Archify内69失敗、23スキップ。
- 69失敗の名前と診断内容はworktree・一時パス・所要時間を正規化後に一致。23スキップ項目も一致。非Archify限定の承認済み例外を適用し、既知失敗を成功に置換しない。
- ログ: `/tmp/issue18-baseline.tap`、`/tmp/issue18-candidate.tap`、`/tmp/issue18-nonarch.tap`、`/tmp/issue18-mutation-{query,exit,exclusion}.tap`。一時ログは永続成果物ではない。

## 保全と完了条件

旧候補の未追跡ファイルと旧履歴は保全し、取り込まない。この変更のmainマージ、内容保全、clean確認、今回の専用/参照worktreeの通常削除後にtodoとHTMLを完了へ更新する。

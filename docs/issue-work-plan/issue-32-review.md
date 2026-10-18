# Issue #32 確認記録

## 適用範囲

- 2026-10-18 22:18 JST（shell `date`）。承認済みの「最も近いpackage設定、実行可能例と概念例を区別」を実施。
- 新規 `docs/js-ts-environment-policy.md` をローカル適用方針とし、台帳Markdownとecmascript-modern-syntaxのroutingから人が明示参照する。AGENTSの安全・承認を最優先し、最寄りpackage/tsconfig/runner/Node版と既存プロジェクト契約を確認する。
- 旧記法Skillの既存規約への無条件優先、ESM強制、function一律禁止をローカル適用では採用しない。互換時のES2022/arrow/async推奨と、必要なthis/hoisting/CJS契約を分けた。設定不明なら推測変換やtype追加をせず確認する。
- 外部PlaywrightのCJS runnerは自動導入や一時ファイル整理を伴う条件付き例。直接実行せず既存のローカルrunner説明へ参照する。設定のないTDD/WebのTS例は概念例として扱う。
- 既存Skill本文・description・lockは変更していない。記法Skillの由来unknownも維持し、ローカル方針の自動読込は保証しない。

## 委任・検証

- native `gpt-6-luna / max` に調査6分、文書とfixture作成8分、export検証追加4分、独立確認4分、文言修正1分の上限で順番に委任。1対象・問い3つ以内、絶対パス許可範囲、再委任・Git書込み禁止。委任中のworktreeは更新していない。
- 作成担当の初回テストは未作成cwd指定によるENOENTで、意図したREDには数えない。既存binをcwdに修正後、fixture3件不在のMODULE_NOT_FOUNDでRED、追加後3件成功を確認した。RED/GREENは担当の実行ツール出力で、個別ログ保存はない。
- 親mutationでESMのexport削除とCJSのmodule.exports空化を入れると、当初3テストは成功して生存。復元後、実際のnamed import/requireを検証する2テスト追加を委任した。追加作業の最初の重複stdout比較失敗も修正し、最終5件成功。
- 親が同じ2変異を再実行するとnamed import/requireの2件が失敗し検出。完全復元後、関連12件成功。ログ `/tmp/issue32-mutation-exports-{initial,final}.tap`、`/tmp/issue32-related.tap`。これは2つの具体的変異の結果であり、包括的mutation scoreではない。
- ESM/CJS/TSは外部依存・通信なしの実プロセスfixture。Node v22.12.0で確認した。TSは `--experimental-strip-types` による実行のみ。tsc（型検査器）とtsx（実行loader）は未導入で、型検査は未実行。他Node版の互換性は未確認。
- 親作成の仮報告 `/tmp/issue32-fixtures.md` 8件は、独立確認でCJS契約維持・概念例の区別・実行と型検査の分離・明示参照の4件を採用、推測設定追加・型消去を型検査成功とする報告・一律変換・外部runner無確認実行の4件を不採用。手動文書確認であって実runtime/ブラウザ実行ではない。
- 台帳のrouting以外がorigin/mainと一致することを親が比較。外部本文・stock系・#24は対象外。
- candidate/referenceは `994a161` の専用worktree。双方のshared/jevで既存lockの `npm ci --ignore-scripts --no-audit --no-fund` を実行し、mainではテストしていない。
- 非Archify117件成功。全件はbaseline 1,045件 / 953成功 / 69失敗 / 23skip、candidate 1,050件 / 958成功 / 69失敗 / 23skipで双方exit 1。追加5件が成功し、69失敗の名前・正規化診断・skipが一致、新規・悪化なし。承認済み非Archify限定例外を適用し、全件成功とは扱わない。ログ `/tmp/issue32-{baseline,candidate,nonarch}.tap`。

## 完了範囲と残リスク

- ローカル適用順、モジュール契約、実行例/概念例、不明設定時の保留、3方式の最小実行確認を今回の完了範囲とする。
- loader自動適用、外部本文の全面的な例の実行保証、実ブラウザ、他Node版、TypeScript型検査は確認していない。既存Skill本文を人が単独参照した場合の旧文言も残るため、台帳のローカル適用方針を明示参照する必要がある。

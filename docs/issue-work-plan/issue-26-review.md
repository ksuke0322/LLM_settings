# Issue #26 検証記録

確認時刻: 2026-10-18 10:02 JST。基準revision: `f5abd5a`。Node: `v22.12.0`。

## 範囲と判断

- ローカル `skills/workflow/SKILL.md` のみ運用規則を更新。承認・開始・方針変更の正本は既決のAGENTS.mdに参照整合し、同じ範囲の承認を重ねて要求しない。
- 動作変更/動作影響設定はTDD、挙動維持リファクタは既存回帰、テスト変更は期待と失敗理由を確認、文書/非動作設定/生成物は内容に合う検証。ユーザーやセッションの全件指定を維持する。
- 対象の正本設定または承認範囲内の明示指示からcommand・cwd・根拠・対象を確認。不明/矛盾時は推測実行しない。test/lintなど複数コマンドの単なる併存は停止理由にしない。
- 外部TDD/test-fixingの固定例は既定命令にしない。外部本文、株式系、Archify、共通テスト基盤は未変更。汎用runnerや自動検出器は追加していない。

## 委任

gpt-6-luna/maxへ1つずつ委任。読み取り調査8分、限定実装10分、レビュー指摘3分、テスト追加3分、fixture仕上げ3分、独立前向き評価5分と追補2分。再委任なし。親が差分・設計・故障検出・実行・最終判定・記録・Gitを担当した。

## テスト先行と親の故障検出

- 初回はテスト補助parserのエスケープ誤りが判明。修正したテストで元文書の分類表・承認境界・コマンド根拠が欠ける3失敗を再確認してから、更新後3成功を確認。
- 親が承認の正本を「AGENTSよりworkflow優先」に逆転。初回は3成功で見逃したため、テスト追加を委任。同じ故障を親が再実行し2成功/1失敗で検出、正しい本文へ復元。
- 親が根拠なし推測実行・自動導入・再試行を許す故障を入れ、2成功/1失敗で検出、復元。
- ログ: `/tmp/issue26-mutation-authority.tap`、`/tmp/issue26-mutation-authority-final.tap`、`/tmp/issue26-mutation-command.tap`。

## 独立したfixture前向き評価

評価者には正解や既知の問題を渡さず、workflowとraw fixtureだけからcommand/cwd/根拠/対象を選ばせた。fixtureは `/tmp/issue26-fixtures/` の検証用データであり、恒久的なコマンド検出器のテストではない。

| fixture | 根拠と評価結果 | 実行確認 |
|---|---|---|
| javascript | package.jsonのtest scriptから `node --test`、fixture直下を選択 | 親が `npm test` で掛算を加算する欠陥のAssertionErrorを確認。委任修正後、同じコマンドで成功 |
| python | READMEから `python3 -m unittest`、fixture直下を選択 | 親が面積の加算欠陥による `7 != 12` を確認。委任修正後、同じコマンドで成功 |
| missing-command | テストファイルだけからコマンドを推測せず確認不能 | 実行していない |
| ambiguous-command | 名前に反してJSとPythonの別々の検査が併存し、全体検証なら両方を選択できる正常例だった | 初期fixture不足を記録し、無理に停止判定へ誘導しなかった |
| conflicting-command | 同一検査のpackage指定とREADMEの必須cwdが矛盾し、そのcwdも存在しない。確認不能 | 追補で正しく停止。実行していない |

起動・構文失敗と依存/入力/環境不足の分類は独立評価で説明を確認したが、両者を実際に起動して失敗させる動的試験までは行っていない。実行コマンド自体が無効と判明した場合も自動切替せず、正本を確認し選べなければ親へ返す。実サービスや依存導入の試験ではない。

## 関連から全件検証

実装用と参照用の専用worktreeで同じNode版・条件を使用。main checkoutではテストしていない。`shared/jev` のみ両方で `npm ci --ignore-scripts --no-audit --no-fund`、Archify依存は双方未導入。

| 検証 | コマンド | 結果 |
|---|---|---|
| 関連 | `node --test bin/workflow-policy.test.mjs bin/governance-policy.test.mjs` | 6成功、0失敗 |
| 非Archify | `git ls-files -z '*.test.mjs' ':!:skills/archify/**' \| xargs -0 node --test --test-reporter=tap` | 101成功、0失敗、0スキップ |
| 基準全件 | `git ls-files -z '*.test.mjs' \| xargs -0 node --test --test-reporter=tap` | 1,031件、939成功、69失敗、23スキップ、exit 1 |
| 候補全件 | 同上。新規テストを明示stage後に実行 | 1,034件、942成功、69失敗、23スキップ、exit 1 |

全件のArchify69失敗はテスト名と診断本文が一致し、23スキップも一致。比較時はworktree/一時パスと実行時間だけを正規化した。新規・悪化・未説明の失敗なし。非Archifyタスクの承認済み例外を適用し、全件を成功と表現しない。

ログ: `/tmp/issue26-related.tap`、`/tmp/issue26-nonarch.tap`、`/tmp/issue26-baseline.tap`、`/tmp/issue26-candidate.tap`。fixture実行ログは `/tmp/issue26-fixture-{js,py}-{red,green}.log`。

## 残る制約

コマンド選択はエージェントの根拠確認手順であり、自動検出の網羅性保証ではない。外部test-fixing本文には固定例が残るため、ローカルworkflowの適用範囲と正本確認を先に使う。fixtureの実行ログは一時領域で、恒久的に自動再現する実行基盤は導入していない。新たな判断待ちはない。

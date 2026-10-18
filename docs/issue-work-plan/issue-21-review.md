# Issue #21: 重複Skillの使い分け

## 範囲と結果

- 基準: `5162f89`。#19の既存routingを確認し、代表依頼・非適用条件とTestingの責務整理を補った。
- `docs/skill-inventory.md` に通常SwiftUI、trace単独、一時browser、永続E2E、unit、integration、既存失敗修正、文書のみの8例を記録した。
- `docs/skill-inventory.json` の既存5件を更新し、Testing関連6件へroutingを追加した。routing以外の既存値は同一である。
- 外部Skill本文、stock系、stock-shared、loader、実行例、テストコードは変更していない。deprecated対象の追加もない。
- 通常SwiftUIはrootのproを標準候補、expertを必要な観点の補助とする。traceだけの解析ではexpertを候補とし、proを必須にしない。
- 一時browserと永続E2Eを分離し、JS/TS記法はテスト種別を選ばない補助として扱う。
- Testingの参照関係はworkflow → TDD詳細 → Web共通 → 種別別。AGENTS.mdの安全境界・承認・開始・方針変更を常に優先する。

## 委任とレビュー

gpt-6-luna / maxへ、読み取り調査、Markdown 1ファイルの整備、独立レビューを逐次委任した。各委任は対象1つ、問い3つ以内、12分以内とし、同時に別Issueを進めていない。親が正本台帳と最終判断を担当した。

独立レビューでtrace単独時のJSONの曖昧さと、JS/TS補助の関連先の非対称が指摘された。親が台帳を修正し、同じレビュー担当が解消を確認した。8つの代表依頼はいずれも意図的な併用または非適用へ整理できた。

文書変更のため、実装コードを壊す自動ミューテーションの代わりに、親が別ファイルで故意の誤案内3件と正しい案内2件を作り、独立レビューに判定させる手動の故障注入を行った。一時操作への永続E2E強制、記法補助による結合テスト規則の省略、loader保証の捏造の3件すべてを検出し、正しい2件は維持した。これは自動ミューテーションテストの成功を意味しない。

## 検証

すべて専用worktreeで実施した。基準・変更後の両方で `shared/jev` に `npm ci --ignore-scripts --no-audit --no-fund` を実施し、Archify依存は追加していない。

| 検証 | 結果 |
| --- | --- |
| `node --test --test-reporter=tap bin/skill-inventory.test.mjs` | 4件成功 |
| JSON解析・routing以外の既存値比較・関連ディレクトリ照合 | 成功、routing 11件 |
| `git diff --check` | 成功 |
| 非Archify全件 (`git ls-files`のテストからArchifyを除外) | 95件成功、失敗・スキップなし |
| 基準の全件・初回 | 1,028件、935成功、70失敗、23スキップ、exit 1 |
| 追加失敗の対象ファイルを単独再実行 | output-path 19件成功、exit 0 |
| 基準の全件・再確認 | 1,028件、936成功、69失敗、23スキップ、exit 1 |
| 変更後の全件 | 1,028件、936成功、69失敗、23スキップ、exit 1 |

初回の追加失敗はArchifyの `deliver rechecks aliases immediately before committing a verified candidate` で、期待 `commit` に対して `render` だった。単独再実行と全件再確認では再現しなかった。原因を修正・解決したとは判定せず、不安定さの可能性を記録する。初回結果を既知例外に追加していない。

基準再確認と変更後は、69件の失敗名・診断内容および23件のスキップ内容が一致した。診断比較ではworktree・一時パスと所要時間だけを正規化した。非Archifyタスクの承認済み例外を適用し、全件成功とは記録しない。

ローカルログ: `/tmp/issue21-related.tap`、`/tmp/issue21-nonarch.tap`、`/tmp/issue21-baseline.tap`、`/tmp/issue21-baseline-output-path.tap`、`/tmp/issue21-baseline-repeat.tap`、`/tmp/issue21-candidate.tap`。手動検査入力は `/tmp/issue21-routing-fault-cases.md`。

## 未確認・後続

- routingは人向けの記録で、実loaderの読み込み順・同時発動・排他性を保証しない。root/nested Skillとlockの対応を含め#33で扱う。
- Playwright CommonJS例とESM優先規則の実行環境適合は#32に残す。
- 由来・版・利用状態など既存のunknown/nullは補完していない。

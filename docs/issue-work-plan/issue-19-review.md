# Issue #19 確認記録

確認日: 2026-10-17 JST。基準main: `d8edee2`。

## 結果

外部Skillの追加・更新の標準チェックリスト、採用比較表、台帳記録手順を追加した。lockの追加・更新を人のレビュー対象として検出する。導入可否を自動判定するgateは設けない。

- `compareSkillLocks(before, after)` と対指定の `--base-lock` / `--current-lock` を追加。追加・更新は `review-required`、削除は `reported-only`。
- 変更フィールドを報告し、ローカル文書の存在と不足理由を残す。`skills/<lock key>/SKILL.md` と上流 `skillPath` を区別する。
- オブジェクトのキー順と配列の要素順だけの変更は無視する。配列順に意味がある将来のメタデータは別途仕様確認が必要。
- stock系8ディレクトリはlock keyと上流パス要素で除外。本文は調査・変更の対象外。
- チェックリストはtrigger、強い規則、安全境界、言語・応答文体、責務、資材、副作用、固有価値、直接編集を避ける方法を扱う。
- 台帳の5レコードに任意の `routing` を追加。元の由来・版・unknown/null・関連情報は維持した。

## 承認済みの役割分担

| 対象 | 採用・併存の理由と条件 |
| --- | --- |
| playwright-skill / web_e2e_test | 一時操作と、リポジトリで保守する永続E2Eを分離。Playwrightは実行手段として利用できる。外部本文は直接編集しない。 |
| coding_typescript | JS/TS記法の補助。テスト配置・種別を担当しない。CommonJS例の適用は最も近いpackage設定と照合し、実行例の整備は#32へ残す。 |
| swiftui-pro / swiftui-expert-skill | ルートのproを標準候補、expertを状態・性能・trace等の必要な観点の補助とする。外部本文は直接編集しない。 |

実行時の同時発動や排他性は保証しない。代表依頼・非適用条件の詳細は#21、実loaderとlockおよび入れ子の対応は#33で未確認。

## 検証

- 追加前のRedは未exportの比較関数で失敗し、実装後のロック関連4件が通過した前任の途中報告を保持。親は保存後の実差分と実行結果を別途確認した。
- `node --test bin/audit-skills-consistency.test.mjs bin/skill-inventory.test.mjs`: 14件通過。
- 親のmutation: 更新差分を出力しない変更で2件失敗、株式系lock除外を無効化して1件失敗。復元後に関連検証を通過。
- 非Archify: `git ls-files -z '*.test.mjs' ':!:skills/archify/**' | xargs -0 node --test --test-reporter=tap`、93件すべて通過。
- 全件: 専用と参照worktreeで `git ls-files -z '*.test.mjs' | xargs -0 node --test --test-reporter=tap` を実行。

| 実行 | tests | pass | fail | skip |
| --- | ---: | ---: | ---: | ---: |
| 参照main | 1022 | 930 | 69 | 23 |
| 候補 | 1026 | 934 | 69 | 23 |

両者ともNode v22.12.0、shared/jevのみ同じlockで依存準備。Archifyの69失敗名と診断内容、23スキップは、worktreeパス・所要時間・一時パスのみ正規化して一致した。全件コマンドは終了1であり、承認済みの非Archify変更に限る例外を適用する。新たな失敗・悪化はない。

ログ: `/tmp/issue19-{baseline,candidate,nonarch,related}.tap`、`/tmp/issue19-mutation-{delta,exclusion}.tap`。一時ログは永続成果物ではないため、集計と比較結果を本記録に残す。

## 委任と逸脱

gpt-6-luna/maxへロック差分と手順文書を順番に小さく委任した。最初の委任は利用上限で中断し、利用可能の確認後に対象を2ファイルへ固定して再定義した。
再開担当が既存の全10テストを実行した際、1件が実リポジトリの非stock Skill本文を全走査し、指定した全走査禁止に違反した。担当が自己申告し、以降の全走査を止めた。stock本文の読み取りは監査器の除外で行われていない。変更範囲は許可2ファイル内で、追加変更はなかった。親の全件検証は別工程として実行した。

## 完了範囲

#19のレビュー方法と役割判断の記録を完了した。未知のruntime選択や上流との一致を確認済みとは扱わない。
2026-10-17 07:50 JST、PR #126のmerge commit `a0f97a7` とmain同期を確認。実装commit `3c5ed66` がmainに保全され、実装用と参照用worktreeがcleanであることを確認後、両方を通常削除した。実装branchは保持した。一覧・HTMLを同じ完了状態へ更新し、ユーザー指定の区切りで停止する。

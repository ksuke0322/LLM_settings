---
name: single-task-pr-policy
description: repo 全体で共通に適用する 1 タスク = 1 PR 方針。複数タスクを同一 PR にまとめないこと、作業開始前に専用ブランチを切ること、ブランチ作成前の差分確認、TDD ワークフロー参照、Git / PR 安全ルール参照、worktree 作業終了時の main 取り込み確認を定義する。`specs/flow` 固有の task lifecycle や worktree の詳細な作成・削除手順は扱わない。
---

## タスク実行方針

- この skill は repo-wide の実行単位方針だけを扱う。`specs/flow` 固有の task lifecycle、done 定義、worktree 運用は `task-flow-non-speckit` を正本とする
- 1タスク1PRを原則とし、複数タスクをまとめて実行しないでください
- 各タスクは専用のブランチを切ってから作業を開始してください。ブランチの方針は下記の「ブランチ」の章を参照してください。
- worktreeを使った場合は、変更と検証が完了し、最終報告に入る直前に、必ず `mainへマージして、mainを更新しますか？ (y/n)` と確認してください。確認前にmainへのマージやmainの更新を行わないでください。`y` と `n` の後のGit操作は `skills/git/SKILL.md` に従ってください。
- すべてのコード変更は TDD ワークフローに従って行ってください（詳細は skills/workflow/SKILL.md を参照）
- Git/PR の安全ルールは `skills/git/SKILL.md` を正本とし、コミット、push、PR 作成、禁止事項は必ずその規定に従ってください

## ブランチ

- ブランチはベースブランチを最新化してから切る（例: git fetch → git switch main → git pull）
  - ベースブランチは通常 main ブランチとする
  - ただし他のブランチに依存する場合はそのブランチをベースブランチとする
  - ベースブランチが main でない場合も同様に最新化する
- ブランチ名の命名は `branch-worktree-naming` skill に従う
- ブランチ作成前に現状のブランチの差分を確認し、不要な変更が含まれていないことを確認する（例: git status, git diff）
  - 変更が含まれている場合は、stash するかコミットしてからブランチを切る

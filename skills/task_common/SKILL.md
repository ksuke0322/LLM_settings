---
name: single-task-pr-policy
description: repo-wide の 1 task = 1 PR 方針、作業前の専用 worktree と差分確認を定める。Git / PR の安全、merge、cleanup は `skills/git/SKILL.md`、開発と TDD は `skills/workflow/SKILL.md`、`specs/flow` lifecycle は `task-flow-non-speckit` を参照する。
---

## タスク実行方針

- この skill は repo-wide の実行単位方針だけを扱う。`specs/flow` 固有の task lifecycle、done 定義、worktree 運用は `task-flow-non-speckit` を正本とする
- 1タスク1PRを原則とし、複数タスクをまとめて実行しないでください
- 各タスクは専用のブランチを切ってから作業を開始してください。ブランチの方針は下記の「ブランチ」の章を参照してください。
- すべてのコード変更は TDD ワークフローに従って行ってください（詳細は skills/workflow/SKILL.md を参照）
- Git/PR の安全、merge、worktree cleanup は `skills/git/SKILL.md` を正本とし、その規定に従ってください

## ブランチ

- ブランチはベースブランチを最新化してから切る（例: git fetch → git switch main → git pull）
  - ベースブランチは通常 main ブランチとする
  - ただし他のブランチに依存する場合はそのブランチをベースブランチとする
  - ベースブランチが main でない場合も同様に最新化する
- ブランチ名の命名は `branch-worktree-naming` skill に従う
- ブランチ作成前に現状のブランチの差分を確認し、不要な変更が含まれていないことを確認する（例: git status, git diff）
  - 変更が含まれている場合は、stash するかコミットしてからブランチを切る

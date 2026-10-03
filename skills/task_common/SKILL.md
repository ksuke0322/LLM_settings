---
name: single-task-pr-policy
description: repo 全体のタスク実行単位方針に使う。1 タスク = 1 PR、作業前の差分確認と専用ブランチを定める。専用 worktree は `AGENTS.md`、Git / PR の安全条件とマージ手順は `skills/git/SKILL.md` を参照する。`specs/flow` 固有の task lifecycle は扱わない。
---

## タスク実行方針

- この skill は repo-wide の実行単位方針だけを扱う。`specs/flow` 固有の task lifecycle、done 定義、worktree 運用は `task-flow-non-speckit` を正本とする
- 1タスクにつきPRは1件とし、複数タスクを同じPRにまとめないでください
- 作業は `AGENTS.md` の規定により必ず専用 worktree で行い、タスク専用ブランチを作成してから開始してください。
- すべてのコード変更は TDD ワークフローに従って行ってください（詳細は skills/workflow/SKILL.md を参照）
- Git / PR の安全ルールと worktree 作業終了時のマージ条件は `skills/git/SKILL.md` を正本とし、その規定に従ってください

## ブランチ

- ブランチ作成前に現状の差分を確認する（例: git status, git diff）。既存差分がある場合は `AGENTS.md` の承認境界に従って整理し、このタスクへ混在させずに専用ブランチを作成する
- ベースブランチを最新化してから専用ブランチを切る（例: git fetch → git switch main → git pull）
  - ベースブランチは通常 main ブランチとする
  - ただし他のブランチに依存する場合はそのブランチをベースブランチとする
  - ベースブランチが main でない場合も同様に最新化する
- ブランチ名の命名は `branch-worktree-naming` skill に従う

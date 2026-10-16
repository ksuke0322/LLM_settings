---
name: task-flow-non-speckit
description: "`specs/flow` で管理する作業タスクに限定して利用する。`specs/flow` 運用時の task lifecycle 専用 skill として、タスク分割基準、ステータス定義、done 条件、worktree 運用、記述テンプレの前提を適用する。repo-wide の 1 task = 1 PR 方針そのものは `single-task-pr-policy` を参照する。"
---

# Task Flow

`specs/flow/` で管理する作業タスクに限定して適用する。通常の開発タスク全般には広げず、`specs/flow` 上の task lifecycle と worktree 運用だけを担当する。

## コア方針

- **タスク分割**: AIが適切に分割判断する。
  - 原則は「単一目的・単一成果物・限定的な影響範囲」。
  - 作業ブランチ名を `<type>/<slug>` で自然に表現できる単位まで分解する。
  - 1つのブランチ名に複数の目的や複数領域を無理に含める必要がある場合は、タスク分割を再検討する。
  - 目的が複数ある場合や、フロント/バックなど複数領域にまたがる場合は分割を前提にする。
- **ステータス**: `未着手` / `done` のみ。
- **done定義**: タスクファイルの `done` と lifecycle の最終完了を区別する。期待値達成後にユーザー確認を依頼し、approve 後にタスク状態を `done` に更新してコミットし、リモートレポジトリがある場合は PR に含める。この `done` はPRに提案するタスク記録であり、最終完了を意味しない。最終完了は期待値の達成、ユーザー approve、`done` を含むコミット、PR作成、main/masterへのマージ確認、作業内容の保全、clean確認、branchを保持した作業worktreeの削除が揃った状態とする。承認・merge・cleanupの手順は `skills/git/SKILL.md` に従う。
- **PR要件**: PRの必須項目は `single-task-pr-policy` と `git-workflow-safety` の規定に準拠。
- **worktree運用**: `specs/flow` 管理タスクでは専用の作業 worktree を作成し、その worktree 上で実施する。終了時のmergeとcleanupは `skills/git/SKILL.md` を正本とする。
- **命名規則**: 作業ブランチ名と作業 worktree 名の命名は `branch-worktree-naming` skill に従う。

## specs/flow ファイルの最低限構成

- タイトル
- 目的
- 方針（必要なら）
- タスク一覧（1タスク=1PR）
- 各タスクの「期待値 / 対象 / 作業」
- 新規タスクファイルは後述のテンプレートを使う

## 実運用のルール

- 新規タスクは `specs/flow/` に作成する。
- タスク一覧のチェックは `未着手` / `done` のみで管理する。
- 各タスクの着手前に main/master を確認し、タスク用ブランチと専用の作業 worktree を作成する。
- タスク作業は必ずその作業 worktree 上で行い、対象タスク以外の変更を混ぜない。
- タスクの期待値を満たした時点で、まずユーザーに確認依頼を投げる。
- ユーザーに approve されたら、タスク状態を `done` に更新してコミットする。タスクファイルの `done` はPRに提案する状態であり、PRが未マージなら lifecycle は完了していない。
- リモートレポジトリが存在する場合は PR を作成する。PRの確認・mergeは、同一PRの事前承認がなければユーザーの明示的な承認を待ち、事前承認があれば `skills/git/SKILL.md` の検証条件に従う。
- main/masterへのmerge確認後、作業内容を保全してworktreeがcleanであることを確認し、branchを保持したまま通常の作業worktreeを削除する。詳細と停止条件は `skills/git/SKILL.md` に従う。
- lifecycle 最終完了は「期待値の全達成」「ユーザー approve」「`done` 更新を含むコミット」「リモートレポジトリがある場合のPR」「main/masterへのmerge確認」「作業内容の保全とclean確認」「PR branchを保持した作業worktreeの削除」の全完了を基準とする。抜けがある場合は最終完了にしない。
- 既存のタスク分割が過大/過小な場合、`specs/flow/` で分割提案を先に行う。

## タスクファイルテンプレート

```md
# <タスク名>

## 目的

<このタスクで達成すること>

## 方針

<必要な場合のみ記載>

## タスク一覧

### 1. <タスク名>

- ステータス: 未着手
- 作業ブランチ: <branch-name>
- 作業 worktree: <worktree-path>

#### 期待値

- <完了時に満たすべき状態>

#### 対象

- <対象ファイル/領域>

#### 作業

- <実施する作業>

#### 実施前チェック

- [ ] main/master を確認した
- [ ] タスク用ブランチを作成した
- [ ] 専用 worktree を作成した
- [ ] 作業 worktree 上で作業している

#### 完了チェック

- [ ] 期待値をすべて満たした
- [ ] 対象タスク以外の変更が混ざっていない
- [ ] ユーザーに確認依頼した
- [ ] ユーザー approve を得た
- [ ] タスク状態を done に更新した
- [ ] approve 後の状態でコミットした
- [ ] リモートレポジトリがある場合は PR を作成した
- [ ] 未コミット差分がないことを確認した
- [ ] PR ブランチを残したまま作業 worktree を削除した
```

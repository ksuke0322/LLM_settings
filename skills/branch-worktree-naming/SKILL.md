---
name: branch-worktree-naming
description: ブランチを切る時や worktree を作成する時の命名規則を定義する。`<type>/<slug>` 形式、許可する type、slug 正規化、判定基準、良い例/悪い例を適用したいときに使う。
---

# Branch / Worktree Naming

ブランチ名と worktree 名の命名規則にだけ適用する。

## 命名形式

- ブランチ名: `<type>/<slug>`
- worktree 名: `<type>/<slug>`

## type

- `feature`: 価値につながる新規機能追加、または意図して振る舞いを変える変更
- `bugfix`: 既存の不具合を、期待する振る舞いへ修正する変更
- `revert`: 以前の状態への巻き戻し
- `improve`: 性能や安定性の改善
- `refactor`: 保守性向上のための構造の変更
- `test`: 品質を担保するためのテストの追加・修正
- `docs`: ドキュメントの追加・修正
- `chore`: 上記7種のいずれにもあてはまらない作業

## type の判定基準

- まず巻き戻しかどうかを見て、該当するなら `revert`
- 既存の不具合修正が主目的なら `bugfix`
- 新しい価値の追加や、意図した振る舞い変更が主目的なら `feature`
- 性能や安定性の改善が主目的なら `improve`
- 外部仕様を変えず、内部構造の整理が主目的なら `refactor`
- テスト追加・修正が主目的なら `test`
- ドキュメント追加・修正が主目的なら `docs`
- 上記のどれでもない運用・設定・雑務は `chore`

## slug のルール

- 英小文字のみを使う
- 単語区切りは kebab-case にする
- 空白、`_`、日本語、記号は使わない
- `type` を slug に重ねない
- 3語から6語程度を目安に、短く内容が分かる語にする

## 良い例

- `feature/branch-worktree-naming`
- `feature/add-branch-slug-rule`
- `bugfix/worktree-cleanup-check`
- `improve/reduce-git-status-latency`
- `refactor/split-git-naming-logic`
- `test/cover-branch-name-parser`
- `docs/update-branch-naming-guide`
- `chore/align-skill-metadata`

## 悪い例

- `feature/feature-branch-worktree-naming`
- `feature/ブランチ命名`
- `feature/branch_worktree_naming`
- `feature/add branch naming rule`
- `misc/tmp`

## 運用メモ

- branch と worktree で同じ命名形式を使う
- 命名に迷ったら、変更の主目的が何かで type を決める
- task 番号や owner 名、repo 名は命名規則に含めない

---
name: git-workflow-safety
description: Git 操作（ブランチ作成、コミット、push、PR 作成）を行うときに必ず適用するルール集。main 直push禁止、force push 禁止（例外は単独PRブランチでの --force-with-lease のみ）、Conventional Commits、1コミット=1意図、PR の Why/What/How/Risk 記載、secrets・生成物・巨大バイナリのコミット禁止を強制する。
---

# git 操作ルール

## push

- mainブランチへの直push禁止
  - すべての変更は作業ブランチを切り、PR 経由でマージする
- `git push --force` は禁止
- 例外として、自分だけが使用している PR ブランチに限り
  `git push --force-with-lease` のみ許可する

## コミット

- Conventional Commits（例: `feat:`, `fix:`, `chore:`）を採用
- Conventional Commits 詳細:
  - 破壊的変更は `feat!:` もしくはフッターに `BREAKING CHANGE:` を記載
  - コミットメッセージは英語で簡潔に（動詞の原形で開始）
- **1コミット = 1意図（1論点）** を基本とする
- コミットメッセージは作業内容を鑑みて適切なメッセージを記載する

## PR

- PR のタイトルや説明は日本語で記載する
- PR の説明は `--body-file方式` を用いて作成するため説明内容をファイルに記載する
- PR のタイトルや下記の内容は作業の内容を鑑みて適切な内容を記載する
- PR には以下を必ず含める：
  - Why: なぜこの変更が必要か
  - What: 何を変更したか
  - How: どのように動作確認したか
  - Risk: 影響範囲・注意点
- PR 作成時は以下のサンプルコマンドを参考に必要な情報を記載してください。

```bash
  gh pr create \
    --title "feat:" \
    --body-file /tmp/pr-body.md \
    --base <base-branch> \
    --head <new-branch>
```

## 秘密情報・生成物の取り扱い

- `.env`、API Key、Token、認証情報は **絶対にコミットしない**
- 生成物（`dist/`, `build/` など）は原則コミットしない
- 巨大ファイル・バイナリは原則コミットしない（必要な場合は別途方針を定める）

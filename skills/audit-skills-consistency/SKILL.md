---
name: audit-skills-consistency
description: ローカル skill 群の重複、矛盾、責務境界、trigger の競合を監査する。skills が増えてきたとき、ルールの重複やコンフリクトが疑われるとき、skill の統合・参照化・削除・description 調整方針を立てるときに使用する。
---

# Skills Consistency Audit

ローカル skill 群を比較し、重複・矛盾・責務の曖昧さを見つけて整理方針を出す。監査 skill であり、ユーザー承認なしに既存 skill を編集・削除・統合しない。

## 基本方針

- まず読み取り専用で `skills/*/SKILL.md` を確認する。
- 監査時は `.skill-lock.json` を確認し、記録されている skill を `npx skills add` などでインストールされた外部由来 skill として扱う。
- `.skill-lock.json` に記録がない skill は自作 skill 候補として扱う。ただし判断できない場合はユーザーに確認する。
- 外部由来 skill は更新追従性を保つため、原則として編集しない。
- 外部由来 skill と自作 skill の間に競合がある場合、競合解消は自作 skill 側の修正、参照化、description 調整、またはラッパー skill の追加で行う。
- 外部由来 skill 自体に問題がある場合は、直接修正ではなく、上流更新待ち、issue/PR 提案、自作 skill 側での回避策として扱う。
- 変更提案は「何を正とするか」「どこを参照化するか」「何を削るか」を明確にする。
- 重複は即削除せず、再利用・参照・責務分離で解消できるかを先に検討する。
- 削除、統合、大幅な description 変更は個別にユーザー承認を得る。
- 既存 skill の意図が不明な場合は、推測で修正せず open question として残す。

## 監査観点

- **Trigger 重複**: 複数 skill の `description` が同じ依頼で発火しそうか。
- **責務重複**: 同じルールや手順を複数 skill が持っていないか。
- **ルール矛盾**: 承認、TDD、Git、PR、worktree、テスト、外部サービス操作の指示が衝突していないか。
- **正本不明**: どの skill を authoritative source として扱うべきか曖昧でないか。
- **粒度不整合**: 1 skill に詰め込みすぎ、または細かすぎて運用しづらくないか。
- **参照関係**: 重複記載ではなく、別 skill への参照で表現できないか。

## 手順

1. `find skills -maxdepth 2 -name SKILL.md -print | sort` で対象を把握する。
2. 関連しそうな skill の frontmatter と本文の主要ルールを読む。
3. skill をカテゴリに分ける。
   - workflow / git-pr / testing / web-testing / design / architecture / accessibility / prompt-context / utility
4. 重複・矛盾・曖昧さを表にまとめる。
5. 各問題に対して整理案を出す。
   - 統合
   - 正本化
   - 参照化
   - description 調整
   - 削除候補
   - 現状維持
6. 修正が必要な場合は、編集前に計画を提示して `y/n` 承認を得る。

## 出力形式

監査結果は以下の形で簡潔に出す。

```md
## 監査結果

### 問題一覧

| 種別 | 対象 skill | 内容 | 影響 | 推奨対応 |
| --- | --- | --- | --- | --- |
| Trigger 重複 | A / B | ... | ... | ... |

### 正本候補

| 領域 | 正とする skill | 参照側 skill | 理由 |
| --- | --- | --- | --- |
| Git/PR | git-workflow-safety | task-flow-non-speckit | ... |

### 修正計画

- <変更対象>
- <変更内容>
- <承認が必要な操作>

### Open Questions

- <判断にユーザー確認が必要な点>
```

## 判断ルール

- 実行フローを定義する skill と、詳細ルールを定義する skill が重複している場合、実行フロー側は詳細ルールを参照する。
- テスト種別ごとの skill と共通テスト skill が重複している場合、共通方針は共通 skill に寄せる。
- Git/PR の安全ルールは専用 skill を正本にし、タスク管理 skill は参照に留める。
- 強い MUST ルールが複数 skill にある場合、優先順位を明文化するか、片方を参照化する。
- description の発火条件が広すぎる場合は、対象領域・利用場面・除外条件を明記して狭める。

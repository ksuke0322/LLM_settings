---
name: audit-skills-consistency
description: ローカル skill 群の重複、矛盾、責務境界、trigger の競合を監査する。skills が増えてきたとき、ルールの重複やコンフリクトが疑われるとき、skill の統合・参照化・削除・description 調整方針を立てるときに使用する。
---

# Skills Consistency Audit

ローカル skill 群を比較し、重複・矛盾・責務の曖昧さを見つけて整理方針を出す。監査 skill であり、ユーザー承認なしに既存 skill を編集・削除・統合しない。

## 基本方針

- まず読み取り専用で `~/.agents/skills/*/SKILL.md` を確認する。
- 監査時は `~/.agents/.skill-lock.json` を確認し、記録されている skill を `npx skills add` などでインストールされた外部由来 skill として扱う。
- `~/.agents/.skill-lock.json` に記録がない skill は自作 skill 候補として扱う。ただし判断できない場合はユーザーに確認する。
- lock の skill key はローカルのディレクトリ名であり、ローカル文書はリポジトリ内の `skills/<key>/SKILL.md` を読む。lock の `skills.<key>.skillPath` は上流リポジトリ内の相対パスであり、ローカル文書の場所として扱わない。
- 外部由来 skill は更新追従性を保つため、原則として編集しない。
- 外部由来 skill と自作 skill の間に競合がある場合、競合解消は自作 skill 側の修正、参照化、description 調整、またはラッパー skill の追加で行う。
- 外部由来 skill 自体に問題がある場合は、直接修正ではなく、上流更新待ち、issue/PR 提案、自作 skill 側での回避策として扱う。
- 変更提案は「何を正とするか」「どこを参照化するか」「何を削るか」を明確にする。
- 重複は即削除せず、再利用・参照・責務分離で解消できるかを先に検討する。
- 削除、統合、大幅な description 変更は個別にユーザー承認を得る。
- 既存 skill の意図が不明な場合は、推測で修正せず open question として残す。

## 外部 Skill の導入・更新レビュー

外部 Skill を追加・更新する前に、lock 差分を確認し、導入候補の内容を人がレビューする。差分表示や `review-required` は確認対象を示すだけで、導入可否を自動判定しない。判断材料が不足する項目は `unknown` として理由を残す。

確認項目:

- **Trigger / strong rules**: description と本文全体の `MUST` / `MUST NOT` / `NEVER` / `ALWAYS` を読み、既存 trigger と承認・Git・TDD・ファイル・network・browser の規則に照らす。
- **範囲と資材**: 言語、応答文体、利用者、責務、参照先、`scripts/`、依存関係、副作用を既存 skill と比較する。
- **価値と境界**: 固有の価値があり、責務と trigger を分けて共存できるか確認する。境界を示せない場合は重複として記録する。
- **変更方法**: 外部 Skill を直接編集せず、必要なローカル差分は wrapper skill / local policy で扱う。未確認事項は `unknown` と理由を残す。

導入判断では次を比較し、選択理由を台帳に記録する。

| 選択肢 | 判断の目安 | 記録する理由 |
| ------ | ---------- | ------------ |
| 併存 | 責務と trigger を分離できる | 分離境界と固有価値 |
| wrapper / local policy | 外部 Skill を保ち、ローカル規則を補う | 補う規則と直接編集を避ける理由 |
| 既存を deprecated | 新 Skill へ移行できる | 対象、移行条件、廃止根拠 |
| 導入却下 | 価値がない、衝突が解けない、根拠が足りない | 却下または保留の根拠 |

台帳記録の雛形:

| lock key | action / fields | local path | upstream `skillPath` | candidates | decision | basis / verification | unknown |
| -------- | -------------- | ---------- | -------------------- | ---------- | -------- | -------------------- | ------- |
| <key> | <added / updated / removed> | <local path> | <upstream path> | <candidate keys> | <choice> | <reason and checks> | <unknown or none> |

## 監査観点

- **Trigger 重複**: 複数 skill の `description` が同じ依頼で発火しそうか。
- **責務重複**: 同じルールや手順を複数 skill が持っていないか。
- **ルール矛盾**: 承認、TDD、Git、PR、worktree、テスト、外部サービス操作の指示が衝突していないか。
- **正本不明**: どの skill を authoritative source として扱うべきか曖昧でないか。
- **粒度不整合**: 1 skill に詰め込みすぎ、または細かすぎて運用しづらくないか。
- **参照関係**: 重複記載ではなく、別 skill への参照で表現できないか。

## 手順

1. `.agents` リポジトリのルートで、読み取り専用CLIを実行する。

   全件を走査する:

   ```sh
   node bin/audit-skills-consistency.mjs .
   ```

   変更された skill を含む候補ペアに絞る場合は、リポジトリルートからの相対パスを `--changed` で指定する。複数指定できる。

   ```sh
   node bin/audit-skills-consistency.mjs . --changed skills/skill-a/SKILL.md --changed skills/skill-b/SKILL.md
   ```

   意図的な重複として確認済みのペアだけを候補一覧から除く場合は、両方の相対パスを `--allow-pair` に渡す。指定した2パスの組み合わせだけに適用され、複数ペアを指定できる。

   ```sh
   node bin/audit-skills-consistency.mjs . --changed skills/skill-a/SKILL.md --allow-pair skills/skill-a/SKILL.md skills/skill-b/SKILL.md
   ```

   lock の追加・更新・削除差分も確認する場合は、基準 lock と現在 lock を両方指定する。

   ```sh
   node bin/audit-skills-consistency.mjs . --base-lock /path/to/base/.skill-lock.json --current-lock .skill-lock.json
   ```

   両 option は対で指定する。`lockReview` は追加・更新を `review-required`、削除を `reported-only` として報告する。オブジェクトのキー順・配列要素順は差分としない。株式関連8ディレクトリは対象外。exit 0 は実行成功を表し、人の導入判断の完了を意味しない。ローカル文書は `skills/<key>/SKILL.md`、lock の `skillPath` は上流側の相対パスなので混同しない。不足情報は `unknown` とする。ローカル文書がある候補は `localSkillPath` を `--changed` に渡す。未配置ならその状態を記録し、上流 `skillPath` の候補本文を別途確認する。

   出力は JSON で、各項目は次の意味を持つ。
   - `inventory`: 発見した全 SKILL.md の path/name/description。
   - `candidates`: frontmatter description の語句類似から抽出した確認候補。意味上の重複・矛盾を確定する判定ではない。
   - `warnings`: 強い規範表現と frontmatter name・フォルダ名の不一致を示す確認箇所。

   `--changed` と `--allow-pair` が絞るのは候補ペアだけで、inventory と warnings は全件分を保つ。
2. inventory から対象の skill を選び、関連しそうな skill の frontmatter と本文の主要ルールを読む。各 candidate の実ファイルを開き、trigger 重複、責務重複、ルール矛盾、正本不明、粒度不整合、参照関係を手作業で確認する。similarity や sharedTerms だけで結論を出さない。
   warnings は該当行と周辺文脈を読み、強い規範表現や名前不一致が実際の問題かを判断する。
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

| 種別         | 対象 skill | 内容 | 影響 | 推奨対応 |
| ------------ | ---------- | ---- | ---- | -------- |
| Trigger 重複 | A / B      | ...  | ...  | ...      |

### 正本候補

| 領域   | 正とする skill      | 参照側 skill          | 理由 |
| ------ | ------------------- | --------------------- | ---- |
| Git/PR | git-workflow-safety | task-flow-non-speckit | ...  |

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

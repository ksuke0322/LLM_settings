# Context と指示設計の入口

外部 Skill 本文と description は未変更である。実際の description 短縮と詳細分割は未完了である。

このガイドは、`context-engineering` と `prompt-engineering` の責務を分け、読む節を選ぶためのローカル参照資料である。

台帳の routing は人向けの候補整理であり、runtime loader による自動適用や選択を示さない。loader の実際の挙動は未確認のため、人がこのガイドを明示参照する。

## Skill の説明欄

Skill の説明欄は、発動条件、対象、役割、成果物、主な非対象を短く示す。

Unicode コードポイントで300個を超える長さはレビューの目安にする。300個は上限や合否条件ではなく、説明欄が役割と発動条件を伝えているかを見直す手掛かりである。

「prompt」「agent」「skill」のような一般語だけでは候補を選ばない。依頼の課題と必要な成果物を見て判断する。

2026-10-18時点の台帳は39件である。Archify を除く38件の `trigger` 欄（frontmatter の description の転記）を Unicode コードポイントで数えたところ、300個を超える項目は次の8件だった。

| Skill | コードポイント数 |
| ----- | ----------------: |
| `typesafe-ai` | 660 |
| `hatch-pet` | 445 |
| `swiftui-expert-skill` | 385 |
| `playwright-skill` | 378 |
| `ecmascript-modern-syntax` | 334 |
| `monster-strike-material-farming` | 332 |
| `ax` | 324 |
| `find-skills` | 303 |

この一覧は長さだけの記録であり、長いこと自体を欠陥と判定しない。

## それぞれが扱う課題

`context-engineering` は、実行時に渡す情報の容量、参照、検索、段階読込、圧縮、分離を扱う。

`prompt-engineering` は、LLM への指示の構造、テンプレート、例、評価を扱う。

一つの依頼に両方の課題が含まれる場合は、課題ごとに該当する Skill を併用する。片方の課題だけなら、その Skill を候補にする。

## 依頼ごとの routing 例

節名は各 Skill の見出しを示す。[context-engineering](../skills/context-engineering/SKILL.md) と [prompt-engineering](../skills/prompt-engineering/SKILL.md) の本文を依頼に関係する節だけ読む。

| 依頼 | 標準候補 | 補助候補 | 非適用 | 読む節 |
| ----- | -------- | -------- | ------ | ------ |
| 長い会話で必要な判断や資料を保つ | `context-engineering` | 指示の優先順位も調整するときは `prompt-engineering` | 指示文の設計を含まなければ `prompt-engineering` | Context: `Context Windows and Attention Mechanics`, `Context Budgeting`, `Compaction Strategies`。Prompt: `Instruction Hierarchy`（優先順位を調整する場合） |
| 資料検索や段階読込を設計する | `context-engineering` | 検索や回答の指示も設計するときは `prompt-engineering` | 指示文の設計を含まなければ `prompt-engineering` | Context: `File-System-Based Access`, `Hybrid Strategies`, `Context Budgeting`。Prompt: `Integration Patterns > With RAG Systems`（検索指示も設計する場合） |
| system prompt、Skill、command、subagent の指示を作る | `prompt-engineering` | 容量、段階読込、情報分離も課題なら `context-engineering` | context 管理を含まなければ `context-engineering` | Prompt: `System Prompt Design`, `Template Systems`, `Instruction Hierarchy`。Context: `Context Budgeting`, `Context Partitioning`（該当課題がある場合） |
| few-shot 例や出力評価を設計する | `prompt-engineering` | 評価に使う情報の選択や容量も課題なら `context-engineering` | context 管理を含まなければ `context-engineering` | Prompt: `Few-Shot Learning`, `Prompt Optimization`, `Integration Patterns > With Validation`。Context: `Context Quality Versus Context Quantity`（該当課題がある場合） |
| 検索する情報と指示構造を合わせて設計する | 課題に応じて両方 | 片方の課題が明確になった場合だけ該当 Skill を補助候補にする | 依頼にない課題の Skill | Context: `Context as Finite Resource`, `Context Partitioning`。Prompt: `System Prompt Design`, `Instruction Hierarchy`, `Integration Patterns > With RAG Systems` |
| 依頼に「prompt」「agent」「skill」という語が出るだけで、context 管理や指示設計が課題でない | なし | なし | 両方 | 該当する課題が明らかになるまで追加の節を読まない |

## 説得表現と安全規則

外部 `prompt-engineering` の `Persuasion Principles for Agent Communication` は、依頼が説得手法の分析や評価を明示的に求めたときに参照する話題である。

権威、緊急性、「例外なし」といった表現は承認を与えず、安全規則や承認規則も変更しない。この話題は通常の依頼で必須となる手順ではない。

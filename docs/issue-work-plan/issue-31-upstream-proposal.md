# Issue #31: upstream proposal draft

**Status:** 草案。未送信・上流未採用・runtime 未検証。外部への投稿は別途明示依頼があるまで行わない。

対象 upstream は、台帳に記録された [`NeoLabHQ/context-engineering-kit`](https://github.com/NeoLabHQ/context-engineering-kit.git)。この草案は既存のローカル記録と Skill ファイルだけに基づく。外部ページの取得・確認はしていない。

確認したローカル資料: [入口方針](../skill-entry-policy.md)、[Issue #31 確認記録](issue-31-review.md)、[Skill 台帳](../skill-inventory.json)、[`context-engineering` 本文](../../skills/context-engineering/SKILL.md)、[`prompt-engineering` 本文](../../skills/prompt-engineering/SKILL.md)。

## 提案の根拠

| Skill | 台帳の source path | 現在の description |
| --- | --- | --- |
| `context-engineering` | `plugins/customaize-agent/skills/context-engineering/SKILL.md` | `Understand the components, mechanics, and constraints of context in agent systems. Use when writing, editing, or optimizing commands, skills, or sub-agents prompts.` |
| `prompt-engineering` | `plugins/customaize-agent/skills/prompt-engineering/SKILL.md` | `Use this skill when you writing commands, hooks, skills for Agent, or prompts for sub agents or any other LLM interaction, including optimizing prompts, improving LLM outputs, or designing production prompt templates.` |

両 description は commands・skills・subagent prompts の作成や改善を含み、同じ依頼で両方が候補になり得る。一方、本文が示す中心課題は異なる。`context-engineering` は context の容量、情報選択、検索、段階読込、圧縮を扱い、`prompt-engineering` は指示構造、system prompt、template、few-shot 例、出力評価を扱う。本文には両方に関連する表現もある（例: `context-engineering` の `Context Windows and Attention Mechanics` と `prompt-engineering` の `Progressive Disclosure` / `Context Window`）。description に主課題と境界を示すと、一般的な作成依頼だけで重複選択する可能性を下げられる。

## description の変更候補

以下は候補文であり、上流での採用や runtime 効果を示すものではない。

### `context-engineering`

> Use when designing how an agent selects, retrieves, organizes, compresses, or progressively loads information for a task under a limited context window. Focus on context management, retrieval, and staged access; use prompt-engineering for instruction structure, reusable templates, examples, or output evaluation.

### `prompt-engineering`

> Use when designing or improving LLM instructions, including system prompts, commands, hooks, skills, subagent prompts, templates, examples, and output evaluation. Focus on instruction structure and behavior; use context-engineering when the main task is selecting, retrieving, organizing, compressing, or progressively loading information into context.

候補は、各 Skill の主な対象と隣接 Skill との境界を明示する。description の長さはレビュー時の参考情報に留める。ローカル方針で使う Unicode コードポイント 300 個はレビュー目安であり、合否条件や上限として扱わない。

## 本文の詳細を必要時に読む案

- 本文の先頭に短い `When to Use` / `Scope` と、もう一方を併用する条件を置き、最初の入口判断を可能にする。
- `context-engineering` は context 情報の選択・取得・整理・圧縮を中心に案内し、`prompt-engineering` は指示の構造・template・例・評価を中心に案内する。混在依頼では課題を分けて該当部分を併用する。
- 長い説明、例、複数段階 workflow は保持したまま、上流のファイル形式が対応する場合に限り、目的別の節または参照可能な補助ファイルへ整理する案を検討する。移動先へのリンク、Skill の配布方法、読み込み時の挙動は上流側で確認が必要。既存内容の削除や自動的な遅延読み込みを前提にしない。
- 特に `context-engineering` の context degradation / multi-agent verification workflow 群と `prompt-engineering` の few-shot、template、prompt optimization の詳説は、該当課題があるときに読む構成を検討できる。`Persuasion Principles for Agent Communication` は明示的に説得手法を分析・評価する依頼に限る話題として位置づける。

## routing の区別例

既存のローカル入口方針にある6例を、上流 description と本文案の区別を確認するために再掲する。

| 依頼の課題 | 標準候補 | 補助候補となる条件 | 非対象となる条件 |
| --- | --- | --- | --- |
| 長い会話で必要な判断や資料を保つ | `context-engineering` | 指示の優先順位も設計するときは `prompt-engineering` | 指示設計を含まないときの `prompt-engineering` |
| 資料検索や段階読込を設計する | `context-engineering` | 検索・回答の指示も設計するときは `prompt-engineering` | 指示設計を含まないときの `prompt-engineering` |
| system prompt、Skill、command、subagent の指示を作る | `prompt-engineering` | 容量、段階読込、情報分離も課題なら `context-engineering` | context 管理を含まないときの `context-engineering` |
| few-shot 例や出力評価を設計する | `prompt-engineering` | 評価に使う情報の選択や容量も課題なら `context-engineering` | context 管理を含まないときの `context-engineering` |
| 検索する情報と指示構造を合わせて設計する | 課題に応じて両方 | 課題ごとに該当する Skill を選ぶ | 依頼にない課題の Skill |
| `prompt`、`agent`、`skill` という語だけがあり、context 管理も指示設計も課題でない | なし | なし | 両 Skill |

## 提案後の確認案

1. 上流 maintainer が候補 description の対象範囲、英語表現、相互参照の扱いを確認する。
2. 上記6例を使い、各依頼の標準候補・併用条件を候補文から区別できるかを確認する。一般語が出るだけの例では、両方を選ぶ根拠がないことを確認する。
3. 変更が採用された場合、既存本文や workflow の参照切れがないことを確認し、実際の skill loader で単独課題・混在課題・非対象例を別途確認する。現時点では runtime loader の挙動も候補文の効果も未確認である。
4. 詳細分割は配布・読み込み形式との互換性とリンク先を確認してから判断する。既存本文の保持と必要時参照が成立するかを確認する。

## 未確認事項

- 上流 maintainer の意図、description の長さ・書式の制約、補助ファイルの配布・読み込み仕様は未確認。
- 候補文はローカルでの提案であり、外部本文・description は変更していない。提案の送信、上流採用、runtime での発動抑制、Issue #31 の完了はいずれも未達・未確認。

# アプリケーションデザインのスキル分担

対象は Web・iOS・macOS アプリの UI/UX。2026-10-23 に `design_ref`（旧名 `web-design-reference`）を `application-design` へ改名・再編した。元の作者・上流は lock と Git 履歴から確定できず、由来は `unknown` を維持する。ローカルでの再編はユーザー承認に基づく。

| 役割 | 担当 | 今回の整理 |
|---|---|---|
| 共通の UI/UX 判断、情報構成、必要な説明の保持 | `application-design` | Web 限定を解除し、共通原則と Web／Apple の参照を分離 |
| Figma の制作、取得、コード変換、ツール操作 | 該当する `figma:*` スキル | 専用手順を維持し、共通指針から操作権限を拡張しない |
| SwiftUI 実装・API・性能 | 標準 `swiftui-pro`、補足 `swiftui-expert-skill` | `docs/swiftui-skill-canonical.md` の分担を維持 |
| AppKit など他の実装 | 対象フレームワークの公式資料とプロジェクト規則 | 専用スキルの存在を仮定しない |
| アクセシビリティの問題発見 | `reviewing-a11y` | 正式な適合判定と区別 |
| 全達成基準の適合判定 | `auditing-wcag` | 証拠を伴う Pass/Fail/NT/NA を担当 |
| 個別サイトの監査計画 | `planning-wcag-audit` | 組織改善計画と区別 |
| 組織全体のアクセシビリティ改善計画 | `planning-a11y-improvement` | 個別画面のレビューと区別 |

既存の専門スキルは統合・削除しない。共通指針の重複を増やさず、必要な専門手順を選ぶ。外部由来スキルの本文、lock、プラグインキャッシュは変更しない。

Web 向けアクセシビリティ監査と、ネイティブ UI の検証は区別する。ネイティブ UI は対象 OS の指針、キーボード、VoiceOver などで確認し、Web 向け監査だけで適合を保証しない。

文書・スライド・表計算・アーキテクチャ図・画像・映像・一般文章・販促サイトだけの制作は対象外。`archify`、文章系、画像・映像系のスキルは今回の再編から除外する。

## 適用入口と移行

共通 `AGENTS.md` から `~/.agents/skills/application-design/SKILL.md` を参照する。現環境では Codex と Claude の指示・スキル入口が `~/.agents` にリンクされている。専用 worktree 上の変更は、通常 checkout へ統合されるまでは実運用へ反映されない。

台帳の名前・ディレクトリ・trigger・責務・更新方針を更新し、旧パスへの互換スキルは置かない。保存済みプロンプトなどリポジトリ外の旧名呼び出しは、利用時に新名へ変更する必要がある。復旧はこの再編のコミットを revert し、他の変更を巻き戻さない。

## 検証の範囲

frontmatter、相対リンク、台帳、旧名の残存、変更対象の整合性監査を確認する。代表依頼の読み合わせでは、適用範囲、必要な説明、専門スキルの分担を確認する。これは実行時の自動選択、実際の UI 生成品質、WCAG 適合の証明ではない。

2026-10-23 の検証結果:

- `node --test bin/skill-inventory.test.mjs`: 4/4 成功。
- `git diff --check`: 成功。相対リンク2件が存在し、台帳 trigger は frontmatter と一致。旧名は移行説明のみ。
- `node bin/audit-skills-consistency.mjs . --changed skills/application-design/SKILL.md`: exit 0。候補4組は Web E2E・結合テスト・Playwright・SwiftUI expert との併用関係として親が確認。
- `quick_validate.py`: 標準・同梱 Python とも `ModuleNotFoundError: No module named 'yaml'` で未実行。環境は変更せず、Ruby 標準 YAML で mapping、許可キー、名前形式・長さ、説明形式・長さ、未完了 TODO を確認し成功。元スクリプトの成功とは扱わない。
- 独立レビューと親確認: 既存 Web フォーム、新規 iPhone＋SwiftUI、Mac キーボード操作、Figma→Web、正式 WCAG 監査、PDF＋販促 LP の6件を読み合わせた。台帳の関係記録、AppKit の実装参照、ネイティブと Web 監査の境界を補正。実アプリや外部成果物の生成は行っていない。

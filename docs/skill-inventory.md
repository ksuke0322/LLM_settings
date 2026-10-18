# Skill 台帳の運用

## 対象と読み方

[skill-inventory.json](skill-inventory.json) は、`skills/<directory>/SKILL.md` がある直下 Skill を1ディレクトリにつき1件記録する。現在の対象は非株式 Skill 39件。以下の7ディレクトリと共有領域は対象外。

- `high-beta-daily-flow`
- `japan-high-beta-breakout-screening`
- `japan-top-companies-screening`
- `market-regime-assessment`
- `portfolio-risk-allocator`
- `stock-investment-decision-support`
- `stock-investment-position-review`
- `stock-shared`

`skills/swiftui-pro/SKILL.md` が台帳の1件で、配下の `skills/swiftui-pro/skills/swiftui-pro/SKILL.md` は別レコードにしない。JSON のトップレベルは `schemaVersion`、`scope`、Skill 配列 `skills`。各レコードには名称・ディレクトリ・由来・適用条件・責務・関係・更新方針・状態・版・検証根拠を記録する。

## 由来・版・不明値

- `origin` と `source` は `.skill-lock.json` の `skills.<directory>` を根拠にする。掲載されている Skill は `origin: external`、`source` は lock の値をそのまま転記する。
- lock にないことはローカル由来の証明ではない。一次根拠が得られるまで `origin: unknown`、`source: null`、`version: null` とする。名称や内容から由来を推測しない。
- lock の `skillFolderHash` は `version` の `basis=skillFolderHash` と `value` に記録する。これはフォルダー内容の照合値であり、通常の製品バージョン番号ではない。
- `verification` には参照した `SKILL.md`、frontmatter 等の根拠、lock の由来情報または不明理由を残す。`related` や `conflicts` の `null` は未確認を表し、関係や競合がないと断定するものではない。`status: unknown` も利用状況・所有者判断が確認できていない状態を表す。

## 任意 routing metadata

Skill レコードの任意の `routing` オブジェクトには、次の6項目を記録できる。

| field | 意味 |
| ----- | ---- |
| `role` / `applyWhen` | 責務 / 適用条件 |
| `relatedDirectories` | 関連する skill ディレクトリ |
| `decision` / `basis` | 判断 / 判断根拠 |
| `verification` | 実際に確認した内容 |

未確認値は `unknown` のまま保ち、trigger の重なりや loader の挙動を推測で補わない。

routing metadata は人が候補を絞るための記録であり、実行時にどの Skill が同時に読み込まれるかを保証・制御するものではない。現在の候補メモは次のとおり。

- `playwright-skill`: 一時的なブラウザー操作。
- `web_e2e_test`: 継続的に保守する E2E テストの作成。
- `coding_typescript`: より広い作業 skill に重ねる JavaScript / TypeScript の記法 overlay。
- ルートの `swiftui-pro`: SwiftUI 作業の標準候補。`swiftui-expert-skill` は補助候補。

### 代表依頼の routing 例

次表は Skill の責務に基づく人向けの標準・補助・非適用の整理である。`workflow → test-driven-development → web_test_common → 種別別 Web test Skill` は責務を確認する参照順を示し、runtime loader の読み込み順や同時発動を保証しない。上位 `AGENTS.md` の安全境界・承認・開始・方針変更規則は常に優先し、Skill はこれを緩和しない。

| 依頼 | 標準 | 補助 | 非適用 |
| ----- | ---- | ---- | ------- |
| 通常の SwiftUI 実装・レビュー | SwiftUI の標準候補は `swiftui-pro`。実装を伴う場合は `workflow → test-driven-development` も適用する。 | 状態・データフロー、view の無効化・性能、深い topic の確認に `swiftui-expert-skill` を加える。JS/TS 作業を含む場合だけ `coding_typescript` を記法 overlay として加える。 | `playwright-skill` と Web test の共通・種別 Skill。Swift の作業に `coding_typescript`。 |
| SwiftUI の trace 単独解析 | trace 固有の分析手順を持つ `swiftui-expert-skill`。 | 通常の SwiftUI ソースレビューや実装修正も依頼された場合、その範囲に `swiftui-pro` を加える。 | 分析だけなら `test-driven-development` と Web test Skill。実装修正も依頼された場合はコード変更の規則を適用する。 |
| 一時的な browser 操作 | `playwright-skill`。ローカル実行は[準備済み依存だけを使う入口](playwright-local-runner.md)を明示的に呼ぶ。 | 操作用の JS/TS スクリプトを書く場合は `coding_typescript` を記法 overlay として加える。 | 永続テスト作成が目的でない場合の `web_e2e_test` と Web test 共通・種別 Skill。 |
| リポジトリで保守する Web E2E | `workflow → test-driven-development → web_test_common → web_e2e_test`。 | JS/TS のテストや実装を編集する場合は `coding_typescript` を記法 overlay として加える。 | 一時操作用の `playwright-skill`、およびこの依頼で扱わない Web test 種別 Skill。 |
| Web 単体テスト | `workflow → test-driven-development → web_test_common → web_unit_test`。 | JS/TS のテストや実装を編集する場合は `coding_typescript` を記法 overlay として加える。 | `web_integration_test`、`web_e2e_test`、一時操作用の `playwright-skill`。 |
| Web 結合テスト | `workflow → test-driven-development → web_test_common → web_integration_test`。 | JS/TS のテストや実装を編集する場合は `coding_typescript` を記法 overlay として加える。 | `web_unit_test`、`web_e2e_test`、一時操作用の `playwright-skill`。 |
| 既存のテスト失敗を直す | `test-fixing` で失敗を分類し修正する。Web test 自体を変更する場合は `web_test_common` と該当する種別 Skill も適用する。 | 実装コードを変更する場合は `workflow → test-driven-development` も適用する。JS/TS を変更する場合は `coding_typescript` を記法 overlay として加える。 | 失敗の対象と無関係な Web test 種別 Skill。 |
| 文書のみの変更 | 文書固有の規則と上位 `AGENTS.md` の安全境界。 | 同じ作業の中でコード変更も行う場合に限り、そのコード変更に `workflow → test-driven-development` と該当する test Skill を適用する。 | 文書のみなら TDD のテスト種別 Skill は原則不要。ただし既存セッションで全件検証が要求されている場合、その要求は免除しない。 |

`workflow` はコード変更の基本手順、`test-driven-development` はその TDD 詳細、`web_test_common` は Web test 作成・変更の共通規則、種別別 Skill は unit / integration / E2E 各テストの責務を扱う。`coding_typescript` は JS/TS 記法の overlay であり、テスト種別を選ばない。ここでの併用指定は責務の重なりを意図している。

実 loader と root/nested Skill および lock の対応は Issue #33 で未確認である。Playwright の CommonJS 例と ESM 優先の `coding_typescript` の実行環境適合は Issue #32 で未確認である。この表は loader の実挙動、trigger の排他性、実行例の互換性を保証しない。追記は routing 判断だけを記録し、台帳の由来・版・`unknown` / `null` や外部 Skill 本文を変更しない。

## 追加・更新・削除

Skill を追加・更新するときは、直下の `skills/*/SKILL.md`、該当する `.skill-lock.json` の項目、台帳のレコードを突き合わせる。名前・trigger・責務は実際の Skill ファイルに照らし、由来と版は lock の値を照合する。根拠のない値は埋めず、unknown/null と理由を維持する。追加・更新後は次を実行する。

```sh
node -e 'JSON.parse(require("node:fs").readFileSync("docs/skill-inventory.json", "utf8"))'
node --test bin/skill-inventory.test.mjs
```

テストは、直下 Skill との件数・ディレクトリ一致、stock 対象の除外、lock の source と unknown の扱い、必須フィールドを確認する。更新時は台帳・lock・実ファイルの差分も確認し、テスト成功だけで根拠の正しさを代替しない。

external Skill は原則として直接編集しない。更新が必要なら upstream の更新を取り込むか、ローカル側の回避策を検討する。Skill または台帳レコードの削除は、リポジトリの `AGENTS.md` に従い、削除対象ごとの個別承認を得てから行う。

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

## 追加・更新・削除

Skill を追加・更新するときは、直下の `skills/*/SKILL.md`、該当する `.skill-lock.json` の項目、台帳のレコードを突き合わせる。名前・trigger・責務は実際の Skill ファイルに照らし、由来と版は lock の値を照合する。根拠のない値は埋めず、unknown/null と理由を維持する。追加・更新後は次を実行する。

```sh
node -e 'JSON.parse(require("node:fs").readFileSync("docs/skill-inventory.json", "utf8"))'
node --test bin/skill-inventory.test.mjs
```

テストは、直下 Skill との件数・ディレクトリ一致、stock 対象の除外、lock の source と unknown の扱い、必須フィールドを確認する。更新時は台帳・lock・実ファイルの差分も確認し、テスト成功だけで根拠の正しさを代替しない。

external Skill は原則として直接編集しない。更新が必要なら upstream の更新を取り込むか、ローカル側の回避策を検討する。Skill または台帳レコードの削除は、リポジトリの `AGENTS.md` に従い、削除対象ごとの個別承認を得てから行う。

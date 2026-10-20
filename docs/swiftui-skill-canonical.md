# SwiftUI Skill の配置と確認状況

## 静的に確認した配置

`skills/swiftui-pro/SKILL.md` は frontmatter の `name: swiftui-pro`、`version: "1.1"` を持つ。入れ子の `skills/swiftui-pro/skills/swiftui-pro/SKILL.md` は同じ name と description を持ち、version は `"1.0"`。Skill本文は異なる。9件の参照パス（`api.md`、`views.md`、`data.md`、`navigation.md`、`design.md`、`accessibility.md`、`performance.md`、`swift.md`、`hygiene.md`）は対応するファイル名が同じで、参照先本文も同一と親が比較確認した。

`.skill-lock.json` の `skills.swiftui-pro.skillPath` は `swiftui-pro/SKILL.md` で、ルートの `skills/swiftui-pro/SKILL.md` を指す。`skillFolderHash` はlockに記録された照合値であり、現在のローカル内容が変更されたかを示す比較基準ではない。`docs/skill-inventory.json` はルートの `skills/swiftui-pro/SKILL.md` を1件だけ台帳に記録している。

## 監査CLIの同名warning

`bin/audit-skills-consistency.mjs` は、複数の配置に現れる非空のfrontmatter `name`ごとに `duplicate-skill-name` warningを1件出す。`path` は相対path順の先頭、`line` はそのSkillのname行、`name` は一致した名前、`relatedPaths` は該当する全配置の相対pathをソートした配列である。説明文の類似度とは独立し、`--changed` と `--allow-pair` では抑制されない。

このwarningは静的な配置を人が確認する候補であり、runtimeでの発火・同時読込を示さず、新しいgateを設けず、自動削除もしない。この説明は本書に置く。台帳上 `skills/audit-skills-consistency/SKILL.md` の `origin` と `updatePolicy` は `unknown` のため、同ファイルは今回変更しない。既存Skillの一般説明を、このwarningの仕様説明として扱わない。

## 人が依頼を振り分けるときの標準

以下は台帳の[既存 routing 方針](skill-inventory.md#代表依頼の-routing-例)（Issue #21）を具体化した例である。Skill の説明から候補を選ぶ静的方針で、runtime loaderの動作を表すものではない。

| 代表依頼 | 標準候補 | 補助候補 |
| --- | --- | --- |
| SwiftUI画面や状態更新を実装する | rootの `swiftui-pro`。コード変更には `workflow → test-driven-development` も適用する。 | 状態やデータフローなど深い個別観点が必要なら `swiftui-expert-skill`。 |
| 既存画面の無効化・性能をレビューする | rootの `swiftui-pro`。 | viewの無効化、性能、深いtopicの調査に `swiftui-expert-skill` を加える。Instruments traceだけの解析はexpert単独を候補とする。 |
| SwiftUIコードを旧APIから現行APIへ移行する | modern APIとプロジェクト規約を確認するrootの `swiftui-pro`。実装を伴う変更には `workflow → test-driven-development` も適用する。 | 移行が状態・データフロー・性能に及ぶ範囲だけ `swiftui-expert-skill` を加える。 |

## runtime確認との境界

[公式 Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference?translationFallback=ja-JP) は `skills.config` の `path` を `SKILL.md` を含むSkillフォルダーのパス、`enabled` を参照Skillの有効・無効設定として説明している。これは設定項目の仕様であり、この作業環境でどの設定が有効か、同名Skillがruntimeでどう扱われるかの確認ではない。

2026-10-20、了承済みのnested無効化を個人設定 `/Users/sawairikeisuke/.codex/config.toml` に反映した。[公式 Build skills](https://learn.chatgpt.com/docs/build-skills#enable-or-disable-local-codex-skills) の例に従い、`[[skills.config]]` の `path` は `/Users/sawairikeisuke/.agents/skills/swiftui-pro/skills/swiftui-pro/SKILL.md`、`enabled` は `false` とした。Config Referenceはfolderと説明しているため、この文書差を実環境で解消済みとは扱わない。rootや外部本文・lockは変更せず、両ファイルは残した。復旧は追加した対象テーブル1件だけを除く。構文と対象の独立readbackは確認済み。詳細は[確認記録](issue-work-plan/issue-33-review.md)。

変更前の作業セッション一覧には `swiftui-pro:swiftui-pro` が同名で2件表示されていた。アプリ再起動は行っておらず、現セッションの一覧を変更後の実効状態の証拠にしない。公式手順に沿った再起動後、新セッションでrootだけが残ることと代表依頼を確認するまで、探索除外・同時読込・trigger選択は未確認とする。

残る確認は、承認された設定変更後に新しいセッションでSkills一覧を読み返し、実装・レビュー・API移行の代表依頼をそれぞれ実行して結果を確認すること。Issue #33はruntime確認が終わるまで閉じない。

# SwiftUI Skill の配置と確認状況

## 現在の運用・完了条件（2026-10-22了承）

ユーザー了承により、rootの`skills/swiftui-pro/SKILL.md`を依頼文に明記する運用をIssue #33の完了条件とする。依頼文は「`docs/swiftui-skill-canonical.md`を適用し、rootの`skills/swiftui-pro/SKILL.md`を標準として使用してください。依頼内容: …」。実装・レビュー・API移行ともrootを標準とし、expertは必要な個別観点の補助とする。

配置/lock対応、nested無効化の設定readback、ユーザー再起動後のroot 1件一覧、明示参照の3例読解確認を根拠とする。自然文自動選択の前回1/3は未解消で、改善したとは扱わない。下記のOPEN・判断待ちはこの合意前の観測履歴であり、現在の完了条件を上書きしない。

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

設定変更前の作業セッション一覧には `swiftui-pro:swiftui-pro` が同名で2件表示されていた。設定変更直後にはアプリ再起動を行っていないため、その時点の一覧は設定反映の証拠にしない。後続の確認はユーザーによる再起動後の実行だったと訂正された。別sessionを含む探索除外・同時読込まで一般化しない。

## 2026-10-20 の確認結果

このセッションに表示されたSkills一覧では、`swiftui-pro`はrootの `skills/swiftui-pro/SKILL.md` の1件だけだった。個人設定のreadbackではnested pathの `enabled = false` を1件確認し、root pathを無効化する設定はなかった。ユーザー確認により再起動後の実行と訂正した（2026-10-22）。この確認は観測したセッション一覧と設定値に限り、別sessionやすべてのloader状態を保証しない。

2026-10-22の明示参照読解確認では、既存方針を指定した実装・レビュー・API移行の3件ともrootを標準とする回答だった。これは同一native応答での読解確認で、自動選択の改善は示さない。当面は依頼文に「本書を適用し、rootの`skills/swiftui-pro/SKILL.md`を標準として使用」を明記する。明示参照を完了条件として採用するかは判断待ちであり、IssueはOPENのまま。

Codex CLI 0.159.0のephemeral・read-only実行で、代表依頼から選ばれたSkillを確認した。

| 代表依頼 | 観測した参照先 | 標準候補との照合 |
| --- | --- | --- |
| SwiftUI画面と状態更新の実装 | `swiftui-expert-skill`と`test-driven-development`。rootの`swiftui-pro`は選ばれなかった | 不一致 |
| 既存SwiftUI画面の無効化・性能レビュー | rootの`swiftui-pro` | 一致 |
| 旧SwiftUI APIから現行APIへの移行 | `swiftui-expert-skill`。rootの`swiftui-pro`は選ばれなかった | 不一致 |

標準候補との一致は1/3で、前節の実装・API移行の標準候補とruntime選択に差がある。routing挙動は変更せず、選択条件を確認・是正してから同じ3依頼を再実行する。CLIの出力には`features.skills`がunknown/ignoredという設定警告、一部MCP handshakeおよびicon pathの警告も含まれたため、結果をこの3回の実行範囲を越えて一般化しない。Issue #33はOPENを維持し、差異の解消と再検証まで完了数に含めない。

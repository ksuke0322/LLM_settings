# Issue #33 確認記録・探索除外の実効確認待ち

## 今回の反映

- 2026-10-18 22:34 JST（shell `date`）。承認済みの「rootを正本候補、nested探索除外、削除は別承認」のうち、配置・lock対応と静的検出を進めた。探索除外完了とは扱わない。
- root `skills/swiftui-pro/SKILL.md` はfrontmatter v1.1、nested `skills/swiftui-pro/skills/swiftui-pro/SKILL.md` はv1.0。同name/descriptionで本文は異なり、参照9件は親のbyte比較で一致した。
- lockの `skills.swiftui-pro.skillPath` は `swiftui-pro/SKILL.md` でrootに対応する。台帳はroot1件のまま。skillFolderHashをローカル本文の改変判定へ使っていない。外部本文・lock・入れ子配置は変更・削除していない。
- `docs/swiftui-skill-canonical.md` に配置対応、root標準/expert補助の実装・レビュー・API移行3例、未確認範囲を記録し、台帳のrouting検証欄を更新した。由来・版などrouting以外はorigin/mainと一致することを親が比較した。
- 監査CLIは同じ非空nameの全配置を `duplicate-skill-name` warningへ出す。全相対pathとname行を記録し、description類似度や候補ペアfilterと独立した静的確認候補とする。閾値・exit・lock差分処理は変えず、新gateやruntime重複発火の確定、自動削除を行わない。
- 既存監査Skillの出力説明は新warningを列挙していない。由来/更新方針unknownの本文を直接変更せず、新しいローカル文書に新warning仕様と明示参照の境界を置いた。

## 委任と検証

- native `gpt-6-luna / max` へ調査6分、実装・文書8分、独立確認3分、文書追記2分の上限で順番に委任。1対象・問い3つ以内、絶対パス許可範囲、再委任・Git書込み禁止。委任中のworktreeを更新していない。
- 担当のテスト先行は既存10件成功・追加同名warning1件失敗のREDから実装後11件成功。2件/3件group、低類似description、空name/別名nested、stock除外、name行・パス順、CLI JSONとexit0、filterでwarningが消えないことを確認した。
- 親mutationは検出条件を無効化した場合とrelatedPathsを1件に欠落させた場合の2つ。各1件失敗で検出し、完全復元後、関連18件成功。ログ `/tmp/issue33-mutation-{disabled,paths}.tap`、`/tmp/issue33-related.tap`。2つの具体的変異の結果であり包括的mutation scoreではない。
- 親の仮報告 `/tmp/issue33-fixtures.md` 8件を期待結果なしで独立確認。root標準とruntime未知の分離、静的候補、手動routing、readback前の未確認維持の4件を採用し、hashで改変断定、台帳だけで発火排除断定、未承認削除、lockなしをlocal由来とする4件を不採用。手動報告評価であってruntime実験ではない。
- candidate/referenceは `f4c5aa9` の専用worktree。双方のshared/jevで既存lockの `npm ci --ignore-scripts --no-audit --no-fund` を実行し、mainではテストしていない。
- 非Archify118件成功。全件はbaseline 1,050件 / 958成功 / 69失敗 / 23skip、candidate 1,051件 / 959成功 / 69失敗 / 23skip、双方exit 1。完了後の比較で69失敗の名前・正規化診断・skipが一致し、新規・悪化なし。承認済み非Archify限定例外を適用し、全件成功とは扱わない。ログ `/tmp/issue33-{baseline,candidate,nonarch}.tap`。
- 実repoの監査でも `swiftui-pro` のroot/nested両パスが1つのduplicate warningに報告された。これは静的配置の確認で、実loader発火や除外の実証ではない。

## 未完了・再開条件

- [公式設定リファレンス](https://learn.chatgpt.com/docs/config-file/config-reference?translationFallback=ja-JP)にはSkillフォルダーpathとenabledの設定がある。しかし設定項目の存在は、今の環境での有効性や同名Skillの扱いの実証ではない。
- 読み取り調査ではユーザーconfigにswiftui-pro対象指定はなく、repo/project configも見つからない。今回、個人configの変更やアプリ再起動は実施していない。現在のセッション一覧には同名2件が見える。探索除外・実効状態・実runtime選択は未確認。
- rootを人向け正本とする承認は維持する。残りは、適用対象と復旧方法を固定した除外設定の反映、その後の新セッション一覧readbackと代表依頼の確認。nested削除は別承認のまま、削除せず進める案を推奨する。
- Issue #33はOPENのまま、設定反映・検証待ちとしてskipする。stock系・#24除外、#22・#31判断待ち、#30実機検証待ちは維持する。
- PR #149はmerge commit `c81de037708f3dd6ef0d6d47a83e8d01cd518d05` でmainへマージ済み。実装commit `4bb32e5` の包含、実装/参照worktreeのraw cleanを確認し通常削除、branch保持。Issue #33はOPENを確認。アプリ添付は100件上限で失敗し、GitHub/mainは別途確認した。

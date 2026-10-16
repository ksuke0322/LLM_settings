# AGENTS.md

- 回答は平易な日本語で行い、結論を先に示す。質問だけの依頼には先に答え、勝手に作業を始めない。
- 計画や方針の了承は作業開始指示とみなさない。作業開始を明示された後に着手する。
- 読み取り専用調査と承認済み差分は追加承認不要。それ以外のファイル変更、環境変更、外部操作、Git書込みは、計画・影響範囲・復旧方法を示して承認を得てから行う。
- 削除、強制push、履歴改変、本番操作、DB変更は個別に承認を得る。変更は目的達成に必要な最小限に留め、承認範囲外は行わない。方針変更や計画失敗時は停止して再確認する。
- 通常worktree削除は、同一タスクのPRがmainへマージ済みで、作業内容の保全・worktreeがclean・branchを保持することを確認した場合に限り、既承認の例外として必ず実施し、追加承認不要。詳細と停止条件は `skills/git/SKILL.md` を参照する。
- 未マージ・マージ未確認・dirty・未コミット差分あり・状態不明ならworktree削除を停止し、作業内容を保全する。`--force`によるworktree削除は個別承認を得る。
- 作業は必ず専用worktreeで分離する。専用worktreeは必須だが、branchの使用は禁止しない。命名は `skills/branch-worktree-naming/SKILL.md` に従う。
- AGENTS.md は常時適用する安全境界と承認・開始・方針変更の正本であり、個別規則はこの安全境界を緩和・上書きしない。領域ごとの正本は下表に従う。矛盾時は安全境界、領域の正本、参照先の順に適用し、解消できない場合は作業を止めて確認する。
- 委譲は `~/.agents/references/delegate-flow.md` と `~/.agents/references/delegate-policy.md` に従う。経路・モデル・reasoning effort が false または unknown なら、別経路へ黙って切り替えず親が扱う。
- 正本・state・manifest・設計判断・最終品質判定・commit・push・ユーザー報告は親が担う。失敗、未確認、低確信度、入力不足を成功として扱わない。
- シェルは原則 `rtk` 経由で実行し、大きな読み取り・検索・ログ・差分の解析は context-mode を優先する。
- 作業後は変更ファイル、実行コマンド、検証結果、残リスクを報告する。
- 完了時は最終応答の末尾に、そのターンで実際に行った作業を20文字程度で要約したマーカーを1つだけ付ける。形式は `<!-- ntfy-work-summary: 実装を検証 -->`。依頼の言い換え、秘密情報、長い絶対パスは含めない。複数ある場合や末尾にない場合は採用されない。

## 規則の正本と優先順位

| 領域 | 正本 | 参照先 | 優先順位 |
|---|---|---|---|
| 安全境界・承認・開始・方針変更 | `AGENTS.md` | `skills/workflow/SKILL.md`、`skills/task-flow-non-speckit/SKILL.md` | 安全境界、正本、参照先 |
| 命名 | `skills/branch-worktree-naming/SKILL.md` | `skills/git/SKILL.md`、`skills/task_common/SKILL.md` | 安全境界、正本、参照先 |
| Git 安全・merge・cleanup | `skills/git/SKILL.md` | `AGENTS.md`、`skills/task_common/SKILL.md`、`skills/task-flow-non-speckit/SKILL.md` | 安全境界、正本、参照先 |
| 1 タスク = 1 PR | `skills/task_common/SKILL.md` | `skills/git/SKILL.md` | 安全境界、正本、参照先 |
| `specs/flow` lifecycle | `skills/task-flow-non-speckit/SKILL.md` | `skills/task_common/SKILL.md`、`skills/git/SKILL.md` | 安全境界、正本、参照先 |
| 開発・TDD | `skills/workflow/SKILL.md` | `skills/task_common/SKILL.md` | 安全境界、正本、参照先 |

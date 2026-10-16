import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const readDocument = relativePath => readFile(join(repositoryRoot, relativePath), "utf8");

test("AGENTS.md assigns six governance domains and defines their precedence", async () => {
  const agents = await readDocument("AGENTS.md");
  const table = agents.match(/## 規則の正本と優先順位\r?\n([\s\S]*?)(?=\r?\n## |$)/)?.[1];

  assert.ok(table, "AGENTS.md should contain the governance authority table");
  const rows = table.split(/\r?\n/).filter(line => line.startsWith("|") && !/^\|\s*:?-+/.test(line));
  const expectedRows = [
    ["AGENTS.md", /安全境界.*承認.*開始.*方針変更/],
    ["skills/branch-worktree-naming/SKILL.md", /命名/],
    ["skills/git/SKILL.md", /Git.*(?:merge|マージ).*cleanup|後片付け/],
    ["skills/task_common/SKILL.md", /1\s*タスク\s*=\s*1\s*PR/],
    ["skills/task-flow-non-speckit/SKILL.md", /specs\/flow/],
    ["skills/workflow/SKILL.md", /開発.*TDD|TDD.*開発/],
  ];

  assert.equal(rows.length, expectedRows.length + 1, "The table should have one header and six domain rows");
  for (const [authority, domain] of expectedRows) {
    const row = rows.find(line => line.includes(`| \`${authority}\` |`));
    assert.ok(row, `The table should name ${authority} as an authority`);
    assert.match(row, domain, `${authority} should own its stated domain`);
  }
  const precedenceOrder = ["安全境界", "正本", "参照先"];
  const isInPrecedenceOrder = value => {
    const positions = precedenceOrder.map(term => value.indexOf(term));
    return positions.every((position, index) => position >= 0 && (index === 0 || positions[index - 1] < position));
  };
  const precedenceLine = agents.split(/\r?\n/).find(line => line.includes("矛盾時は"));
  const conflictResolution = precedenceLine?.match(/矛盾時は([^。]*?)順に適用/)?.[1];
  assert.ok(conflictResolution, "AGENTS.md should state how conflicting rules are resolved");
  assert.ok(isInPrecedenceOrder(conflictResolution), "Conflict resolution should apply the safety boundary before the domain authority and its references");
  for (const row of rows.slice(1)) {
    const priority = row.split("|")[4]?.trim() ?? "";
    assert.ok(isInPrecedenceOrder(priority), `The priority column should use safety boundary → authority → references: ${row}`);
  }
  assert.match(agents, /AGENTS\.md.*安全境界[\s\S]*個別規則はこの安全境界を緩和/);
});

test("task_common and task-flow defer merge and cleanup procedures to the Git authority", async () => {
  const [taskCommon, taskFlow, git] = await Promise.all([
    readDocument("skills/task_common/SKILL.md"),
    readDocument("skills/task-flow-non-speckit/SKILL.md"),
    readDocument("skills/git/SKILL.md"),
  ]);

  assert.match(taskCommon, /skills\/git\/SKILL\.md/);
  assert.ok(!/mainへマージして、mainを更新しますか|worktreeがclean|worktree.{0,20}(?:clean確認|cleanである|削除)|マージ済み/.test(taskCommon), "task_common should defer merge and cleanup details");
  assert.match(taskFlow, /skills\/git\/SKILL\.md/);
  assert.match(taskFlow, /タスクファイル.{0,40}done.{0,80}(?:最終完了|lifecycle)/s);
  assert.match(taskFlow, /main.{0,30}(?:マージ|merge).{0,100}worktree/s);

  assert.match(git, /事前の明示的なマージ承認[\s\S]*追加確認をせず/);
  assert.match(git, /事前.{0,30}(?:明示的な承認|承認).{0,80}ない[\s\S]*mainへマージして、mainを更新しますか？ \(y\/n\)/);
  assert.match(git, /mainブランチへの直push禁止/);
  const cleanupRule = git.split(/\r?\n/).find(line => line.startsWith("- PRのmainへのマージ完了"));
  assert.ok(cleanupRule, "Git authority should have one worktree cleanup rule");
  assert.match(cleanupRule, /PRのmainへのマージ完了.*作業内容の保全.*worktreeがclean.*branchを保持.*通常の作業worktreeを必ず削除.*追加承認は不要/);
  assert.match(git, /未マージ・マージ未確認・dirty・未コミット差分あり・状態不明[\s\S]*(?:削除を止め|削除を停止)/);
  assert.match(git, /--force.{0,30}個別承認/);
});

test("AGENTS.md keeps start approval and safety boundaries explicit", async () => {
  const agents = await readDocument("AGENTS.md");
  const taskCommon = await readDocument("skills/task_common/SKILL.md");
  const cleanupException = agents.split(/\r?\n/).find(line => line.startsWith("- 通常worktree削除"));

  assert.match(agents, /方針.{0,30}(?:了承|決定).{0,40}(?:開始|着手).{0,30}(?:指示|みなさない)/);
  assert.match(agents, /作業は必ず専用worktreeで分離/);
  assert.match(agents, /専用worktreeは必須だが、branchの使用は禁止しない/);
  assert.doesNotMatch(agents, /branch(?:を|は).{0,20}禁止|ブランチ.{0,20}禁止/);
  assert.match(agents, /削除、強制push、履歴改変、本番操作、DB変更は個別に承認/);
  assert.ok(cleanupException, "AGENTS.md should state the normal worktree cleanup exception");
  assert.match(cleanupException, /通常worktree削除.*PR.*mainへマージ済み.*作業内容の保全.*clean.*branchを保持.*既承認の例外.*必ず実施.*追加承認不要.*skills\/git\/SKILL\.md/);
  assert.match(agents, /--force.{0,30}(?:worktree|削除).{0,30}個別承認/);
  assert.match(taskCommon, /skills\/workflow\/SKILL\.md/);
});

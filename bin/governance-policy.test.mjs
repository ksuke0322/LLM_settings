import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryRoot = new URL('../', import.meta.url);
const readPolicy = (relativePath) => readFile(new URL(relativePath, repositoryRoot), 'utf8');
const [agentsPolicy, commonPolicy, gitPolicy, flowPolicy] = await Promise.all([
  readPolicy('AGENTS.md'),
  readPolicy('skills/task_common/SKILL.md'),
  readPolicy('skills/git/SKILL.md'),
  readPolicy('skills/task-flow-non-speckit/SKILL.md'),
]);

test('AGENTS.md maps each workflow area to its governing document', () => {
  const rows = agentsPolicy.split(/\r?\n/).filter((line) => /^\s*\|.*\|\s*$/.test(line));
  const mappings = [
    { area: /git|pull request|\bPR\b/i, authority: /skills\/git\/SKILL\.md/i },
    { area: /承認|approval/i, authority: /(?:AGENTS\.md|workflow\/SKILL\.md)/i },
    { area: /worktree|ワークツリー/i, authority: /(?:task-flow-non-speckit\/SKILL\.md|AGENTS\.md)/i },
    { area: /命名|naming/i, authority: /branch-worktree-naming\/SKILL\.md/i },
    { area: /1\s*タスク\s*[=＝:]\s*1\s*PR|one task.{0,12}one PR/i, authority: /task_common\/SKILL\.md/i },
    { area: /specs\/flow/i, authority: /task-flow-non-speckit\/SKILL\.md/i },
    { area: /\bTDD\b|test.driven/i, authority: /workflow\/SKILL\.md/i },
  ];

  for (const { area, authority } of mappings) {
    const row = rows.find((candidate) => area.test(candidate.split('|').slice(1, -1).join(' ')));
    assert.ok(row, `AGENTS.md is missing a source-of-truth row for ${area}`);
    assert.match(row, authority, `The ${area} row should name its governing document`);
  }
});

test('AGENTS.md limits execution to one task and waits for an explicit start', () => {
  const normalized = agentsPolicy.replace(/\s+/g, ' ');
  const missingRules = [
    [/(?:1|一)タスク.{0,20}(?:ずつ|一度に)|(?:一度に|同時に).{0,20}(?:1|一)タスク/.test(normalized), 'one task at a time'],
    [/(?:方針|決定).{0,24}(?:だけ|のみ).{0,30}(?:開始|着手).{0,30}(?:しない|されない)|(?:開始|着手).{0,30}(?:明示的な|明示).{0,10}(?:指示|開始).{0,30}(?:待つ|まで)/.test(normalized), 'explicit start after a policy decision'],
  ].filter(([isPresent]) => !isPresent).map(([, rule]) => rule);
  assert.deepEqual(missingRules, [], `AGENTS.md is missing these execution boundaries: ${missingRules.join(', ')}`);
});

test('task_common delegates merge approval instructions to the Git policy', () => {
  assert.match(commonPolicy, /skills\/git\/SKILL\.md/i);
  const repeatsMergePrompt = commonPolicy.split(/\r?\n/).some((line) =>
    /(?:マージ|取り込み)/i.test(line)
    && /(?:確認してください|確認すること|確認.*(?:しますか|承認))/i.test(line),
  );
  assert.equal(repeatsMergePrompt, false, 'task_common should refer to the Git policy instead of asking for merge approval itself');
});

test('the Git policy permits merging an approved PR when merge checks are satisfied', () => {
  const normalized = gitPolicy.replace(/\s+/g, ' ');
  assert.ok(/(?:明示.{0,12}承認|承認済み)/.test(normalized), 'the policy should recognize an existing explicit approval');
  assert.ok(/(?:再(?:確認|質問)|改めて.{0,8}(?:確認|質問)|追加.{0,8}承認).{0,16}(?:不要|しない|求めない)|(?:不要|しない|求めない).{0,16}(?:再(?:確認|質問)|追加.{0,8}承認)/.test(normalized), 'the policy should avoid asking for the same approval again');
  assert.ok(/PR.{0,40}(?:マージ|merge)/i.test(normalized), 'the rule should describe merging a pull request');
  assert.ok(/(?:CI|チェック|レビュー|検証).{0,40}(?:通過|成功|完了|満た)/i.test(normalized), 'merge eligibility should include a satisfied review or check condition');
});

test('task-flow requires individual approval before deleting a worktree', () => {
  const normalized = flowPolicy.replace(/\s+/g, ' ');
  assert.ok(/worktree.{0,100}削除.{0,100}個別.{0,12}承認|worktree.{0,100}個別.{0,12}承認.{0,100}削除/i.test(normalized), 'worktree deletion should require a separate, specific approval');
});

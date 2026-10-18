import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const skill = await readFile(join(repositoryRoot, "skills/task-flow-non-speckit/SKILL.md"), "utf8");
const tables = text => {
  const result = [];
  let current = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith("|")) current.push(line);
    else if (current.length) {
      result.push(current);
      current = [];
    }
  }
  if (current.length) result.push(current);
  return result.map(lines => lines.map(line => line.trim().slice(1, -1).split("|").map(cell => cell.trim())));
};
const tableWithHeader = predicate => tables(skill).find(([header]) => predicate(header ?? []));
const rowText = row => row.join(" ");

test("task states and transitions preserve start, evidence, ownership, and failure gates", () => {
  const stateTable = tableWithHeader(header => header.some(cell => /^状態$/.test(cell)));
  assert.ok(stateTable, "lifecycle states should be defined in a table");
  const [stateHeader, , ...stateRows] = stateTable;
  for (const requiredColumn of [/条件/, /入力/, /承認/, /証跡/, /次担当/]) {
    assert.ok(stateHeader.some(cell => requiredColumn.test(cell)), `state table should include ${requiredColumn}`);
  }
  for (const [index, row] of stateRows.entries()) {
    assert.equal(row.length, stateHeader.length, `state row ${index + 1} should have every field`);
    assert.ok(row.every(value => value && !/^(?:-|未設定|不明)$/.test(value)), `state row ${index + 1} should include conditions, inputs, approvals, evidence, and next owner`);
  }
  const definedStates = stateRows.map(row => row[0]);
  for (const state of ["未着手", "進行中", "検証中", "承認待ち", "blocked", "失敗", "確認不能", "完了"]) {
    assert.ok(definedStates.includes(state), `state ${state} should remain distinct`);
  }

  const transitions = tableWithHeader(header => header.some(cell => /遷移/.test(cell)));
  assert.ok(transitions, "lifecycle transitions should be recorded in a matrix");
  const [header, separator, ...rows] = transitions;
  for (const requiredColumn of [/条件/, /入力/, /承認/, /証跡/, /次担当/]) {
    assert.ok(header.some(cell => requiredColumn.test(cell)), `transition matrix should include ${requiredColumn}`);
  }
  assert.ok(rows.length > 0, "transition matrix should list allowed transitions");
  for (const [index, row] of rows.entries()) {
    assert.equal(row.length, header.length, `transition row ${index + 1} should have every field`);
    for (const [columnIndex, value] of row.entries()) {
      assert.ok(value && !/^(?:-|未設定|不明)$/.test(value), `transition row ${index + 1}, column ${columnIndex + 1} needs an explicit value`);
    }
  }

  const conditionColumn = header.findIndex(cell => /開始・終了条件/.test(cell));
  const approvalColumn = header.findIndex(cell => /承認条件/.test(cell));
  assert.ok(conditionColumn >= 0, "transition matrix should expose its condition column");
  assert.ok(approvalColumn >= 0, "transition matrix should expose its approval column");
  const transitionRows = rows.map(row => ({
    transition: row[0],
    detail: rowText(row),
    condition: row[conditionColumn],
    approval: row[approvalColumn],
  }));
  const verifiedCompletion = transitionRows.find(({ transition }) => /検証中\s*(?:→|->)\s*完了/.test(transition));
  assert.ok(verifiedCompletion && /期待値/.test(verifiedCompletion.condition), "verification-to-complete should require checking the expected acceptance result in its condition");
  assert.ok(verifiedCompletion && /必須業務書込/.test(verifiedCompletion.condition) && /証跡で確認/.test(verifiedCompletion.condition), "verification-to-complete should require evidence that required business writes were performed");
  assert.ok(verifiedCompletion && /事前承認.{0,20}範囲が一致/.test(verifiedCompletion.approval), "verification-to-complete should enforce matching prior acceptance approval in its approval column");
  const approvalCompletion = transitionRows.find(({ transition }) => /承認待ち\s*(?:→|->)\s*完了/.test(transition));
  assert.ok(approvalCompletion && /明示承認/.test(approvalCompletion.condition) && /受入れ条件/.test(approvalCompletion.condition), "approval-to-complete should require explicit acceptance and fulfilled acceptance conditions in its condition");
  assert.ok(approvalCompletion && /必須業務書込/.test(approvalCompletion.condition) && /満たした時点/.test(approvalCompletion.condition), "approval-to-complete should require required business writes to be fulfilled in its condition");
  assert.ok(approvalCompletion && /未実施の業務書込があれば完了不可/.test(approvalCompletion.approval), "approval-to-complete should prohibit completion with an unperformed required write in its approval column");
  const directUnresolvedCompletion = transitionRows.find(({ transition }) =>
    /(?:blocked|失敗|確認不能)/.test(transition) && /完了/.test(transition) && /(?:→|->)/.test(transition));
  assert.equal(directUnresolvedCompletion, undefined, "unresolved blocked, failed, or unknown work cannot transition directly to complete");
  const start = transitionRows.find(({ transition }) => /未着手/.test(transition) && /進行中/.test(transition));
  assert.ok(start && /明示/.test(start.detail) && /方針.{0,12}(?:了承|合意).{0,16}(?:開始|着手).{0,12}(?:扱わない|みなさない)/s.test(skill), "work starts only on an explicit start instruction, not policy approval");
  const resume = transitionRows.find(({ transition }) => /(?:blocked|失敗|確認不能)\s*(?:→|->)/.test(transition) && /(?:進行中|検証中)/.test(transition));
  assert.ok(resume && /保存.{0,20}成果/.test(resume.detail) && /停止.{0,20}理由/.test(resume.detail) && /再開条件/.test(resume.detail) && /明示再開指示/.test(resume.detail), "resuming stopped work requires saved output, stop reason, restart conditions, and explicit user resumption after a pause");
  const approvalResume = transitionRows.find(({ transition }) => /承認待ち\s*(?:→|->)/.test(transition) && /進行中|検証中/.test(transition));
  assert.ok(approvalResume && /業務書込.{0,30}実行/.test(approvalResume.detail) && /再検証/.test(approvalResume.detail), "approved required writes return to execution and verification before acceptance");
  assert.ok(/ユーザーが「一旦停止」を指示した場合だけ.{0,50}明示的な再開指示/s.test(skill), "only an explicit user pause requires an explicit restart instruction");
  assert.ok(/既承認の作業を再承認待ちにしない/.test(skill), "resolved blockers within approved scope do not require repeated approval");
});

test("task acceptance, PR state, final completion, and cleanup are independent", () => {
  const statusTable = tableWithHeader(header => header.some(cell => /記録対象/.test(cell)) && header.some(cell => /状態/.test(cell)));
  assert.ok(statusTable, "task, PR, cleanup, and final lifecycle states should have separate records");
  const recordNames = statusTable.slice(2).map(row => row[0]);
  for (const requiredRecord of [/タスク/, /Git/, /PR/, /cleanup|後片付け/, /最終/]) {
    assert.ok(recordNames.some(name => requiredRecord.test(name)), `status records should separately include ${requiredRecord}`);
  }

  assert.ok(/タスク.{0,30}(?:完了|done).{0,70}(?:成果受入れ|受入れ).{0,40}(?:最終完了|lifecycle)/s.test(skill), "task completion records acceptance, while final completion tracks Git lifecycle separately");
  assert.ok(/(?:業務|外部).{0,30}(?:書込|更新).{0,80}(?:承認待ち|blocked).{0,50}(?:完了にしない|完了不可|完了とはしない)/s.test(skill), "required external business writes must remain pending until performed");
  assert.ok(/同じ範囲.{0,30}事前.{0,20}承認.{0,80}(?:再承認|再度.{0,10}承認).{0,20}(?:不要|求めない)/s.test(skill), "same-scope pre-approval can satisfy acceptance without reapproval");
  assert.ok(/(?:マージ|merge).{0,30}承認.{0,50}(?:成果|受入れ).{0,20}承認.{0,30}(?:流用|代用).{0,12}(?:しない|不可)/s.test(skill), "merge approval cannot satisfy acceptance approval");
  const cleanupRule = skill.split(/\r?\n/).find(line => line.includes("通常のworktree削除を追加承認なしで実施する条件"));
  assert.ok(cleanupRule, "normal cleanup should have a dedicated rule");
  const cleanupPrerequisites = cleanupRule.match(/条件は、([^。]+)である。/)?.[1] ?? "";
  for (const requirement of [/同一PR/, /main\/masterへのmerge確認/, /作業内容の保全/, /worktreeのclean確認/, /branch保持/]) {
    assert.ok(requirement.test(cleanupPrerequisites), `normal cleanup prerequisites should include ${requirement}`);
  }
  for (const requirement of [/削除/, /追加承認なし/]) {
    assert.ok(requirement.test(cleanupRule), `normal cleanup should require ${requirement}`);
  }
  const noPrCleanupRule = skill.split(/\r?\n/).find(line => line.includes("この通常削除例外を使えない"));
  assert.ok(noPrCleanupRule && /個別承認/.test(noPrCleanupRule) && /保全/.test(noPrCleanupRule) && /未完了/.test(noPrCleanupRule), "without a remote or PR, cleanup stays preserved and incomplete pending individual approval");
  const noPrClause = noPrCleanupRule.slice(noPrCleanupRule.indexOf("リモートがない場合"));
  assert.doesNotMatch(noPrClause, /追加承認なし|追加承認不要/, "the no-PR path must not inherit automatic cleanup approval");
  const cleanupRecord = statusTable.find(row => /cleanup/.test(row[0]));
  assert.ok(cleanupRecord && /clean確認済\s*\/\s*worktree削除済/.test(cleanupRecord[1]), "clean verification and worktree deletion are separate cleanup states");
  const finalRule = skill.split(/\r?\n/).find(line => line.includes("最終lifecycleの完了には"));
  assert.ok(finalRule, "final lifecycle should have one explicit completion rule");
  for (const requirement of [/成果受入れ/, /main\/master.{0,30}反映/, /保全/, /clean/, /branchを保持/, /削除/]) {
    assert.ok(requirement.test(finalRule), `final lifecycle should require ${requirement}`);
  }
  assert.ok(/リモートがありPRが存在する場合は、同一PR.{0,50}merge確認を要する/.test(skill), "same-PR merge is required when a remote and PR exist");
  assert.ok(/リモートがない場合やPRが存在しない場合も.{0,80}main\/masterへの反映/.test(skill), "work without a remote or PR still requires main or master reflection and cleanup");
  assert.ok(/明示承認.{0,40}(?:再度|再).{0,20}承認依頼しない/s.test(skill), "already approved operations should not be sent for approval again");
  assert.ok(/--force.{0,30}個別承認/s.test(skill), "force cleanup requires separate approval");
  assert.ok(/未マージ.{0,50}(?:dirty|状態不明).{0,50}(?:保持|削除.{0,10}(?:停止|しない))/s.test(skill), "unmerged, dirty, or unknown worktrees are preserved");
});

test("examples, resumption, user reporting, and template preserve the same lifecycle model", () => {
  assert.ok(/実装済み.{0,20}承認待ち/s.test(skill), "example should cover implemented work waiting for acceptance");
  assert.ok(/受入.{0,20}(?:テスト|検証).{0,20}失敗/s.test(skill), "example should cover failed acceptance verification");
  assert.ok(/外部.{0,30}(?:書込|更新).{0,30}(?:待ち|未実施)/s.test(skill), "example should cover a required external write that has not happened");
  assert.ok(/TDD.{0,20}(?:Red|red).{0,50}(?:受入|検証).{0,30}(?:区別|別)/s.test(skill), "planned TDD red is distinct from failed acceptance verification");

  const template = skill.match(/```md\s*([\s\S]*?)```/)?.[1] ?? "";
  for (const field of [/タスク状態/, /PR状態/, /cleanup状態/, /最終(?:lifecycle)?状態/, /次担当/, /証跡/]) {
    assert.ok(field.test(template), `task template should include ${field}`);
  }
  for (const reportField of [/状態/, /変更/, /実行コマンド/, /検証/, /残リスク|残.{0,8}risk/i]) {
    assert.ok(reportField.test(skill), `user reporting rules should include ${reportField}`);
  }
});

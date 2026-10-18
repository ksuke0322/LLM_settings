import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const workflowPath = join(repositoryRoot, "skills/workflow/SKILL.md");
const readWorkflow = () => readFile(workflowPath, "utf8");

const sectionBody = (document, heading) => {
  const lines = document.split(/\r?\n/);
  const headingIndex = lines.indexOf(`## ${heading}`);
  if (headingIndex < 0) return "";
  const nextHeading = lines.findIndex((line, index) => index > headingIndex && line.startsWith("## "));
  return lines.slice(headingIndex + 1, nextHeading < 0 ? undefined : nextHeading).join("\n");
};

const markdownTableRows = section => section
  .split(/\r?\n/)
  .filter(line => line.startsWith("|") && !/^\|\s*:?-+/.test(line))
  .map(line => line.split("|").slice(1, -1).map(cell => cell.trim()));

test("workflow assigns distinct validation to each change class", async () => {
  const workflow = await readWorkflow();
  const table = markdownTableRows(sectionBody(workflow, "変更種別と検証"));
  const [header, ...rows] = table;
  const policyByType = new Map(rows.map(([type, ...details]) => [type, details.join(" | ")]));

  assert.deepEqual(header, ["変更種別", "進め方と検証"]);
  assert.deepEqual([...policyByType.keys()], [
    "動作変更・動作影響設定",
    "挙動維持リファクタ",
    "テストの追加・修正",
    "文書・動作非影響の設定・生成物",
  ]);

  assert.match(policyByType.get("動作変更・動作影響設定"), /TDD|Red/);
  assert.match(policyByType.get("動作変更・動作影響設定"), /実装前/);
  assert.match(policyByType.get("挙動維持リファクタ"), /既存テスト/);
  assert.match(policyByType.get("挙動維持リファクタ"), /回帰/);
  assert.match(policyByType.get("挙動維持リファクタ"), /テストがない場合/);
  assert.match(policyByType.get("挙動維持リファクタ"), /必要性/);
  assert.match(policyByType.get("テストの追加・修正"), /期待する振る舞い/);
  assert.match(policyByType.get("テストの追加・修正"), /正しい失敗か確認/);
  assert.match(policyByType.get("テストの追加・修正"), /必要最小限.*実効的/);
  assert.match(policyByType.get("文書・動作非影響の設定・生成物"), /変更内容に合う検証/);
  assert.match(policyByType.get("文書・動作非影響の設定・生成物"), /全件検証/);
  assert.match(workflow, /skills\/test-driven-development\/SKILL\.md/);
});

test("workflow follows AGENTS approval boundaries without adding a second start gate", async () => {
  const workflow = await readWorkflow();
  const approval = sectionBody(workflow, "開始・承認と方針変更");

  assert.match(approval, /承認範囲、作業開始、方針変更は `AGENTS\.md` を正本として扱う/);
  assert.doesNotMatch(approval, /承認範囲、作業開始、方針変更は `AGENTS\.md` よりもこの workflow を優先する/);
  assert.match(approval, /方針.{0,24}(?:了承|決定).{0,24}(?:開始指示ではない|着手指示ではない)/);
  assert.match(approval, /承認範囲内.{0,32}追加承認を求めない/);
  assert.match(approval, /承認された範囲内のテスト追加・修正/);
  assert.match(approval, /承認範囲を超え|方針変更/);
});

test("workflow requires evidence for commands and classifies failures before rerunning", async () => {
  const workflow = await readWorkflow();
  const commandPolicy = sectionBody(workflow, "検証コマンドの根拠と失敗時の扱い");

  assert.match(commandPolicy, /package\.json/);
  assert.match(commandPolicy, /pyproject\.toml/);
  assert.match(commandPolicy, /Makefile/);
  assert.match(commandPolicy, /README/);
  assert.match(commandPolicy, /CI/);
  assert.match(commandPolicy, /ユーザー|親/);
  assert.match(commandPolicy, /明示されたコマンド/);
  assert.match(commandPolicy, /作業ディレクトリ/);
  assert.match(commandPolicy, /確認不能/);
  assert.match(commandPolicy, /test と lint.*だけでは停止しない/);
  assert.match(commandPolicy, /対象範囲と正本情報から.*絞れない/);
  assert.match(commandPolicy, /対象範囲外の隣接 package は根拠にしない/);
  assert.match(commandPolicy, /外部の例/);
  assert.match(commandPolicy, /例をそのまま実行しない/);
  assert.match(commandPolicy, /推測で実行せず/);
  assert.match(commandPolicy, /assertion|アサーション/);
  assert.match(commandPolicy, /構文|起動/);
  assert.match(commandPolicy, /依存|入力/);
  assert.match(commandPolicy, /同一.*コマンド.*再実行/);
  assert.match(commandPolicy, /自動.*(?:再試行|導入|インストール)/);
  assert.match(commandPolicy, /test-fixing/);
});

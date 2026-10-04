import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const inventoryPath = join(repositoryRoot, "docs", "skill-inventory.json");
const skillsPath = join(repositoryRoot, "skills");
const lockPath = join(repositoryRoot, ".skill-lock.json");
const excludedDirectories = new Set([
  "high-beta-daily-flow",
  "japan-high-beta-breakout-screening",
  "japan-top-companies-screening",
  "market-regime-assessment",
  "portfolio-risk-allocator",
  "stock-investment-decision-support",
  "stock-investment-position-review",
  "stock-shared",
]);
const requiredFields = [
  "name",
  "directory",
  "origin",
  "source",
  "category",
  "trigger",
  "responsibility",
  "related",
  "conflicts",
  "updatePolicy",
  "status",
  "version",
  "verification",
];

const readJson = async filePath => {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const inventoryRecords = value => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.skills)) return value.skills;
  if (value?.skills && typeof value.skills === "object") return Object.values(value.skills);
  if (Array.isArray(value?.entries)) return value.entries;
  return [];
};

const readInventory = async () => inventoryRecords(await readJson(inventoryPath));

const findScopedSkillDirectories = async () => {
  const children = await readdir(skillsPath, { withFileTypes: true });
  const directories = [];

  for (const child of children) {
    if (!child.isDirectory() || excludedDirectories.has(child.name)) continue;
    try {
      await access(join(skillsPath, child.name, "SKILL.md"));
      directories.push(child.name);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  return directories.sort();
};

test("inventory contains each in-scope direct skill exactly once and excludes stock directories", async () => {
  const records = await readInventory();
  const directories = records.map(record => record?.directory);
  const currentDirectories = await findScopedSkillDirectories();

  assert.ok(records.length > 0, `Expected a skill inventory at ${inventoryPath}`);
  assert.ok(directories.every(directory => typeof directory === "string" && directory.length > 0));
  assert.equal(new Set(directories).size, directories.length, "Skill directories must not be duplicated");
  assert.deepEqual([...directories].sort(), currentDirectories, "Inventory must track the current direct skill directories");
  assert.equal(directories.some(directory => excludedDirectories.has(directory)), false);
});

test("inventory origin and source follow the skill lock, with unlocked skills left unknown", async () => {
  const records = await readInventory();
  const byDirectory = new Map(records.map(record => [record?.directory, record]));
  const currentDirectories = await findScopedSkillDirectories();
  const lock = await readJson(lockPath);

  assert.ok(records.length > 0, `Expected a skill inventory at ${inventoryPath}`);
  assert.ok(lock?.skills && typeof lock.skills === "object", "Expected the skill lock map");

  for (const [directory, lockedSkill] of Object.entries(lock.skills)) {
    if (excludedDirectories.has(directory)) continue;
    assert.ok(currentDirectories.includes(directory), `Locked skill ${directory} should have a direct SKILL.md`);
    const record = byDirectory.get(directory);
    assert.ok(record, `Locked skill ${directory} should be present in the inventory`);
    assert.equal(record.origin, "external", `${directory} should be marked external`);
    assert.equal(record.source, lockedSkill.source, `${directory} should preserve its locked source`);
  }

  for (const directory of currentDirectories) {
    const record = byDirectory.get(directory);
    assert.ok(record, `Skill ${directory} should be present in the inventory`);
    if (!Object.hasOwn(lock.skills, directory)) {
      assert.equal(record.origin, "unknown", `${directory} has no lock evidence and should remain unknown`);
      assert.equal(record.source, null, `${directory} has no lock evidence and should not claim a source`);
      assert.equal(record.version, null, `${directory} has no lock evidence and should not claim a version`);
    }
  }
});

test("inventory versions follow locked hashes and names follow skill frontmatter", async () => {
  const records = await readInventory();
  const byDirectory = new Map(records.map(record => [record?.directory, record]));
  const currentDirectories = await findScopedSkillDirectories();
  const lock = await readJson(lockPath);

  for (const [directory, lockedSkill] of Object.entries(lock.skills)) {
    if (excludedDirectories.has(directory)) continue;
    const record = byDirectory.get(directory);
    assert.ok(record, `Locked skill ${directory} should be present in the inventory`);
    assert.equal(record.version?.basis, "skillFolderHash", `${directory} should identify its locked hash basis`);
    assert.equal(record.version?.value, lockedSkill.skillFolderHash, `${directory} should preserve its locked skillFolderHash`);
  }

  for (const directory of currentDirectories) {
    const record = byDirectory.get(directory);
    const skillFile = join(skillsPath, directory, "SKILL.md");
    const skillText = await readFile(skillFile, "utf8");
    const frontmatter = skillText.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    const nameMatch = frontmatter?.match(/^name:\s*(?:"([^"]+)"|'([^']+)'|([^\r\n]+))\s*$/m);
    const skillName = nameMatch?.slice(1).find(Boolean)?.trim();

    assert.ok(skillName, `${skillFile} should declare a frontmatter name`);
    assert.equal(record?.name, skillName, `${directory} should match its SKILL.md frontmatter name`);
  }
});

test("each inventory record exposes the required governance and verification fields", async () => {
  const records = await readInventory();

  assert.ok(records.length > 0, `Expected a skill inventory at ${inventoryPath}`);

  for (const record of records) {
    assert.ok(record && typeof record === "object" && !Array.isArray(record));
    for (const field of requiredFields) {
      assert.ok(Object.hasOwn(record, field), `${record.directory ?? "Unknown skill"} is missing ${field}`);
      assert.notEqual(record[field], undefined, `${record.directory ?? "Unknown skill"} has undefined ${field}`);
    }
    assert.ok(["external", "local", "unknown"].includes(record.origin), `${record.directory} has an invalid origin`);
  }
});

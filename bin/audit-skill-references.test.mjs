import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cliPath = fileURLToPath(new URL("./audit-skill-references.mjs", import.meta.url));
const excludedSkills = [
  "high-beta-daily-flow",
  "japan-high-beta-breakout-screening",
  "japan-top-companies-screening",
  "market-regime-assessment",
  "portfolio-risk-allocator",
  "stock-investment-decision-support",
  "stock-investment-position-review",
  "stock-shared",
];

const writeFixtureFile = async (root, relativePath, contents) => {
  const absolutePath = join(root, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
};

const makeFixture = async (files) => {
  const root = await mkdtemp(join(tmpdir(), "audit-skill-references-test-"));
  await Promise.all(Object.entries(files).map(([relativePath, contents]) => (
    writeFixtureFile(root, relativePath, contents)
  )));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
};

const executeCli = (root, extraArgs = []) => spawnSync(
  process.execPath,
  [cliPath, "--root", root, "--json", ...extraArgs],
  { encoding: "utf8" },
);

const runAudit = (root, extraArgs = []) => {
  const result = executeCli(root, extraArgs);
  assert.equal(result.error, undefined, result.error?.message);
  let output;
  assert.doesNotThrow(() => { output = JSON.parse(result.stdout); }, result.stderr);
  assert.ok(Array.isArray(output.references), "JSON should contain reference records");
  return { ...output, status: result.status, stderr: result.stderr };
};

test("scans the approved Markdown roots and excludes the exact stock skill set", async () => {
  const files = {
    "AGENTS.md": "[guide](references/nested/guide.md)\n",
    "references/nested/guide.md": "[skill](../../skills/example/SKILL.md)\n",
    "skills/example/SKILL.md": "[own file](./SKILL.md)\n",
    "skills/example/notes.md": "[not a skill source](missing.md)\n",
  };
  for (const skill of excludedSkills) {
    files[`skills/${skill}/SKILL.md`] = "[fictional excluded link](../../missing.md)\n";
  }
  const fixture = await makeFixture(files);
  try {
    const result = runAudit(fixture.root);
    assert.equal(result.status, 0);
    const sources = new Set(result.references.map(({ sourceFile }) => sourceFile));
    assert.ok(sources.has("AGENTS.md"));
    assert.ok(sources.has("references/nested/guide.md"));
    assert.ok(sources.has("skills/example/SKILL.md"));
    assert.equal(sources.has("skills/example/notes.md"), false);
    for (const skill of excludedSkills) assert.equal(sources.has(`skills/${skill}/SKILL.md`), false);
  } finally {
    await fixture.cleanup();
  }
});

test("keeps Markdown query and fragment text while failing only a missing local target", async () => {
  const fixture = await makeFixture({
    "AGENTS.md": [
      "Existing: [guide](references/guide.md?view=short#intro).",
      "Missing: [old guide](references/missing.md?view=short#intro).",
      "",
    ].join("\n"),
    "references/guide.md": "# Guide\n",
  });
  try {
    const result = runAudit(fixture.root);
    const existing = result.references.find(({ reference }) => reference === "references/guide.md?view=short#intro");
    const missing = result.references.find(({ reference }) => reference === "references/missing.md?view=short#intro");
    assert.deepEqual({
      status: result.status,
      existingClassification: existing?.classification,
      missingClassification: missing?.classification,
      summaryBrokenLocal: result.summary?.brokenLocal,
      errors: result.errors?.length,
    }, {
      status: 1,
      existingClassification: "repository-local",
      missingClassification: "broken-local",
      summaryBrokenLocal: 1,
      errors: 1,
    });
    assert.equal(missing?.sourceFile, "AGENTS.md");
    assert.equal(missing?.line, 2);
    assert.equal(missing?.classification, "broken-local");
    assert.equal(missing?.severity, "error");
    assert.match(missing?.reason ?? "", /not found|見つかりません/u);
  } finally {
    await fixture.cleanup();
  }
});

test("keeps external, template, and repository-escaping links as non-failing unknowns", async () => {
  const fixture = await makeFixture({
    "AGENTS.md": [
      "[web](https://example.invalid/guide?x=1#part)",
      "[home](~/.agents/skills/example/SKILL.md)",
      "[user path](/Users/example/private.md)",
      "[outside](../../outside/private.md)",
      "[template](${SKILL_DIR}/generated/guide.md)",
      "",
    ].join("\n"),
  });
  try {
    const result = runAudit(fixture.root);
    assert.equal(result.status, 0);
    assert.equal(result.errors?.length ?? 0, 0);
    const classifications = new Map(result.references.map(({ reference, classification }) => [reference, classification]));
    for (const reference of [
      "https://example.invalid/guide?x=1#part",
      "~/.agents/skills/example/SKILL.md",
      "/Users/example/private.md",
      "../../outside/private.md",
    ]) assert.equal(classifications.get(reference), "external-unknown");
    assert.equal(classifications.get("${SKILL_DIR}/generated/guide.md"), "template-unknown");
  } finally {
    await fixture.cleanup();
  }
});

test("keeps inline code as unknown and ignores fenced examples and ambiguous bare paths", async () => {
  const fixture = await makeFixture({
    "AGENTS.md": [
      "The path `references/example.md` is only an example.",
      "feature/example-branch and y/n are labels.",
      "```md",
      "[example](references/missing.md)",
      "```",
      "",
    ].join("\n"),
  });
  try {
    const result = runAudit(fixture.root);
    assert.equal(result.status, 0);
    assert.deepEqual(result.errors ?? [], []);
    assert.equal(result.references.some(({ reference }) => reference === "references/missing.md"), false);
    const codeExample = result.references.find(({ reference }) => reference === "references/example.md");
    assert.equal(codeExample?.classification, "code-example-unknown");
    assert.equal(codeExample?.severity, "warning");
  } finally {
    await fixture.cleanup();
  }
});

test("marks external references known only for exact registry matches", async () => {
  const fixture = await makeFixture({
    "AGENTS.md": [
      "[registered](https://example.invalid/guide?a=1#part)",
      "[different fragment](https://example.invalid/guide?a=1)",
      "[unregistered](https://example.invalid/other)",
      "",
    ].join("\n"),
    "registry.json": JSON.stringify({ references: ["https://example.invalid/guide?a=1#part"] }),
  });
  try {
    const result = runAudit(fixture.root, ["--registry", join(fixture.root, "registry.json")]);
    assert.equal(result.status, 0);
    const byReference = new Map(result.references.map(({ reference, classification, severity }) => (
      [reference, { classification, severity }]
    )));
    assert.deepEqual(byReference.get("https://example.invalid/guide?a=1#part"), {
      classification: "external-known",
      severity: "info",
    });
    assert.deepEqual(byReference.get("https://example.invalid/guide?a=1"), {
      classification: "external-unknown",
      severity: "warning",
    });
    assert.deepEqual(byReference.get("https://example.invalid/other"), {
      classification: "external-unknown",
      severity: "warning",
    });
    const inlineRegistryResult = runAudit(fixture.root, ["--registry", JSON.stringify({
      references: ["https://example.invalid/other"],
    })]);
    const inlineRegistryReference = inlineRegistryResult.references.find(({ reference }) => (
      reference === "https://example.invalid/other"
    ));
    assert.deepEqual(
      [inlineRegistryReference?.classification, inlineRegistryReference?.severity],
      ["external-known", "info"],
    );
  } finally {
    await fixture.cleanup();
  }
});

test("rejects malformed or invalid registry schemas with exit 2", async () => {
  const fixture = await makeFixture({
    "AGENTS.md": "[web](https://example.invalid/guide)\n",
    "registry-invalid-json.json": "{\"references\":[",
    "registry-invalid-shape.json": JSON.stringify({ references: "https://example.invalid/guide" }),
    "registry-invalid-entry.json": JSON.stringify({ references: ["", 42] }),
  });
  try {
    for (const registryFile of [
      "registry-invalid-json.json",
      "registry-invalid-shape.json",
      "registry-invalid-entry.json",
    ]) {
      const result = executeCli(fixture.root, ["--registry", join(fixture.root, registryFile)]);
      assert.equal(result.status, 2, `${registryFile} should be rejected`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /registry|JSON/u);
    }
  } finally {
    await fixture.cleanup();
  }
});

test("resolves SKILL_DIR fixtures and keeps unresolved templates as warnings", async () => {
  const fixture = await makeFixture({
    "skills/example/SKILL.md": [
      "[existing](${SKILL_DIR}/refs/guide.md)",
      "[missing](${SKILL_DIR}/refs/missing.md)",
      "[other variable](${OTHER_DIR}/refs/guide.md)",
      "Inline `${SKILL_DIR}/refs/guide.md` and `${SKILL_DIR}/refs/inline-missing.md`.",
      "",
    ].join("\n"),
    "skills/example/refs/guide.md": "# Guide\n",
  });
  try {
    const result = runAudit(fixture.root);
    assert.equal(result.status, 0);
    const find = (reference, syntax = "markdown-link") => result.references.find((item) => (
      item.reference === reference && item.syntax === syntax
    ));
    assert.deepEqual(
      [find("${SKILL_DIR}/refs/guide.md")?.classification, find("${SKILL_DIR}/refs/guide.md")?.severity],
      ["skill-local", "info"],
    );
    assert.deepEqual(
      [find("${SKILL_DIR}/refs/missing.md")?.classification, find("${SKILL_DIR}/refs/missing.md")?.severity],
      ["template-unknown", "warning"],
    );
    assert.deepEqual(
      [find("${OTHER_DIR}/refs/guide.md")?.classification, find("${OTHER_DIR}/refs/guide.md")?.severity],
      ["template-unknown", "warning"],
    );
    assert.deepEqual(
      [find("${SKILL_DIR}/refs/guide.md", "code-span")?.classification, find("${SKILL_DIR}/refs/guide.md", "code-span")?.severity],
      ["skill-local", "info"],
    );
    assert.deepEqual(
      [find("${SKILL_DIR}/refs/inline-missing.md", "code-span")?.classification, find("${SKILL_DIR}/refs/inline-missing.md", "code-span")?.severity],
      ["template-unknown", "warning"],
    );
  } finally {
    await fixture.cleanup();
  }
});

test("resolves SKILL_DIR from the nearest nested SKILL.md directory", async () => {
  const fixture = await makeFixture({
    "skills/outer/skills/inner/SKILL.md": "[guide](${SKILL_DIR}/refs/guide.md)\n",
    "skills/outer/skills/inner/refs/guide.md": "# Inner guide\n",
  });
  try {
    const result = runAudit(fixture.root);
    const reference = result.references.find(({ reference: value }) => (
      value === "${SKILL_DIR}/refs/guide.md"
    ));
    assert.equal(result.status, 0);
    assert.deepEqual([reference?.classification, reference?.severity], ["skill-local", "info"]);
  } finally {
    await fixture.cleanup();
  }
});

test("classifies inline home paths through exact external registry matches", async () => {
  const knownReference = "~/.agents/skills/private/SKILL.md";
  const unknownReference = "~/.agents/skills/not-listed/SKILL.md";
  const fixture = await makeFixture({
    "AGENTS.md": [
      "Known `" + knownReference + "`.",
      "Unknown `" + unknownReference + "`.",
      "",
    ].join("\n"),
  });
  try {
    const result = runAudit(fixture.root, ["--registry", JSON.stringify({ references: [knownReference] })]);
    const find = (reference) => result.references.find(({ reference: value }) => value === reference);
    assert.equal(result.status, 0);
    assert.deepEqual([find(knownReference)?.classification, find(knownReference)?.severity], ["external-known", "info"]);
    assert.deepEqual([find(unknownReference)?.classification, find(unknownReference)?.severity], ["external-unknown", "warning"]);
  } finally {
    await fixture.cleanup();
  }
});

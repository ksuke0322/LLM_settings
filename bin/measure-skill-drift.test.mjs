import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cliPath = fileURLToPath(new URL("./measure-skill-drift.mjs", import.meta.url));
const stockSkillNames = [
  "high-beta-daily-flow",
  "japan-high-beta-breakout-screening",
  "japan-top-companies-screening",
  "market-regime-assessment",
  "portfolio-risk-allocator",
  "stock-investment-decision-support",
  "stock-investment-position-review",
  "stock-shared",
];

const makeFixture = async ({ skillNames = ["external-alpha"], missingNames = [] } = {}) => {
  const root = await mkdtemp(join(tmpdir(), "measure-skill-drift-test-"));
  const skills = Object.fromEntries(skillNames.map((name) => [name, {
    source: "fixture/local-skills",
    sourceType: "github",
    sourceUrl: "https://github.com/fixture/local-skills.git",
    skillPath: `skills/${name}/SKILL.md`,
    skillFolderHash: "a".repeat(40),
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }]));

  for (const name of skillNames) {
    if (missingNames.includes(name)) continue;
    const skillFile = join(root, "skills", name, "SKILL.md");
    await mkdir(dirname(skillFile), { recursive: true });
    await writeFile(skillFile, `# ${name}\ninitial skill content\n`, "utf8");
  }
  await writeFile(join(root, ".skill-lock.json"), JSON.stringify({ version: 3, skills }, null, 2), "utf8");

  return { root, skills };
};

const inspect = (root, args = []) => spawnSync(process.execPath, [cliPath, "--root", root, "--json", ...args], {
  encoding: "utf8",
  timeout: 10000,
});

const runAndReadReport = (root, args = []) => {
  const run = inspect(root, args);
  assert.equal(run.status, 0, `CLI should exit successfully. stderr: ${run.stderr}`);
  const report = JSON.parse(run.stdout);
  assert.ok(Array.isArray(report.records), "JSON report should contain a records array");
  return report;
};

const gitAt = (root, ...args) => {
  const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 10000 });
  assert.equal(run.status, 0, `fixture git ${args.join(" ")} should succeed: ${run.stderr}`);
  return run.stdout.trim();
};

const makeUpstreamCheckout = async (root, { origin = "https://github.com/fixture/local-skills.git", skillPath = "skills/external-alpha/SKILL.md", directoryName = "upstream-checkout" } = {}) => {
  const checkout = join(root, directoryName);
  await mkdir(checkout);
  gitAt(checkout, "init", "-q");
  gitAt(checkout, "config", "user.name", "Fixture");
  gitAt(checkout, "config", "user.email", "fixture@example.invalid");
  gitAt(checkout, "remote", "add", "origin", origin);
  const skillFile = join(checkout, ...skillPath.split("/"));
  await mkdir(dirname(skillFile), { recursive: true });
  await writeFile(skillFile, "# upstream skill\ninitial upstream content\n", "utf8");
  gitAt(checkout, "add", ".");
  gitAt(checkout, "commit", "-m", "initial fixture skill");
  return checkout;
};

const recordForSkill = (report, name) => report.records.find((record) => record.name === name);

test("reports separate hashes, deterministic local digest, and its algorithm rules", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const report = runAndReadReport(fixture.root);
  const repeated = runAndReadReport(fixture.root);
  const record = recordForSkill(report, "external-alpha");

  assert.deepEqual(report.digestAlgorithm, {
    id: "skill-folder-content-v1",
    rules: [
      "Hash stream starts with UTF-8 bytes for skill-folder-content-v1 followed by one NUL byte.",
      "SHA-256 over regular files sorted by UTF-8 relative path.",
      "Each file encodes the big-endian path byte length, path bytes, big-endian content byte length, and content bytes.",
      "Empty directories and executable bits are excluded.",
      "Finding any symbolic link makes the local digest null and the measurement unknown.",
    ],
  });
  assert.equal(record.lockHash, fixture.skills["external-alpha"].skillFolderHash);
  assert.equal(record.upstreamTreeSha, null);
  assert.match(record.localContentDigest, /^[a-f0-9]{64}$/);
  assert.equal(record.localContentDigest, recordForSkill(repeated, "external-alpha").localContentDigest);
  assert.equal(record.status, "verification-unknown");
  assert.match(record.reason, /unknown|未確認|未取得/i);
});

test("explicitly excludes the eight stock skills before measuring local content", async (t) => {
  const fixture = await makeFixture({ skillNames: ["external-alpha", ...stockSkillNames] });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  for (const name of stockSkillNames) {
    const stockDirectory = join(fixture.root, "skills", name);
    await rm(stockDirectory, { recursive: true });
    await symlink(join(fixture.root, "skills", "external-alpha"), stockDirectory, "dir");
  }

  const upstreamConfigPath = join(fixture.root, "upstream-checkouts.json");
  await writeFile(upstreamConfigPath, JSON.stringify({ sources: { "fixture/local-skills": join(fixture.root, "not-a-git-checkout") } }), "utf8");
  const report = runAndReadReport(fixture.root, ["--upstream-checkouts", upstreamConfigPath]);
  assert.deepEqual(report.records.map((record) => record.name), ["external-alpha"]);
  for (const name of stockSkillNames) assert.equal(recordForSkill(report, name), undefined);
});

test("reproduces the digest and ignores empty directories and executable bits", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const skillFile = join(fixture.root, "skills", "external-alpha", "SKILL.md");
  const before = recordForSkill(runAndReadReport(fixture.root), "external-alpha").localContentDigest;
  const repeated = recordForSkill(runAndReadReport(fixture.root), "external-alpha").localContentDigest;
  await mkdir(join(fixture.root, "skills", "external-alpha", "empty-folder"));
  await chmod(skillFile, 0o755);
  const afterMetadataOnly = recordForSkill(runAndReadReport(fixture.root), "external-alpha").localContentDigest;
  await writeFile(skillFile, "# external-alpha\nchanged skill content\n", "utf8");
  const afterContentChange = recordForSkill(runAndReadReport(fixture.root), "external-alpha").localContentDigest;

  assert.equal(repeated, before);
  assert.equal(afterMetadataOnly, before);
  assert.notEqual(afterContentChange, before);
});

test("retains an unknown reason when a locked local skill directory is missing", async (t) => {
  const fixture = await makeFixture({ missingNames: ["external-alpha"] });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const record = recordForSkill(runAndReadReport(fixture.root), "external-alpha");
  assert.equal(record.localContentDigest, null);
  assert.equal(record.status, "verification-unknown");
  assert.match(record.reason, /見つからない|欠損|missing/i);
});

test("retains an unknown reason and null digest when a local skill contains a symlink", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const skillDirectory = join(fixture.root, "skills", "external-alpha");
  await symlink("SKILL.md", join(skillDirectory, "reference-link.md"), "file");
  const record = recordForSkill(runAndReadReport(fixture.root), basename(skillDirectory));

  assert.equal(record.localContentDigest, null);
  assert.equal(record.status, "verification-unknown");
  assert.match(record.reason, /シンボリックリンク|symbolic link|symlink/i);
});

test("compares only matching local digests and reports lock changes separately", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const baseline = runAndReadReport(fixture.root);
  baseline.records = baseline.records.map((record) => ({ ...record, upstreamTreeSha: "f".repeat(64) }));
  const baselinePath = join(fixture.root, "baseline.json");
  const baselineContent = JSON.stringify(baseline, null, 2);
  await writeFile(baselinePath, baselineContent, "utf8");

  const same = recordForSkill(runAndReadReport(fixture.root, ["--baseline", baselinePath]), "external-alpha");
  assert.equal(same.localComparison, "local-baseline-match");
  assert.equal(same.localComparisonReason, null);
  assert.equal(same.lockComparison.status, "lock-match");
  assert.equal(same.upstreamTreeSha, null);
  assert.equal(same.upstreamComparison.status, "verification-unknown");
  assert.equal(same.source, fixture.skills["external-alpha"].source);
  assert.equal(same.sourceUrl, fixture.skills["external-alpha"].sourceUrl);
  assert.equal(same.skillPath, fixture.skills["external-alpha"].skillPath);

  const lockPath = join(fixture.root, ".skill-lock.json");
  const changedLock = JSON.parse(await readFile(lockPath, "utf8"));
  changedLock.skills["external-alpha"].skillFolderHash = "b".repeat(40);
  await writeFile(lockPath, JSON.stringify(changedLock, null, 2), "utf8");
  const lockChanged = recordForSkill(runAndReadReport(fixture.root, ["--baseline", baselinePath]), "external-alpha");
  assert.equal(lockChanged.localComparison, "local-baseline-match");
  assert.equal(lockChanged.lockComparison.status, "lock-changed");

  changedLock.skills["external-alpha"].skillFolderHash = "a".repeat(40);
  await writeFile(lockPath, JSON.stringify(changedLock, null, 2), "utf8");
  await writeFile(join(fixture.root, "skills", "external-alpha", "SKILL.md"), "# changed\n", "utf8");
  const modified = recordForSkill(runAndReadReport(fixture.root, ["--baseline", baselinePath]), "external-alpha");
  assert.equal(modified.localComparison, "locally-modified");
  assert.equal(modified.lockComparison.status, "lock-match");
  assert.equal(await readFile(baselinePath, "utf8"), baselineContent);
});

test("keeps missing, malformed, mismatched, and null-digest baselines unknown with reasons", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const missingPath = join(fixture.root, "missing-baseline.json");
  const missingRecord = recordForSkill(runAndReadReport(fixture.root, ["--baseline", missingPath]), "external-alpha");
  assert.equal(missingRecord.localComparison, "verification-unknown");
  assert.match(missingRecord.localComparisonReason, /baseline|基準|見つから/i);

  const validBaseline = runAndReadReport(fixture.root);
  const baselinePath = join(fixture.root, "baseline.json");
  await writeFile(baselinePath, JSON.stringify({ ...validBaseline, records: {} }), "utf8");
  const malformedRecord = recordForSkill(runAndReadReport(fixture.root, ["--baseline", baselinePath]), "external-alpha");
  assert.equal(malformedRecord.localComparison, "verification-unknown");
  assert.match(malformedRecord.localComparisonReason, /schema|形式|records/i);

  await writeFile(baselinePath, JSON.stringify({
    ...validBaseline,
    digestAlgorithm: { ...validBaseline.digestAlgorithm, id: "other-algorithm" },
  }), "utf8");
  const algorithmRecord = recordForSkill(runAndReadReport(fixture.root, ["--baseline", baselinePath]), "external-alpha");
  assert.equal(algorithmRecord.localComparison, "verification-unknown");
  assert.match(algorithmRecord.localComparisonReason, /algorithm|アルゴリズム/i);

  const nullDigestBaseline = {
    ...validBaseline,
    records: validBaseline.records.map((record) => ({ ...record, localContentDigest: null })),
  };
  await writeFile(baselinePath, JSON.stringify(nullDigestBaseline), "utf8");
  const nullRecord = recordForSkill(runAndReadReport(fixture.root, ["--baseline", baselinePath]), "external-alpha");
  assert.equal(nullRecord.localComparison, "verification-unknown");
  assert.match(nullRecord.localComparisonReason, /digest|null|計測/i);
  assert.equal(nullRecord.lockComparison.status, "lock-match");
});

test("records declared customizations as unverified and missing declarations as unknown", async (t) => {
  const fixture = await makeFixture({ skillNames: ["external-alpha", "external-beta"] });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const customizationsPath = join(fixture.root, "customizations.json");
  const customizationsContent = JSON.stringify({
    skills: {
      "external-alpha": {
        type: "patch",
        reference: "patches/example.patch",
        reason: "local compatibility adjustment",
      },
    },
  }, null, 2);
  await writeFile(customizationsPath, customizationsContent, "utf8");

  const report = runAndReadReport(fixture.root, ["--customizations", customizationsPath]);
  const declared = recordForSkill(report, "external-alpha").customization;
  assert.equal(declared.status, "declared");
  assert.equal(declared.type, "patch");
  assert.equal(declared.reference, "patches/example.patch");
  assert.equal(declared.reason, "local compatibility adjustment");
  assert.equal(declared.validity, "unverified");
  assert.equal(report.customizationsInput.path, customizationsPath);
  assert.equal(report.customizationsInput.status, "loaded");
  assert.equal(recordForSkill(report, "external-beta").customization.status, "verification-unknown");
  assert.match(recordForSkill(report, "external-beta").customization.statusReason, /未指定|宣言/i);
  assert.equal(await readFile(customizationsPath, "utf8"), customizationsContent);

  const absent = runAndReadReport(fixture.root);
  assert.equal(absent.customizationsInput.status, "verification-unknown");
  assert.equal(recordForSkill(absent, "external-alpha").customization.status, "verification-unknown");

  const inlineDeclaration = JSON.stringify({
    skills: {
      "external-beta": {
        type: "wrapper",
        reference: "wrappers/beta.mjs",
        reason: "local wrapper",
      },
    },
  });
  const inline = runAndReadReport(fixture.root, ["--customizations", inlineDeclaration]);
  const wrapper = recordForSkill(inline, "external-beta").customization;
  assert.equal(inline.customizationsInput.source, "inline");
  assert.equal(inline.customizationsInput.path, null);
  assert.equal(wrapper.status, "declared");
  assert.equal(wrapper.type, "wrapper");
  assert.equal(wrapper.reference, "wrappers/beta.mjs");
  assert.equal(wrapper.reason, "local wrapper");
  assert.equal(wrapper.validity, "unverified");
});

test("preserves lock metadata and emits null for unavailable lock fields", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const lockPath = join(fixture.root, ".skill-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  for (const field of ["source", "sourceType", "sourceUrl", "skillPath", "installedAt", "updatedAt"]) {
    delete lock.skills["external-alpha"][field];
  }
  await writeFile(lockPath, JSON.stringify(lock), "utf8");

  const record = recordForSkill(runAndReadReport(fixture.root), "external-alpha");
  for (const field of ["source", "sourceType", "sourceUrl", "skillPath", "installedAt", "updatedAt"]) {
    assert.equal(record[field], null);
  }
  assert.deepEqual(record.lockMetadata, lock.skills["external-alpha"]);
});

test("measures the selected checkout HEAD tree and compares it only with the GitHub lock hash", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const checkout = await makeUpstreamCheckout(fixture.root, { origin: "git@github.com:fixture/local-skills.git" });
  const skillPath = "skills/external-alpha/SKILL.md";
  const lockPath = join(fixture.root, ".skill-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.skills["external-alpha"].skillFolderHash = gitAt(checkout, "rev-parse", `HEAD:${dirname(skillPath)}`);
  await writeFile(lockPath, JSON.stringify(lock, null, 2), "utf8");
  const upstreamConfigPath = join(fixture.root, "upstream-checkouts.json");
  await writeFile(upstreamConfigPath, JSON.stringify({ sources: { "fixture/local-skills": checkout } }), "utf8");

  const matching = recordForSkill(runAndReadReport(fixture.root, ["--upstream-checkouts", upstreamConfigPath]), "external-alpha");
  const originalTree = gitAt(checkout, "rev-parse", `HEAD:${dirname(skillPath)}`);
  assert.equal(matching.upstreamTreeSha, originalTree);
  assert.equal(matching.upstream.source, "fixture/local-skills");
  assert.equal(matching.upstream.ref, "HEAD");
  assert.equal(matching.upstream.skillPath, skillPath);
  assert.equal(matching.upstream.commit, gitAt(checkout, "rev-parse", "HEAD"));
  assert.equal(matching.upstream.treeSha, originalTree);
  assert.equal(matching.upstream.treeSha, gitAt(checkout, "rev-parse", `${matching.upstream.commit}:${dirname(skillPath)}`));
  assert.equal(matching.upstreamComparison.status, "upstream-lock-match");
  assert.equal(matching.status, "verification-unknown");

  const upstreamSkill = join(checkout, ...skillPath.split("/"));
  await writeFile(upstreamSkill, "# uncommitted\ncontent outside git objects\n", "utf8");
  const dirty = recordForSkill(runAndReadReport(fixture.root, ["--upstream-checkouts", upstreamConfigPath]), "external-alpha");
  assert.equal(dirty.upstream.treeSha, originalTree);
  assert.equal(dirty.upstream.workingTreeDirty, true);
  assert.match(dirty.upstream.workingTreeNote, /HEAD|Git object|未反映/i);
  assert.equal(dirty.upstreamComparison.status, "upstream-lock-match");

  gitAt(checkout, "add", skillPath);
  gitAt(checkout, "commit", "-m", "change fixture skill");
  const changed = recordForSkill(runAndReadReport(fixture.root, ["--upstream-checkouts", upstreamConfigPath]), "external-alpha");
  assert.notEqual(changed.upstream.treeSha, originalTree);
  assert.equal(changed.upstreamComparison.status, "lock-update-needed");
  assert.equal(changed.upstream.ref, "HEAD");
});

test("measures a root-level SKILL.md as the selected commit root tree", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const checkout = await makeUpstreamCheckout(fixture.root, { skillPath: "SKILL.md" });
  const lockPath = join(fixture.root, ".skill-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.skills["external-alpha"].skillPath = "SKILL.md";
  lock.skills["external-alpha"].skillFolderHash = gitAt(checkout, "rev-parse", "HEAD^{tree}");
  await writeFile(lockPath, JSON.stringify(lock, null, 2), "utf8");
  const upstreamConfigPath = join(fixture.root, "upstream-checkouts.json");
  await writeFile(upstreamConfigPath, JSON.stringify({ sources: { "fixture/local-skills": checkout } }), "utf8");

  const record = recordForSkill(runAndReadReport(fixture.root, ["--upstream-checkouts", upstreamConfigPath]), "external-alpha");
  assert.equal(record.upstream.status, "measured");
  assert.equal(record.upstream.ref, "HEAD");
  assert.equal(record.upstream.skillPath, "SKILL.md");
  assert.equal(record.upstream.treeSha, gitAt(checkout, "rev-parse", `${record.upstream.commit}^{tree}`));
  assert.equal(record.upstreamComparison.status, "upstream-lock-match");
});

test("keeps upstream measurement unknown for absent input, missing path, wrong origin, and non-GitHub locks", async (t) => {
  const fixture = await makeFixture({ skillNames: ["external-alpha", "external-beta", "external-gamma"] });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const absent = recordForSkill(runAndReadReport(fixture.root), "external-alpha");
  assert.equal(absent.upstreamComparison.status, "verification-unknown");
  assert.match(absent.upstreamComparison.reason, /provided|指定|未取得/i);

  const wrongOriginCheckout = await makeUpstreamCheckout(fixture.root, { origin: "https://github.com/someone/else.git", directoryName: "wrong-origin-checkout" });
  const matchingCheckout = await makeUpstreamCheckout(fixture.root, { origin: "https://github.com/fixture/local-skills.git", directoryName: "matching-checkout" });
  const lockPath = join(fixture.root, ".skill-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.skills["external-alpha"].source = "fixture/wrong-origin";
  lock.skills["external-beta"].skillPath = "skills/not-present/SKILL.md";
  lock.skills["external-gamma"].sourceType = "git";
  await writeFile(lockPath, JSON.stringify(lock, null, 2), "utf8");
  const upstreamConfigPath = join(fixture.root, "upstream-checkouts.json");
  await writeFile(upstreamConfigPath, JSON.stringify({ sources: {
    "fixture/wrong-origin": wrongOriginCheckout,
    "fixture/local-skills": matchingCheckout,
  } }), "utf8");

  const report = runAndReadReport(fixture.root, ["--upstream-checkouts", upstreamConfigPath]);
  const wrongOrigin = recordForSkill(report, "external-alpha");
  assert.equal(wrongOrigin.upstream.treeSha, null);
  assert.equal(wrongOrigin.upstreamComparison.status, "verification-unknown");
  assert.match(wrongOrigin.upstreamComparison.reason, /origin|source|一致/i);

  const missingPath = recordForSkill(report, "external-beta");
  assert.equal(missingPath.upstream.treeSha, null);
  assert.equal(missingPath.upstreamComparison.status, "verification-unknown");
  assert.match(missingPath.upstreamComparison.reason, /path|見つか|missing/i);

  const nonGithub = recordForSkill(report, "external-gamma");
  assert.equal(nonGithub.upstream.treeSha, null);
  assert.equal(nonGithub.upstreamComparison.status, "verification-unknown");
  assert.match(nonGithub.upstreamComparison.reason, /github|GitHub/i);
  for (const record of report.records) assert.equal(record.status, "verification-unknown");

  lock.version = 2;
  await writeFile(lockPath, JSON.stringify(lock, null, 2), "utf8");
  const oldLock = recordForSkill(runAndReadReport(fixture.root, ["--upstream-checkouts", upstreamConfigPath]), "external-alpha");
  assert.equal(oldLock.upstreamComparison.status, "verification-unknown");
  assert.match(oldLock.upstreamComparison.reason, /version 3|v3/i);
});

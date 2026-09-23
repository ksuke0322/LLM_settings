import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveCodexBinary } from "./codex-delegate.mjs";

const wrapperPath = fileURLToPath(new URL("./codex-delegate.mjs", import.meta.url));
const sessionId = "2bd9432c-6f3c-4faf-91ec-e48ba109b755";
const resumedSessionId = "2bd9432c-6f3c-4faf-91ec-e48ba109b755";

const fakeCodexSource = `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { utimesSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { prompt += chunk; });
process.stdin.on("end", () => {
  const capturePath = process.env.TEST_CAPTURE_PATH;
  if (capturePath) writeFileSync(capturePath, JSON.stringify({
    args,
    prompt,
    cwd: process.cwd(),
    codexHomePresent: process.env.CODEX_HOME === process.env.TEST_EXPECT_CODEX_HOME,
  }));
  const mode = process.env.TEST_FAKE_MODE ?? "success";
  process.stderr.write("stderr-only-marker");
  if (mode === "sleep") {
    const markerPath = process.env.TEST_CHILD_MARKER;
    spawn(process.execPath, ["-e", "setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'alive'), 350)", markerPath], { stdio: "ignore" });
    setInterval(() => {}, 1000);
    return;
  }
  if (mode === "mutate") writeFileSync(process.env.TEST_MUTATION_PATH, "changed by fake Codex");
  if (mode === "touch-directory") utimesSync(process.env.TEST_MUTATION_PATH, new Date(), new Date());
  const threadId = process.env.TEST_THREAD_ID ?? "${sessionId}";
  if (mode === "invalid-json") process.stdout.write("not-json\\n");
  if (mode !== "missing-session") process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: threadId }) + "\\n");
  if (mode === "conflicting-session") process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "d46dcb4b-2457-4ac9-a725-535775222865" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "assistant-output" } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "turn.completed" }) + "\\n");
  const outputIndex = args.findIndex(value => value === "--output-last-message" || value === "-o");
  if (outputIndex >= 0) {
    const outputPath = args[outputIndex + 1];
    const response = mode === "invalid-result"
      ? { status: "PARTIAL", summary: "partial", changedFiles: [], tests: [] }
      : { status: mode === "blocked-result" ? "BLOCKED" : "DONE", summary: "finished", changedFiles: [], tests: [] };
    writeFileSync(outputPath, JSON.stringify(response));
  }
  process.exitCode = mode === "nonzero" ? 7 : 0;
});
`;

const makeHarness = async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-delegate-test-"));
  const cwd = join(root, "workspace");
  const artifactsRoot = join(root, "artifacts");
  const fakeCodex = join(root, "fake-codex.mjs");
  await mkdir(cwd, { recursive: true });
  await writeFile(fakeCodex, fakeCodexSource, "utf8");
  await chmod(fakeCodex, 0o755);

  const invoke = async (request, {
    mode = "success",
    threadId = sessionId,
    timeoutMs,
    childMarker,
    mutationPath,
    codexBin = fakeCodex,
    codexCliBin = "",
    pathOverride = process.env.PATH,
  } = {}) => {
    const capturePath = join(root, `capture-${Date.now()}-${Math.random()}.json`);
    const args = [wrapperPath];
    if (codexBin !== null) args.push("--codex-bin", codexBin);
    args.push("--artifacts-root", artifactsRoot);
    const child = spawn(process.execPath, args, {
      cwd,
      env: {
        ...process.env,
        PATH: pathOverride,
        CODEX_CLI_BIN: codexCliBin,
        TEST_CAPTURE_PATH: capturePath,
        TEST_FAKE_MODE: mode,
        TEST_THREAD_ID: threadId,
        TEST_CHILD_MARKER: childMarker ?? "",
        TEST_MUTATION_PATH: mutationPath ?? "",
        TEST_PRIVATE_VALUE: "do-not-write-this-environment-value",
        CODEX_HOME: join(root, "codex-home"),
        TEST_EXPECT_CODEX_HOME: join(root, "codex-home"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.stdin.end(JSON.stringify({
      purpose: "Verify the delegation wrapper",
      acceptanceCriteria: ["Return a valid result"],
      cwd,
      permission: "read-only",
      allowedPaths: [],
      prohibitedOperations: ["Do not change unrelated files"],
      continuationId: "63d97cc8-526b-4324-9052-82dc89d6e28a",
      timeoutMs: timeoutMs ?? 5000,
      prompt: "PROMPT_SENTINEL: inspect only the supplied task",
      ...request,
    }));
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", code => resolve(code));
    });
    const output = Buffer.concat(stdout).toString("utf8");
    const error = Buffer.concat(stderr).toString("utf8");
    return {
      exitCode,
      output,
      error,
      capturePath,
      readCapture: async () => JSON.parse(await readFile(capturePath, "utf8")),
      parseResult: () => JSON.parse(output.trim()),
    };
  };

  return { root, cwd, fakeCodex, artifactsRoot, invoke, cleanup: () => rm(root, { recursive: true, force: true }) };
};

test("Codex CLI selection honors explicit and environment overrides, then safe platform defaults", async () => {
  const harness = await makeHarness();
  try {
    const homebrewDir = join(harness.root, "homebrew");
    const pathDir = join(harness.root, "path-bin");
    const nonExecutableDir = join(harness.root, "non-executable");
    await Promise.all([mkdir(homebrewDir), mkdir(pathDir), mkdir(nonExecutableDir)]);
    const preferredBin = join(homebrewDir, "codex");
    const pathBin = join(pathDir, "codex");
    const nonExecutableBin = join(nonExecutableDir, "codex");
    await Promise.all([
      writeFile(preferredBin, fakeCodexSource, "utf8"),
      writeFile(pathBin, fakeCodexSource, "utf8"),
      writeFile(nonExecutableBin, fakeCodexSource, "utf8"),
    ]);
    await Promise.all([chmod(preferredBin, 0o755), chmod(pathBin, 0o755), chmod(nonExecutableBin, 0o644)]);

    assert.equal(await resolveCodexBinary({
      explicitBin: "codex-exact-as-specified",
      env: { CODEX_CLI_BIN: nonExecutableBin, PATH: pathDir },
      platform: "darwin",
      preferredBin,
    }), "codex-exact-as-specified");
    assert.equal(await resolveCodexBinary({
      env: { CODEX_CLI_BIN: pathBin, PATH: pathDir },
      platform: "darwin",
      preferredBin,
    }), pathBin);
    assert.equal(await resolveCodexBinary({
      env: { PATH: pathDir },
      platform: "darwin",
      preferredBin,
    }), preferredBin);
    assert.equal(await resolveCodexBinary({
      env: { PATH: pathDir },
      platform: "linux",
      preferredBin,
    }), pathBin);
    assert.equal(await resolveCodexBinary({
      env: { PATH: pathDir },
      platform: "darwin",
      preferredBin: nonExecutableBin,
    }), pathBin);
    await assert.rejects(resolveCodexBinary({
      env: { PATH: nonExecutableDir },
      platform: "linux",
      preferredBin: join(harness.root, "missing-codex"),
    }), /No executable Codex CLI was found/);
  } finally {
    await harness.cleanup();
  }
});

test("CODEX_CLI_BIN is used when --codex-bin is omitted", async () => {
  const harness = await makeHarness();
  try {
    const isolatedPath = join(harness.root, "node-only-path");
    await mkdir(isolatedPath);
    await symlink(process.execPath, join(isolatedPath, "node"));
    const run = await harness.invoke({}, {
      codexBin: null,
      codexCliBin: harness.fakeCodex,
      pathOverride: isolatedPath,
    });
    assert.equal(run.exitCode, 0, run.error);
    assert.equal(run.parseResult().status, "DONE");
  } finally {
    await harness.cleanup();
  }
});

const readArtifacts = async result => {
  const resultJson = JSON.parse(await readFile(join(result.artifactsDir, "result.json"), "utf8"));
  const metadata = JSON.parse(await readFile(join(result.artifactsDir, "run-metadata.json"), "utf8"));
  const events = await readFile(join(result.artifactsDir, "events.jsonl"), "utf8");
  const progress = await readFile(join(result.artifactsDir, "progress.log"), "utf8");
  return { resultJson, metadata, events, progress };
};

test("spawns codex directly with a fixed model, max effort, and prompt on stdin", async () => {
  const harness = await makeHarness();
  try {
    const run = await harness.invoke({});
    assert.equal(run.exitCode, 0, run.error);
    const result = run.parseResult();
    const capture = await run.readCapture();
    const canonicalCwd = await realpath(harness.cwd);
    assert.equal(result.status, "DONE");
    assert.equal(capture.prompt.includes("PROMPT_SENTINEL"), true);
    assert.equal(capture.args.includes("PROMPT_SENTINEL: inspect only the supplied task"), false);
    assert.equal(capture.args.includes("--model") && capture.args[capture.args.indexOf("--model") + 1] === "gpt-5.6-luna", true);
    assert.equal(capture.args.includes('model_reasoning_effort="max"'), true);
    assert.equal(capture.args.includes("--sandbox") && capture.args[capture.args.indexOf("--sandbox") + 1] === "read-only", true);
    assert.equal(capture.args.includes("--cd") && capture.args[capture.args.indexOf("--cd") + 1] === canonicalCwd, true);
    assert.equal(capture.args.includes("--ignore-user-config"), true);
    assert.equal(capture.args.includes("--disable") && capture.args[capture.args.indexOf("--disable") + 1] === "multi_agent", true);
    assert.equal(capture.args.at(-1), "-");
    assert.equal(capture.args.includes("PROMPT_SENTINEL"), false);
    assert.equal(capture.codexHomePresent, true);
    assert.equal(result.sessionId, sessionId);

    const artifacts = await readArtifacts(result);
    assert.equal(artifacts.resultJson.status, "DONE");
    assert.match(artifacts.events, /assistant-output/);
    assert.doesNotMatch(run.output, /assistant-output|stderr-only-marker/);
    assert.doesNotMatch(artifacts.events, /stderr-only-marker/);
    assert.doesNotMatch(artifacts.progress, /assistant-output|stderr-only-marker/);
    assert.match(artifacts.progress, /stderrBytes=\d+/);
    assert.doesNotMatch(artifacts.metadata + artifacts.progress, /PROMPT_SENTINEL|do-not-write-this-environment-value|codex-home/);
    assert.deepEqual((await readdir(result.artifactsDir)).sort(), ["events.jsonl", "progress.log", "result.json", "run-metadata.json"]);
  } finally {
    await harness.cleanup();
  }
});

test("approved writes require an explicit scope and use workspace-write", async () => {
  const harness = await makeHarness();
  try {
    const allowedPath = join(await realpath(harness.cwd), "src");
    const run = await harness.invoke({
      permission: "approved-write",
      allowedPaths: [allowedPath],
    });
    assert.equal(run.exitCode, 0, run.error);
    const capture = await run.readCapture();
    assert.equal(capture.args.includes("--sandbox") && capture.args[capture.args.indexOf("--sandbox") + 1] === "workspace-write", true);
    assert.match(capture.prompt, /approved-write/);
    assert.match(capture.prompt, new RegExp(allowedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(capture.prompt, /Do not start or request another agent/);
  } finally {
    await harness.cleanup();
  }
});

test("unapproved permissions fail closed without spawning Codex", async () => {
  const harness = await makeHarness();
  try {
    const run = await harness.invoke({ permission: "unapproved" });
    assert.equal(run.exitCode, 2, run.error);
    const result = run.parseResult();
    assert.equal(result.status, "BLOCKED");
    await assert.rejects(readFile(run.capturePath, "utf8"), { code: "ENOENT" });
    const artifacts = await readArtifacts(result);
    assert.equal(artifacts.resultJson.status, "BLOCKED");
  } finally {
    await harness.cleanup();
  }
});

test("unknown permissions and paths outside cwd fail closed", async () => {
  const harness = await makeHarness();
  try {
    const unknown = await harness.invoke({ permission: "maybe" });
    assert.equal(unknown.exitCode, 2, unknown.error);
    assert.equal(unknown.parseResult().status, "BLOCKED");
    await assert.rejects(readFile(unknown.capturePath, "utf8"), { code: "ENOENT" });

    const outsidePath = join(harness.root, "outside");
    const outside = await harness.invoke({ permission: "approved-write", allowedPaths: [outsidePath] });
    assert.equal(outside.exitCode, 2, outside.error);
    assert.equal(outside.parseResult().status, "BLOCKED");
    await assert.rejects(readFile(outside.capturePath, "utf8"), { code: "ENOENT" });
  } finally {
    await harness.cleanup();
  }
});

test("read-only execution fails if Codex mutates any workspace file", async () => {
  const harness = await makeHarness();
  try {
    const target = join(harness.cwd, "source.txt");
    await writeFile(target, "original content", "utf8");
    const run = await harness.invoke({}, { mode: "mutate", mutationPath: target });
    assert.equal(run.exitCode, 1, run.error);
    const result = run.parseResult();
    assert.equal(result.status, "FAILED");
    assert.match(result.summary, /read-only execution changed workspace files/i);
  } finally {
    await harness.cleanup();
  }
});

test("read-only execution ignores directory timestamp changes without content changes", async () => {
  const harness = await makeHarness();
  try {
    const directory = join(harness.cwd, "metadata");
    await mkdir(directory);
    const run = await harness.invoke({}, { mode: "touch-directory", mutationPath: directory });
    assert.equal(run.exitCode, 0, run.error);
    assert.equal(run.parseResult().status, "DONE");
  } finally {
    await harness.cleanup();
  }
});

test("approved-write fails if Codex mutates a workspace path outside its approved scope", async () => {
  const harness = await makeHarness();
  try {
    const allowedPath = join(await realpath(harness.cwd), "allowed");
    const outsidePath = join(await realpath(harness.cwd), "outside.txt");
    await mkdir(allowedPath);
    await writeFile(outsidePath, "original content", "utf8");
    const run = await harness.invoke({
      permission: "approved-write",
      allowedPaths: [allowedPath],
    }, { mode: "mutate", mutationPath: outsidePath });
    assert.equal(run.exitCode, 1, run.error);
    const result = run.parseResult();
    assert.equal(result.status, "FAILED");
    assert.match(result.summary, /approved write scope/i);
    assert.deepEqual(result.changedFiles, ["outside.txt"]);
  } finally {
    await harness.cleanup();
  }
});

test("approved-write permits mutations contained in its approved scope", async () => {
  const harness = await makeHarness();
  try {
    const allowedPath = join(await realpath(harness.cwd), "allowed");
    await mkdir(allowedPath);
    const target = join(allowedPath, "inside.txt");
    await writeFile(target, "original content", "utf8");
    const run = await harness.invoke({
      permission: "approved-write",
      allowedPaths: [allowedPath],
    }, { mode: "mutate", mutationPath: target });
    assert.equal(run.exitCode, 0, run.error);
    assert.equal(run.parseResult().status, "DONE");
  } finally {
    await harness.cleanup();
  }
});

test("resume uses the session ID from the prior run and the resume-compatible argv layout", async () => {
  const harness = await makeHarness();
  try {
    const first = await harness.invoke({});
    assert.equal(first.exitCode, 0, first.error);
    const firstResult = first.parseResult();
    const resumed = await harness.invoke({ resumeSessionId: firstResult.sessionId });
    assert.equal(resumed.exitCode, 0, resumed.error);
    const result = resumed.parseResult();
    const capture = await resumed.readCapture();
    assert.equal(result.status, "DONE");
    assert.deepEqual(capture.args.slice(0, 2), ["exec", "resume"]);
    assert.equal(capture.args.includes(resumedSessionId), true);
    assert.equal(capture.args.at(-1), "-");
    assert.equal(capture.args.includes("--sandbox"), false);
    assert.equal(capture.args.includes("--cd"), false);
    assert.equal(capture.args.includes("-s"), false);
    assert.equal(capture.args.includes("-C"), false);
    assert.equal(capture.args.includes('sandbox_mode="read-only"'), true);
    assert.equal(capture.args.includes("--ignore-user-config"), true);
    assert.equal(capture.args.includes("--strict-config"), true);
    assert.equal(capture.cwd, await realpath(harness.cwd));
    assert.equal(result.sessionId, resumedSessionId);
  } finally {
    await harness.cleanup();
  }
});

test("resume rejects a different continuation identity without spawning Codex", async () => {
  const harness = await makeHarness();
  try {
    const first = await harness.invoke({});
    assert.equal(first.exitCode, 0, first.error);
    const previous = first.parseResult();
    const changed = await harness.invoke({ resumeSessionId: previous.sessionId, continuationId: "d4de96ac-5f1c-4f19-9272-87d47d8453fa" });
    assert.equal(changed.exitCode, 2, changed.error);
    assert.equal(changed.parseResult().status, "BLOCKED");
    await assert.rejects(readFile(changed.capturePath, "utf8"), { code: "ENOENT" });
  } finally {
    await harness.cleanup();
  }
});

test("resume rejects prior FAILED or BLOCKED runs", async t => {
  for (const mode of ["nonzero", "blocked-result"]) {
    await t.test(mode, async () => {
      const harness = await makeHarness();
      try {
        const prior = await harness.invoke({}, { mode });
        const priorResult = prior.parseResult();
        assert.equal(priorResult.sessionId, sessionId);
        assert.equal(priorResult.status, mode === "nonzero" ? "FAILED" : "BLOCKED");
        const resumed = await harness.invoke({ resumeSessionId: priorResult.sessionId });
        assert.equal(resumed.exitCode, 2, resumed.error);
        assert.equal(resumed.parseResult().status, "BLOCKED");
        await assert.rejects(readFile(resumed.capturePath, "utf8"), { code: "ENOENT" });
      } finally {
        await harness.cleanup();
      }
    });
  }
});

test("resume binds purpose, acceptance criteria, and prohibited operations but not prompt text", async () => {
  const harness = await makeHarness();
  try {
    const first = await harness.invoke({});
    const session = first.parseResult().sessionId;
    const changedContracts = [
      { purpose: "A different purpose" },
      { acceptanceCriteria: ["A different criterion"] },
      { prohibitedOperations: ["A different prohibition"] },
    ];
    for (const change of changedContracts) {
      const run = await harness.invoke({ resumeSessionId: session, ...change });
      assert.equal(run.exitCode, 2, run.error);
      assert.equal(run.parseResult().status, "BLOCKED");
      await assert.rejects(readFile(run.capturePath, "utf8"), { code: "ENOENT" });
    }

    const promptOnly = await harness.invoke({ resumeSessionId: session, prompt: "Updated continuation details" });
    assert.equal(promptOnly.exitCode, 0, promptOnly.error);
    assert.equal(promptOnly.parseResult().status, "DONE");
  } finally {
    await harness.cleanup();
  }
});

test("missing or conflicting session IDs, malformed JSONL, invalid results, and nonzero exits are failures", async t => {
  for (const mode of ["missing-session", "conflicting-session", "invalid-json", "invalid-result", "nonzero"]) {
    await t.test(mode, async () => {
      const harness = await makeHarness();
      try {
        const run = await harness.invoke({}, { mode });
        assert.equal(run.exitCode, 1, run.error);
        assert.notEqual(run.output.trim(), "", run.error);
        assert.equal(run.parseResult().status, "FAILED");
      } finally {
        await harness.cleanup();
      }
    });
  }
});

test("timeout terminates the Codex process group", async () => {
  const harness = await makeHarness();
  try {
    const marker = join(harness.root, "child-survived-timeout");
    const run = await harness.invoke({}, { mode: "sleep", timeoutMs: 100, childMarker: marker });
    assert.equal(run.exitCode, 1, run.error);
    assert.notEqual(run.output.trim(), "", run.error);
    assert.equal(run.parseResult().status, "FAILED");
    await new Promise(resolve => setTimeout(resolve, 500));
    await assert.rejects(readFile(marker, "utf8"), { code: "ENOENT" });
  } finally {
    await harness.cleanup();
  }
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runPlaywrightLocal } from "./run-playwright-local.mjs";

const makeHarness = async ({ browser = true } = {}) => {
  const root = await mkdtemp(join(tmpdir(), "prepared-playwright-runner-test-"));
  const preparedRoot = join(root, "prepared", "node_modules", "playwright");
  const scriptPath = join(root, "task.mjs");
  const capturePath = join(root, "capture.json");
  await mkdir(preparedRoot, { recursive: true });
  await writeFile(join(preparedRoot, "package.json"), JSON.stringify({
    name: "playwright",
    main: "index.cjs",
    exports: { ".": { require: "./index.cjs", import: "./index.mjs" } },
  }));
  await writeFile(join(preparedRoot, "index.cjs"), [
    "const { join } = require('node:path');",
    "exports.chromium = { executablePath: () => join(__dirname, 'browser') };",
    "exports.version = 'fixture-only';",
  ].join("\n"));
  await writeFile(join(preparedRoot, "index.mjs"), [
    "import { fileURLToPath } from 'node:url';",
    "export const chromium = { executablePath: () => fileURLToPath(new URL('./browser', import.meta.url)) };",
    "export const version = 'fixture-only';",
  ].join("\n"));
  if (browser) {
    await writeFile(join(preparedRoot, "browser"), [
      "#!/bin/sh",
      "if [ -n \"$TEST_FORBIDDEN_ATTEMPTS\" ]; then printf 'browser\\n' >> \"$TEST_FORBIDDEN_ATTEMPTS\"; fi",
      "exit 0",
    ].join("\n"));
    await chmod(join(preparedRoot, "browser"), 0o755);
  }
  await writeFile(scriptPath, [
    "import { symlink, writeFile } from 'node:fs/promises';",
    "import { join } from 'node:path';",
    "const out = process.env.PLAYWRIGHT_OUTPUT_DIR;",
    "await writeFile(process.env.TEST_CAPTURE_PATH, JSON.stringify({ cwd: process.cwd(), out }));",
    "await writeFile(join(out, 'copy.txt'), 'copied');",
    "await writeFile(join(out, 'private.txt'), 'private');",
    "await writeFile(join(out, 'existing.txt'), 'new value');",
    "await symlink(join(out, 'private.txt'), join(out, 'linked.txt'));",
    "process.exitCode = Number(process.env.TEST_EXIT_CODE ?? 0);",
  ].join("\n"));

  return {
    root,
    preparedRoot,
    scriptPath,
    capturePath,
    invoke: async (options = {}) => {
      const previousCapture = process.env.TEST_CAPTURE_PATH;
      const previousExitCode = process.env.TEST_EXIT_CODE;
      process.env.TEST_CAPTURE_PATH = capturePath;
      process.env.TEST_EXIT_CODE = String(options.childExitCode ?? 0);
      const { childExitCode, ...request } = options;
      try {
        return await runPlaywrightLocal({ scriptPath, preparedRoot, ...request });
      } finally {
        if (previousCapture === undefined) delete process.env.TEST_CAPTURE_PATH;
        else process.env.TEST_CAPTURE_PATH = previousCapture;
        if (previousExitCode === undefined) delete process.env.TEST_EXIT_CODE;
        else process.env.TEST_EXIT_CODE = previousExitCode;
      }
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
};

const waitAtMost = async (promise, timeoutMs) => {
  let timer;
  const timeout = new Promise(resolveTimeout => {
    timer = setTimeout(() => resolveTimeout({ timedOut: true }), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const stopFixtureProcess = async pid => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  const exited = async timeoutMs => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code === "ESRCH") return true;
        throw error;
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 25));
    }
    return false;
  };

  for (const [signal, timeoutMs] of [["SIGTERM", 1000], ["SIGKILL", 5000]]) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    if (await exited(timeoutMs)) return;
  }
};

const installForbiddenSentinels = async harness => {
  const binDir = join(harness.root, "sentinel-bin");
  const markerPath = join(harness.root, "forbidden-attempts.log");
  await mkdir(binDir);
  for (const command of ["npm", "npx"]) {
    const path = join(binDir, command);
    await writeFile(path, `#!/bin/sh\nprintf '${command}\\n' >> "$TEST_FORBIDDEN_ATTEMPTS"\nexit 97\n`);
    await chmod(path, 0o755);
  }
  await writeFile(join(harness.root, "run.js"), "require('node:fs').appendFileSync(process.env.TEST_FORBIDDEN_ATTEMPTS, 'run.js\\n');\n");
  return { binDir, markerPath };
};

const withForbiddenSentinels = async (harness, operation) => {
  const { binDir, markerPath } = await installForbiddenSentinels(harness);
  const previousPath = process.env.PATH;
  const previousMarker = process.env.TEST_FORBIDDEN_ATTEMPTS;
  process.env.PATH = `${binDir}${delimiter}${previousPath ?? ""}`;
  process.env.TEST_FORBIDDEN_ATTEMPTS = markerPath;
  try {
    const result = await operation();
    await assert.rejects(readFile(markerPath, "utf8"), { code: "ENOENT" });
    return result;
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousMarker === undefined) delete process.env.TEST_FORBIDDEN_ATTEMPTS;
    else process.env.TEST_FORBIDDEN_ATTEMPTS = previousMarker;
  }
};

test("runs from a fresh temporary cwd and removes only that run directory", async () => {
  const harness = await makeHarness();
  try {
    const olderRun = join(harness.root, "older-run");
    await mkdir(olderRun);
    const result = await harness.invoke();
    const capture = JSON.parse(await readFile(harness.capturePath, "utf8"));
    assert.equal(result.exitCode, 0);
    assert.equal(result.reason, undefined);
    assert.equal(basename(capture.cwd), basename(result.runDir));
    assert.equal(capture.cwd.startsWith(await realpath(tmpdir())), true);
    assert.equal(capture.out, result.runDir);
    await assert.rejects(readdir(result.runDir), { code: "ENOENT" });
    assert.deepEqual(await readdir(olderRun), []);
  } finally {
    await harness.cleanup();
  }
});

test("missing prepared dependency and missing browser executable are non-successes", async t => {
  await t.test("dependency absent", async () => {
    const harness = await makeHarness();
    try {
      const result = await withForbiddenSentinels(harness, () => harness.invoke({
        preparedRoot: join(harness.root, "missing-playwright"),
      }));
      assert.notEqual(result.exitCode, 0);
      assert.equal(result.reason, "PLAYWRIGHT_NOT_PREPARED");
      await assert.rejects(readFile(harness.capturePath, "utf8"), { code: "ENOENT" });
      await assert.rejects(readdir(result.runDir), { code: "ENOENT" });
    } finally {
      await harness.cleanup();
    }
  });

  await t.test("browser absent", async () => {
    const harness = await makeHarness({ browser: false });
    try {
      const result = await withForbiddenSentinels(harness, () => harness.invoke());
      assert.notEqual(result.exitCode, 0);
      assert.equal(result.reason, "BROWSER_NOT_PREPARED");
      await assert.rejects(readFile(harness.capturePath, "utf8"), { code: "ENOENT" });
      await assert.rejects(readdir(result.runDir), { code: "ENOENT" });
    } finally {
      await harness.cleanup();
    }
  });
});

test("self-contained .mjs and .cjs scripts load Playwright and export named artifacts", async t => {
  for (const extension of ["mjs", "cjs"]) {
    await t.test(extension, async () => {
      const harness = await makeHarness();
      const outputDir = join(harness.root, `output-${extension}`);
      const scriptPath = join(harness.root, `playwright.${extension}`);
      const source = extension === "mjs"
        ? [
          "import { chromium, version } from 'playwright';",
          "import { writeFile } from 'node:fs/promises';",
          "import { join } from 'node:path';",
          "const prepared = chromium.executablePath().endsWith('/browser');",
          "await writeFile(join(process.env.PLAYWRIGHT_OUTPUT_DIR, 'api-result.txt'), `${version}:${prepared}`);",
        ].join("\n")
        : [
          "const { chromium, version } = require('playwright');",
          "const { writeFileSync } = require('node:fs');",
          "const { join } = require('node:path');",
          "const prepared = chromium.executablePath().endsWith('/browser');",
          "writeFileSync(join(process.env.PLAYWRIGHT_OUTPUT_DIR, 'api-result.txt'), `${version}:${prepared}`);",
        ].join("\n");
      try {
        await writeFile(scriptPath, source);
        const result = await harness.invoke({
          scriptPath,
          outputDir,
          artifactBasenames: ["api-result.txt"],
        });
        assert.equal(result.exitCode, 0, result.message);
        assert.deepEqual(await readdir(outputDir), ["api-result.txt"]);
        assert.equal(await readFile(join(outputDir, "api-result.txt"), "utf8"), "fixture-only:true");
      } finally {
        await harness.cleanup();
      }
    });
  }
});

test("preserves child failure while exporting only explicit regular non-symlink artifacts", async () => {
  const harness = await makeHarness();
  const outputDir = join(harness.root, "published");
  try {
    await mkdir(outputDir);
    await writeFile(join(outputDir, "existing.txt"), "original value");
    const result = await harness.invoke({
      outputDir,
      artifactBasenames: ["copy.txt", "existing.txt", "linked.txt"],
      childExitCode: "7",
    });
    assert.equal(result.exitCode, 7);
    assert.equal(result.reason, "SCRIPT_EXITED_NONZERO");
    assert.equal(await readFile(join(outputDir, "copy.txt"), "utf8"), "copied");
    assert.equal(await readFile(join(outputDir, "existing.txt"), "utf8"), "original value");
    await assert.rejects(readFile(join(outputDir, "private.txt"), "utf8"), { code: "ENOENT" });
    await assert.rejects(readFile(join(outputDir, "linked.txt"), "utf8"), { code: "ENOENT" });
    assert.ok(result.artifactErrors.length >= 2);
    await assert.rejects(readdir(result.runDir), { code: "ENOENT" });
  } finally {
    await harness.cleanup();
  }
});

test("returns a nonzero result and cleans up when spawning the child fails", async () => {
  const harness = await makeHarness();
  const descriptor = Object.getOwnPropertyDescriptor(process, "execPath");
  try {
    Object.defineProperty(process, "execPath", {
      ...descriptor,
      value: join(harness.root, "missing-node"),
    });
    const result = await harness.invoke();
    assert.notEqual(result.exitCode, 0);
    assert.equal(result.reason, "CHILD_START_FAILED");
    await assert.rejects(readdir(result.runDir), { code: "ENOENT" });
  } finally {
    Object.defineProperty(process, "execPath", descriptor);
    await harness.cleanup();
  }
});

test("CLI forwards SIGTERM and removes the current run directory", async () => {
  const harness = await makeHarness();
  const cliPath = fileURLToPath(new URL("./run-playwright-local.mjs", import.meta.url));
  const markerPath = join(harness.root, "signal-capture.json");
  const olderRun = join(harness.root, "older-run");
  const previousCapture = process.env.TEST_CAPTURE_PATH;
  let child;
  let closed;
  let childClosed = false;
  let capture;
  let signalTestPassed = false;
  let stderr = "";
  try {
    await mkdir(olderRun);
    await writeFile(harness.scriptPath, [
      "import { writeFile } from 'node:fs/promises';",
      "await writeFile(process.env.TEST_CAPTURE_PATH, JSON.stringify({ cwd: process.cwd(), pid: process.pid }));",
      "setInterval(() => {}, 1000);",
    ].join("\n"));
    process.env.TEST_CAPTURE_PATH = markerPath;
    child = spawn(process.execPath, [
      cliPath,
      "--script", harness.scriptPath,
      "--prepared-root", harness.preparedRoot,
    ], { cwd: harness.root, stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => { stderr += chunk; });
    closed = new Promise((resolveChild, rejectChild) => {
      child.once("error", rejectChild);
      child.once("close", (code, signal) => {
        childClosed = true;
        resolveChild({ code, signal });
      });
    });
    for (let attempt = 0; attempt < 500; attempt += 1) {
      try {
        capture = JSON.parse(await readFile(markerPath, "utf8"));
        break;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await new Promise(resolveDelay => setTimeout(resolveDelay, 10));
      }
    }
    assert.ok(capture, "script should start before the runner is signalled");
    child.kill("SIGTERM");
    const outcome = await waitAtMost(closed, 5000);
    assert.notEqual(outcome.timedOut, true, "CLI should close within the test-only 5 second limit");
    assert.equal(outcome.code, 143);
    assert.match(stderr, /SCRIPT_SIGNALLED/);
    await assert.rejects(readdir(capture.cwd), { code: "ENOENT" });
    assert.deepEqual(await readdir(olderRun), []);
    signalTestPassed = true;
  } finally {
    let cleanupError;
    if (!signalTestPassed && capture?.pid) {
      try {
        await stopFixtureProcess(capture.pid);
      } catch (error) {
        cleanupError = error;
      }
    }
    if (child && !childClosed) {
      try {
        child.kill("SIGTERM");
        const outcome = closed ? await waitAtMost(closed, 5000) : { timedOut: true };
        if (outcome.timedOut) {
          child.kill("SIGKILL");
          if (closed) await closed;
        }
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (!signalTestPassed && capture?.cwd) {
      try {
        await rm(capture.cwd, { recursive: true, force: true });
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (previousCapture === undefined) delete process.env.TEST_CAPTURE_PATH;
    else process.env.TEST_CAPTURE_PATH = previousCapture;
    try {
      await harness.cleanup();
    } catch (error) {
      cleanupError ??= error;
    }
    if (cleanupError) throw cleanupError;
  }
});

test("rejects JavaScript type inference and unsafe artifact names", async () => {
  const harness = await makeHarness();
  try {
    await assert.rejects(harness.invoke({ scriptPath: join(harness.root, "task.js") }), /\.mjs or \.cjs/);
    for (const artifact of ["../secret", "/tmp/secret", "nested/file", "..", "has..dots.txt"]) {
      await assert.rejects(harness.invoke({ artifactBasenames: [artifact] }), /artifact basename/i);
    }
  } finally {
    await harness.cleanup();
  }
});

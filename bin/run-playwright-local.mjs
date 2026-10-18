import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

class RunnerError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

const validateRequest = ({ scriptPath, preparedRoot, outputDir, artifactBasenames = [], signal }) => {
  if (typeof scriptPath !== "string" || scriptPath.length === 0) {
    throw new TypeError("scriptPath must be explicitly provided");
  }
  const absoluteScriptPath = resolve(scriptPath);
  if (![".mjs", ".cjs"].includes(extname(absoluteScriptPath))) {
    throw new TypeError("scriptPath must end with .mjs or .cjs; .js type is not inferred");
  }
  if (typeof preparedRoot !== "string" || preparedRoot.length === 0) {
    throw new TypeError("preparedRoot must be explicitly provided");
  }
  if (!Array.isArray(artifactBasenames)) {
    throw new TypeError("artifactBasenames must be an array of explicit basenames");
  }
  for (const name of artifactBasenames) {
    if (
      typeof name !== "string"
      || name.length === 0
      || name === "."
      || name === ".."
      || name.includes("..")
      || name.includes("/")
      || name.includes("\\")
      || basename(name) !== name
      || name.includes("\0")
    ) {
      throw new TypeError(`Invalid artifact basename: ${String(name)}`);
    }
  }
  if (new Set(artifactBasenames).size !== artifactBasenames.length) {
    throw new TypeError("artifactBasenames cannot contain duplicates");
  }
  if (artifactBasenames.length > 0 && (typeof outputDir !== "string" || outputDir.length === 0)) {
    throw new TypeError("outputDir is required when artifactBasenames are specified");
  }
  if (signal !== undefined && typeof signal?.addEventListener !== "function") {
    throw new TypeError("signal must be an AbortSignal");
  }

  return {
    absoluteScriptPath,
    absolutePreparedRoot: resolve(preparedRoot),
    absoluteOutputDir: outputDir ? resolve(outputDir) : undefined,
    artifactBasenames: [...artifactBasenames],
    signal,
  };
};

const loadPreparedPlaywright = async (runDir, preparedRoot) => {
  let packageMetadata;
  try {
    packageMetadata = JSON.parse(await readFile(join(preparedRoot, "package.json"), "utf8"));
  } catch (error) {
    throw new RunnerError("PLAYWRIGHT_NOT_PREPARED", `Cannot read prepared Playwright package: ${error.message}`);
  }
  if (packageMetadata.name !== "playwright") {
    throw new RunnerError("PLAYWRIGHT_NOT_PREPARED", "preparedRoot must be the root of the playwright package");
  }

  try {
    await mkdir(join(runDir, "node_modules"));
    await symlink(preparedRoot, join(runDir, "node_modules", "playwright"), "dir");
    const requireFromRun = createRequire(join(runDir, "runner.mjs"));
    const entryPath = requireFromRun.resolve("playwright");
    const moduleNamespace = await import(pathToFileURL(entryPath).href);
    const moduleExports = moduleNamespace.chromium ? moduleNamespace : moduleNamespace.default;
    if (typeof moduleExports?.chromium?.executablePath !== "function") {
      throw new Error("playwright.chromium.executablePath() is unavailable");
    }
    return moduleExports.chromium;
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    throw new RunnerError("PLAYWRIGHT_NOT_PREPARED", `Prepared Playwright cannot be resolved: ${error.message}`);
  }
};

const verifyBrowser = async chromium => {
  let executablePath;
  try {
    executablePath = chromium.executablePath();
    if (typeof executablePath !== "string" || executablePath.length === 0) {
      throw new Error("Playwright returned an empty browser path");
    }
    const info = await lstat(executablePath);
    if (!info.isFile()) throw new Error("browser path is not a regular file");
    await access(executablePath, fsConstants.X_OK);
  } catch (error) {
    throw new RunnerError("BROWSER_NOT_PREPARED", `Chromium is not prepared: ${error.message}`);
  }
};

const waitForChild = (child, signal) => new Promise(resolveChild => {
  let spawnError;
  const onAbort = () => {
    const requestedSignal = typeof signal?.reason === "string" && ["SIGINT", "SIGTERM"].includes(signal.reason)
      ? signal.reason
      : "SIGTERM";
    child.kill(requestedSignal);
  };
  const removeAbortListener = () => signal?.removeEventListener("abort", onAbort);
  child.once("error", error => {
    spawnError = error;
  });
  child.once("close", (code, childSignal) => {
    removeAbortListener();
    resolveChild({ code, signal: childSignal, spawnError });
  });
  if (signal) {
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  }
});

const exportArtifacts = async (runDir, outputDir, artifactBasenames) => {
  const errors = [];
  try {
    await mkdir(outputDir, { recursive: true });
  } catch (error) {
    return [`${outputDir}: ${error.message}`];
  }
  for (const name of artifactBasenames) {
    const source = join(runDir, name);
    const target = join(outputDir, name);
    try {
      const info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink()) {
        throw new Error("source is not a regular non-symlink file");
      }
      await copyFile(source, target, fsConstants.COPYFILE_EXCL);
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  }
  return errors;
};

export const runPlaywrightLocal = async request => {
  const {
    absoluteScriptPath,
    absolutePreparedRoot,
    absoluteOutputDir,
    artifactBasenames,
    signal,
  } = validateRequest(request ?? {});
  let runDir;
  let result = { exitCode: 2, reason: "RUNNER_FAILED" };
  let childStarted = false;

  try {
    const scriptInfo = await lstat(absoluteScriptPath);
    if (!scriptInfo.isFile()) {
      throw new RunnerError("SCRIPT_NOT_FOUND", "scriptPath must refer to a regular file");
    }
    runDir = await mkdtemp(join(tmpdir(), "prepared-playwright-run-"));
    const copiedScriptPath = join(runDir, basename(absoluteScriptPath));
    await copyFile(absoluteScriptPath, copiedScriptPath, fsConstants.COPYFILE_EXCL);

    const chromium = await loadPreparedPlaywright(runDir, absolutePreparedRoot);
    await verifyBrowser(chromium);

    let child;
    try {
      child = spawn(process.execPath, [copiedScriptPath], {
        cwd: runDir,
        env: { ...process.env, PLAYWRIGHT_OUTPUT_DIR: runDir },
        stdio: "inherit",
      });
    } catch (error) {
      throw new RunnerError("CHILD_START_FAILED", `Could not start Node child process: ${error.message}`);
    }
    childStarted = true;
    const childResult = await waitForChild(child, signal);
    if (childResult.spawnError) {
      result = {
        exitCode: 2,
        reason: "CHILD_START_FAILED",
        message: `Could not start Node child process: ${childResult.spawnError.message}`,
        runDir,
      };
    } else if (childResult.signal) {
      const signalCode = { SIGINT: 130, SIGTERM: 143 }[childResult.signal] ?? 1;
      result = { exitCode: signalCode, reason: "SCRIPT_SIGNALLED", signal: childResult.signal, runDir };
    } else if (childResult.code !== 0) {
      result = {
        exitCode: childResult.code ?? 1,
        reason: "SCRIPT_EXITED_NONZERO",
        runDir,
      };
    } else {
      result = { exitCode: 0, runDir };
    }

    if (childStarted && artifactBasenames.length > 0) {
      result.artifactErrors = await exportArtifacts(runDir, absoluteOutputDir, artifactBasenames);
      if (result.artifactErrors.length > 0 && result.exitCode === 0) {
        result.exitCode = 2;
        result.reason = "ARTIFACT_EXPORT_FAILED";
      }
    }
  } catch (error) {
    const knownReason = error instanceof RunnerError ? error.reason : undefined;
    result = {
      exitCode: 2,
      reason: knownReason ?? "RUNNER_FAILED",
      message: error.message,
      ...(runDir ? { runDir } : {}),
    };
  } finally {
    if (runDir) {
      try {
      await rm(runDir, { recursive: true, force: false });
      } catch (error) {
        result.cleanupError = error.message;
        if (result.exitCode === 0) {
          result.exitCode = 2;
          result.reason = "CLEANUP_FAILED";
        }
      }
    }
  }

  return result;
};

const usage = "Usage: node bin/run-playwright-local.mjs --script <file.mjs|file.cjs> --prepared-root <node_modules/playwright> [--output-dir <dir> --artifact <basename> ...]";

const parseArguments = args => {
  const values = { artifactBasenames: [] };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!["--script", "--prepared-root", "--output-dir", "--artifact"].includes(key)) {
      throw new TypeError(`Unknown option: ${key}`);
    }
    const value = args[++index];
    if (typeof value !== "string" || value.startsWith("--")) {
      throw new TypeError(`Missing value for ${key}`);
    }
    if (key === "--script") values.scriptPath = value;
    else if (key === "--prepared-root") values.preparedRoot = value;
    else if (key === "--output-dir") values.outputDir = value;
    else if (key === "--artifact") values.artifactBasenames.push(value);
  }
  return values;
};

const main = async () => {
  const controller = new AbortController();
  const onInterrupt = () => controller.abort("SIGINT");
  const onTerminate = () => controller.abort("SIGTERM");
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  try {
    const options = parseArguments(process.argv.slice(2));
    if (!options.scriptPath || !options.preparedRoot) throw new TypeError(usage);
    const result = await runPlaywrightLocal({ ...options, signal: controller.signal });
    if (result.message) process.stderr.write(`${result.reason}: ${result.message}\n`);
    for (const error of result.artifactErrors ?? []) process.stderr.write(`ARTIFACT_EXPORT_FAILED: ${error}\n`);
    if (result.cleanupError) process.stderr.write(`CLEANUP_FAILED: ${result.cleanupError}\n`);
    if (result.reason) process.stderr.write(`${result.reason}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}

#!/usr/bin/env node

import { constants, createReadStream } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "gpt-6-luna";
const REASONING_EFFORT = "max";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
const MAX_STDOUT_BYTES = 64 * 1024 * 1024;
const MAX_WORKSPACE_ENTRIES = 200_000;
const MAX_WORKSPACE_BYTES = 4 * 1024 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const statusExitCode = { DONE: 0, FAILED: 1, BLOCKED: 2 };
const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "changedFiles", "tests"],
  properties: {
    status: { enum: ["DONE", "FAILED", "BLOCKED"] },
    summary: { type: "string", maxLength: 10_000 },
    changedFiles: { type: "array", items: { type: "string", maxLength: 4096 }, maxItems: 10_000 },
    tests: { type: "array", items: { type: "string", maxLength: 4096 }, maxItems: 10_000 },
  },
};

class RequestError extends Error {
  constructor(code, message = "Request is invalid or outside the approved scope") {
    super(message);
    this.code = code;
  }
}

const parseCli = argv => {
  const options = {
    codexBin: null,
    artifactsRoot: join(homedir(), ".codex", "delegations"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if ((flag !== "--codex-bin" && flag !== "--artifacts-root") || !value || value.startsWith("--")) {
      throw new RequestError("invalid_cli");
    }
    if (flag === "--codex-bin") options.codexBin = value;
    else options.artifactsRoot = resolve(value);
    index += 1;
  }
  return options;
};

const executable = async path => {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export const resolveCodexBinary = async ({
  explicitBin = null,
  env = process.env,
  platform = process.platform,
  preferredBin = "/opt/homebrew/bin/codex",
} = {}) => {
  if (explicitBin) return explicitBin;
  if (env.CODEX_CLI_BIN) {
    if (await executable(env.CODEX_CLI_BIN)) return env.CODEX_CLI_BIN;
    throw new RequestError("codex_cli_unavailable", "No executable Codex CLI was found");
  }
  if (platform === "darwin" && await executable(preferredBin)) return preferredBin;
  for (const directory of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(directory, "codex");
    if (await executable(candidate)) return candidate;
  }
  throw new RequestError("codex_cli_unavailable", "No executable Codex CLI was found");
};

const readRequestInput = async () => {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_REQUEST_BYTES) throw new RequestError("request_too_large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("invalid_json");
  }
};

const isInside = (parent, candidate) => {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === "" || (pathFromParent !== ".." && !pathFromParent.startsWith(`..${sep}`) && !isAbsolute(pathFromParent));
};

const resolvePathWithoutFollowingMissingTail = async inputPath => {
  let cursor = inputPath;
  const tail = [];
  while (true) {
    try {
      const existing = await realpath(cursor);
      return resolve(existing, ...tail);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      tail.unshift(basename(cursor));
      cursor = parent;
    }
  }
};

const validateStringArray = (value, { required = false } = {}) => Array.isArray(value)
  && (!required || value.length > 0)
  && value.every(item => typeof item === "string" && item.trim().length > 0 && item.length <= 4096);

const validateRequest = async value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("invalid_request");
  if (typeof value.cwd !== "string" || !isAbsolute(value.cwd)) throw new RequestError("invalid_cwd");
  if (!UUID_PATTERN.test(value.continuationId ?? "")) throw new RequestError("invalid_continuation_id");
  if (typeof value.prompt !== "string" || value.prompt.trim().length === 0) throw new RequestError("missing_prompt");
  if (value.prompt.length > MAX_REQUEST_BYTES / 2) throw new RequestError("prompt_too_large");
  if (typeof value.purpose !== "string" || value.purpose.trim().length === 0 || value.purpose.length > 4096) {
    throw new RequestError("invalid_purpose");
  }
  if (!validateStringArray(value.acceptanceCriteria, { required: true })) throw new RequestError("invalid_acceptance_criteria");
  if (!validateStringArray(value.prohibitedOperations)) throw new RequestError("invalid_prohibited_operations");
  if (!Array.isArray(value.allowedPaths) || !["read-only", "approved-write", "unapproved"].includes(value.permission)) {
    throw new RequestError("invalid_permission");
  }
  if (value.permission === "unapproved") throw new RequestError("permission_not_approved");
  if (value.permission === "read-only" && value.allowedPaths.length !== 0) throw new RequestError("read_only_has_write_scope");
  if (value.permission === "approved-write" && value.allowedPaths.length === 0) throw new RequestError("write_scope_missing");
  if (value.allowedPaths.some(path => typeof path !== "string" || !isAbsolute(path))) {
    throw new RequestError("invalid_allowed_path");
  }

  const cwd = await realpath(value.cwd);
  const cwdInfo = await lstat(cwd);
  if (!cwdInfo.isDirectory()) throw new RequestError("cwd_not_directory");

  const allowedPaths = [];
  for (const rawPath of value.allowedPaths) {
    const canonicalPath = await resolvePathWithoutFollowingMissingTail(resolve(rawPath));
    if (!isInside(cwd, canonicalPath)) throw new RequestError("allowed_path_symlink_escape");
    allowedPaths.push(canonicalPath);
  }

  const timeoutMs = value.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60 * 60 * 1000) {
    throw new RequestError("invalid_timeout");
  }
  if (value.resumeSessionId !== undefined && !UUID_PATTERN.test(value.resumeSessionId)) {
    throw new RequestError("invalid_resume_session_id");
  }

  return {
    purpose: value.purpose,
    acceptanceCriteria: value.acceptanceCriteria,
    cwd,
    permission: value.permission,
    allowedPaths: [...new Set(allowedPaths)].sort(),
    prohibitedOperations: value.prohibitedOperations,
    continuationId: value.continuationId,
    timeoutMs,
    prompt: value.prompt,
    resumeSessionId: value.resumeSessionId,
  };
};

const createArtifactsDirectory = async artifactsRoot => {
  await mkdir(artifactsRoot, { recursive: true });
  return mkdtemp(join(artifactsRoot, "run-"));
};

const taskContractHash = request => createHash("sha256")
  .update(JSON.stringify({
    purpose: request.purpose,
    acceptanceCriteria: request.acceptanceCriteria,
    prohibitedOperations: request.prohibitedOperations,
  }))
  .digest("hex");

const readPreviousRun = async (artifactsRoot, request) => {
  let entries;
  try {
    entries = await readdir(artifactsRoot, { withFileTypes: true });
  } catch {
    throw new RequestError("resume_lineage_not_found", "No matching prior run was found");
  }
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const metadata = JSON.parse(await readFile(join(artifactsRoot, entry.name, "run-metadata.json"), "utf8"));
      if (metadata.sessionId === request.resumeSessionId) matches.push(metadata);
    } catch {
      // Ignore incomplete or unrelated artifact folders; no user-controlled text is logged.
    }
  }
  if (matches.length === 0) throw new RequestError("resume_lineage_not_found", "No matching prior run was found");
  const hasExactIdentity = metadata => metadata.continuationId === request.continuationId
    && metadata.cwd === request.cwd
    && metadata.permission === request.permission
    && JSON.stringify(metadata.allowedPaths) === JSON.stringify(request.allowedPaths)
    && metadata.taskContractHash === taskContractHash(request)
    && metadata.status === "DONE";
  if (matches.some(metadata => !hasExactIdentity(metadata))) {
    throw new RequestError("resume_identity_conflict", "Resume session identity or approved scope conflicts with prior metadata");
  }
};

const makePrompt = request => [
  "You are a bounded Codex execution worker. Do not start or request another agent, subagent, MCP delegation, or child delegation.",
  `Objective: ${request.purpose}`,
  `Permission: ${request.permission}`,
  `Approved write paths: ${request.allowedPaths.length ? request.allowedPaths.join(", ") : "none; do not modify the workspace"}`,
  `Acceptance criteria:\n${request.acceptanceCriteria.map(item => `- ${item}`).join("\n")}`,
  `Prohibited operations:\n${request.prohibitedOperations.length ? request.prohibitedOperations.map(item => `- ${item}`).join("\n") : "- Do not perform unapproved operations"}`,
  "Return a final JSON object conforming to the supplied schema with status DONE, FAILED, or BLOCKED, a concise summary, changedFiles, and tests.",
  "Task prompt:",
  request.prompt,
].join("\n\n");

const buildCodexArgs = (request, schemaPath, outputPath) => {
  const shared = [
    "--json",
    "--model", MODEL,
    "-c", `model_reasoning_effort="${REASONING_EFFORT}"`,
    "--ignore-user-config",
    "--strict-config",
    "--disable", "multi_agent",
    "--output-schema", schemaPath,
    "--output-last-message", outputPath,
  ];
  if (request.resumeSessionId) {
    return [
      "exec", "resume",
      ...shared,
      "-c", `sandbox_mode="${request.permission === "read-only" ? "read-only" : "workspace-write"}"`,
      request.resumeSessionId,
      "-",
    ];
  }
  return [
    "exec",
    ...shared,
    "--sandbox", request.permission === "read-only" ? "read-only" : "workspace-write",
    "--cd", request.cwd,
    "-",
  ];
};

const hashFile = async filePath => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
};

const snapshotWorkspace = async (root, { rejectExternalSymlinks = false } = {}) => {
  const snapshot = new Map();
  let entryCount = 0;
  let totalFileBytes = 0;
  const addEntry = (name, value) => {
    entryCount += 1;
    if (entryCount > MAX_WORKSPACE_ENTRIES) throw new RequestError("workspace_snapshot_limit", "Workspace is too large to attest read-only");
    snapshot.set(name || ".", value);
  };
  const walk = async (directory, relativeDirectory) => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolutePath = join(directory, child.name);
      const relativePath = relativeDirectory ? join(relativeDirectory, child.name) : child.name;
      const info = await lstat(absolutePath, { bigint: true });
      const mode = info.mode.toString();
      if (info.isDirectory()) {
        addEntry(relativePath, `directory:${mode}`);
        await walk(absolutePath, relativePath);
      } else if (info.isSymbolicLink()) {
        const linkTarget = await readlink(absolutePath);
        if (rejectExternalSymlinks) {
          const resolvedTarget = await resolvePathWithoutFollowingMissingTail(resolve(dirname(absolutePath), linkTarget));
          if (!isInside(root, resolvedTarget)) {
            throw new RequestError("workspace_symlink_escape", "Workspace symlink escapes the writable workspace");
          }
        }
        addEntry(relativePath, `symlink:${mode}:${linkTarget}`);
      } else if (info.isFile()) {
        totalFileBytes += Number(info.size);
        if (totalFileBytes > MAX_WORKSPACE_BYTES) {
          throw new RequestError("workspace_snapshot_limit", "Workspace is too large to attest read-only");
        }
        addEntry(relativePath, `file:${mode}:${info.size}:${info.mtimeNs}:${await hashFile(absolutePath)}`);
      } else {
        addEntry(relativePath, `special:${mode}:${info.size}:${info.mtimeNs}`);
      }
    }
  };
  const rootInfo = await lstat(root, { bigint: true });
  addEntry(".", `directory:${rootInfo.mode}`);
  await walk(root, "");
  return snapshot;
};

const changedWorkspacePaths = (before, after) => {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter(path => before.get(path) !== after.get(path)).sort();
};

const isApprovedWorkspaceChange = (path, before, after, request) => {
  const absolutePath = resolve(request.cwd, path);
  if (request.allowedPaths.some(allowedPath => isInside(allowedPath, absolutePath))) return true;

  const previous = before.get(path);
  const current = after.get(path);
  const previousIsDirectory = typeof previous === "string" && previous.startsWith("directory:");
  const currentIsDirectory = typeof current === "string" && current.startsWith("directory:");
  const isAllowedPathAncestor = request.allowedPaths.some(allowedPath => isInside(absolutePath, allowedPath));
  if (!isAllowedPathAncestor || (!previousIsDirectory && !currentIsDirectory)) return false;
  if (!previousIsDirectory || !currentIsDirectory) return true;
  return previous.split(":")[1] === current.split(":")[1];
};

const parseEvents = stdout => {
  const sessionIds = new Set();
  let malformed = false;
  let startedEvents = 0;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      malformed = true;
      continue;
    }
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      malformed = true;
      continue;
    }
    if (event.type === "thread.started") startedEvents += 1;
    if (event.thread_id !== undefined) {
      if (typeof event.thread_id !== "string" || !UUID_PATTERN.test(event.thread_id)) malformed = true;
      else sessionIds.add(event.thread_id);
    }
  }
  return {
    malformed,
    startedEvents,
    sessionId: sessionIds.size === 1 ? [...sessionIds][0] : null,
    conflict: sessionIds.size > 1,
  };
};

const terminateProcessGroup = (child, signal) => {
  if (!child.pid) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process may have exited between the timeout and the signal.
    }
  }
};

const runCodex = ({ codexBin, args, cwd, prompt, timeoutMs }) => new Promise(resolvePromise => {
  let child;
  let spawnError = false;
  let timedOut = false;
  let outputOverflow = false;
  let stderrBytes = 0;
  let stdoutBytes = 0;
  const stdoutChunks = [];
  let killTimer;
  let timeoutTimer;
  try {
    child = spawn(codexBin, args, {
      cwd,
      env: process.env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    resolvePromise({ code: null, spawnError: true, timedOut, outputOverflow, stderrBytes, stdout: "" });
    return;
  }
  child.once("error", () => { spawnError = true; });
  child.stdout.on("data", chunk => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > MAX_STDOUT_BYTES) {
      outputOverflow = true;
      terminateProcessGroup(child, "SIGTERM");
      killTimer ??= setTimeout(() => terminateProcessGroup(child, "SIGKILL"), 250);
      return;
    }
    stdoutChunks.push(chunk);
  });
  child.stderr.on("data", chunk => { stderrBytes += chunk.length; });
  child.stdin.on("error", () => {});
  timeoutTimer = setTimeout(() => {
    timedOut = true;
    terminateProcessGroup(child, "SIGTERM");
    killTimer = setTimeout(() => terminateProcessGroup(child, "SIGKILL"), 250);
  }, timeoutMs);
  child.once("close", (code, signal) => {
    clearTimeout(timeoutTimer);
    clearTimeout(killTimer);
    resolvePromise({
      code,
      signal,
      spawnError,
      timedOut,
      outputOverflow,
      stderrBytes,
      stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    });
  });
  child.stdin.end(prompt);
});

const parseAgentResult = outputPath => readFile(outputPath, "utf8")
  .then(text => JSON.parse(text))
  .then(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (!outputSchema.properties.status.enum.includes(value.status)) return null;
    if (typeof value.summary !== "string" || value.summary.length > 10_000) return null;
    if (!validateStringArray(value.changedFiles) || !Array.isArray(value.tests) || !value.tests.every(item => typeof item === "string" && item.length <= 4096)) return null;
    if (value.changedFiles.length > 10_000 || value.tests.length > 10_000) return null;
    return { status: value.status, summary: value.summary, changedFiles: value.changedFiles, tests: value.tests };
  })
  .catch(() => null);

const main = async () => {
  let cli;
  let cliError = false;
  try {
    cli = parseCli(process.argv.slice(2));
  } catch {
    cliError = true;
    cli = { codexBin: null, artifactsRoot: join(homedir(), ".codex", "delegations") };
  }
  const artifactsRoot = cli.artifactsRoot;
  let artifactsDir;
  try {
    artifactsDir = await createArtifactsDirectory(artifactsRoot);
  } catch {
    const result = { status: "BLOCKED", summary: "Could not create the delegation artifact directory", sessionId: null, changedFiles: [], tests: [] };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 2;
    return;
  }

  const progress = ["state=VALIDATING"];
  let events = "";
  let request = null;
  let sessionId = null;
  let status = "BLOCKED";
  let summary = "Request is invalid or outside the approved scope";
  let changedFiles = [];
  let tests = [];
  let exitCode = null;
  let stderrBytes = 0;
  let reasonCode = "invalid_request";
  let startedAt = new Date().toISOString();
  let finishedAt = startedAt;
  let tempDir;
  let codexBin;

  const finish = async () => {
    finishedAt = new Date().toISOString();
    progress.push(`stderrBytes=${stderrBytes}`);
    progress.push(`state=${status}`);
    const result = { status, summary, sessionId, changedFiles, tests, artifactsDir };
    const metadata = {
      schemaVersion: 1,
      continuationId: request?.continuationId ?? null,
      cwd: request?.cwd ?? null,
      permission: request?.permission ?? null,
      allowedPaths: request?.allowedPaths ?? [],
      taskContractHash: request ? taskContractHash(request) : null,
      timeoutMs: request?.timeoutMs ?? null,
      model: MODEL,
      reasoningEffort: REASONING_EFFORT,
      sandboxMode: request?.permission === "read-only" ? "read-only" : request?.permission === "approved-write" ? "workspace-write" : null,
      resumeSessionId: request?.resumeSessionId ?? null,
      sessionId,
      status,
      reasonCode,
      exitCode,
      stderrBytes,
      startedAt,
      finishedAt,
    };
    await Promise.all([
      writeFile(join(artifactsDir, "events.jsonl"), events, "utf8"),
      writeFile(join(artifactsDir, "progress.log"), `${progress.join("\n")}\n`, "utf8"),
      writeFile(join(artifactsDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8"),
      writeFile(join(artifactsDir, "run-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8"),
    ]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = statusExitCode[status];
  };

  try {
    if (cliError) throw new RequestError("invalid_cli");
    const rawRequest = await readRequestInput();
    request = await validateRequest(rawRequest);
    if (request.resumeSessionId) await readPreviousRun(artifactsRoot, request);
    codexBin = await resolveCodexBinary({ explicitBin: cli.codexBin });
    reasonCode = "execution_started";
  } catch (error) {
    status = "BLOCKED";
    reasonCode = error instanceof RequestError ? error.code : "request_validation_failed";
    summary = error instanceof RequestError && error.code === "permission_not_approved"
      ? "No approved permission scope was supplied"
      : error instanceof RequestError && error.code === "codex_cli_unavailable"
        ? "No executable Codex CLI was found"
      : error instanceof RequestError && error.code.startsWith("resume_")
        ? "Resume session does not match an approved prior run"
        : "Request is invalid or outside the approved scope";
    await finish();
    return;
  }

  if (request.permission === "read-only" || request.permission === "approved-write") {
    try {
      request.workspaceSnapshot = await snapshotWorkspace(request.cwd, {
        rejectExternalSymlinks: request.permission === "approved-write",
      });
    } catch (error) {
      status = "BLOCKED";
      reasonCode = error instanceof RequestError ? error.code : "workspace_snapshot_failed";
      summary = "Could not attest the workspace before execution";
      await finish();
      return;
    }
  }

  progress.push("state=RUNNING");
  startedAt = new Date().toISOString();
  try {
    tempDir = await mkdtemp(join(tmpdir(), "codex-delegate-"));
    const schemaPath = join(tempDir, "output-schema.json");
    const outputPath = join(tempDir, "last-message.json");
    await writeFile(schemaPath, `${JSON.stringify(outputSchema)}\n`, "utf8");
    const run = await runCodex({
      codexBin,
      args: buildCodexArgs(request, schemaPath, outputPath),
      cwd: request.cwd,
      prompt: makePrompt(request),
      timeoutMs: request.timeoutMs,
    });
    events = run.stdout;
    stderrBytes = run.stderrBytes;
    exitCode = run.code;
    const parsedEvents = parseEvents(run.stdout);
    sessionId = parsedEvents.sessionId;
    progress.push(`stdoutBytes=${Buffer.byteLength(run.stdout)}`);

    const agentResult = await parseAgentResult(outputPath);
    if (run.timedOut) {
      status = "FAILED";
      reasonCode = "timeout";
      summary = "Codex execution exceeded the approved timeout";
    } else if (run.outputOverflow) {
      status = "FAILED";
      reasonCode = "stdout_limit_exceeded";
      summary = "Codex output exceeded the protocol size limit";
    } else if (run.spawnError) {
      status = "FAILED";
      reasonCode = "codex_spawn_failed";
      summary = "Codex could not be started";
    } else if (run.code !== 0) {
      status = "FAILED";
      reasonCode = "codex_nonzero_exit";
      summary = "Codex exited unsuccessfully";
    } else if (parsedEvents.malformed) {
      status = "FAILED";
      reasonCode = "invalid_jsonl";
      summary = "Codex emitted invalid JSONL events";
    } else if (parsedEvents.conflict) {
      status = "FAILED";
      reasonCode = "conflicting_session_ids";
      summary = "Codex emitted conflicting session IDs";
      sessionId = null;
    } else if (parsedEvents.startedEvents === 0 || !sessionId) {
      status = "FAILED";
      reasonCode = "session_id_missing";
      summary = "Codex did not emit a valid session ID";
    } else if (request.resumeSessionId && sessionId !== request.resumeSessionId) {
      status = "FAILED";
      reasonCode = "resume_session_id_conflict";
      summary = "Codex resumed a different session ID";
      sessionId = null;
    } else if (!agentResult) {
      status = "FAILED";
      reasonCode = "invalid_agent_result";
      summary = "Codex did not produce a result matching the required schema";
    } else {
      status = agentResult.status;
      summary = agentResult.summary;
      changedFiles = agentResult.changedFiles;
      tests = agentResult.tests;
      reasonCode = "agent_result";
    }

    if (request.permission === "read-only" || request.permission === "approved-write") {
      try {
        const afterSnapshot = await snapshotWorkspace(request.cwd, {
          rejectExternalSymlinks: request.permission === "approved-write",
        });
        const modifiedPaths = changedWorkspacePaths(request.workspaceSnapshot, afterSnapshot);
        const unauthorizedPaths = request.permission === "read-only"
          ? modifiedPaths
          : modifiedPaths.filter(path => !isApprovedWorkspaceChange(path, request.workspaceSnapshot, afterSnapshot, request));
        if (unauthorizedPaths.length > 0) {
          status = "FAILED";
          reasonCode = request.permission === "read-only" ? "read_only_workspace_mutation" : "approved_write_scope_violation";
          summary = request.permission === "read-only"
            ? "Read-only execution changed workspace files"
            : "Execution changed paths outside the approved write scope";
          changedFiles = unauthorizedPaths;
        }
      } catch {
        status = "FAILED";
        reasonCode = "workspace_snapshot_after_failed";
        summary = "Could not verify workspace changes after execution";
      }
    }
  } catch {
    status = "FAILED";
    reasonCode = "wrapper_execution_failed";
    summary = "Delegation wrapper failed during Codex execution";
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  await finish();
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    const result = { status: "FAILED", summary: "Delegation wrapper failed", sessionId: null, changedFiles: [], tests: [] };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 1;
  });
}

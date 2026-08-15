import { spawn } from "node:child_process";

const home = "/Users/sawairikeisuke";
const bridgeTimeoutMs = 5000;
const maxOutputBytes = 1024 * 1024;

const pluginRoot = `${home}/.codex/plugins/cache/context-mode/context-mode/1.0.169`;
const claudePluginRoot = `${home}/.claude/plugins/cache/context-mode/context-mode/1.0.169`;

const handlerDefinitions = Object.freeze({
  Claude: [
    {
      provider: "custom",
      matcher: "Bash",
      executable: "rtk",
      args: ["hook", "claude"],
    },
    {
      provider: "custom",
      matcher: "Bash|Write|Edit|NotebookEdit",
      executable: "node",
      args: [`${home}/.claude/hooks/pretooluse-guardrails.mjs`],
    },
    {
      provider: "plugin",
      matcher: "Bash|WebFetch|Read|Grep|Agent|mcp__plugin_context-mode_context-mode__ctx_execute|mcp__plugin_context-mode_context-mode__ctx_execute_file|mcp__plugin_context-mode_context-mode__ctx_batch_execute|mcp__",
      executable: "node",
      args: [`${claudePluginRoot}/hooks/pretooluse.mjs`],
    },
  ],
  Codex: [
    {
      provider: "custom",
      matcher: "Read|NotebookEdit",
      executable: "rtk",
      args: ["proxy", "node", `${home}/.codex/hooks/pretooluse.mjs`],
    },
    {
      provider: "plugin",
      matcher: "local_shell|shell|shell_command|exec_command|Bash|Shell|apply_patch|Edit|Write|grep_files|ctx_execute|ctx_execute_file|ctx_batch_execute|ctx_fetch_and_index|ctx_search|ctx_index|mcp__",
      executable: "node",
      args: [`${pluginRoot}/hooks/codex/pretooluse.mjs`],
    },
  ],
});

const readStdin = async () => {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
};

const matcherMatches = (matcher, toolName) => {
  if (!matcher || matcher === "*") return true;
  return new RegExp(matcher).test(toolName);
};

const readOutput = stdout => {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  if (Buffer.byteLength(trimmed, "utf8") > maxOutputBytes) {
    return { __bridgeError: "hook output exceeded the bridge limit" };
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) {
    return { __bridgeError: "hook emitted multiple stdout records" };
  }

  try {
    return JSON.parse(lines[0]);
  } catch {
    return { __bridgeError: "hook emitted malformed JSON" };
  }
};

const runChild = ({ executable, args, input }) =>
  new Promise(resolve => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(executable, args, {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, bridgeTimeoutMs);

    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", error => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        response: { __bridgeError: `hook process error: ${error.message}` },
        stderr,
      });
    });
    child.on("close", code => {
      clearTimeout(timeout);
      const response = readOutput(stdout);
      resolve({
        ok: !timedOut && code === 0 && !response?.__bridgeError,
        response: timedOut
          ? { __bridgeError: "hook process timed out" }
          : code !== 0
            ? { __bridgeError: `hook process exited with code ${code}` }
            : response,
        stderr,
      });
    });
    child.stdin.end(input);
  });

const normalizeHookResponse = response => {
  if (response == null) return { decision: "none" };
  if (response.__bridgeError) return { decision: "deny", reason: response.__bridgeError };

  const specific = response.hookSpecificOutput ?? response;
  const permissionDecision = specific.permissionDecision ?? response.permissionDecision;
  const reason =
    specific.permissionDecisionReason ??
    response.permissionDecisionReason ??
    specific.reason ??
    response.reason;
  const updatedInput = specific.updatedInput ?? response.updatedInput;
  const additionalContext = specific.additionalContext ?? response.additionalContext;

  if (permissionDecision === "deny") {
    return { decision: "deny", reason: reason ?? "hook denied the tool" };
  }
  if (permissionDecision === "ask") {
    return { decision: "deny", reason: reason ?? "unsupported ask decision" };
  }
  if (updatedInput !== undefined) {
    return {
      decision: "modify",
      updatedInput,
      ...(additionalContext === undefined ? {} : { additionalContext }),
    };
  }
  if (additionalContext !== undefined) {
    return { decision: "context", additionalContext: String(additionalContext) };
  }
  if (permissionDecision === "allow" || specific.hookEventName === "PreToolUse") {
    return { decision: "allow" };
  }

  return { decision: "deny", reason: "unrecognized PreToolUse hook output" };
};

const uniqueJsonValues = values => {
  const unique = new Map(values.map(value => [JSON.stringify(value), value]));
  return [...unique.values()];
};

export const mergeHookResponses = ({ product, custom, plugin, secondaryPlugin }) => {
  const entries = [
    ...[custom].flatMap(value => (Array.isArray(value) ? value : [value])),
    ...[plugin, secondaryPlugin].flatMap(value => (Array.isArray(value) ? value : [value])),
  ].filter(value => value !== undefined);
  const normalized = entries.map(normalizeHookResponse);
  const denies = normalized.filter(({ decision }) => decision === "deny");

  if (denies.length > 0) {
    const customDenies = [custom]
      .flatMap(value => (Array.isArray(value) ? value : [value]))
      .filter(Boolean)
      .map(normalizeHookResponse)
      .filter(({ decision }) => decision === "deny");
    const selected = customDenies[0] ?? denies[0];
    return { decision: "deny", reason: selected.reason ?? `${product} PreToolUse denied the tool` };
  }

  const rewrites = normalized
    .filter(({ decision, updatedInput }) => decision === "modify" && updatedInput !== undefined)
    .map(({ updatedInput }) => updatedInput);
  const uniqueRewrites = uniqueJsonValues(rewrites);
  if (uniqueRewrites.length > 1) {
    return { decision: "deny", reason: "conflicting updatedInput values from PreToolUse hooks" };
  }

  const contexts = normalized
    .filter(({ additionalContext }) => additionalContext !== undefined)
    .map(({ additionalContext }) => String(additionalContext))
    .filter(Boolean);
  const additionalContext = contexts.length > 0 ? contexts.join("\n\n") : undefined;

  if (uniqueRewrites.length === 1) {
    return {
      decision: "modify",
      updatedInput: uniqueRewrites[0],
      ...(additionalContext === undefined ? {} : { additionalContext }),
    };
  }
  if (additionalContext !== undefined) return { decision: "context", additionalContext };
  return { decision: "none" };
};

export const formatHookResponse = (_product, merged) => {
  if (!merged || merged.decision === "none") return null;

  const hookSpecificOutput = { hookEventName: "PreToolUse" };
  if (merged.decision === "deny") {
    hookSpecificOutput.permissionDecision = "deny";
    hookSpecificOutput.permissionDecisionReason = merged.reason;
  } else {
    hookSpecificOutput.permissionDecision = "allow";
    if (merged.updatedInput !== undefined) hookSpecificOutput.updatedInput = merged.updatedInput;
    if (merged.additionalContext !== undefined) hookSpecificOutput.additionalContext = merged.additionalContext;
  }

  return { hookSpecificOutput };
};

const runHandlers = async (product, input) => {
  const parsed = JSON.parse(input);
  const toolName = parsed.tool_name ?? parsed.toolName ?? "";
  const handlers = handlerDefinitions[product].filter(({ matcher }) => matcherMatches(matcher, toolName));
  const results = await Promise.all(
    handlers.map(async handler => ({
      provider: handler.provider,
      result: await runChild({ ...handler, input }),
    })),
  );

  return {
    custom: results.filter(({ provider }) => provider === "custom").map(({ result }) => result.response),
    plugin: results.filter(({ provider }) => provider === "plugin").map(({ result }) => result.response),
  };
};

export const runBridgeMain = async product => {
  try {
    const input = await readStdin();
    const responses = await runHandlers(product, input);
    const merged = mergeHookResponses({ product, ...responses });
    const output = formatHookResponse(product, merged);
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    const output = formatHookResponse(product, {
      decision: "deny",
      reason: `PreToolUse bridge failed closed: ${error.message}`,
    });
    process.stdout.write(`${JSON.stringify(output)}\n`);
    process.exitCode = 1;
  }
};

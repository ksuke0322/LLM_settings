import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const TASK_UNKNOWN = "タスク不明";
export const SUMMARY_MAX_CODE_POINTS = 20;
export const DEFAULT_STATE_DIR = join(homedir(), ".agents", "state", "ntfy-task-context");
export const DEFAULT_STATE_TTL_MS = 24 * 60 * 60 * 1_000;

const PRODUCTS = new Set(["codex", "claude-code"]);
const SYSTEM_MESSAGE_PATTERN = /^\s*<(?:system-reminder|task-notification|context_guidance|tool-result)\b/iu;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/giu;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
const ASSIGNED_SECRET_PATTERN = /\b(?:[A-Za-z][A-Za-z0-9_-]*_)?(?:api[ _-]?key|access[ _-]?token|auth[ _-]?token|refresh[ _-]?token|client[ _-]?secret|secret|password|passwd|private[ _-]?key)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu;
const SPACED_SECRET_PATTERN = /\b(?:api[ _-]?key|access[ _-]?token|auth[ _-]?token|refresh[ _-]?token|token|secret|password|passwd)\b\s+(?:is\s+)?[A-Za-z0-9._~+/=-]{6,}/giu;
const PREFIXED_TOKEN_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_-]{8,}|xox[baprs]-[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{12,})\b/gu;
const ABSOLUTE_PATH_PATTERN = /\/(?:Users|home|private\/var|var\/folders|tmp)\/[^\s"'`<>]{8,}/gu;
const REDACTION_MARKER_PATTERN = /\[(?:秘匿|パス)\]/gu;

const asNonEmptyString = value =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const normalizeWhitespace = value => value.replace(/\s+/gu, " ").trim();

const isSystemInput = ({ input, prompt }) => {
  if (input && typeof input === "object") {
    const metadata = [input.role, input.type, input.source]
      .filter(value => typeof value === "string")
      .map(value => value.trim().toLowerCase());
    if (metadata.some(value => value === "system" || value === "internal")) {
      return true;
    }
  }

  return SYSTEM_MESSAGE_PATTERN.test(prompt);
};

const visibleContent = value => value
  .replace(REDACTION_MARKER_PATTERN, "")
  .replace(/[\s"'`=,:;()[\]{}|/\\._-]+/gu, "")
  .trim();

export const sanitizeTaskSummary = (value, { maxCodePoints = SUMMARY_MAX_CODE_POINTS } = {}) => {
  const raw = typeof value === "string" ? value : "";
  const redacted = normalizeWhitespace(raw
    .replace(PRIVATE_KEY_PATTERN, "[秘匿]")
    .replace(BEARER_PATTERN, "[秘匿]")
    .replace(ASSIGNED_SECRET_PATTERN, "[秘匿]")
    .replace(SPACED_SECRET_PATTERN, "[秘匿]")
    .replace(PREFIXED_TOKEN_PATTERN, "[秘匿]")
    .replace(ABSOLUTE_PATH_PATTERN, "[パス]"));

  if (!visibleContent(redacted)) {
    return TASK_UNKNOWN;
  }

  const codePoints = [...redacted];
  if (codePoints.length <= maxCodePoints) {
    return redacted;
  }

  return `${codePoints.slice(0, Math.max(0, maxCodePoints - 1)).join("")}…`;
};

const normalizeProduct = product => PRODUCTS.has(product) ? product : null;

const getInputValue = (input, snakeKey, camelKey) => {
  if (!input || typeof input !== "object") {
    return null;
  }

  return asNonEmptyString(input[snakeKey]) ?? asNonEmptyString(input[camelKey]);
};

const getPrompt = input => {
  if (!input || typeof input !== "object") {
    return null;
  }

  return asNonEmptyString(input.prompt) ?? asNonEmptyString(input.message);
};

export const makeTaskContextKey = ({ product, sessionId, agentId }) => {
  const normalizedProduct = normalizeProduct(product);
  const normalizedSessionId = asNonEmptyString(sessionId);
  const normalizedAgentId = asNonEmptyString(agentId);
  if (!normalizedProduct || !normalizedSessionId || !normalizedAgentId) {
    return null;
  }

  return createHash("sha256")
    .update(`${normalizedProduct}\u0000${normalizedSessionId}\u0000${normalizedAgentId}`)
    .digest("hex");
};

export const taskContextPath = ({ product, sessionId, agentId, stateDir = DEFAULT_STATE_DIR }) => {
  const key = makeTaskContextKey({ product, sessionId, agentId });
  return key ? join(stateDir, `${key}.json`) : null;
};

export const cleanupTaskContext = async ({
  stateDir = DEFAULT_STATE_DIR,
  now = new Date(),
  ttlMs = DEFAULT_STATE_TTL_MS,
} = {}) => {
  try {
    const entries = await readdir(stateDir, { withFileTypes: true });
    const cutoff = now.getTime() - ttlMs;
    await Promise.all(entries
      .filter(entry => entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".tmp")))
      .map(async entry => {
        const path = join(stateDir, entry.name);
        try {
          const fileInfo = await stat(path);
          let timestamp = fileInfo.mtimeMs;
          if (entry.name.endsWith(".json")) {
            try {
              const record = JSON.parse(await readFile(path, "utf8"));
              const capturedAt = Date.parse(record?.capturedAt ?? "");
              if (!Number.isNaN(capturedAt)) {
                timestamp = capturedAt;
              }
            } catch {
              // Fall back to the filesystem timestamp for malformed records.
            }
          }
          if (timestamp < cutoff) {
            await rm(path, { force: true });
          }
        } catch {
          // Cleanup is best effort and must never affect the host hook.
        }
      }));
  } catch {
    // A missing or inaccessible state directory is handled by the caller.
  }
};

export const recordTaskContext = async ({
  product,
  input,
  stateDir = DEFAULT_STATE_DIR,
  now = new Date(),
} = {}) => {
  try {
    const normalizedProduct = normalizeProduct(product);
    const sessionId = getInputValue(input, "session_id", "sessionId");
    const agentId = getInputValue(input, "agent_id", "agentId") ?? "main";
    const prompt = getPrompt(input);
    if (!normalizedProduct || !sessionId || !prompt || isSystemInput({ input, prompt })) {
      return false;
    }

    const summary = sanitizeTaskSummary(prompt);
    const path = taskContextPath({ product: normalizedProduct, sessionId, agentId, stateDir });
    if (!path) {
      return false;
    }

    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    const record = {
      product: normalizedProduct,
      sessionId,
      agentId,
      summary,
      capturedAt: now instanceof Date && !Number.isNaN(now.valueOf())
        ? now.toISOString()
        : new Date().toISOString(),
    };
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, path);
    await cleanupTaskContext({ stateDir, now });
    return true;
  } catch {
    return false;
  }
};

export const consumeTaskContext = async ({
  product,
  sessionId,
  agentId,
  stateDir = DEFAULT_STATE_DIR,
} = {}) => {
  const path = taskContextPath({ product, sessionId, agentId, stateDir });
  if (!path) {
    return { product, sessionId, agentId, summary: TASK_UNKNOWN };
  }

  await cleanupTaskContext({ stateDir });

  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { product, sessionId, agentId, summary: TASK_UNKNOWN };
  }

  try {
    await rm(path, { force: true });
  } catch {
    // Deletion is best effort; the notification itself remains non-blocking.
  }

  try {
    const record = JSON.parse(raw);
    if (record?.product !== product || record?.sessionId !== sessionId || record?.agentId !== agentId) {
      return { product, sessionId, agentId, summary: TASK_UNKNOWN };
    }

    return {
      product,
      sessionId,
      agentId,
      summary: sanitizeTaskSummary(record.summary),
      capturedAt: record.capturedAt,
    };
  } catch {
    return { product, sessionId, agentId, summary: TASK_UNKNOWN };
  }
};

export const captureTaskContext = async ({
  product,
  rawInput,
  stateDir = DEFAULT_STATE_DIR,
  now = new Date(),
} = {}) => {
  try {
    const input = JSON.parse(typeof rawInput === "string" ? rawInput : "");
    return await recordTaskContext({ product, input, stateDir, now });
  } catch {
    return false;
  }
};

const parseCliArgs = args => {
  const options = {};
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === "--product") {
      options.product = args[index + 1];
      index += 1;
    }
  }
  return options;
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const { product } = parseCliArgs(process.argv.slice(2));
  let rawInput = "";
  try {
    rawInput = await readStdin();
  } catch {
    // Input errors are intentionally ignored so the host can continue.
  }
  await captureTaskContext({ product, rawInput });
  process.stdout.write("{}");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

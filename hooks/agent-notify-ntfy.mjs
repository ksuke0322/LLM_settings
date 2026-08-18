import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  consumeTaskContext,
  consumeWorkSummary,
  cleanupTaskContext,
  DEFAULT_STATE_DIR,
  extractWorkSummary,
  recordTaskContext,
  recordWorkSummary,
  sanitizeTaskSummary,
  TASK_UNKNOWN,
} from "./agent-notify-context.mjs";

const execFileAsync = promisify(execFile);
const KEYCHAIN_SERVICE = "codex-ntfy-topic";
const NTFY_BASE_URL = "https://ntfy.sh";
const REQUEST_TIMEOUT_MS = 5_000;
const TOPIC_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const PRODUCT_TITLES = Object.freeze({
  codex: "codex",
  "claude-code": "claude code",
});
const EVENTS = new Set(["stop", "subagent-stop"]);

export {
  consumeTaskContext,
  consumeWorkSummary,
  cleanupTaskContext,
  DEFAULT_STATE_DIR,
  extractWorkSummary,
  recordTaskContext,
  recordWorkSummary,
  sanitizeTaskSummary,
  TASK_UNKNOWN,
} from "./agent-notify-context.mjs";

const asNonEmptyString = value =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const getInputValue = (input, snakeKey, camelKey) => {
  if (!input || typeof input !== "object") {
    return null;
  }

  return asNonEmptyString(input[snakeKey]) ?? asNonEmptyString(input[camelKey]);
};

const isValidProduct = product => Object.hasOwn(PRODUCT_TITLES, product);

const isValidEvent = event => EVENTS.has(event);

const getNotificationIdentity = ({ input, event }) => {
  const sessionId = getInputValue(input, "session_id", "sessionId");
  const inputAgentId = getInputValue(input, "agent_id", "agentId");
  const agentId = event === "subagent-stop" ? inputAgentId : inputAgentId ?? "main";
  if (!sessionId || !agentId || (event === "subagent-stop" && !inputAgentId)) {
    return null;
  }

  return { sessionId, agentId };
};

export const buildNotificationPayload = ({
  product = "codex",
  event = "stop",
  summary = TASK_UNKNOWN,
} = {}) => {
  if (!isValidProduct(product)) {
    throw new Error("invalid notification product");
  }
  if (!isValidEvent(event)) {
    throw new Error("invalid notification event");
  }

  const suffix = event === "subagent-stop" ? " [subagent]" : "";
  return {
    title: `${PRODUCT_TITLES[product]}${suffix}`,
    message: sanitizeTaskSummary(summary),
  };
};

export const buildNtfyRequest = ({ topic, payload }) => {
  if (!TOPIC_PATTERN.test(topic)) {
    throw new Error("invalid ntfy topic");
  }

  return {
    url: `${NTFY_BASE_URL}/${encodeURIComponent(topic)}`,
    options: {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Title: payload.title,
      },
      body: payload.message,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  };
};

export const sendNotification = async ({
  topic,
  payload,
  fetchImpl = globalThis.fetch,
}) => {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch unavailable");
  }

  const request = buildNtfyRequest({ topic, payload });
  const response = await fetchImpl(request.url, request.options);

  if (!response?.ok) {
    throw new Error(`ntfy request returned HTTP ${response?.status ?? "unknown"}`);
  }

  return response;
};

const getSummaryFromState = async ({ input, event, stateDir, workSummarySaved = false }) => {
  const identity = getNotificationIdentity({ input, event });
  if (!identity) {
    return TASK_UNKNOWN;
  }

  const { sessionId, agentId } = identity;
  const product = input.product;
  const workSummary = workSummarySaved
    ? await consumeWorkSummary({ product, sessionId, agentId, stateDir })
    : { summary: TASK_UNKNOWN };
  const context = await consumeTaskContext({
    product,
    sessionId,
    agentId,
    stateDir,
  });
  return workSummary.summary !== TASK_UNKNOWN ? workSummary.summary : context.summary;
};

const resolveSummary = async ({ product, event, input, summary, stateDir }) => {
  if (typeof summary === "string" && summary.trim()) {
    return sanitizeTaskSummary(summary);
  }

  const normalizedInput = input && typeof input === "object" ? input : {};
  const identity = getNotificationIdentity({ input: normalizedInput, event });
  if (!identity) {
    return TASK_UNKNOWN;
  }

  const workSummarySaved = await recordWorkSummary({
    product,
    input: {
      ...normalizedInput,
      agent_id: identity.agentId,
    },
    stateDir,
  });

  return getSummaryFromState({
    input: { ...normalizedInput, product },
    event,
    stateDir,
    workSummarySaved,
  });
};

const readTopicFromKeychain = async () => {
  const account = process.env.USER;

  if (!account) {
    throw new Error("macOS user unavailable");
  }

  try {
    const { stdout } = await execFileAsync(
      "security",
      ["find-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", maxBuffer: 4_096 },
    );
    const topic = stdout.trim();

    if (!TOPIC_PATTERN.test(topic)) {
      throw new Error("invalid ntfy topic");
    }

    return topic;
  } catch {
    throw new Error("ntfy topic unavailable");
  }
};

export const run = async ({
  product = "codex",
  event = "stop",
  input = {},
  summary,
  stateDir = DEFAULT_STATE_DIR,
  readTopic = readTopicFromKeychain,
  fetchImpl = globalThis.fetch,
  logError = console.error,
} = {}) => {
  try {
    if (!isValidProduct(product) || !isValidEvent(event)) {
      throw new Error("invalid notification arguments");
    }

    const topic = await readTopic();
    const message = await resolveSummary({ product, event, input, summary, stateDir });
    await sendNotification({
      topic,
      payload: buildNotificationPayload({ product, event, summary: message }),
      fetchImpl,
    });
    return true;
  } catch {
    try {
      logError("[agent-notify] ntfy notification skipped");
    } catch {
      // Logging failure must not block the host hook.
    }
    return false;
  }
};

const readStdin = async () => {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

const parseInput = rawInput => {
  try {
    const input = JSON.parse(rawInput);
    return input && typeof input === "object" && !Array.isArray(input) ? input : {};
  } catch {
    return {};
  }
};

const parseCliArgs = args => {
  const options = {};
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === "--product") {
      options.product = args[index + 1];
      index += 1;
    } else if (args[index] === "--event") {
      options.event = args[index + 1];
      index += 1;
    }
  }
  return options;
};

const main = async () => {
  const { product, event } = parseCliArgs(process.argv.slice(2));
  let rawInput = "";
  try {
    rawInput = await readStdin();
  } catch {
    // A malformed or unavailable hook payload must not block Codex.
  }

  await run({ product, event, input: parseInput(rawInput) });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

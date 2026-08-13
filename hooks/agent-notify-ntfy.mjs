import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const KEYCHAIN_SERVICE = "codex-ntfy-topic";
const NTFY_BASE_URL = "https://ntfy.sh";
const NOTIFICATION_TITLE = "Codex";
const NOTIFICATION_MESSAGE = "Codexのターンが終了しました";
const REQUEST_TIMEOUT_MS = 5_000;
const TOPIC_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export const buildNotificationPayload = (_input = {}) => ({
  title: NOTIFICATION_TITLE,
  message: NOTIFICATION_MESSAGE,
});

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
  readTopic = readTopicFromKeychain,
  fetchImpl = globalThis.fetch,
  logError = console.error,
} = {}) => {
  try {
    const topic = await readTopic();
    await sendNotification({
      topic,
      payload: buildNotificationPayload(),
      fetchImpl,
    });
    return true;
  } catch {
    logError("[agent-notify] ntfy notification skipped");
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

const main = async () => {
  try {
    await readStdin();
  } catch {
    // A malformed or unavailable hook payload must not block Codex.
  }

  await run();
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const notifierPath = "/Users/sawairikeisuke/.agents/hooks/agent-notify-ntfy.mjs";
const contextPath = "/Users/sawairikeisuke/.agents/hooks/agent-notify-context.mjs";
const agentsPath = "/Users/sawairikeisuke/.agents/AGENTS.md";
const codexHooksPath = "/Users/sawairikeisuke/.codex/hooks.json";
const claudeSettingsPath = "/Users/sawairikeisuke/.claude/settings.json";

const readJson = async path => JSON.parse(await readFile(path, "utf8"));

const commandList = (config, event) =>
  (config.hooks?.[event] ?? []).flatMap(({ hooks = [] }) =>
    hooks.map(({ command = "" }) => command),
  );

const withTempState = async callback => {
  const stateDir = await mkdtemp(join(tmpdir(), "agent-notify-"));
  try {
    return await callback(stateDir);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
};

test("通常ターンとsubagentの通知タイトルを製品・イベントから決定する", async () => {
  const { buildNotificationPayload } = await import(notifierPath);

  assert.equal(buildNotificationPayload({ product: "codex", event: "stop" }).title, "codex");
  assert.equal(buildNotificationPayload({ product: "claude-code", event: "stop" }).title, "claude code");
  assert.equal(buildNotificationPayload({ product: "codex", event: "subagent-stop" }).title, "codex [subagent]");
  assert.equal(buildNotificationPayload({ product: "claude-code", event: "subagent-stop" }).title, "claude code [subagent]");
});

test("最終応答末尾の専用マーカーから作業要約だけを抽出する", async () => {
  const { extractWorkSummary } = await import(notifierPath);

  assert.equal(
    extractWorkSummary("回答本文\n<!-- ntfy-work-summary: 実装を検証 🧪 -->"),
    "実装を検証 🧪",
  );
  assert.equal(
    extractWorkSummary("<!-- ntfy-work-summary: 途中の要約 -->\n補足本文"),
    null,
  );
  assert.equal(
    extractWorkSummary("<!-- ntfy-work-summary: 一つ目 -->\n<!-- ntfy-work-summary: 二つ目 -->"),
    null,
  );
  assert.equal(
    extractWorkSummary("<!-- ntfy-work-summary: api_key=sk-only-secret -->"),
    null,
  );
  const longSummary = extractWorkSummary(
    "<!-- ntfy-work-summary: 日本語と英字と絵文字を含む長い作業要約です 🧪 secret=abc123456 -->",
  );
  assert.ok(longSummary);
  assert.ok([...longSummary].length <= 20);
  assert.doesNotMatch(longSummary, /abc123456|secret/iu);
});

test("通知本文は空白・秘密情報・長さを安全に整形する", async () => {
  const { sanitizeTaskSummary } = await import(notifierPath);
  const source = "  日本語のタスク 🧪 API_KEY=sk-test-1234567890 Bearer abc.def.ghi /Users/sawairikeisuke/private/project  ";
  const summary = sanitizeTaskSummary(source);

  assert.ok(summary.length > 0);
  assert.ok([...summary].length <= 20);
  assert.match(summary, /…$/);
  assert.doesNotMatch(summary, /sk-test|abc\.def|\/Users\//);
  assert.equal(sanitizeTaskSummary("\n\t  "), "タスク不明");
  assert.equal(sanitizeTaskSummary("api_key=sk-only-secret"), "タスク不明");
});

test("通知送信は短縮済み本文をHTTPリクエストへ渡す", async () => {
  const { run } = await import(notifierPath);
  const requests = [];
  const result = await run({
    product: "claude-code",
    event: "stop",
    summary: "実装状況を確認する",
    readTopic: async () => "codex-test-topic",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    },
  });

  assert.equal(result, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers.Title, "claude code");
  assert.equal(requests[0].options.body, "実装状況を確認する");
});

test("Stop通知は対応するstateだけを消費して本文へ使う", async () => {
  const notifier = await import(notifierPath);

  await withTempState(async stateDir => {
    assert.equal(await notifier.recordTaskContext({
      product: "codex",
      input: { session_id: "session-stop", prompt: "Stopで使うタスク" },
      stateDir,
    }), true);
    const requests = [];
    assert.equal(await notifier.run({
      product: "codex",
      event: "stop",
      input: { session_id: "session-stop" },
      stateDir,
      readTopic: async () => "codex-test-topic",
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, status: 200 };
      },
    }), true);
    assert.equal(requests[0].options.headers.Title, "codex");
    assert.equal(requests[0].options.body, "Stopで使うタスク");
    assert.equal((await readdir(stateDir)).length, 0);
  });
});

test("作業要約は依頼要約と別stateへ秘匿化して保存し、全文を残さない", async () => {
  const notifier = await import(notifierPath);

  await withTempState(async stateDir => {
    const assistantMessage = "この長い最終応答全文は保存してはいけない。\n"
      + "<!-- ntfy-work-summary: 実装を検証 🧪 -->";
    assert.equal(await notifier.recordWorkSummary({
      product: "codex",
      input: {
        session_id: "work-session",
        agent_id: "work-agent",
        last_assistant_message: assistantMessage,
      },
      stateDir,
      now: new Date("2026-08-17T00:00:00.000Z"),
    }), true);

    const files = await readdir(stateDir);
    assert.equal(files.length, 1);
    const stored = await readFile(join(stateDir, files[0]), "utf8");
    assert.doesNotMatch(stored, /この長い最終応答全文/);
    const record = JSON.parse(stored);
    assert.deepEqual(Object.keys(record).sort(), ["agentId", "capturedAt", "product", "sessionId", "summary"]);
    assert.equal(record.product, "codex");
    assert.equal(record.sessionId, "work-session");
    assert.equal(record.agentId, "work-agent");
    assert.equal(record.summary, "実装を検証 🧪");

    assert.equal((await notifier.consumeWorkSummary({
      product: "codex",
      sessionId: "work-session",
      agentId: "other-agent",
      stateDir,
    })).summary, "タスク不明");
    assert.equal((await readdir(stateDir)).length, 1);
    assert.equal((await notifier.consumeWorkSummary({
      product: "codex",
      sessionId: "work-session",
      agentId: "work-agent",
      stateDir,
    })).summary, "実装を検証 🧪");
    assert.equal((await readdir(stateDir)).length, 0);
  });
});

test("作業要約は依頼要約より優先してStop通知本文になる", async () => {
  const notifier = await import(notifierPath);

  await withTempState(async stateDir => {
    assert.equal(await notifier.recordTaskContext({
      product: "codex",
      input: { session_id: "priority-session", prompt: "依頼内容の要約" },
      stateDir,
    }), true);

    const requests = [];
    assert.equal(await notifier.run({
      product: "codex",
      event: "stop",
      input: {
        session_id: "priority-session",
        last_assistant_message: "完了しました。\n<!-- ntfy-work-summary: 実装を検証 🧪 -->",
      },
      stateDir,
      readTopic: async () => "codex-test-topic",
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, status: 200 };
      },
    }), true);
    assert.equal(requests[0].options.body, "実装を検証 🧪");
    assert.equal((await readdir(stateDir)).length, 0);
  });
});

test("作業要約がない場合は既存の依頼要約へフォールバックする", async () => {
  const notifier = await import(notifierPath);

  await withTempState(async stateDir => {
    assert.equal(await notifier.recordTaskContext({
      product: "claude-code",
      input: { session_id: "fallback-session", prompt: "依頼要約へ戻る" },
      stateDir,
    }), true);

    const requests = [];
    assert.equal(await notifier.run({
      product: "claude-code",
      event: "stop",
      input: {
        session_id: "fallback-session",
        last_assistant_message: "通常の応答本文でマーカーなし",
      },
      stateDir,
      readTopic: async () => "codex-test-topic",
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, status: 200 };
      },
    }), true);
    assert.equal(requests[0].options.body, "依頼要約へ戻る");
  });
});

test("マーカーがないターンは残存した前ターンの作業stateを流用しない", async () => {
  const notifier = await import(notifierPath);

  await withTempState(async stateDir => {
    assert.equal(await notifier.recordWorkSummary({
      product: "codex",
      input: {
        session_id: "stale-session",
        last_assistant_message: "前ターン\n<!-- ntfy-work-summary: 前ターンの作業 -->",
      },
      stateDir,
    }), true);
    assert.equal(await notifier.recordTaskContext({
      product: "codex",
      input: { session_id: "stale-session", prompt: "今回の依頼" },
      stateDir,
    }), true);

    const requests = [];
    assert.equal(await notifier.run({
      product: "codex",
      event: "stop",
      input: {
        session_id: "stale-session",
        last_assistant_message: "今回の応答にはマーカーがない",
      },
      stateDir,
      readTopic: async () => "codex-test-topic",
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, status: 200 };
      },
    }), true);
    assert.equal(requests[0].options.body, "今回の依頼");
    assert.equal((await readdir(stateDir)).length, 1);
  });
});

test("subagentの作業要約はagent_idがない場合に親stateへフォールバックしない", async () => {
  const notifier = await import(notifierPath);

  await withTempState(async stateDir => {
    assert.equal(await notifier.recordTaskContext({
      product: "codex",
      input: { session_id: "subagent-session", agent_id: "main", prompt: "親の依頼" },
      stateDir,
    }), true);

    const requests = [];
    assert.equal(await notifier.run({
      product: "codex",
      event: "subagent-stop",
      input: {
        session_id: "subagent-session",
        last_assistant_message: "subagentの応答\n<!-- ntfy-work-summary: 子作業を完了 -->",
      },
      stateDir,
      readTopic: async () => "codex-test-topic",
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, status: 200 };
      },
    }), true);
    assert.equal(requests[0].options.body, "タスク不明");
    assert.equal((await readdir(stateDir)).length, 1);
  });
});

test("状態保存は短縮済み要約だけを保存し、sessionとagentを分離する", async () => {
  const notifier = await import(notifierPath);

  await withTempState(async stateDir => {
    const prompt = "これは保存してはいけない長い元プロンプトです。秘密情報ではないが全文を残さないことを確認します。";
    assert.equal(await notifier.recordTaskContext({
      product: "codex",
      input: { session_id: "session-a", agent_id: "agent-a", prompt },
      stateDir,
      now: new Date("2026-08-17T00:00:00.000Z"),
    }), true);

    const files = await readdir(stateDir);
    assert.equal(files.length, 1);
    const stored = await readFile(join(stateDir, files[0]), "utf8");
    assert.doesNotMatch(stored, new RegExp(prompt));
    const record = JSON.parse(stored);
    assert.deepEqual(Object.keys(record).sort(), ["agentId", "capturedAt", "product", "sessionId", "summary"]);
    assert.equal(record.product, "codex");
    assert.equal(record.sessionId, "session-a");
    assert.equal(record.agentId, "agent-a");
    assert.ok([...record.summary].length <= 20);

    assert.equal(await notifier.recordTaskContext({
      product: "codex",
      input: { session_id: "session-b", agent_id: "agent-b", prompt: "別セッションの作業" },
      stateDir,
    }), true);
    assert.equal((await notifier.consumeTaskContext({
      product: "codex",
      sessionId: "session-a",
      agentId: "agent-a",
      stateDir,
    })).summary, record.summary);
    assert.equal((await notifier.consumeTaskContext({
      product: "codex",
      sessionId: "session-b",
      agentId: "agent-b",
      stateDir,
    })).summary, "別セッションの作業");
  });
});

test("subagentは親タスクへフォールバックせず、消費後に状態を残さない", async () => {
  const notifier = await import(notifierPath);

  await withTempState(async stateDir => {
    assert.equal(await notifier.recordTaskContext({
      product: "codex",
      input: { session_id: "session-a", agent_id: "main", prompt: "親タスクの内容" },
      stateDir,
    }), true);
    const missing = await notifier.consumeTaskContext({
      product: "codex",
      sessionId: "session-a",
      agentId: "subagent-1",
      stateDir,
    });
    assert.equal(missing.summary, "タスク不明");
    assert.equal((await readdir(stateDir)).length, 1);

    const parent = await notifier.consumeTaskContext({
      product: "codex",
      sessionId: "session-a",
      agentId: "main",
      stateDir,
    });
    assert.equal(parent.summary, "親タスクの内容");
    assert.equal((await readdir(stateDir)).length, 0);
  });
});

test("不正入力・保存失敗・送信失敗はホスト処理をブロックしない", async () => {
  const notifier = await import(notifierPath);
  const context = await import(contextPath);

  assert.equal(await context.captureTaskContext({
    product: "codex",
    rawInput: "{not-json",
    stateDir: "/tmp/agent-notify-test-missing",
  }), false);
  assert.equal(await notifier.recordTaskContext({
    product: "codex",
    input: { prompt: "sessionなし" },
    stateDir: "/dev/null/agent-notify-state",
  }), false);
  assert.equal(await notifier.recordTaskContext({
    product: "codex",
    input: { session_id: "s", prompt: "保存失敗" },
    stateDir: "/dev/null/agent-notify-state",
  }), false);
  assert.equal(await notifier.recordWorkSummary({
    product: "codex",
    input: {
      session_id: "s",
      last_assistant_message: "保存失敗\n<!-- ntfy-work-summary: 作業要約 -->",
    },
    stateDir: "/dev/null/agent-notify-state",
  }), false);
  assert.equal(await notifier.run({
    product: "codex",
    event: "stop",
    summary: "送信失敗",
    readTopic: async () => "codex-test-topic",
    fetchImpl: async () => { throw new Error("synthetic network failure"); },
    logError: () => {},
  }), false);
});

test("システムメッセージはタスク状態として保存しない", async () => {
  const notifier = await import(notifierPath);

  await withTempState(async stateDir => {
    assert.equal(await notifier.recordTaskContext({
      product: "claude-code",
      input: { session_id: "session-a", prompt: "<system-reminder>internal reminder</system-reminder>" },
      stateDir,
    }), false);
    assert.equal((await readdir(stateDir)).length, 0);
  });
});

test("TTLを過ぎた孤立stateは掃除される", async () => {
  const notifier = await import(notifierPath);
  const context = await import(contextPath);

  await withTempState(async stateDir => {
    const capturedAt = new Date("2026-08-15T00:00:00.000Z");
    assert.equal(await notifier.recordTaskContext({
      product: "codex",
      input: { session_id: "old-session", prompt: "期限切れstate" },
      stateDir,
      now: capturedAt,
    }), true);
    assert.equal(await notifier.recordWorkSummary({
      product: "codex",
      input: {
        session_id: "old-session",
        last_assistant_message: "期限切れ作業\n<!-- ntfy-work-summary: 期限切れ要約 -->",
      },
      stateDir,
      now: capturedAt,
    }), true);
    await context.cleanupTaskContext({
      stateDir,
      now: new Date("2026-08-17T00:00:00.000Z"),
      ttlMs: 24 * 60 * 60 * 1_000,
    });
    assert.equal((await readdir(stateDir)).length, 0);
  });
});

test("フック登録は製品別引数、subagent通知、MCP非依存を満たす", async () => {
  const codex = await readJson(codexHooksPath);
  const claude = await readJson(claudeSettingsPath);
  const expected = {
    codex: {
      context: "node /Users/sawairikeisuke/.agents/hooks/agent-notify-context.mjs --product codex",
      stop: "node /Users/sawairikeisuke/.agents/hooks/agent-notify-ntfy.mjs --product codex --event stop",
      subagent: "node /Users/sawairikeisuke/.agents/hooks/agent-notify-ntfy.mjs --product codex --event subagent-stop",
    },
    claude: {
      context: "node /Users/sawairikeisuke/.agents/hooks/agent-notify-context.mjs --product claude-code",
      stop: "node /Users/sawairikeisuke/.agents/hooks/agent-notify-ntfy.mjs --product claude-code --event stop",
      subagent: "node /Users/sawairikeisuke/.agents/hooks/agent-notify-ntfy.mjs --product claude-code --event subagent-stop",
    },
  };

  for (const [name, config] of [["codex", codex], ["claude", claude]]) {
    const userPromptCommands = commandList(config, "UserPromptSubmit");
    const stopCommands = commandList(config, "Stop");
    const subagentCommands = commandList(config, "SubagentStop");
    assert.ok(userPromptCommands.includes(expected[name].context));
    assert.ok(stopCommands.includes(expected[name].stop));
    assert.ok(subagentCommands.includes(expected[name].subagent));
    assert.ok(stopCommands.some(command => command.includes("notify-glass.mjs")));
    assert.ok(subagentCommands.some(command => command.includes("subagent-stop.mjs")));
    assert.ok(!userPromptCommands.some(command => command.includes("mcp")));
    assert.ok(!stopCommands.some(command => command.includes("mcp")));
    assert.ok(!subagentCommands.some(command => command.includes("mcp")));
  }
});

test("通知実装はMCPを判定・参照しない", async () => {
  const { readFile: readFileText } = await import("node:fs/promises");
  const source = await readFileText(notifierPath, "utf8");
  const contextSource = await readFileText(contextPath, "utf8");
  assert.doesNotMatch(source, /mcp/i);
  assert.doesNotMatch(contextSource, /mcp/i);
});

test("共通指示にCodexとClaude Code向けの作業要約マーカー契約がある", async () => {
  const { readFile: readFileText } = await import("node:fs/promises");
  const source = await readFileText(agentsPath, "utf8");
  assert.match(source, /ntfy-work-summary/);
  assert.match(source, /最終応答の末尾/);
  assert.match(source, /実際に行った作業/);
  assert.match(source, /<!-- ntfy-work-summary:/);
});

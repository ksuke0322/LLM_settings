import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hookPath = fileURLToPath(new URL("./delegate-preflight.mjs", import.meta.url));

const runHook = input => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [hookPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  child.stdin.end(JSON.stringify(input));
});

const assertSharedPromptContext = async input => {
  const result = await runHook(input);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");

  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output), ["hookSpecificOutput"]);
  assert.deepEqual(
    Object.keys(output.hookSpecificOutput).sort(),
    ["additionalContext", "hookEventName"],
  );
  assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.equal(typeof output.hookSpecificOutput.additionalContext, "string");
  assert.ok(output.hookSpecificOutput.additionalContext.length < 700);

  return output.hookSpecificOutput.additionalContext;
};

test("Codex UserPromptSubmit receives valid shared exec-policy JSON", async () => {
  const context = await assertSharedPromptContext({
    session_id: "codex-session",
    hook_event_name: "UserPromptSubmit",
    prompt: "委任可能なレビューを行う",
    turn_id: "codex-turn",
    model: "gpt-6",
  });

  assert.match(context, /Claude親はCodex委任にcodex execを使う/u);
  assert.match(context, /Codex親はnative subagentを使う/u);
  assert.match(context, /gpt-5\.6-luna\s*\/\s*max/u);
});

test("Claude UserPromptSubmit receives the same valid shared exec-policy JSON", async () => {
  const context = await assertSharedPromptContext({
    session_id: "claude-session",
    hook_event_name: "UserPromptSubmit",
    prompt: "委任可能なレビューを行う",
    permission_mode: "default",
  });

  assert.match(context, /Claude親はCodex委任にcodex execを使う/u);
  assert.match(context, /Codex親はnative subagentを使う/u);
  assert.match(context, /gpt-5\.6-luna\s*\/\s*max/u);
});

test("Claude delegation names the canonical Codex exec wrapper", async () => {
  const context = await assertSharedPromptContext({
    session_id: "claude-wrapper-session",
    hook_event_name: "UserPromptSubmit",
    prompt: "delegate policy",
  });

  assert.match(
    context,
    /Claude親はCodex委任にcodex execを使う。Claude向けwrapperは`\/Users\/sawairikeisuke\/\.agents\/bin\/codex-delegate\.mjs`を使う/u,
  );
});

test("delegation states read-only or explicitly approved-write authorization", async () => {
  const context = await assertSharedPromptContext({
    session_id: "authorization-session",
    hook_event_name: "UserPromptSubmit",
    prompt: "delegate policy",
  });

  assert.match(context, /権限状態を`read-only`または`approved-write`として明示/u);
  assert.match(context, /approved-write.*ユーザー.*明示承認.*許可パス/u);
  assert.match(context, /未指定・不明・未承認.*起動せず`BLOCKED`で親へ戻す/u);
});

test("delegation route, model, and effort checks fail closed before execution", async () => {
  const context = await assertSharedPromptContext({
    session_id: "verification-session",
    hook_event_name: "UserPromptSubmit",
    prompt: "delegate policy",
  });

  assert.match(context, /経路・モデル・reasoning effortを実行前に確認/u);
  assert.match(context, /`false`・`unknown`・未確認/u);
  assert.match(context, /起動せず`BLOCKED`で親へ戻し、別経路・別モデルへ切り替えない/u);
});

test("policy avoids MCP instructions and keeps delegation under parent control", async () => {
  const context = await assertSharedPromptContext({
    session_id: "policy-session",
    hook_event_name: "UserPromptSubmit",
    prompt: "delegate policy",
  });

  assert.doesNotMatch(context, /mcp|codex_mcp|codex mcp-server/iu);
  assert.match(context, /自動起動/u);
  assert.match(context, /自動選択/u);
  assert.match(context, /親の種類/u);
  assert.match(context, /自動フォールバック/u);
  assert.match(context, /再委譲は禁止/u);
  assert.match(context, /DONE/u);
  assert.match(context, /FAILED/u);
  assert.match(context, /BLOCKED/u);
  assert.doesNotMatch(context, /PARTIAL/u);
});

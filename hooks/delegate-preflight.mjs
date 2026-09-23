const drainStdin = async () => {
  for await (const chunk of process.stdin) {
    // Input is intentionally unused; consume it before returning hook output.
    void chunk;
  }
};

await drainStdin();

const additionalContext = `
Delegate preflight:
- 質問だけなら先に回答し、作業・委任を始めない。
- 委任前に目的・入力・出力・受入条件・許可範囲を固定する。親は分解・統合・最終判定を担う。
- Claude親はCodex委任にcodex execを使う。Claude向けwrapperは\`/Users/sawairikeisuke/.agents/bin/codex-delegate.mjs\`を使う。Codex親はnative subagentを使う。標準モデルはgpt-6-luna / max。
- 委任前に権限状態を\`read-only\`または\`approved-write\`として明示する。\`approved-write\`はユーザーが明示承認した作業・許可パスだけ。未指定・不明・未承認なら起動せず\`BLOCKED\`で親へ戻す。
- このhookは規則を注入するだけ。親の種類や委任先を自動選択せず、委任を自動起動しない。経路・モデル・reasoning effortを実行前に確認し、どれかが\`false\`・\`unknown\`・未確認なら起動せず\`BLOCKED\`で親へ戻し、別経路・別モデルへ切り替えない。自動フォールバックもしない。
- 委任先からの再委譲は禁止。
- 完了状態はDONE、FAILED、BLOCKED。DONEは親が成果物と検証を確認した場合だけ。
`.trim();

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext,
  },
}));

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
- 作業はまず独立した小単位へ分解する。入力・出力・受入条件と検証方法を固定できる読み取り・探索・実装・レビュー・保存後の再検証は、実行条件を満たせば委任する。依存しない作業は入出力・許可パスが重ならない場合に並列化する。
- 委任前に目的・入力・出力・受入条件・許可範囲を固定する。親は分解・統合・最終判定を担う。
- 実際の委任を判断するときは、詳細を/Users/sawairikeisuke/.agents/references/delegate-policy.md と/Users/sawairikeisuke/.agents/references/delegate-flow.md で読む。毎ターン全文を読むのは不要。
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

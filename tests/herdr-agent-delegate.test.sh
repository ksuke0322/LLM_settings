#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT_DIR/hooks/herdr-agent-delegate.sh"
LEGACY_SCRIPT="$ROOT_DIR/hooks/herdr-opencode-delegate.sh"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

MOCK_BIN="$TEMP_DIR/bin"
mkdir -p "$MOCK_BIN"
LOG_FILE="$TEMP_DIR/herdr.log"
TASK_FILE="$TEMP_DIR/task.md"
RESULT_FILE="$TEMP_DIR/result.md"

cat >"$TASK_FILE" <<'EOF'
# Agent delegation task

## Objective

Add one focused test.

## Allowed paths

- tests/example.test.sh

## Prohibited operations

- network access

## Expected result

Report the changed file and test result.

## Verification

Run the focused test only.

## Completion criteria

The focused test passes.
EOF

write_herdr() {
  local agent_state="$1"
  local agent_kind="$2"
  local wait_state="${3:-done}"
  local write_result="${4:-true}"
  cat >"$MOCK_BIN/herdr" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "\$*" >>"$LOG_FILE"
case "\$1 \${2:-}" in
  "status ")
    printf 'server: running\\n'
    ;;
  "agent get")
    printf '{"id":"\${3:-target}","status":"$agent_state","agent":"$agent_kind"}\\n'
    ;;
  "agent prompt")
    if [ "$write_result" = true ]; then
      printf '# Agent result\\n' >"$RESULT_FILE"
    fi
    printf 'submitted\\n'
    ;;
  "agent wait")
    if [ "$wait_state" = timeout ]; then
      exit 1
    fi
    printf '{"status":"$wait_state"}\\n'
    ;;
  "agent read")
    printf 'delegated task completed\\n'
    ;;
  *)
    printf 'unexpected herdr invocation: %s\\n' "\$*" >&2
    exit 64
    ;;
esac
EOF
  chmod +x "$MOCK_BIN/herdr"
}

expect_success() {
  "$@" >/dev/null
}

expect_failure() {
  if "$@" >/dev/null 2>&1; then
    printf 'expected failure: %s\n' "$*" >&2
    exit 1
  fi
}

dispatch() {
  rm -f "$RESULT_FILE" "$RESULT_FILE.wait.txt" "$RESULT_FILE.terminal.txt"
  "$SCRIPT" dispatch \
    --parent "$1" \
    --target "$2" \
    --task-file "$TASK_FILE" \
    --worktree "$TEMP_DIR" \
    --result-file "$RESULT_FILE" \
    --timeout-ms 1000
}

export PATH="$MOCK_BIN:$PATH"

write_herdr idle codex
expect_success "$SCRIPT" preflight --parent claude --target codex-delegate
expect_success dispatch claude codex-delegate

write_herdr idle claude
expect_success "$SCRIPT" preflight --parent codex --target claude-delegate
expect_success dispatch codex claude-delegate

write_herdr idle opencode
expect_success "$SCRIPT" preflight --parent claude --target opencode-delegate
expect_success "$SCRIPT" preflight --parent codex --target opencode-delegate

write_herdr idle claude
expect_failure "$SCRIPT" preflight --parent claude --target claude-delegate

write_herdr idle codex
expect_failure "$SCRIPT" preflight --parent codex --target codex-delegate

write_herdr idle claude
expect_failure "$SCRIPT" preflight --parent opencode --target claude-delegate
expect_failure "$SCRIPT" preflight --target claude-delegate

write_herdr working codex
expect_failure "$SCRIPT" preflight --parent claude --target codex-delegate

write_herdr idle codex blocked
expect_failure dispatch claude codex-delegate

write_herdr idle codex timeout
expect_failure dispatch claude codex-delegate

write_herdr idle codex done false
expect_failure dispatch claude codex-delegate

write_herdr idle opencode
expect_failure "$LEGACY_SCRIPT" preflight --target opencode-delegate
expect_success "$LEGACY_SCRIPT" preflight --parent claude --target opencode-delegate

grep -F -- "agent prompt codex-delegate" "$LOG_FILE" >/dev/null
grep -F -- "agent prompt claude-delegate" "$LOG_FILE" >/dev/null
grep -F -- "agent wait codex-delegate --until done --until blocked --until idle --timeout 1000" "$LOG_FILE" >/dev/null
grep -F -- "agent read claude-delegate --source recent-unwrapped --lines 200 --format text" "$LOG_FILE" >/dev/null

printf 'herdr-agent-delegate tests passed\n'

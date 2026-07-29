#!/usr/bin/env bash
# Herdr-managed, single-task delegation between Claude, Codex, and OpenCode.
set -euo pipefail

PARENT=''
TARGET=''
TIMEOUT_MS=120000

usage() {
  cat <<'EOF'
Usage:
  herdr-agent-delegate.sh preflight --parent {claude|codex} --target NAME
  herdr-agent-delegate.sh dispatch --parent {claude|codex} --target NAME --task-file PATH --worktree PATH --result-file PATH [--timeout-ms MS]

Allowed routes: claude -> codex|opencode; codex -> claude|opencode.
The target must already be an idle Herdr-detected agent. This script never
creates, restarts, or attaches to panes.
EOF
}

fail() {
  printf 'agent delegation unavailable: %s\n' "$1" >&2
  exit 1
}

agent_field() {
  local field="$1"
  python3 -c '
import json
import sys

field = sys.argv[1]
try:
    payload = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)

def visit(value):
    if isinstance(value, dict):
        candidate = value.get(field)
        if isinstance(candidate, str):
            print(candidate)
            return True
        return any(visit(item) for item in value.values())
    if isinstance(value, list):
        return any(visit(item) for item in value)
    return False

raise SystemExit(0 if visit(payload) else 1)
' "$field"
}

agent_state() {
  python3 -c '
import json
import sys

try:
    payload = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)

def visit(value):
    if isinstance(value, dict):
        for key in ("status", "agent_status", "state"):
            candidate = value.get(key)
            if isinstance(candidate, str):
                print(candidate)
                return True
        return any(visit(item) for item in value.values())
    if isinstance(value, list):
        return any(visit(item) for item in value)
    return False

raise SystemExit(0 if visit(payload) else 1)
'
}

validate_arguments() {
  [ -n "$PARENT" ] || fail '--parent is required'
  [ -n "$TARGET" ] || fail '--target is required'
  case "$PARENT" in
    claude|codex) ;;
    *) fail "parent '$PARENT' is not allowed" ;;
  esac
}

validate_route() {
  local target_kind="$1"
  case "$PARENT:$target_kind" in
    claude:codex|claude:opencode|codex:claude|codex:opencode) ;;
    *) fail "route '$PARENT' -> '$target_kind' is not allowed" ;;
  esac
}

preflight() {
  validate_arguments
  command -v herdr >/dev/null 2>&1 || fail 'herdr is not installed'
  herdr status >/dev/null 2>&1 || fail 'Herdr server is not reachable'

  local agent_payload
  agent_payload="$(herdr agent get "$TARGET" 2>/dev/null)" || fail "agent '$TARGET' was not found"

  local target_kind
  target_kind="$(printf '%s' "$agent_payload" | agent_field agent)" || fail "agent '$TARGET' has no readable type"
  validate_route "$target_kind"

  local current_state
  current_state="$(printf '%s' "$agent_payload" | agent_state)" || fail "agent '$TARGET' has no readable state"
  [ "$current_state" = 'idle' ] || fail "agent '$TARGET' is '$current_state', not idle"

  printf 'agent delegation ready: parent=%s target=%s type=%s state=%s\n' "$PARENT" "$TARGET" "$target_kind" "$current_state"
}

require_task_ticket() {
  local task_file="$1"
  [ -f "$task_file" ] || fail "task file does not exist: $task_file"
  local heading
  for heading in '## Objective' '## Allowed paths' '## Prohibited operations' '## Expected result' '## Verification' '## Completion criteria'; do
    grep -Fqx -- "$heading" "$task_file" || fail "task file is missing '$heading'"
  done
}

require_path_inside_worktree() {
  local path="$1"
  local worktree="$2"
  python3 - "$path" "$worktree" <<'PY'
import os
import sys

path = os.path.realpath(sys.argv[1])
worktree = os.path.realpath(sys.argv[2])
if os.path.commonpath((path, worktree)) != worktree:
    raise SystemExit(1)
PY
}

dispatch() {
  local task_file=''
  local worktree=''
  local result_file=''

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --parent) PARENT="${2:-}"; shift 2 ;;
      --target) TARGET="${2:-}"; shift 2 ;;
      --task-file) task_file="${2:-}"; shift 2 ;;
      --worktree) worktree="${2:-}"; shift 2 ;;
      --result-file) result_file="${2:-}"; shift 2 ;;
      --timeout-ms) TIMEOUT_MS="${2:-}"; shift 2 ;;
      *) usage >&2; exit 64 ;;
    esac
  done

  [ -n "$task_file" ] && [ -n "$worktree" ] && [ -n "$result_file" ] || fail 'task-file, worktree, and result-file are required'
  [ -d "$worktree" ] || fail "worktree does not exist: $worktree"
  [[ "$TIMEOUT_MS" =~ ^[1-9][0-9]*$ ]] || fail 'timeout-ms must be a positive integer'
  require_task_ticket "$task_file"
  require_path_inside_worktree "$result_file" "$worktree" || fail 'result file must be inside the worktree'
  [ -d "$(dirname "$result_file")" ] || fail 'result file parent directory does not exist'
  preflight >/dev/null

  local prompt
  prompt="$(cat <<EOF
You are a bounded Herdr delegation worker. Execute exactly one task.

Parent type: $PARENT
Task ticket: $task_file
Worktree: $worktree
Result file: $result_file

Read the task ticket first. Work only in the stated worktree and only on the
allowed paths in that ticket. Do not make design decisions or broaden scope.
Never perform network access, dependency changes, destructive operations,
database operations, or any git commit, push, branch, merge, or PR action.
Do not change approval settings or use automatic approval. If a required action
is outside the ticket, stop and report the blocker; do not retry the same failed
action repeatedly.

Before finishing, write the result file in Markdown with: summary, changed
files, verification commands and outcomes, blockers, and scope confirmation.
Then give a short terminal summary. The parent agent will review all results
before deciding whether to send another task.
EOF
)"

  herdr agent prompt "$TARGET" "$prompt" >/dev/null

  local wait_output
  wait_output="$(herdr agent wait "$TARGET" --until done --until blocked --until idle --timeout "$TIMEOUT_MS")" || fail 'agent wait failed or timed out'
  printf '%s\n' "$wait_output" >"$result_file.wait.txt"
  herdr agent read "$TARGET" --source recent-unwrapped --lines 200 --format text >"$result_file.terminal.txt" || fail 'agent output could not be read'

  if printf '%s' "$wait_output" | grep -Eq '"(status|agent_status|state)"[[:space:]]*:[[:space:]]*"blocked"|\bblocked\b'; then
    fail "agent '$TARGET' is blocked"
  fi
  [ -s "$result_file" ] || fail "agent completed without a result file: $result_file"

  printf 'agent delegation complete: parent=%s result=%s terminal=%s.terminal.txt\n' "$PARENT" "$result_file" "$result_file"
}

command_name="${1:-}"
case "$command_name" in
  preflight)
    shift
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --parent) PARENT="${2:-}"; shift 2 ;;
        --target) TARGET="${2:-}"; shift 2 ;;
        *) usage >&2; exit 64 ;;
      esac
    done
    preflight
    ;;
  dispatch)
    shift
    dispatch "$@"
    ;;
  *)
    usage >&2
    exit 64
    ;;
esac

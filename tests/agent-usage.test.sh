#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
SCRIPT_PATH="$ROOT_DIR/bin/agent-usage"
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/agent-usage-test.XXXXXX")

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'ok - %s\n' "$1"
}

assert_contains() {
  local haystack=$1
  local needle=$2
  local description=$3

  if ! grep -Fq -- "$needle" <<<"$haystack"; then
    fail "$description (missing: $needle)"
  fi
}

assert_not_contains() {
  local haystack=$1
  local needle=$2
  local description=$3

  if grep -Fq -- "$needle" <<<"$haystack"; then
    fail "$description (unexpected: $needle)"
  fi
}

write_success_fixtures() {
  local fixture_dir=$1

  mkdir -p "$fixture_dir"
  printf '%s\n' \
    '{"five_hour":{"utilization":73.0,"resets_at":"2100-01-01T00:00:00+00:00"},"seven_day":{"utilization":12.0,"resets_at":"2100-01-02T00:00:00+00:00"},"seven_day_opus":null,"seven_day_sonnet":{"utilization":0.0,"resets_at":null},"extra_usage":{"is_enabled":false}}' \
    > "$fixture_dir/claude.json"
  printf '%s\n' \
    '{"id":1,"result":{"protocolVersion":"1.0"}}' \
    '{"id":2,"result":{"rateLimits":{"primary":{"usedPercent":20,"windowDurationMins":300,"resetsAt":4102444800},"secondary":{"usedPercent":65,"windowDurationMins":10080,"resetsAt":4103049600},"credits":{"hasCredits":true,"unlimited":false,"balance":"***"},"planType":"plus"}}}' \
    > "$fixture_dir/codex.json"
}

write_stub_commands() {
  local bin_dir=$1

  mkdir -p "$bin_dir"
  cat > "$bin_dir/curl" <<'STUB'
#!/usr/bin/env bash
if [[ "${AGENT_USAGE_TEST_MODE:-success}" == "auth_failure" ]]; then
  printf '%s\n' '{"error":{"type":"authentication_error","message":"invalid token"}}'
  printf '%s\n' '__AGENT_USAGE_HTTP_STATUS__401'
  exit 0
fi
if [[ "${AGENT_USAGE_TEST_MODE:-success}" == "failure" ]]; then
  exit 22
fi
cat "$AGENT_USAGE_CLAUDE_FIXTURE"
printf '%s\n' '__AGENT_USAGE_HTTP_STATUS__200'
STUB
  cat > "$bin_dir/codex" <<'STUB'
#!/usr/bin/env bash
if [[ "${1:-}" != "app-server" ]]; then
  exit 64
fi
if [[ "${AGENT_USAGE_TEST_MODE:-success}" == "failure" ]]; then
  exit 1
fi
cat "$AGENT_USAGE_CODEX_FIXTURE"
STUB
  cat > "$bin_dir/security" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB
  chmod +x "$bin_dir/curl" "$bin_dir/codex" "$bin_dir/security"
}

run_success_case() {
  local home_dir="$TMP_DIR/success-home"
  local bin_dir="$TMP_DIR/success-bin"
  local fixture_dir="$TMP_DIR/success-fixtures"
  local output

  mkdir -p "$home_dir/.claude"
  printf '%s\n' '{"claudeAiOauth":{"accessToken":"test-secret-token"}}' \
    > "$home_dir/.claude/.credentials.json"
  write_success_fixtures "$fixture_dir"
  write_stub_commands "$bin_dir"

  if ! output=$(
    HOME="$home_dir" \
    PATH="$bin_dir:$PATH" \
    AGENT_USAGE_CLAUDE_FIXTURE="$fixture_dir/claude.json" \
    AGENT_USAGE_CODEX_FIXTURE="$fixture_dir/codex.json" \
    AGENT_USAGE_CODEX_WAIT_SECONDS=0 \
    AGENT_USAGE_TEST_MODE=success \
    "$SCRIPT_PATH"
  ); then
    fail 'success response should return zero'
  fi

  assert_contains "$output" 'Claude Code' 'shows Claude Code section'
  assert_contains "$output" 'Codex' 'shows Codex section'
  assert_contains "$output" '5時間枠' 'shows five-hour windows'
  assert_contains "$output" '週間枠' 'shows weekly windows'
  assert_contains "$output" '使用率 73%' 'shows Claude five-hour usage'
  assert_contains "$output" '残量 27%' 'shows Claude five-hour remaining quota'
  assert_contains "$output" '使用率 20%' 'shows Codex five-hour usage'
  assert_contains "$output" '残量 35%' 'shows Codex weekly remaining quota'
  assert_contains "$output" 'リセット' 'shows reset information'
  assert_contains "$output" '取得時刻' 'shows fetch timestamp'
  assert_not_contains "$output" 'test-secret-token' 'does not print credentials'
  pass 'renders both providers and both windows'
}

run_failure_case() {
  local home_dir="$TMP_DIR/failure-home"
  local bin_dir="$TMP_DIR/failure-bin"
  local fixture_dir="$TMP_DIR/failure-fixtures"
  local output
  local status=0

  mkdir -p "$home_dir/.claude"
  printf '%s\n' '{"claudeAiOauth":{"accessToken":"test-secret-token"}}' \
    > "$home_dir/.claude/.credentials.json"
  write_success_fixtures "$fixture_dir"
  write_stub_commands "$bin_dir"

  output=$(
    HOME="$home_dir" \
    PATH="$bin_dir:$PATH" \
    AGENT_USAGE_CLAUDE_FIXTURE="$fixture_dir/claude.json" \
    AGENT_USAGE_CODEX_FIXTURE="$fixture_dir/codex.json" \
    AGENT_USAGE_CODEX_WAIT_SECONDS=0 \
    AGENT_USAGE_TEST_MODE=failure \
    "$SCRIPT_PATH"
  ) || status=$?

  if (( status == 0 )); then
    fail 'provider failure should return non-zero'
  fi
  assert_contains "$output" '取得失敗' 'reports provider failures explicitly'
  assert_not_contains "$output" '使用率 0%' 'does not turn failures into zero usage'
  assert_not_contains "$output" 'test-secret-token' 'does not print credentials after failure'
  pass 'reports provider failures without fabricating zero usage'
}

run_claude_auth_failure_case() {
  local home_dir="$TMP_DIR/auth-failure-home"
  local bin_dir="$TMP_DIR/auth-failure-bin"
  local fixture_dir="$TMP_DIR/auth-failure-fixtures"
  local output
  local status=0

  mkdir -p "$home_dir/.claude"
  printf '%s\n' '{"claudeAiOauth":{"accessToken":"test-secret-token"}}' \
    > "$home_dir/.claude/.credentials.json"
  write_success_fixtures "$fixture_dir"
  write_stub_commands "$bin_dir"

  output=$(
    HOME="$home_dir" \
    PATH="$bin_dir:$PATH" \
    AGENT_USAGE_CLAUDE_FIXTURE="$fixture_dir/claude.json" \
    AGENT_USAGE_CODEX_FIXTURE="$fixture_dir/codex.json" \
    AGENT_USAGE_CODEX_WAIT_SECONDS=0 \
    AGENT_USAGE_TEST_MODE=auth_failure \
    "$SCRIPT_PATH"
  ) || status=$?

  if (( status == 0 )); then
    fail 'authentication failure should return non-zero'
  fi
  assert_contains "$output" '認証が無効または期限切れ' 'identifies expired Claude credentials'
  assert_not_contains "$output" '使用率 0%' 'does not turn authentication failures into zero usage'
  assert_not_contains "$output" 'test-secret-token' 'does not print credentials after authentication failure'
  pass 'identifies Claude authentication failures'
}

if [[ ! -x "$SCRIPT_PATH" ]]; then
  fail "command is not executable yet: $SCRIPT_PATH"
fi

run_success_case
run_failure_case
run_claude_auth_failure_case

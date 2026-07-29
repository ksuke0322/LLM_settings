#!/usr/bin/env bash
# Compatibility entry point. --parent remains mandatory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/herdr-agent-delegate.sh" "$@"

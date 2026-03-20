#!/usr/bin/env bash
# OCC Enforcement for Claude Desktop — Setup Script
# Wraps any MCP server with cryptographic proof via occ-mcp-proxy.
#
# Usage:
#   ./setup.sh <server-name> <command> [args...]
#
# Example:
#   ./setup.sh filesystem npx -y @anthropic/mcp-filesystem /tmp
#
# This generates the claude_desktop_config.json snippet you need.

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: ./setup.sh <server-name> <command> [args...]"
  echo ""
  echo "Example:"
  echo "  ./setup.sh filesystem npx -y @anthropic/mcp-filesystem /tmp"
  exit 1
fi

SERVER_NAME="$1"
shift
COMMAND="$1"
shift
ARGS=("$@")

# Build the args JSON array for the downstream server
DOWNSTREAM_ARGS=""
for arg in "${ARGS[@]}"; do
  if [ -n "$DOWNSTREAM_ARGS" ]; then
    DOWNSTREAM_ARGS="$DOWNSTREAM_ARGS, \"$arg\""
  else
    DOWNSTREAM_ARGS="\"$arg\""
  fi
done

# The OCC proxy wraps the downstream server
PROXY_ARGS="\"--wrap\", \"$COMMAND\""
if [ -n "$DOWNSTREAM_ARGS" ]; then
  PROXY_ARGS="$PROXY_ARGS, $DOWNSTREAM_ARGS"
fi

CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

cat <<EOF

Add this to your Claude Desktop config at:
  $CONFIG_FILE

{
  "mcpServers": {
    "occ-${SERVER_NAME}": {
      "command": "npx",
      "args": ["-y", "occ-mcp-proxy@latest", $PROXY_ARGS]
    }
  }
}

Every tool call through "${SERVER_NAME}" will now produce Ed25519-signed proofs
written to proof.jsonl in your working directory.

Verify anytime:
  npx occ-mcp-proxy verify proof.jsonl

EOF

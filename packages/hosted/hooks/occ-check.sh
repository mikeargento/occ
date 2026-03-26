#!/bin/bash
# OCC Hook for Claude Code
# Reads tool call from stdin, sends to OCC for approval.
# Exit 0 = allow, Exit 2 = deny.
#
# Config: set OCC_TOKEN in your environment
# Get your token from agent.occ.wtf → Settings

OCC_URL="${OCC_URL:-https://agent.occ.wtf}"
TOKEN="${OCC_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo '{"decision":"allow"}' # No token = no enforcement, pass through
  exit 0
fi

# Read hook input from stdin
INPUT=$(cat)

# Extract tool name and args
TOOL=$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4)
TOOL_INPUT=$(echo "$INPUT" | grep -o '"tool_input":{[^}]*}' | head -1 | sed 's/^"tool_input"://')

if [ -z "$TOOL" ]; then
  exit 0 # Can't parse, allow
fi

# Skip internal/read-only tools that don't need approval
case "$TOOL" in
  Read|Glob|Grep|WebSearch|TodoRead|TaskOutput)
    exit 0
    ;;
esac

# Call OCC
RESPONSE=$(curl -s -m 125 -X POST "${OCC_URL}/api/v2/hook/check" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"tool\":\"$TOOL\",\"args\":$TOOL_INPUT}")

DECISION=$(echo "$RESPONSE" | grep -o '"decision":"[^"]*"' | head -1 | cut -d'"' -f4)
REASON=$(echo "$RESPONSE" | grep -o '"reason":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$DECISION" = "allow" ]; then
  exit 0
elif [ "$DECISION" = "deny" ]; then
  echo "OCC: Action denied — ${REASON:-No reason given}" >&2
  exit 2
else
  # Unknown response, allow by default
  exit 0
fi

#!/bin/bash
# OCC Agent Proxy — Quick Setup
#
# This script:
#   1. Builds all dependencies (policy-sdk, stub, occ-agent, mcp-proxy)
#   2. Loads the demo policy into the proxy via the management API
#   3. Prints the Claude Desktop config snippet
#
# Usage:
#   cd occ/packages/mcp-proxy
#   bash examples/setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROXY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGES_DIR="$(cd "$PROXY_DIR/.." && pwd)"

echo "═══════════════════════════════════════════════"
echo "  OCC Agent Proxy — Setup"
echo "═══════════════════════════════════════════════"
echo ""

# ── Build dependencies ──
echo "▸ Building policy-sdk..."
(cd "$PACKAGES_DIR/policy-sdk" && npm run build 2>&1 | tail -1)

echo "▸ Building stub..."
(cd "$PACKAGES_DIR/stub" && npm run build 2>&1 | tail -1)

echo "▸ Building occ-agent..."
(cd "$PACKAGES_DIR/occ-agent" && npm run build 2>&1 | tail -1)

echo "▸ Building mcp-proxy..."
(cd "$PROXY_DIR" && npm run build 2>&1 | tail -1)

echo ""
echo "✓ All packages built"
echo ""

# ── Print Claude Desktop config ──
echo "═══════════════════════════════════════════════"
echo "  Claude Desktop Configuration"
echo "═══════════════════════════════════════════════"
echo ""
echo "Add this to your Claude Desktop config file:"
echo "  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo ""
cat <<EOJSON
{
  "mcpServers": {
    "occ-agent": {
      "command": "node",
      "args": [
        "$PROXY_DIR/dist/index.js",
        "--config",
        "$PROXY_DIR/examples/proxy-config.json"
      ]
    }
  }
}
EOJSON
echo ""

# ── Instructions ──
echo "═══════════════════════════════════════════════"
echo "  Next Steps"
echo "═══════════════════════════════════════════════"
echo ""
echo "1. Add the config above to Claude Desktop"
echo "2. Restart Claude Desktop"
echo "3. Start the dashboard:  cd $PACKAGES_DIR/commandcentral && npm run dev"
echo "4. Open http://localhost:3002/settings — verify proxy connection"
echo "5. Load a policy via the dashboard (Policies → New Policy)"
echo "   Or load the demo policy via CLI:"
echo ""
echo "   curl -X PUT http://localhost:9100/policy \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d @$PROXY_DIR/examples/demo-policy.json"
echo ""
echo "6. Use Claude Desktop — every tool call flows through the proxy"
echo "7. Check the Proof Log at http://localhost:3002/audit"
echo ""
echo "The proxy logs to stderr. Signer state persists at:"
echo "  $PROXY_DIR/.occ/signer-state.json"
echo ""

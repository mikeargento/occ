---
name: bitgraph-agent
description: Set up and run the BitGraph Agent proxy — the control plane for AI agents with default-deny policy enforcement and cryptographic proof signing. Use when the user wants to install, configure, or start the BitGraph Agent proxy, connect it to Claude Desktop, or manage agent policies.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
argument-hint: [start|setup|status|stop]
---

# BitGraph Agent — Setup & Control Skill

You are helping the user set up and manage the BitGraph Agent proxy, a control plane that enforces default-deny policies on AI tool calls and signs every action with a cryptographic proof.

## System Info

Node version: !`node --version 2>/dev/null || echo "NOT INSTALLED"`
Proxy installed: !`command -v bitgraph-mcp-proxy >/dev/null 2>&1 && echo "yes ($(bitgraph-mcp-proxy --version 2>/dev/null || echo 'unknown version'))" || (npm ls -g bitgraph-mcp-proxy 2>/dev/null | grep bitgraph-mcp-proxy || echo "no")`
Proxy running: !`curl -s http://localhost:9100/health 2>/dev/null || echo "not running"`
Claude Desktop config: !`cat "$HOME/Library/Application Support/Claude/claude_desktop_config.json" 2>/dev/null || echo "not found"`

## Commands

The user passes an argument: `$ARGUMENTS`

### `/bitgraph-agent` or `/bitgraph-agent start` — Start the proxy

1. Check if the proxy is already running (health check above). If yes, tell the user and skip to step 4.
2. Check if `bitgraph-mcp-proxy` is installed. If not, install it:
   ```
   npm install -g bitgraph-mcp-proxy
   ```
3. Start the proxy in the background:
   ```
   npx bitgraph-mcp-proxy --no-open &
   ```
4. Wait 2 seconds, then verify with `curl -s http://localhost:9100/health`.
5. Tell the user the proxy is running and the dashboard is at `http://localhost:9100`.
6. Show them how to open the agent management UI at `https://bitgraph.ing/agent` (or `http://localhost:3001/agent` if running locally).

### `/bitgraph-agent setup` — Full setup with Claude Desktop

1. Do everything from `start` above.
2. Check the Claude Desktop config at `~/Library/Application Support/Claude/claude_desktop_config.json`.
3. If `bitgraph-agent` is not already in the config, add it:
   ```json
   {
     "mcpServers": {
       "bitgraph-agent": {
         "command": "npx",
         "args": ["bitgraph-mcp-proxy", "--mcp"]
       }
     }
   }
   ```
   Merge with existing config — do NOT overwrite other MCP servers.
4. Tell the user to restart Claude Desktop to pick up the new MCP server.
5. Explain: "Every tool call Claude Desktop makes will now flow through the BitGraph Agent proxy. Tools are blocked by default — enable them per-agent at https://bitgraph.ing/agent"

### `/bitgraph-agent status` — Check status

1. Report proxy health from the dynamic context above.
2. If running, fetch agent list: `curl -s http://localhost:9100/api/agents`
3. Show a summary: how many agents, which are active/paused, how many tools enabled.

### `/bitgraph-agent stop` — Stop the proxy

1. Find and kill the proxy process:
   ```
   pkill -f bitgraph-mcp-proxy || echo "Proxy not running"
   ```
2. Confirm it's stopped.

## Key Concepts to Explain

- **Default-deny**: agents start with zero tool access. Nothing flows unless explicitly allowed.
- **Dashboard**: manage agents, toggle tools, view proof logs at `http://localhost:9100` or `https://bitgraph.ing/agent`.
- **Proofs**: every tool call gets a cryptographic receipt — tamper-evident audit trail.
- **The proxy sits between Claude and MCP tools** — it's a policy enforcement + signing layer.

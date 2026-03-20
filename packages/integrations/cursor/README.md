# OCC Enforcement for Cursor

One line to enforce. One proof to verify.

## What it does

Wraps any MCP server in Cursor with OCC's cryptographic proof layer. Every tool call gets an Ed25519-signed receipt. Policy violations are signed and denied.

## Setup (30 seconds)

### 1. Create or edit `.cursor/mcp.json` in your project root

```json
{
  "mcpServers": {
    "occ-filesystem": {
      "command": "npx",
      "args": ["-y", "occ-mcp-proxy@latest", "--wrap", "npx", "-y", "@anthropic/mcp-filesystem", "/tmp"]
    }
  }
}
```

### 2. Restart Cursor

The OCC proxy starts automatically when Cursor connects to the MCP server.

## Pattern

Take any MCP server config and insert the OCC proxy wrapper:

**Before:**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "my-mcp-server"]
    }
  }
}
```

**After:**
```json
{
  "mcpServers": {
    "occ-my-server": {
      "command": "npx",
      "args": ["-y", "occ-mcp-proxy@latest", "--wrap", "npx", "-y", "my-mcp-server"]
    }
  }
}
```

## Adding a policy

Add `--policy rules.json` before `--wrap`:

```json
{
  "mcpServers": {
    "occ-my-server": {
      "command": "npx",
      "args": ["-y", "occ-mcp-proxy@latest", "--policy", "rules.json", "--wrap", "npx", "-y", "my-mcp-server"]
    }
  }
}
```

## Verify proofs

```bash
npx occ-mcp-proxy verify proof.jsonl
```

## How it works

```
Cursor Agent  -->  occ-mcp-proxy  -->  Your MCP Server
                    |
                    +-- policy enforcement (default-deny)
                    +-- Ed25519 signing (every call)
                    +-- proof.jsonl (append-only log)
```

Same tools, same results. Now with cryptographic proof of every action.

# OCC Enforcement for Claude Desktop

One line to enforce. One proof to verify.

## What it does

Wraps any MCP server with OCC's cryptographic proof layer. Every tool call gets an Ed25519-signed receipt written to `proof.jsonl`. If a tool is blocked by policy, the denial is signed too.

## Setup (30 seconds)

### Option A: Edit config directly

Open your Claude Desktop config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Replace any MCP server entry with the OCC-wrapped version:

**Before:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-filesystem", "/tmp"]
    }
  }
}
```

**After:**
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

### Option B: Use the setup script

```bash
./setup.sh filesystem npx -y @anthropic/mcp-filesystem /tmp
```

This prints the config snippet to paste in.

### Restart Claude Desktop

After editing the config, restart Claude Desktop. The OCC proxy starts automatically.

## Adding a policy

Create a `rules.json`:

```json
{
  "version": "occ/policy/1",
  "name": "safe-filesystem",
  "createdAt": 1710000000000,
  "globalConstraints": {
    "allowedTools": ["read_file", "list_directory"],
    "blockedTools": ["write_file", "delete_file"]
  },
  "skills": {}
}
```

Then add `--policy rules.json` to the args:

```json
{
  "mcpServers": {
    "occ-filesystem": {
      "command": "npx",
      "args": ["-y", "occ-mcp-proxy@latest", "--policy", "rules.json", "--wrap", "npx", "-y", "@anthropic/mcp-filesystem", "/tmp"]
    }
  }
}
```

## Verify proofs

```bash
npx occ-mcp-proxy verify proof.jsonl
```

This checks chain integrity, Ed25519 signatures, and prints a full audit report.

## How it works

```
Claude Desktop  -->  occ-mcp-proxy  -->  Your MCP Server
                      |
                      +-- policy enforcement (default-deny)
                      +-- Ed25519 signing (every call)
                      +-- proof.jsonl (append-only log)
```

The proxy is invisible to Claude. It sees the same tools, gets the same results. But every action is now cryptographically proven.

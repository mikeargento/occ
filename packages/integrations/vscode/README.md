# OCC Enforcement VS Code Extension

One line to enforce. One proof to verify.

## Concept

A VS Code extension that provides real-time visibility into OCC agent enforcement directly in the editor.

## Features

### Status Bar
- Shows enforcement status: active/inactive
- Displays proof count and chain health
- Click to open the dashboard

### Proof Chain Viewer (Sidebar Panel)
- Tree view of all proof entries from `proof.jsonl`
- Color-coded: green for allowed, red for denied
- Click any entry to see full details (tool, args, receipt, signature)
- Chain integrity indicator at the top

### Policy Status Panel
- Shows currently loaded policy
- Lists allowed/blocked tools
- Rate limit and spend cap status
- Click to edit policy file

### Agent Panel
- Lists connected agents
- Per-agent tool toggles
- Pause/resume buttons
- Live audit count

### Commands
- `OCC: Verify Proof Chain` -- Run full verification on proof.jsonl
- `OCC: Open Dashboard` -- Open the web dashboard in browser
- `OCC: Start Proxy` -- Start the OCC proxy from VS Code
- `OCC: Stop Proxy` -- Stop the proxy
- `OCC: Load Policy` -- Select and load a policy file

### Editor Integration
- When `proof.jsonl` is open, a "Verify" button appears in the editor title bar
- JSONL syntax highlighting for proof files
- Hover over tool names to see policy status

## Configuration

| Setting | Default | Description |
|---|---|---|
| `occ.proxyUrl` | `http://localhost:9100` | OCC proxy URL |
| `occ.proofFile` | `proof.jsonl` | Proof log path |
| `occ.autoStart` | `false` | Auto-start proxy on VS Code open |
| `occ.policyFile` | | Default policy file |

## Architecture

```
VS Code Extension
  |
  +-- Status Bar Item
  |     +-- Polls /api/health every 5s
  |
  +-- Proof Chain TreeView
  |     +-- Watches proof.jsonl for changes
  |     +-- Parses JSONL, builds tree
  |
  +-- Policy Status TreeView
  |     +-- Reads from /api/policy
  |
  +-- Agent TreeView
  |     +-- Reads from /api/agents
  |     +-- Subscribes to /api/events (SSE)
  |
  +-- Commands
        +-- Verify: spawns `npx occ-mcp-proxy verify`
        +-- Dashboard: opens proxy URL in browser
        +-- Start/Stop: manages child process
```

## Building (when ready)

```bash
npm install
npm run compile
# Package with vsce
npx @vscode/vsce package
```

## Status

This is a concept manifest. The `package.json` is complete and ready for implementation. The extension would be a thin wrapper around the OCC proxy HTTP API, providing a visual interface for what the CLI already does.

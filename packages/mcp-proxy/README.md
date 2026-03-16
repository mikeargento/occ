# occ-mcp-proxy

Cryptographic proof for every AI tool call. Wrap any MCP server with Ed25519-signed receipts.

## Quick Start

```
npx occ-mcp-proxy --wrap npx <your-mcp-server>
```

Every tool call produces a signed receipt in `proof.jsonl`.

## Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["occ-mcp-proxy", "--wrap", "npx", "my-mcp-server"]
    }
  }
}
```

That's it. Claude calls tools normally. Every call gets an Ed25519-signed receipt written to `proof.jsonl` in the working directory.

## Any MCP Client

Works with Paperclip, Cursor, Windsurf, or any MCP-compatible client. Point it at:

```
npx occ-mcp-proxy --wrap <command> [args...]
```

The proxy discovers tools from the downstream server, passes calls through transparently, and signs every execution.

## What You Get

Each line in `proof.jsonl` contains:

```json
{
  "timestamp": "2026-03-16T...",
  "tool": "send-email",
  "args": { "to": "...", "body": "..." },
  "output": [{ "type": "text", "text": "..." }],
  "proofDigestB64": "sha256:...",
  "receipt": {
    "format": "occ-agent/receipt/1",
    "envelope": {
      "tool": "send-email",
      "inputHashB64": "...",
      "outputHashB64": "..."
    },
    "proof": {
      "artifact": { "digestB64": "..." },
      "signer": {
        "publicKeyB64": "...",
        "signatureB64": "..."
      }
    }
  }
}
```

- Ed25519 signatures chain across calls
- Signer identity persists in `.occ/signer-state.json`
- Receipts are self-contained and offline-verifiable
- No server, no account, no trust required

## Dashboard Mode

For agent management with per-agent policies and a web dashboard:

```
npx occ-mcp-proxy --mcp
```

## License

Apache-2.0

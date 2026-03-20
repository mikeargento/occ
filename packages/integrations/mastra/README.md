# occ-mastra

Cryptographic proof signing for Mastra tool calls. Every tool execution gets an Ed25519-signed proof written to `proof.jsonl`.

## Install

```bash
npm install occ-mastra mastra
```

## Usage

### Wrap tools directly

```typescript
import { occWrapTool, occWrapTools } from "occ-mastra";

// Wrap a single tool
const wrappedSearch = occWrapTool(searchTool, "search");

// Wrap all tools at once
const tools = occWrapTools({
  search: searchTool,
  calculate: calcTool,
});
```

### Use middleware hooks

```typescript
import { occMiddleware } from "occ-mastra";

const mw = occMiddleware({ agentId: "my-mastra-agent" });

// beforeExecute / afterExecute hooks for Mastra's middleware system
const agent = new Agent({
  tools: { search: searchTool },
  middleware: [mw],
});
```

### Convenience methods on middleware

```typescript
const mw = occMiddleware();

// Wrap tools via middleware instance
const tools = mw.wrapTools({ search: searchTool });
const single = mw.wrapTool(searchTool, "search");
```

## Configuration

```typescript
interface OCCMastraOptions {
  proofFile?: string;    // Default: "proof.jsonl"
  statePath?: string;    // Default: ".occ/signer-state.json"
  measurement?: string;  // Default: "occ-mastra:stub"
  agentId?: string;      // Default: "mastra-agent"
}
```

## How it works

1. `occWrapTool()` wraps a tool's `execute` with pre/post proof signing
2. `occWrapTools()` wraps all tools in a record
3. `occMiddleware()` provides `beforeExecute`/`afterExecute` hooks
4. Pre-execution proof: Ed25519 signature over SHA-256 of tool name + arguments
5. Post-execution proof: signature over tool name + args + result
6. Proofs are chained via `prevB64` for tamper-evident ordering
7. All proofs written to `proof.jsonl` as append-only log

## Verify

```bash
npx occ-mcp-proxy verify proof.jsonl
```

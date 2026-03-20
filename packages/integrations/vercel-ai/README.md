# occ-vercel

Cryptographic proof signing for Vercel AI SDK tool calls. Every tool execution gets an Ed25519-signed pre/post proof pair written to `proof.jsonl`.

## Install

```bash
npm install occ-vercel ai
```

## Usage

### Option A: Wrap tools directly

```typescript
import { tool } from "ai";
import { z } from "zod";
import { occWrapTools } from "occ-vercel";

const tools = occWrapTools({
  search: tool({
    description: "Search the web",
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => doSearch(query),
  }),
  calculate: tool({
    description: "Calculate math",
    parameters: z.object({ expression: z.string() }),
    execute: async ({ expression }) => eval(expression),
  }),
});

const result = await generateText({
  model: openai("gpt-4o"),
  tools,
  prompt: "Search for OCC",
});
```

### Option B: Middleware pattern

```typescript
import { generateText } from "ai";
import { occMiddleware } from "occ-vercel";

const result = await generateText({
  model: openai("gpt-4o"),
  tools: { search: searchTool },
  experimental_middleware: occMiddleware(),
  prompt: "Search for OCC",
});
```

### Option C: Wrap a single tool

```typescript
import { occWrapTool } from "occ-vercel";

const safeSearch = occWrapTool(searchTool, "search", {
  proofFile: "proof.jsonl",
  agentId: "my-agent",
});
```

## Configuration

```typescript
interface OCCVercelOptions {
  proofFile?: string;    // Default: "proof.jsonl"
  statePath?: string;    // Default: ".occ/signer-state.json"
  measurement?: string;  // Default: "occ-vercel:stub"
  agentId?: string;      // Default: "vercel-ai-agent"
}
```

## How it works

1. Each tool's `execute` function is wrapped with pre/post proof signing
2. **Pre-execution proof**: Ed25519 signature over SHA-256(tool name + arguments)
3. Tool executes normally
4. **Post-execution proof**: Ed25519 signature over SHA-256(tool name + args + result)
5. Proofs are chained via `prevB64` for tamper-evident ordering
6. Ed25519 keypair generated on first use, persisted to `.occ/signer-state.json`

## Verify

```bash
npx occ-mcp-proxy verify proof.jsonl
```

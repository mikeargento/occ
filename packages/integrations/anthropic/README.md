# occ-anthropic

Cryptographic proof signing for Anthropic Node SDK tool calls. Every tool call gets an Ed25519-signed proof written to `proof.jsonl`.

## Install

```bash
npm install occ-anthropic @anthropic-ai/sdk
```

## Usage

### Wrap the client

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { wrapAnthropic } from "occ-anthropic";

const client = wrapAnthropic(new Anthropic(), {
  proofFile: "proof.jsonl",    // default
  agentId: "my-agent",
});

// Use as normal — tool calls are automatically signed
const response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "What's the weather?" }],
  tools: [{
    name: "get_weather",
    description: "Get the weather for a city",
    input_schema: {
      type: "object" as const,
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  }],
});
```

### Sign tool execution results

When you execute tool calls in your own loop, sign the results too:

```typescript
import { signToolResult } from "occ-anthropic";

// After executing the tool
const result = await getWeather({ city: "Buffalo" });

// Sign the result
await signToolResult("get_weather", { city: "Buffalo" }, result);
```

## Configuration

```typescript
interface WrapAnthropicOptions {
  proofFile?: string;    // Default: "proof.jsonl"
  statePath?: string;    // Default: ".occ/signer-state.json"
  measurement?: string;  // Default: "occ-anthropic:stub"
  agentId?: string;      // Default: "anthropic-agent"
}
```

## How it works

1. `wrapAnthropic()` returns a Proxy around your Anthropic client
2. When `messages.create()` returns `tool_use` content blocks, each one is signed
3. Pre-execution proof: Ed25519 signature over SHA-256 of tool name + arguments
4. Post-execution proof (via `signToolResult`): signature over tool name + args + result
5. Both proofs are chained via `prevB64` for tamper-evident ordering
6. All proofs written to `proof.jsonl` as append-only log

## Verify

```bash
npx occ-mcp-proxy verify proof.jsonl
```

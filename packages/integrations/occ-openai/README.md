# occ-openai

Cryptographic proof signing for OpenAI Node SDK tool calls. Every tool call gets an Ed25519-signed proof written to `proof.jsonl`.

## Install

```bash
npm install occ-openai openai
```

## Usage

### Wrap the client

```typescript
import OpenAI from "openai";
import { wrapOpenAI } from "occ-openai";

const client = wrapOpenAI(new OpenAI(), {
  proofFile: "proof.jsonl",    // default
  agentId: "my-agent",
});

// Use as normal — tool calls are automatically signed
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "What's the weather?" }],
  tools: [{
    type: "function",
    function: {
      name: "get_weather",
      parameters: { type: "object", properties: { city: { type: "string" } } },
    },
  }],
});
```

### Sign tool execution results

When you execute tool calls in your own loop, sign the results too:

```typescript
import { signToolResult } from "occ-openai";

// After executing the tool
const result = await getWeather({ city: "Buffalo" });

// Sign the result
await signToolResult("get_weather", { city: "Buffalo" }, result);
```

## Configuration

```typescript
interface WrapOpenAIOptions {
  proofFile?: string;    // Default: "proof.jsonl"
  statePath?: string;    // Default: ".occ/signer-state.json"
  measurement?: string;  // Default: "occ-openai:stub"
  agentId?: string;      // Default: "openai-agent"
}
```

## How it works

1. `wrapOpenAI()` returns a Proxy around your OpenAI client
2. When `chat.completions.create()` returns tool calls, each one is signed
3. Pre-execution proof: Ed25519 signature over SHA-256 of tool name + arguments
4. Post-execution proof (via `signToolResult`): signature over tool name + args + result
5. Both proofs are chained via `prevB64` for tamper-evident ordering
6. All proofs written to `proof.jsonl` as append-only log

## Verify

```bash
npx occ-mcp-proxy verify proof.jsonl
```

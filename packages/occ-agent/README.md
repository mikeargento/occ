# @occ/agent

Verifiable execution receipts for AI tool calls via OCC.

## What is OCC Agent?

Agent Skills define what a tool *can* do. OCC Agent proves what a tool *actually did*.

`@occ/agent` is a trust layer for skill execution. It wraps any tool call, creates a canonical execution envelope, hashes it, commits it through [OCC](https://github.com/mikeargento/occ), and returns a portable cryptographic receipt alongside the normal tool output.

```
tool execution → canonical execution envelope → OCC commit → portable receipt
```

## How it relates to OCC

OCC (Origin Controlled Computing) provides cryptographic proof that digital events entered a causal sequence. The proof format (`occ/1`) was designed for arbitrary digital artifacts — files are just one case.

`@occ/agent` reuses the existing OCC proof format directly. The "artifact" committed is the SHA-256 hash of a canonical execution envelope. No new proof schema. No parallel receipt format. Just the same `occ/1` proof with tool execution metadata.

## How it works

```
1. Normalize input  → deterministic JSON
2. Hash input        → SHA-256
3. Execute tool      → get output
4. Normalize output  → deterministic JSON
5. Hash output       → SHA-256
6. Build envelope    → canonical execution envelope
7. Hash envelope     → SHA-256(canonicalize(envelope))
8. Commit digest     → POST /commit with envelope hash
9. Return            → { output, executionEnvelope, occProof }
```

## The Canonical Execution Envelope

```json
{
  "type": "tool-execution",
  "tool": "fetch_url",
  "toolVersion": "1.0.0",
  "runtime": "agent-skills",
  "adapter": "occ-agent",
  "inputHashB64": "base64(SHA-256(canonicalize(input)))",
  "outputHashB64": "base64(SHA-256(canonicalize(output)))",
  "timestamp": 1740000000
}
```

The envelope contains only hashes — never raw input or output. This preserves privacy while still proving that a specific execution record was committed.

## What the proof proves

- A canonical execution record was committed through OCC
- The envelope hash matches the committed artifact digest (`proof.artifact.digestB64`)
- The execution entered the OCC causal sequence at a specific counter position
- The commit was signed by a specific enclave key
- (When available) Hardware attestation, external timestamps, and causal ordering

## What the proof does NOT prove

- That the tool output is correct or complete
- That the input/output hashes correspond to specific content (unless you have the originals)
- That the execution happened at a specific wall-clock time (timestamps are advisory)

## Quick Start

### Wrap a tool

```typescript
import { wrapTool, fetchUrlTool } from "@occ/agent";

const verifiedFetch = wrapTool(fetchUrlTool, {
  apiUrl: "https://your-occ-service.example/commit",
  apiKey: "your-api-key",
});

const result = await verifiedFetch({ url: "https://example.com" });
// result.output         — normal tool output
// result.executionEnvelope — the canonical envelope
// result.occProof       — full OCC proof (occ/1 format)
```

### One-shot execution

```typescript
import { runVerifiedTool, fetchUrlTool } from "@occ/agent";

const result = await runVerifiedTool(
  fetchUrlTool,
  { url: "https://example.com" },
  { apiUrl: "https://your-occ-service.example/commit" },
);
```

### Define a custom tool

```typescript
import { wrapTool, type ToolDefinition } from "@occ/agent";

const myTool: ToolDefinition<{ query: string }, { answer: string }> = {
  name: "my_tool",
  version: "1.0.0",

  async execute(input) {
    const answer = await someService(input.query);
    return { answer };
  },

  normalizeInput(input) {
    return { query: input.query.trim().toLowerCase() };
  },

  normalizeOutput(output) {
    return { answer: output.answer };
  },
};

const verifiedTool = wrapTool(myTool, config);
const result = await verifiedTool({ query: "Hello World" });
```

### Verify a receipt

```typescript
import { verifyExecutionReceipt } from "@occ/agent";

const verification = await verifyExecutionReceipt(
  result.executionEnvelope,
  result.occProof,
);
// verification.valid    — true if all checks pass
// verification.checks   — individual check results
```

## API Reference

### `wrapTool(tool, config)`
Wraps a `ToolDefinition` to produce verified execution receipts. Returns an async function.

### `runVerifiedTool(tool, input, config)`
Wrap and immediately execute. Convenience for one-shot calls.

### `createExecutionEnvelope(opts)`
Build a canonical execution envelope from hashed input/output.

### `hashExecutionEnvelope(envelope)`
SHA-256 hash of the canonicalized envelope. This is the digest committed to OCC.

### `hashValue(value)`
Canonicalize and SHA-256 hash any value. Used for input/output hashing.

### `commitExecutionEnvelope(envelope, config)`
Commit an envelope through the OCC `/commit` endpoint.

### `verifyExecutionReceipt(envelope, proof)`
Local verification: envelope hash match + OCC proof signature.

### `verifyExecutionReceiptRemote(envelope, proof, config)`
Remote verification via the OCC `/verify` endpoint.

### `fetchUrlTool`
Built-in tool definition for URL fetching with deterministic output normalization.

## Privacy Model

- Only hashes are committed to OCC — never raw input or output
- Raw values may be shown in local UI for demonstration
- The canonical execution envelope contains `inputHashB64` and `outputHashB64`, not the values themselves
- Proof generation and privacy boundaries are cleanly separated

## Running the Demo

```bash
cd apps/occ-agent-demo
npm install
npm run dev
# → http://localhost:3002
```

Set `OCC_API_URL` and `OCC_API_KEY` environment variables to connect to a live OCC commit service. Without them, the demo runs in demonstration mode (tool execution works, but no real proofs are generated).

## Integration with Claude / Agent Skills

This package is designed to be the trust layer for agent skill execution. Future integration could look like:

1. **MCP Server wrapper** — An MCP server that wraps tool calls with OCC receipts, making any MCP tool verifiable
2. **Agent SDK middleware** — Interceptor in the Claude Agent SDK that automatically generates receipts for every tool call
3. **Skill metadata** — Skills could declare whether they require OCC verification, and the runtime would enforce it
4. **Receipt chains** — Using `prevB64` proof chaining to create tamper-evident logs of entire agent sessions

The key insight: Agent Skills package *capability*. OCC provides *verifiable execution receipts*. Together, they form a complete trust model for autonomous AI actions.

## License

Apache-2.0

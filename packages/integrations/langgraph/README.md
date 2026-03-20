# occ-langgraph

Cryptographic proof signing for LangGraph node executions. Every node invocation gets an Ed25519-signed proof written to `proof.jsonl`.

## Install

```bash
npm install occ-langgraph @langchain/langgraph
```

## Usage

### Wrap a single node

```typescript
import { occNode } from "occ-langgraph";

const researchNode = occNode(async (state) => {
  const results = await search(state.query);
  return { results };
}, "research");
```

### Wrap all nodes in a graph

```typescript
import { StateGraph } from "@langchain/langgraph";
import { occGraph } from "occ-langgraph";

const builder = new StateGraph({ channels: { query: null, results: null } });
const wrapped = occGraph(builder);

// All nodes added after this are automatically proof-signed
wrapped.addNode("research", async (state) => {
  return { results: await search(state.query) };
});
wrapped.addNode("summarize", async (state) => {
  return { summary: await summarize(state.results) };
});
```

## Configuration

```typescript
interface OCCLangGraphOptions {
  proofFile?: string;    // Default: "proof.jsonl"
  statePath?: string;    // Default: ".occ/signer-state.json"
  measurement?: string;  // Default: "occ-langgraph:stub"
  agentId?: string;      // Default: "langgraph-agent"
}
```

## How it works

1. `occNode()` wraps a node function with pre/post proof signing
2. `occGraph()` patches `addNode` so every node is automatically wrapped
3. Pre-execution proof: Ed25519 signature over SHA-256 of node name + state keys
4. Post-execution proof: signature over node name + state keys + result keys
5. Proofs are chained via `prevB64` for tamper-evident ordering
6. All proofs written to `proof.jsonl` as append-only log

## Verify

```bash
npx occ-mcp-proxy verify proof.jsonl
```

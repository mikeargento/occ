# occ-cloudflare

Cryptographic proof signing for Cloudflare Workers. Every tool/binding call gets an Ed25519-signed proof pair returned alongside the result.

Unlike other OCC integrations, proofs are **returned** (not written to disk) since Cloudflare Workers have no filesystem. Store them wherever you like (KV, D1, R2, Durable Objects).

## Install

```bash
npm install occ-cloudflare
```

## Usage

### Wrap a tool

```typescript
import { occWrapTool } from "occ-cloudflare";

const searchTool = {
  execute: async (args: { query: string }) => {
    return await doSearch(args.query);
  },
};

const wrapped = occWrapTool(searchTool, "search");
const { result, proofs } = await wrapped.execute({ query: "OCC" });

// Store proofs in KV, D1, R2, etc.
await env.PROOF_LOG.put(`proof-${Date.now()}`, JSON.stringify(proofs));
```

### Wrap a binding

```typescript
import { occWrapBinding } from "occ-cloudflare";

export default {
  async fetch(request: Request, env: Env) {
    const kv = occWrapBinding(env.MY_KV, "my-kv");

    const { result, proofs } = await kv.get("some-key");
    // result = the KV value
    // proofs = pre/post Ed25519-signed proof entries
  },
};
```

## Configuration

```typescript
interface OCCCloudflareOptions {
  measurement?: string;  // Default: "occ-cloudflare:stub"
  agentId?: string;      // Default: "cloudflare-worker"
}
```

## How it works

1. `occWrapTool()` wraps a tool's `execute` with pre/post proof signing
2. `occWrapBinding()` wraps all methods on a Cloudflare binding via Proxy
3. An ephemeral Ed25519 key pair is generated in-memory per Worker invocation
4. Pre-execution proof: Ed25519 signature over SHA-256 of tool name + arguments
5. Post-execution proof: signature over tool name + args + result
6. Proofs are chained via `prevB64` for tamper-evident ordering
7. No filesystem access — proofs are returned, not written to disk

## Verify

Collect proof entries and write them to a `.jsonl` file, then:

```bash
npx occ-mcp-proxy verify proof.jsonl
```

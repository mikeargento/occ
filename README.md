# OCC — Origin Controlled Computing

**Control what your AI agents can do. Prove what they did.**

[![npm occproof](https://img.shields.io/npm/v/occproof?label=occproof&color=cb3837)](https://www.npmjs.com/package/occproof)
[![Website](https://img.shields.io/badge/occ.wtf-live-34d399)](https://occ.wtf)

OCC is a system where computations are only executable if they are authorized by a previously committed, cryptographically bound policy. The proof that allowed the action and the proof that it happened are the same object.

```sh
npm install occproof        # Core library
npx occ-mcp-proxy --wrap --policy policy.md npx <any-mcp-server>  # One command
```

---

## How It Works

1. **Define a policy** — a markdown file listing what tools an agent can use
2. **Policy is committed as a signed proof** — cryptographically bound before any actions execute
3. **Every tool call is checked against the policy** — unauthorized tools are blocked before execution
4. **Allowed tools produce a proof** — the authorization and the record are the same object
5. **Revoke a permission** — commit a new policy, and the proof record updates accordingly

No accounts. No external services. Works offline.

---

## What OCC is NOT

- **Not a blockchain** — no consensus, no distributed ledger, no token. Proofs are locally verifiable within a single process, not a replicated public history.
- **Not a watermark** — the proof is a separate document, not embedded in content
- **Not DRM** — no runtime access control or encrypted containers
- **Not proof of truth** — proves what was authorized and what happened, not whether content is accurate

For detailed technical documentation, see [occ.wtf/docs](https://occ.wtf/docs).

---

## Integrations

OCC has policy enforcement built into 16 framework integrations across JavaScript and Python. All of them block unauthorized tools before execution and produce signed proofs for allowed actions.

### JavaScript / TypeScript

```sh
npm install occ-anthropic    # Anthropic SDK
npm install occ-openai       # OpenAI SDK
npm install occ-vercel       # Vercel AI SDK
npm install occ-langgraph    # LangGraph
npm install occ-mastra       # Mastra
npm install occ-cloudflare   # Cloudflare Workers
npm install occ-agent        # Agent SDK (tool wrapping)
```

### Python

```sh
pip install occ-anthropic    # Anthropic SDK
pip install occ-openai-agents # OpenAI Agents
pip install occ-langchain    # LangChain
pip install occ-crewai       # CrewAI
pip install occ-gemini       # Google Gemini
pip install occ-google-adk   # Google ADK
pip install occ-llamaindex   # LlamaIndex
pip install occ-autogen      # AutoGen
pip install occ-openclaw     # OpenClaw
```

### MCP (any server)

```sh
# Wrap ANY MCP server with default-deny policy enforcement
npx occ-mcp-proxy --wrap --policy policy.md npx @modelcontextprotocol/server-filesystem /home
```

### Claude Desktop

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": [
        "occ-mcp-proxy", "--wrap", "--policy", "policy.md",
        "npx", "@modelcontextprotocol/server-filesystem", "/home"
      ]
    }
  }
}
```

---

## Quick Examples

### OpenAI (JS)

```ts
import { occWrap } from 'occ-openai';

const tools = occWrap([
  { name: 'search', fn: searchWeb },
  { name: 'calculate', fn: calculate },
], { policyPath: './policy.md' });
// Unauthorized tools are blocked. Allowed tools get a proof.
```

### Anthropic (Python)

```python
from occ_anthropic import occ_tool

@occ_tool(policy_path="./policy.md")
def search(query: str) -> str:
    return web_search(query)
# Tools not in the policy are blocked before execution.
```

### Vercel AI SDK

```ts
import { occMiddleware } from 'occ-vercel';

const ai = createAI({
  middleware: [occMiddleware({ policyPath: './policy.md' })],
});
// Unauthorized tools blocked. Allowed tools get a proof.
```

---

## Policy Files

Policies are markdown files. Simple and readable:

```markdown
# Policy: Personal Assistant

## Allowed Tools
- search
- calculate
- send_email

## Rate Limit
10 calls per minute

## Time Window
09:00-17:00 UTC
```

The policy is committed as a signed proof before any actions can execute. Every action proof references the policy it was authorized under. Change the policy and a new proof is committed — the record shows what changed and when.

---

## Two Signing Modes

Every integration supports both modes. Switching modes commits a new proof so the transition is recorded in the proof history.

| | Local Signing | TEE (Hardware) |
|---|---|---|
| **Key storage** | Ed25519 keypair on your machine | Key never leaves the enclave |
| **Verification** | Signature valid, software boundary | Signature valid, hardware-attested boundary |
| **Use case** | Development, testing, local control | Production, compliance, third-party verification |
| **Setup** | Zero config | AWS Nitro Enclave |

Local signing is the default. Add `OCC_MODE=tee` to use hardware attestation.

---

## Proof Format (`occ/1`)

Every proof is a self-contained JSON document. No server needed to verify.

```json
{
  "version": "occ/1",
  "artifact": { "hashAlg": "sha256", "digestB64": "..." },
  "commit": { "counter": "42", "time": 1700000000000, "epochId": "..." },
  "signer": { "publicKeyB64": "...", "signatureB64": "..." },
  "environment": { "enforcement": "measured-tee", "measurement": "..." },
  "policy": {
    "name": "Personal Assistant",
    "digestB64": "...",
    "authorProofDigestB64": "..."
  }
}
```

The `policy` field links every action to the policy that authorized it. If the policy changes, subsequent proofs reference the new policy. The proof record shows exactly which policy was in effect for every action.

### Verify a proof (3 lines)

```ts
import { verify } from "occproof";

const result = await verify({ proof, bytes });
// result.valid === true | false
```

---

## MCP Proxy Dashboard

The MCP proxy includes a built-in dashboard for managing agents, policies, and viewing proof logs.

```sh
npx occ-mcp-proxy
# Dashboard at http://localhost:9100
```

Features:
- Per-agent policy management
- Default-deny tool control (nothing runs unless explicitly allowed)
- Real-time proof log
- Policy import (drag-and-drop markdown files)
- Encrypted API key storage

---

## Live Explorer

Browse and verify proofs at **[occ.wtf/explorer](https://occ.wtf/explorer)**

Policy Studio for creating and testing policies: **[occ.wtf/studio](https://occ.wtf/studio)**

---

## Architecture

```
occ/
  src/                        Core library (occproof on npm)
  packages/
    mcp-proxy/                MCP proxy — default-deny, per-agent policies
    commandcentral/           Dashboard UI
    policy-sdk/               Policy enforcement engine
    occ-agent/                Agent SDK — tool wrapping with proofs
    integrations/             16 framework integrations (7 JS + 9 Python)
    paperclip/                Agent orchestrator (see below)
  server/
    commit-service/           TEE commit service (AWS Nitro Enclave)
  website/                    occ.wtf — Next.js
  cli/                        CLI tool
```

---

## Build & Test

```sh
git clone git@github.com:mikeargento/occ.git
cd occ
npm install
npm run build
npm test
```

---

## Cryptography

| Primitive | Algorithm | Library |
|---|---|---|
| Hashing | SHA-256 | `@noble/hashes` |
| Signatures | Ed25519 | `@noble/ed25519` |

Audited, zero-dependency, pure TypeScript.

---

## See Also

- **[Paperclip](https://github.com/mikeargento/occ/tree/main/packages/paperclip)** — an open-source agent control plane (MIT) with built-in OCC policy enforcement, revocation, and TEE-attested proofs. OCC is wired into the Paperclip runtime so every agent action is policy-controlled and cryptographically recorded.
- **[occ.wtf](https://occ.wtf)** — project site, documentation, and live proof explorer
- **[occ.wtf/docs](https://occ.wtf/docs)** — full technical documentation

---

## License

Copyright 2024-2026 Mike Argento.

Licensed under the [Apache License, Version 2.0](./LICENSE).

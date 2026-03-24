# OCC — Origin Controlled Computing

**Define what your AI agents can do.**

[![npm occproof](https://img.shields.io/npm/v/occproof?label=occproof&color=cb3837)](https://www.npmjs.com/package/occproof)
[![Website](https://img.shields.io/badge/occ.wtf-live-34d399)](https://occ.wtf)
[![Dashboard](https://img.shields.io/badge/agent.occ.wtf-dashboard-34d399)](https://agent.occ.wtf)

Every rule is mathematically proven before a single action can exist.

---

## Try OCC

1. **Sign in** at [agent.occ.wtf](https://agent.occ.wtf)
2. **Copy your link** — one URL, unique to you
3. **Paste into your AI** — Cursor, Claude Code, or any MCP-compatible tool
4. **Set your rules** — toggle categories, add custom rules, commit to chain
5. **Use your AI** — blocked actions appear on your dashboard, you allow or deny

That's it. No installs. No config files. One link.

---

## How It Works

OCC is not a permission check. It's a computation model where execution is only reachable through pre-existing, mathematically provable authorization.

1. **You set rules** — toggles and custom rules on [agent.occ.wtf](https://agent.occ.wtf)
2. **Rules become a proof** — committed through a Trusted Execution Environment (TEE), signed and hash-chained
3. **Your AI connects via MCP** — one URL, everything flows through OCC
4. **Tool calls are gated** — no authorization object = no execution path
5. **You allow or deny** — each decision creates a signed authorization object through the TEE
6. **Every execution references its authorization** — the proof that authorized the action and the record that it happened are the same object

---

## Connect Your AI

### Cursor

Settings → MCP → Add Custom MCP → paste your URL

### Claude Code

```sh
claude mcp add occ --transport http https://agent.occ.wtf/mcp/YOUR_TOKEN
```

### Any MCP tool

Paste your URL into the MCP server settings.

---

## What OCC is NOT

- **Not a blockchain** — no consensus, no distributed ledger, no token
- **Not a permission check** — authorization is an object that must exist before execution, not a runtime decision
- **Not a log** — the proof IS the authorization, extended with the execution result
- **Not DRM** — no encrypted containers or access control

---

## Developer Tools

OCC also ships as libraries for building policy enforcement directly into your code:

### JavaScript / TypeScript

```sh
npm install occproof          # Core proof library
npm install occ-mcp-proxy     # MCP proxy with default-deny
npm install occ-anthropic     # Anthropic SDK integration
npm install occ-openai        # OpenAI SDK integration
npm install occ-vercel        # Vercel AI SDK
```

### Python

```sh
pip install occ-anthropic     # Anthropic SDK
pip install occ-langchain     # LangChain
pip install occ-crewai        # CrewAI
pip install occ-gemini        # Google Gemini
pip install occ-google-adk    # Google ADK
```

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
  "policy": { "digestB64": "...", "authorProofDigestB64": "..." }
}
```

The `policy` field links every action to the rule that authorized it. The `authorProofDigestB64` is the causal link — it points to the authorization proof that made the execution possible.

### Verify a proof

```ts
import { verify } from "occproof";
const result = await verify({ proof, bytes });
```

---

## Two Signing Modes

| | Local Signing | TEE (Hardware) |
|---|---|---|
| **Key storage** | Ed25519 keypair on your machine | Key never leaves the enclave |
| **Verification** | Signature valid, software boundary | Signature valid, hardware-attested boundary |
| **Use case** | Development, testing | Production, compliance |
| **Setup** | Zero config | AWS Nitro Enclave |

The hosted dashboard at [agent.occ.wtf](https://agent.occ.wtf) uses TEE signing by default.

---

## Architecture

```
occ/
  src/                        Core library (occproof on npm)
  packages/
    hosted/                   Hosted dashboard + MCP endpoint (agent.occ.wtf)
    commandcentral/           Dashboard UI (Next.js static export)
    mcp-proxy/                Local MCP proxy — default-deny policies
    policy-sdk/               Policy enforcement engine
    integrations/             Framework integrations (JS + Python)
  server/
    commit-service/           TEE commit service (AWS Nitro Enclave)
  website/                    occ.wtf (Next.js on Vercel)
```

---

## Links

- **[occ.wtf](https://occ.wtf)** — project site
- **[agent.occ.wtf](https://agent.occ.wtf)** — dashboard
- **[occ.wtf/explorer](https://occ.wtf/explorer)** — proof explorer
- **[occ.wtf/docs](https://occ.wtf/docs)** — documentation

---

## Cryptography

| Primitive | Algorithm | Library |
|---|---|---|
| Hashing | SHA-256 | `@noble/hashes` |
| Signatures | Ed25519 | `@noble/ed25519` |

Audited, zero-dependency, pure TypeScript.

---

## License

Copyright 2024-2026 Mike Argento.

Licensed under the [Apache License, Version 2.0](./LICENSE).

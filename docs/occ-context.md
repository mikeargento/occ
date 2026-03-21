# OCC — Origin Controlled Computing

## What OCC Is

A system where AI actions are only executable if they are authorized by a previously committed, cryptographically bound policy.

It's not an audit log, not a receipt, not a blockchain. It's the authorization mechanism itself.

**The core abstraction:** The proof IS the control. An AI agent cannot execute a tool call without constructing a valid OCC proof. The proof simultaneously authorizes the action and creates an immutable record of it. No valid proof = no action executes. Like a signed transaction — you can't move Bitcoin without a valid signature, and the signature IS the record.

**One-liner:** "Control what your AI agents can do. Prove what they did."

## How It Works

1. Agent wants to call a tool (send email, read file, hit API, etc.)
2. To execute, a valid OCC proof must be constructed:
   - Signed by an authorized Ed25519 key
   - Compliant with the agent's policy (default-deny — nothing flows unless explicitly allowed)
   - Chained to the previous proof (counter increments, prev hash links)
   - Timestamped by a third-party authority (RFC 3161)
3. If any of that fails, the proof can't be constructed, and the action does not execute
4. If it succeeds, the proof that authorized the action IS the audit trail

The proof is simultaneously the lock and the key. The record of what happened is the same object that allowed it to happen.

## What OCC Is NOT

- NOT a receipt/audit log added after the fact
- NOT guardrails or content filtering
- NOT a blockchain
- NOT just a hash — a hash tells you a file exists; OCC tells you who authorized what, when, in what order, with cryptographic proof that the chain is unbroken

## Architecture

- **Core library** (`occproof` on npm): Ed25519 signatures via @noble/ed25519, SHA-256 hashing
- **MCP Proxy** (`occ-mcp-proxy`): sits between AI orchestrators (Claude, Cursor, etc.) and tools. Default-deny policy engine. Every tool call requires a valid proof.
- **14 framework integrations** (all published to npm/PyPI): OpenAI, Vercel AI, LangGraph, Mastra, Cloudflare Workers, LangChain, CrewAI, Gemini, Google ADK, LlamaIndex, AutoGen, OpenClaw, OpenAI Agents SDK, plus a GitHub Actions verifier
- **Dashboard** (CommandCentral): manage agents, policies, view proof chains, API keys
- **Website**: occ.wtf — Next.js, deployed on Vercel

## Proof Structure (proof.json)

```json
{
  "version": "OCC/0.2",
  "artifact": {
    "hashAlg": "sha-256",
    "digestB64": "<SHA-256 of the artifact>"
  },
  "commit": {
    "counter": 1127,
    "prevB64": "<hash of previous proof in chain>",
    "time": "<ISO timestamp>",
    "nonceB64": "<random nonce>"
  },
  "signer": {
    "publicKeyB64": "<Ed25519 public key>",
    "signatureB64": "<Ed25519 signature over canonical proof>"
  },
  "environment": {
    "enforcement": "hardware-enclave | software | self-reported",
    "measurement": "<enclave measurement hash>",
    "attestation": { "reportB64": "<attestation report>" }
  },
  "timestamps": {
    "rfc3161": { "tokenB64": "<TSA token>" }
  },
  "agency": {
    "type": "webauthn",
    "keyId": "<passkey ID>",
    "authenticatorDataB64": "<...>",
    "clientDataJSON": "<...>"
  }
}
```

## Key Design Decisions

- **Default-deny**: empty policy blocks everything. Faucet model — nothing flows unless explicitly allowed.
- **Per-agent policies**: each agent instance has independent policy and state
- **Proof = authorization**: the proof is not optional logging, it's the mechanism that permits execution
- **Framework-agnostic**: same proof format whether you're using OpenAI, LangChain, CrewAI, or anything else

## Product Direction

- Open-source CLI (`npx occ-mcp-proxy`) — free, runs locally
- Hosted dashboard (SaaS) — paid, for teams
- The integrations are control layers for every major AI framework
- The proxy runs on customer infrastructure

## Brand

- **OCC.WTF** — one brand, one product
- No sub-brands (ProofStudio is dead, OCC Agent is dead as a separate name)
- Everything is just OCC

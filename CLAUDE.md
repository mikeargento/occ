# OCC — Origin Controlled Computing

## What This Is
A system where AI actions are only executable if they are authorized by a previously committed, cryptographically bound policy.

Proof = authorization. No valid proof, no action executes. The proof that authorizes an action is the same object that proves it happened.

**One-liner**: "Control what your AI agents can do. Prove what they did."

## Build Commands

```bash
# Core library (occproof)
npm run build          # compiles src/ → dist/
npm run test           # runs core + proxy + policy-sdk tests
npm run test:core      # core tests only

# Website (Next.js)
cd website && npm run dev    # localhost:3000
cd website && npm run build  # production build

# MCP Proxy
cd packages/mcp-proxy && npm run build
cd packages/mcp-proxy && npm test

# Policy SDK
cd packages/policy-sdk && npm run build
cd packages/policy-sdk && npm test

# CommandCentral Dashboard
cd packages/commandcentral && npm run build  # static export
```

## Project Structure

```
occ/
├── src/              # Core library — Ed25519 signatures, proof construction, policy binding
├── dist/             # Compiled output (npm package: occproof)
├── website/          # Next.js app deployed to occ.wtf via Vercel
├── cli/              # CLI tool
├── docs/             # Documentation
├── policies/         # Starter pack policy files (.md)
│   └── starter-packs/
├── packages/
│   ├── mcp-proxy/        # MCP proxy — default-deny, per-agent policies, OCC proof signing
│   ├── commandcentral/   # Dashboard UI — agents, policies, proof log, connections
│   ├── policy-sdk/       # Policy enforcement engine
│   ├── occ-agent/        # Agent SDK — wraps tool calls with cryptographic receipts
│   ├── integrations/     # All 17 framework integrations (JS + Python)
│   ├── adapter-nitro/    # AWS Nitro enclave adapter
│   ├── paperclip/        # Forked Paperclip (MIT)
│   └── stub/             # Stub package
└── server/
    └── commit-service/   # Enclave commit service
```

## Key Packages

| Package | Registry | Description |
|---------|----------|-------------|
| `occproof` | npm v1.0.2 | Core proof library |
| `occ-mcp-proxy` | npm | MCP proxy with default-deny policies |
| `occ-anthropic` | npm + PyPI | Anthropic SDK integration |
| `occ-openai` | npm | OpenAI integration |
| `occ-vercel` | npm | Vercel AI SDK integration |
| `occ-langgraph` | npm | LangGraph integration |
| `occ-langchain` | PyPI | LangChain integration |
| `occ-crewai` | PyPI | CrewAI integration |
| `occ-gemini` | PyPI | Google Gemini integration |
| `occ-google-adk` | PyPI | Google ADK integration |

## Architecture Rules

- **Default-deny**: empty `allowedTools` blocks everything. Faucet model — nothing flows unless explicitly allowed.
- **Per-agent policies**: independent state per agent instance.
- **Policy-in-proof**: rules are SHA-256 hashed and the hash is signed into every proof. A policy is not a "rule" until it has an OCC proof binding it.
- **The policy proof is the key**: no valid policy proof = no agent operations.
- **Causal chain**: each proof has a counter + prevB64 hash linking to the previous proof.

## Brand

- **OCC.WTF** — no sub-brands. Not ProofStudio. Just OCC.
- Website domain: occ.wtf (primary), proofstudio.xyz (legacy, don't use)
- Tagline: "Cryptographic control for AI agents"

## Style Preferences

- No generic card grids (AI slop pattern)
- No emojis in code or docs unless explicitly asked
- Keep messaging focused on CONTROL, not "proof" or "receipts"
- Green accent color: emerald-400 / #34d399

## Don't Touch

- `server/commit-service/` — deployed enclave service, change carefully
- `.env` files — never commit
- `packages/paperclip/` — forked, rarely modified

# Session Handoff — 2026-03-18

## What Was Built

### Epoch Chaining (DEPLOYED TO PRODUCTION)
- **Types**: `epochLink` added to `commit` in `src/types.ts` — includes `prevEpochId`, `prevPublicKeyB64`, `prevCounter`, `prevProofHashB64`, `toEpochId`, `toPublicKeyB64`
- **Enclave app.ts**: Fail-closed init — if lastProof provided but fails verification, enclave HALTS. Genesis requires explicit `allowGenesis: true`. No implicit fallback.
- **Parent server.ts**: Persists last proof to `.occ/last-proof.json` after every commit. Passes it to enclave on boot via `init` message.
- **Verifier**: `verifyEpochLink()` validates successor binding, cross-epoch boundary, different keys. Single-successor tracking via `consumedPredecessors` map — FORK DETECTED if same predecessor claimed by multiple successors.
- **VsockClient**: Added `InitRequest` type with `lastProof` and `allowGenesis` fields.
- **Init response fix**: Enclave returns `{ counter, epochId }` without `ok` field so VsockClient wraps it correctly.
- **PROVEN WORKING**: First proof of new epoch contains `epochLink` referencing previous epoch's last proof. Verified in production.

### Current Enclave State
- **PCR0 (measurement)**: `1acdac0aa2d72178cc8ed9d77a7e07c63fa47c2db9db186eed48ca5ea126f45da98acbc22531aac2c837bee4cc542dee`
- **Current epoch**: `szxQi/iJV9YKQ0//XU4GTlxwh+PqUxEKhZLlszFB7zw=` (chained from genesis `ErG/6de...`)
- **Genesis epoch had counter=2** (one proof made before restart)
- **Website measurement updated** in page.tsx, tee-status.tsx, proof-globe.tsx

### Infrastructure
- **Cloudflare Tunnel**: `occ-nitro` tunnel ID `250d13e1-b470-4ffd-94a4-6e00fdbf1758`, installed as systemd service
- **Caddy**: Installed but NOT needed (tunnel handles TLS). Can be removed.
- **Cloudflared config**: `/etc/cloudflared/config.yml` routes `nitro.occproof.com` → `localhost:8080`
- **Proof indexing**: Parent POSTs to `PROOF_INDEX_URL` after each commit (fire-and-forget to explorer DB)

### Website Changes
- Whitepaper converted to JSX: 4 section files + TOC dropdown at `/docs/whitepaper`
- `@custom-variant dark (&:where(.dark *))` added to globals.css for Tailwind v4 dark mode
- Explorer: full hashes in proof list (no counter numbers), green colors fixed for light mode
- Studio: "View on Explorer →" link after successful proof creation
- Homepage: 3-step cards equal height, copy updated (Drop a file / Lock it in / Take your proof)
- JSON proof collision bug fixed: original files named `original_<filename>` in zip when filename is `proof.json`

### Key Design Decisions
- **Epochs continue lineage, not counters** — each epoch starts fresh counter at 0
- **Fail-closed**: invalid predecessor = enclave HALTS, not silent genesis
- **Single-successor invariant**: `successorKey = SHA256(prevEpochId|prevCounter|prevProofHashB64)` — consumed at most once
- **Successor binding**: epochLink includes `toEpochId` and `toPublicKeyB64` — predecessor is bound to THIS specific successor
- **Disk is transport only**: `.occ/last-proof.json` is NOT a source of truth — enclave fully verifies Ed25519 signature before trusting

## Next Session: Build `occ-dev` CLI

### The Vision
Ryan Carson (@ryancarson) described "SDLC 2.0 for the agent age" — agent-first code factory. OCC is the trust layer that makes it provable. His implementation uses git logs, CI trust, SHA discipline. OCC replaces all of that with cryptographic proof.

### What to Build
`npx occ-dev` — a CLI that wraps agent workflows with OCC proof:
- `occ-dev init` — set up a repo for OCC-proven agent development
- Agent writes code in sandbox → every file touched is proven
- Every tool call produces a cryptographic receipt
- Policy controls what the agent can do (default-deny)
- "Commits" are proof bundles, not git hashes
- Human reviews proof bundle and merges

### Pieces Already Built
- `occ-mcp-proxy` — wraps any MCP server, default-deny, per-agent policies
- `occproof` — cryptographic proof library
- `policy-sdk` — enforcement engine
- Epoch chaining — orders everything, fork-detectable
- Proof indexing — explorer DB captures every proof

### Bigger Vision
- AI agent company that clones open source products + adds OCC
- Every agent action provable, not just logged
- "The agent could not have done anything it wasn't authorized to do"
- Model-agnostic — works with Claude, GPT, Gemini, any MCP client

# ProofStudio / OCC — Complete System Overview

## What OCC Is

Origin Controlled Computing (OCC) is a cryptographic proof system. When any digital artifact (file, code, agent output) passes through an OCC boundary, it receives a self-verifying proof that it existed in that exact form at that exact moment. The proof is portable — it verifies without the server, without the database, without you.

No blockchain. No ledger. No consensus. Just a hardware enclave, a signature, and math.

## How It Works

### The Enclave
An AWS Nitro Enclave runs on EC2. On boot:
1. Generates an Ed25519 keypair in memory (private key never leaves the enclave)
2. Generates a boot nonce from hardware RNG
3. Computes epochId = SHA-256(publicKey + bootNonce)
4. Begins accepting commit requests

The enclave is stateless by design. When it restarts, everything resets — new key, new epoch, new counter. The private key dies with the process.

### The Proof
When you commit an artifact (any file), the enclave produces a proof containing:
- **Artifact digest**: SHA-256 of the file bytes (the file never leaves your browser)
- **Commit context**: monotonic counter, timestamp, epoch ID, nonce
- **Signature**: Ed25519 over the canonical signed body
- **Attestation**: AWS Nitro attestation report (proves the code running is the code you measured)
- **Slot allocation**: Causal ordering evidence (nonce existed before the artifact was bound)
- **Agency** (optional): WebAuthn/passkey device signature proving WHO authorized the commit
- **Attribution** (optional): Human-readable name/title sealed into the signed body
- **TSA timestamp**: RFC 3161 token from FreeTSA (independent third-party time anchor)

### Causal Ordering (OCC Atomic Causality)
Every proof uses a 2-round-trip protocol:
1. `allocateSlot()` → enclave creates a signed nonce (no artifact data)
2. `commit(slotId, digest)` → enclave consumes the slot and binds the artifact

This proves the nonce existed BEFORE the artifact was known. The slot's counter is always less than the commit's counter. Both are signed. This is the structural enforcement that makes proofs unforgeable — you can't backdate because the causal ordering is cryptographically locked.

### Proof Chaining
Within an epoch, each proof includes `prevB64` — the SHA-256 hash of the previous proof's canonical form. This creates a forward-only chain. Any gap, fork, or reordering is detectable.

### Epoch Chaining (NEW — March 18, 2026)
When the enclave restarts, a new epoch begins. The first proof of the new epoch includes an `epochLink` object:

```json
{
  "epochLink": {
    "prevEpochId": "ErG/6de...",
    "prevPublicKeyB64": "4VeQUy...",
    "prevCounter": "2",
    "prevProofHashB64": "MrpdJe...",
    "toEpochId": "szxQi/i...",
    "toPublicKeyB64": "UF+Znk..."
  }
}
```

This establishes cryptographic succession across enclave lifecycles:
- The predecessor proof's Ed25519 signature is fully verified by the enclave before acceptance
- The predecessor's canonical hash is included (tamper-evident)
- Successor binding: `toEpochId` and `toPublicKeyB64` bind the link to THIS specific successor (prevents a different enclave from claiming the same predecessor)
- Single-successor invariant: a predecessor can be consumed by at most ONE successor epoch. Multiple claims = detectable fork.

**Fail-closed semantics**: If a predecessor proof is provided but fails verification, the enclave HALTS. It does not silently start a genesis epoch. Genesis requires an explicit `allowGenesis: true` flag.

**Epochs continue lineage, not counters.** Each epoch starts its counter fresh. The previous counter is referenced only inside the epochLink.

### Verification
Verification is fully offline and deterministic:
1. Recompute SHA-256 of the original bytes
2. Compare against the proof's digest
3. Reconstruct the canonical signed body
4. Verify Ed25519 signature
5. (Optional) Verify slot allocation causal ordering
6. (Optional) Verify agency (WebAuthn P-256 signature)
7. (Optional) Verify epoch link correctness and single-successor invariant
8. (Optional) Check policy constraints (enforcement tier, measurement allowlist, etc.)

No network calls. No database. No server. The proof is self-contained.

## The Products

### ProofStudio (proofstudio.xyz)
Consumer-facing web app. Drop a file, get a proof. Verify a file. Browse the explorer.
- **Studio**: Drop files, optional passkey signing, optional attribution, download proof.zip
- **Explorer**: Search by digest, browse recent proofs, view full proof details
- **Docs**: What is OCC, proof format, trust model, verification, integration, FAQ
- **Whitepaper**: Full academic paper as JSX (19 sections, formal model, security game)
- **Enclave status**: Live connection to nitro.occproof.com showing measurement, key, enforcement

### OCC Agent
Agent control platform. Wraps any AI agent via MCP (Model Context Protocol).
- **MCP Proxy** (`packages/mcp-proxy/`): Default-deny policy enforcement. Intercepts every tool call. Signs receipts.
- **Policy SDK** (`packages/policy-sdk/`): Defines what agents can do. Rate limits, spend caps, tool toggles, argument restrictions.
- **Dashboard** (`packages/commandcentral/`): Agent CRUD, tool toggle grid, flow log, real-time SSE.
- **Agent SDK** (`packages/occ-agent/`): Wraps tool calls with cryptographic receipts.

The one-liner: "The agent could not have done anything it wasn't authorized to do."

### occproof (npm package)
The core library. Ed25519 signing, canonical serialization, verification, types.
- `Constructor` — produces proofs
- `verify()` — validates proofs offline
- `canonicalize()` — deterministic JSON serialization
- `resetEpochLinkState()` — reset single-successor tracking

## Architecture

```
Browser (Studio)
  ↓ SHA-256 hash (file never uploaded)
  ↓ POST /commit { digests, agency?, attribution? }
  ↓
Parent EC2 (server.ts, port 8080)
  ↓ allocateSlot → commit (2-RTT via vsock)
  ↓ TSA timestamp (parallel, best-effort)
  ↓ persistLastProof (.occ/last-proof.json)
  ↓ indexProofs (POST to explorer DB)
  ↓
Nitro Enclave (app.ts, vsock port 5000)
  ↓ Ed25519 sign, Nitro attestation
  ↓ Monotonic counter, proof chaining
  ↓ Agency verification (P-256/WebAuthn)
  ↓ Epoch lineage (epochLink on first proof)
  ↓
Cloudflare Tunnel → nitro.occproof.com
```

## Infrastructure

- **EC2**: `i-0650273423ff67567` (occ-nitro-test), us-east-2, Nitro Enclave enabled
- **Enclave**: 2 vCPUs, 1024MB RAM, vsock port 5000
- **Socat bridge**: TCP :9000 → vsock CID:5000
- **Parent server**: Node.js on port 8080
- **Cloudflare Tunnel**: `occ-nitro` → localhost:8080, systemd service
- **Website**: Next.js on Vercel, domain proofstudio.xyz (also occ.wtf)
- **Database**: Neon Postgres (explorer proof index)
- **DNS**: Cloudflare for occproof.com, Vercel for proofstudio.xyz

## What Makes This Different

1. **Not attestation**: TEEs attest that trusted code ran. OCC proves that a specific artifact was created through a specific controlled path. Attestation says "this code ran." OCC says "this artifact could only exist because this exact process created it."

2. **Not blockchain**: No consensus, no ledger, no gas fees, no network dependency. Proofs are portable files that verify offline.

3. **Not signing**: Anyone can sign anything after the fact. OCC enforces that the signature happens AT creation time, inside a controlled boundary, with causal ordering that prevents backdating.

4. **Not C2PA/provenance**: C2PA traces content history. OCC enforces that content can only enter the authenticated state through a controlled boundary. Provenance is metadata. OCC is structural.

## Next: occ-dev CLI

The next product to build is `npx occ-dev` — a CLI that brings OCC into the software development lifecycle:
- `occ-dev init` — set up a repo for OCC-proven agent development
- Agents write code → every file, tool call, and decision is OCC-proven
- "Commits" become proof bundles, not git hashes
- Humans review proof bundles and merge
- Every agent action is cryptographically receipted, not just logged

This is "SDLC 2.0 for the agent age" — the trust infrastructure that makes agent-produced code auditable and provable. The agent could not have done anything it wasn't authorized to do. And you can prove it.

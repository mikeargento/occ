# OCC — Origin Controlled Computing

**Cryptographic proof of when digital objects came into existence.**

[![npm occproof](https://img.shields.io/npm/v/occproof?label=occproof&color=cb3837)](https://www.npmjs.com/package/occproof)
[![Website](https://img.shields.io/badge/occ.wtf-live-1A73E8)](https://occ.wtf)
[![Docs](https://img.shields.io/badge/docs-1A73E8)](https://occ.wtf/docs)

OCC produces portable cryptographic proof when bytes are committed through a hardware-attested execution boundary. The proof is not added to the artifact — it is caused by the act of committing through the authorized path.

Patent Pending.

---

## Try It

1. Go to [occ.wtf](https://occ.wtf)
2. Drop a file
3. Get a proof

Your file never leaves your device. Only the SHA-256 hash is sent to the enclave. The proof is signed inside an AWS Nitro Enclave and sealed by Ethereum anchors every 12 seconds.

---

## What OCC Proves

- **This specific digital state existed** — at this position in a monotonic causal chain
- **It was committed through a hardware boundary** — AWS Nitro Enclave with attested measurement
- **Everything before it already existed** — Ethereum front anchors seal backward
- **The ordering is unforgeable** — atomic causality, not timestamps

Time is subjective. Causality isn't. OCC gives you causality directly.

---

## How It Works

1. **Allocate** — The enclave pre-allocates a causal slot (nonce + counter) before the artifact hash is known
2. **Bind** — The artifact's SHA-256 digest is bound to the pre-allocated slot and signed with Ed25519 inside the TEE
3. **Commit** — The artifact and its proof are produced together. Fail-closed: if any step fails, nothing is produced
4. **Anchor** — Every 12 seconds, an Ethereum block hash is committed to the same chain as a future causal boundary

The slot exists before the artifact. The proof is caused by the commit. The Ethereum anchor proves everything before it existed before that block was mined.

---

## Proof Format (`occ/1`)

Every proof is a self-contained JSON document. No server needed to verify.

```json
{
  "version": "occ/1",
  "artifact": { "hashAlg": "sha256", "digestB64": "..." },
  "commit": {
    "counter": "48",
    "slotCounter": "47",
    "epochId": "...",
    "prevB64": "...",
    "chainId": "occ:main"
  },
  "signer": { "publicKeyB64": "...", "signatureB64": "..." },
  "environment": {
    "enforcement": "measured-tee",
    "measurement": "638d655a...",
    "attestation": { "format": "aws-nitro" }
  },
  "slotAllocation": { "counter": "47", "signatureB64": "..." },
  "proofHash": "..."
}
```

Key fields:
- `counter` — monotonic position in the causal chain (shared with Ethereum anchors)
- `slotCounter` — the pre-allocated slot that preceded this commit
- `prevB64` — hash of the previous proof (chain linking)
- `proofHash` — canonical SHA-256 of the proof (excluded from its own computation)
- `environment.measurement` — PCR0 of the enclave image (verifiable)

### Verify a proof

```ts
import { verify } from "occproof";
const result = await verify({ proof, bytes });
```

---

## What OCC is NOT

- **Not a timestamp** — proves causal order, not clock time
- **Not a blockchain** — no consensus, no distributed ledger, no token
- **Not a watermark** — no data embedded in the file
- **Not DRM** — no encrypted containers or access control
- **Not proof of authorship** — proves commitment through a boundary, not who created it

---

## Architecture

```
occ/
  src/                        Core library (occproof on npm)
  server/
    commit-service/           TEE commit service (AWS Nitro Enclave)
      src/enclave/            Enclave app (Ed25519, counter, slots)
      src/parent/             Parent server (HTTP, VSOCK bridge)
  packages/
    hosted/                   Ethereum anchor service (Railway)
  website/                    occ.wtf (Next.js on Vercel)
```

### Infrastructure

| Component | Location | Purpose |
|---|---|---|
| TEE | AWS EC2 + Nitro Enclave | Signs proofs, maintains monotonic counter |
| Anchor | Railway (agent.occ.wtf) | Commits ETH block hashes every 12 seconds |
| Ledger | S3 (occ-ledger-prod) | Immutable proof storage, 10-year Object Lock |
| Website | Vercel (occ.wtf) | Drop zone, proof pages, chat, docs |
| Tunnel | Cloudflare (nitro.occproof.com) | Public access to TEE |

---

## Cryptography

| Primitive | Algorithm | Library |
|---|---|---|
| Hashing | SHA-256 | `@noble/hashes` |
| Signatures | Ed25519 | `@noble/ed25519` |
| Attestation | AWS Nitro | Hardware (PCR0 measurement) |
| Anchoring | Ethereum | Block hash commitment |

Audited, zero-dependency, pure TypeScript.

---

## Links

- **[occ.wtf](https://occ.wtf)** — prove and verify files
- **[occ.wtf/docs](https://occ.wtf/docs)** — documentation
- **[GitHub](https://github.com/mikeargento/occ)** — source code

---

## License

Copyright 2024-2026 Mike Argento. Patent Pending.

Licensed under the [Apache License, Version 2.0](./LICENSE).

# OCC — Origin Controlled Computing

**Portable cryptographic proof at finalization**

[![npm occproof](https://img.shields.io/npm/v/occproof?label=occproof&color=cb3837)](https://www.npmjs.com/package/occproof)

```sh
npm install occproof
```

OCC is a TypeScript library for producing tamper-evident, process-bound commit proofs. It enforces one invariant:

> A specific trusted constructor finalized specific bytes at a specific authorization step — atomically, fail-closed.

This is **proof of finalization**, not proof of authorship, truth, or first creation.

The file never leaves your machine — only the SHA-256 digest is sent.

---

## CLI

```bash
occ photo.jpg -o ./proofs -k my-api-key
occ *.png -o ./proofs -k my-api-key
OCC_API_KEY=my-key occ document.pdf -o ./out
```

Each file produces a `.proof.zip` containing:
- The original file
- `proof.json` (the OCC proof with TEE signature)
- `VERIFY.txt` (verification instructions)

### CLI options

```
occ [files...] -o <dir> [options]

  -o, --output <dir>       Output directory for .proof.zip files (required)
  -k, --key <key>          API key (or set OCC_API_KEY env var)
  -e, --endpoint <url>     Commit service URL (default: https://nitro.occproof.com)
                           (or set OCC_ENDPOINT env var)
  -c, --concurrency <n>    Max concurrent files (default: 4)
  -h, --help               Show help
```

### Verify

Visit [occproof.com/verify](https://occproof.com/verify) and drop the `.proof.zip`.

---

## For AI Agents

OCC is designed to be called by AI agents, autonomous pipelines, and LLM-powered tools. It solves a specific problem: **how does an agent prove that it processed specific bytes, in a specific order, at a specific time — without trusting a centralized service?**

### One-line usage from any agent

```sh
curl -X POST https://nitro.occproof.com/commit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"digests":[{"digestB64":"...","hashAlg":"sha256"}]}'
```

### What you get back

A JSON `OCCProof` that any verifier can check offline — no API key, no account, no external lookup:

```json
{
  "version": "occ/1",
  "artifact": { "hashAlg": "sha256", "digestB64": "u4eMAiu6Qg..." },
  "commit": { "nonceB64": "...", "counter": "42", "time": 1700000000000, "epochId": "..." },
  "signer": { "publicKeyB64": "...", "signatureB64": "..." },
  "environment": { "enforcement": "measured-tee", "measurement": "pcr0:..." }
}
```

### Agent use cases

| Use case | How OCC helps |
|---|---|
| **AI output provenance** | Commit model outputs to a TEE — proof ties the exact bytes to a hardware measurement |
| **Dataset admission gate** | Verify incoming data hasn't changed before a training run |
| **Audit trail for tool calls** | Chain proofs with `prevB64` — any insertion or reordering breaks the chain |
| **Tamper-evident logs** | Every log line committed = any modification is detectable |
| **Content integrity for RAG** | Prove retrieved documents match what was indexed |
| **Agent-to-agent handoff** | Pass a proof alongside data so the receiving agent can verify it hasn't been modified in transit |

---

## Library API

```ts
import { Constructor, verify } from "occproof";
import { StubHost } from "@occ/stub";

// One-time setup
const stub = await StubHost.createPersistent({ statePath: "./occ-state.json" });
const ctor = await Constructor.initialize({ host: stub.host });

// Commit bytes (atomic, fail-closed)
const bytes = new TextEncoder().encode("hello world");
const proof = await ctor.commit({ bytes });

// Verify offline — no network, no host
const result = await verify({ proof, bytes });
console.log(result.valid); // true
```

### Proof chaining (`prevB64`)

Each proof can reference the hash of the previous one, creating a verifiable chain:

```ts
import { canonicalize } from "occproof";
import { sha256 } from "@noble/hashes/sha256";

// After each commit, compute the proof's hash
const proofHash = Buffer.from(sha256(canonicalize(proof))).toString("base64");

// Feed it into the next commit
const nextProof = await ctor.commit({
  bytes: nextBytes,
  prevProofHashB64: proofHash,
});

// nextProof.commit.prevB64 === proofHash
```

---

## Proof Structure (`occ/1`)

Every `OCCProof` is a self-contained JSON document. No server lookup is needed to verify one.

```jsonc
{
  "version": "occ/1",
  "artifact": {
    "hashAlg": "sha256",
    "digestB64": "<base64>"            // SHA-256 of raw input bytes
  },
  "commit": {
    "nonceB64": "<base64>",            // boundary-fresh random nonce
    "counter":  "42",                  // monotonic counter (decimal string)
    "time":     1700000000000,         // Unix ms (advisory)
    "prevB64":  "<base64>",            // optional — chain link to previous proof
    "epochId":  "<hex>"                // optional — enclave lifecycle identifier
  },
  "signer": {
    "publicKeyB64":  "<base64>",       // Ed25519 public key (32 bytes)
    "signatureB64":  "<base64>"        // Ed25519 signature over canonical SignedBody
  },
  "environment": {
    "enforcement": "measured-tee",     // "stub" | "hw-key" | "measured-tee"
    "measurement": "<string>",         // platform measurement (PCR0 on Nitro)
    "attestation": {                   // optional
      "format":    "aws-nitro",
      "reportB64": "<base64>"          // raw attestation document (vendor-signed)
    }
  },
  "metadata": { }                      // optional — NOT signed, advisory
}
```

### What is signed

The Ed25519 signature covers the canonical serialization of:

```ts
{
  version:           proof.version,
  artifact:          proof.artifact,
  commit:            proof.commit,            // ALL commit fields verbatim
  publicKeyB64:      proof.signer.publicKeyB64,
  enforcement:       proof.environment.enforcement,
  measurement:       proof.environment.measurement,
  attestationFormat: proof.environment.attestation?.format,  // when present
}
```

`attestation.reportB64` and `metadata` are **outside** the signature. The attestation report is vendor-signed and self-authenticating; `metadata` should never be used as a trust signal.

### Verification policy

```ts
const result = await verify({
  proof,
  bytes,
  policy: {
    requireEnforcement: "measured-tee",
    allowedMeasurements: ["pcr0:<known-good-hex>"],
    allowedPublicKeys: ["<expected pubkey base64>"],
    requireAttestation: true,
    requireAttestationFormat: ["aws-nitro"],
    minCounter: "100",
    maxCounter: "999",
    requireEpochId: true,
  },
});
```

All fields are optional. Omitting a field skips that check.

---

## Packages

| Package | npm | Description |
|---|---|---|
| `occproof` | [![npm](https://img.shields.io/npm/v/occproof?label=&color=cb3837)](https://www.npmjs.com/package/occproof) | Core library: `Constructor`, `verify`, types, canonical JSON |
| `packages/stub` | — | Dev-only `StubHost` — software crypto, no TEE required |
| `packages/adapter-nitro` | — | AWS Nitro Enclaves adapter — NSM, PCR0, KMS counter |
| `server/commit-service` | — | Nitro enclave + parent HTTP server with API key auth |
| `cli/` | — | CLI tool: hash locally, get TEE-signed proofs |

---

## Adapters

### `@occ/stub` — development only

Full `HostCapabilities` implementation in software. Use for local development and testing.

```ts
import { StubHost } from "@occ/stub";

const stub = await StubHost.create();                                          // ephemeral
const stub = await StubHost.createPersistent({ statePath: "./state.json" });   // persistent
```

**Not a security boundary.** The signing key is in process memory. The counter is software-only. There is no hardware measurement or attestation.

### `@occ/adapter-nitro` — AWS Nitro Enclaves

Full `HostCapabilities` for code running inside a Nitro Enclave.

- `getMeasurement()` — reads PCR0 via NSM `DescribePCR`
- `getFreshNonce()` — uses NSM `GetRandom` (hardware RNG)
- `getAttestation()` — NSM attestation document bound to proof body hash
- `sign()` / `getPublicKey()` — Ed25519 with enclave-resident key
- `nextCounter()` — optional KMS-backed monotonic counter with DynamoDB anchor

```ts
import { NitroHost, KmsCounter } from "@occ/adapter-nitro";

const counter = new KmsCounter({
  kmsKeyId:    "arn:aws:kms:us-east-1:...",
  kmsRegion:   "us-east-1",
  kmsEndpoint: "http://localhost:8000",
});
await counter.restore();

const host = new NitroHost({
  sign: async (data) => { /* Ed25519 sign */ },
  getPublicKey: async () => { /* Ed25519 public key */ },
  counter,
});
```

---

## Commit Service

The `server/commit-service` runs the TEE-backed commit endpoint.

### API key auth

```
POST /commit
Authorization: Bearer <key>
Content-Type: application/json

{"digests":[{"digestB64":"...","hashAlg":"sha256"}],"metadata":{}}
```

- Set `API_KEYS` env var (comma-separated) to enable auth
- 401 if key is missing or invalid
- Open mode (no auth) when `API_KEYS` is unset — for development only

### Architecture

```
┌─────────────────────┐     vsock      ┌──────────────────────┐
│   Parent EC2         │ ◄────────────► │   Nitro Enclave      │
│                      │                │                      │
│   HTTP server        │                │   Ed25519 keypair    │
│   API key auth       │                │   Monotonic counter  │
│   RFC 3161 TSA       │                │   Proof constructor  │
│   DynamoDB anchor    │                │   NSM attestation    │
└─────────────────────┘                └──────────────────────┘
```

### Mock server (local development)

```sh
cd server/commit-service
npm install && npm run build
node dist/mock/mock-server.js
# → listening on :8787
```

Uses `StubHost` — no Nitro Enclave required.

---

## Threat Model

### What OCC proves

- That a process in possession of a specific private key committed specific bytes
- That the commitment happened after a specific authorization step (counter + nonce)
- That the commitment structure was not tampered with after signing
- That chained proofs were produced in the stated order (when `prevB64` is used)

### What OCC does NOT prove

- That the private key was generated inside a real TEE (requires attestation verification)
- That the committed bytes are true, correct, or authored by any party
- Anything about the contents of `metadata` (not signed)
- Liveness of the enclave at verification time

### Enforcement tiers

| Tier | Key location | Commit gate | Use case |
|---|---|---|---|
| `stub` | Process memory | Software | Development, testing |
| `hw-key` | Hardware (HSM/SE/TPM) | Software | Key custody without code measurement |
| `measured-tee` | TEE memory | Inside TEE boundary | Production, highest assurance |

See [docs/trust-model.md](docs/trust-model.md) for the full threat analysis.

---

## What OCC is NOT

### Not a blockchain

No consensus, no peer nodes, no distributed ledger, no token. Chained proofs (`prevB64`) create a locally verifiable sequence within a single process — not a public, replicated history.

### Not a content watermark

OCC proves that a specific process committed specific bytes — it does not embed anything inside the bytes. The proof is a separate document.

### Not DRM

No encrypted container, no license server, no runtime enforcement. OCC is a commit record, not a gating mechanism.

### Not a proof of authorship

OCC proves **finalization**, not origin. A proof says "this process committed these bytes at this counter". It says nothing about who wrote the bytes or whether they are accurate.

---

## Architecture

```
occ/
├── src/                              occproof — core library
│   ├── types.ts                      OCCProof, SignedBody, VerificationPolicy
│   ├── canonical.ts                  deterministic JSON + constant-time equality
│   ├── constructor.ts                write path: 10-step atomic commit
│   ├── verifier.ts                   offline 5-step verification
│   ├── host.ts                       HostCapabilities interface
│   └── index.ts                      public re-exports
├── packages/
│   ├── adapter-nitro/                AWS Nitro Enclaves adapter
│   │   └── src/
│   │       ├── nitro-host.ts         NitroHost, DefaultNsmClient (NSM ioctl)
│   │       ├── kms-counter.ts        KMS-backed monotonic counter, SigV4
│   │       └── index.ts
│   └── stub/                         dev-only StubHost
│       └── src/
│           ├── stub-host.ts          ephemeral + persistent modes
│           └── index.ts
├── server/
│   └── commit-service/               TEE-backed commit endpoint
│       └── src/
│           ├── enclave/app.ts        runs inside Nitro Enclave
│           ├── parent/server.ts      public HTTPS API + API key auth
│           ├── parent/tsa-client.ts  RFC 3161 timestamping
│           ├── parent/vsock-client.ts vsock transport
│           ├── mock/mock-server.ts   local dev server (StubHost)
│           ├── mock/mock-enclave.ts  mock enclave logic
│           └── mock/verify-helper.ts signature verification
├── cli/                              CLI tool
│   └── occ.ts                        hash locally, get TEE-signed proofs
└── docs/
    ├── proof-v1.md                   wire format spec (occ/1)
    ├── epoch-model.md                TEE lifecycle, counter continuity
    └── trust-model.md                threat analysis, enforcement tiers
```

---

## Cryptography

| Primitive | Algorithm | Library |
|---|---|---|
| Hashing | SHA-256 (FIPS 180-4) | `@noble/hashes` |
| Signatures | Ed25519 (RFC 8032) | `@noble/ed25519` |
| Canonicalization | Sorted-key JSON + UTF-8 | built-in |
| Nonce | 256-bit hardware random | NSM `GetRandom` / `crypto.getRandomValues` |

`@noble/hashes` and `@noble/ed25519` are audited, zero-dependency, pure-TypeScript.

---

## Documentation

- [Wire Format Spec](docs/proof-v1.md) — `occ/1` proof schema, signed body, canonical serialization, verification algorithm
- [Epoch Model](docs/epoch-model.md) — TEE lifecycle, counter continuity, cross-epoch guarantees, verifier obligations
- [Trust Model](docs/trust-model.md) — threat analysis, enforcement tiers, assumptions, diagnostic guide

---

## Building

```sh
# Root (core library)
npm install && npm run build

# Sub-packages
cd packages/stub && npm install && npm run build
cd packages/adapter-nitro && npm install && npm run build
cd server/commit-service && npm install && npm run build
cd cli && npm install && npm run build
```

---

## License

Copyright 2024-2026 Mike Argento.

Licensed under the [Apache License, Version 2.0](./LICENSE).

```
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento
```

This software depends on [`@noble/ed25519`](https://github.com/paulmillr/noble-ed25519)
and [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) (both MIT-licensed).

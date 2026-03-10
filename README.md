# Origin Controlled Computing (OCC)
**Proof as a reachability property of system architecture.**

[![npm occproof](https://img.shields.io/npm/v/occproof?label=occproof&color=cb3837)](https://www.npmjs.com/package/occproof)

```sh
npm install occproof
```

Documentation: [Proof as a Reachability Property](https://occproof.com/whitepaper.html)

OCC is a TypeScript library for producing tamper-evident, process-bound commit proofs.  It enforces one invariant:

> A specific trusted constructor finalized specific bytes at a specific authorization step — atomically, fail-closed.

This is **proof of finalization**, not proof of authorship, truth, or first creation.

---

## 30-Second Demo

```sh
git clone git@github.com:mikeargento/occ.git
cd occ
npm install
npm run demo
```

```
OCC demo starting…
  ✓ server healthy
  ✓ commit produced proof
    digest:      u4eMAiu6Qg8uDGPqqdv5zzHnWEP6aMCG7sctUPccbMU=
    counter:     1
    measurement: stub:measurement:not-a-real-tee
    proofHash:   +0Q8UEdmGd03KexFoeMER5j14SpjeHzRxrPboFt/vlg=
  ✓ verification passed
  ✓ tampered payload correctly rejected
Demo complete.
```

No accounts. No Docker. No external services.
Swap `@occ/stub` for a real TEE adapter when you need hardware boundary enforcement.

---

## For AI agents

OCC is designed to be called by AI agents, autonomous pipelines, and LLM-powered tools. It solves a specific problem: **how does an agent prove that it processed specific bytes, in a specific order, at a specific time — without trusting a centralized service?**

### One-line usage from any agent

```sh
# Commit any file or output — returns a self-contained JSON proof
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

### Verify a proof in Node.js (3 lines)

```ts
import { verify } from "occproof";

const result = await verify({ proof, bytes });
// result.valid === true | false
// result.detail — per-field breakdown
```

### Live Proof Studio (browser)

Drag-and-drop a file to commit and verify instantly, no install:

**https://occproof.com/studio**

### Claude / MCP integration

Add OCC tools directly to any Claude agent — no code required:

```bash
# Claude Code
claude mcp add occ -- npx -y @occ/mcp

# Claude Desktop — add to ~/.claude/claude_desktop_config.json:
# { "mcpServers": { "occ": { "command": "npx", "args": ["-y", "@occ/mcp"] } } }
```

Once installed, Claude can call `commit_text`, `commit_file`, and `verify_proof` natively.

### OpenAPI spec

Machine-readable API description for agent frameworks, code generators, and tool registries:

**https://occproof.com/openapi.json**

### Discovery endpoints (GitHub Pages)

Agent frameworks that probe for capabilities will find:

- `/.well-known/ai-plugin.json` — ChatGPT plugin / OpenAI tool format
- `/.well-known/mcp.json` — MCP server install instructions
- `/llms.txt` — plain-English summary for LLM crawlers

### Agent workflow example

Ready-to-run script: commit output → save proof → verify:

```bash
node examples/agent-workflow/agent-workflow.js
node examples/agent-workflow/agent-workflow.js --file ./myreport.txt
node examples/agent-workflow/agent-workflow.js --text "My AI output"
```

---

## Which package do I need?

| I want to… | Start here |
|---|---|
| Use OCC in an app (dev/test) | `occproof` (includes core + stub for development) |
| Run inside AWS Nitro Enclaves | `occproof` + `@occ/adapter-nitro` (monorepo package) |
| Build a new hardware TEE adapter | `occproof` + `@occ/adapter-kit` (monorepo package) |
| Verify proofs offline | `occproof` only |

---

## Packages in this repo

| Package | Description |
|---|---|
| `occproof` | The library: `Constructor`, `verify`, types, canonical JSON |
| `@occ/stub` | Dev-only `StubHost` — software crypto, no TEE required, persistent state |
| `@occ/adapter-nitro` | AWS Nitro Enclaves adapter — NSM, PCR0 measurement, KMS-backed counter |
| `@occ/adapter-kit` | Hardware TEE builder kit — 28-test compliance suite + adapter template |
| `@occ/mcp` | MCP server — exposes `commit_text`, `commit_file`, `verify_proof` as Claude tools |
| `@occ/demo-service` | Local HTTP service: `POST /commit`, `POST /verify`, `GET /health` |
| `@occ/cli` | CLI: `occ [files...] -o <dir> [-k <key>]` |
| `@occ/playground` | Browser UI: commit/verify via drag-and-drop, proof JSON viewer |

---

## HTTP Demo

Start the demo service, then use `curl` to commit and verify:

```sh
# Terminal 1 — start the service
node packages/occ-cli/dist/cli.js serve --port=8787

# Terminal 2 — health check
curl -s http://localhost:8787/health
# → {"ok":true}

# Commit a file (raw bytes via octet-stream)
curl -s -X POST http://localhost:8787/commit \
  -H "Content-Type: application/octet-stream" \
  --data-binary @README.md > commit-result.json

cat commit-result.json | grep -o '"counter":"[^"]*"'
# → "counter":"1"

# Verify a file against its proof
BYTES_B64=$(base64 -i README.md | tr -d '\n')
curl -s -X POST http://localhost:8787/verify \
  -H "Content-Type: application/json" \
  -d "{\"bytes\":\"$BYTES_B64\",\"proof\":$(cat commit-result.json | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(d.join('')).proof)))")}"
# → {"valid":true}
```

For scripted use, prefer the CLI (`occ commit` / `occ verify`) over the HTTP service.
The HTTP service exists for browser and polyglot client demos.

---

## Troubleshooting

### Supported Node versions

Node 20 or later is required.  Check with:

```sh
node --version   # must be >= 20.0.0
```

### `npm run build` fails — TypeScript errors

Ensure devDependencies are installed:

```sh
npm install
npm run build
```

If you see `Cannot find module 'occproof'` inside a sub-package, the workspace
symlinks may not be set up.  Run `npm install` from the repo root, not from
inside a sub-package.

### Port already in use

```
Error: listen EADDRINUSE: address already in use :::8787
```

Either stop the existing process or choose a different port:

```sh
node server/commit-service/dist/mock/mock-server.js  # default :8787
```

### `OCC_STATE_PATH` — what it controls

The CLI and demo service persist a signing key and monotonic counter to a JSON
file at `./occ-state.json` by default.  Override with:

```sh
OCC_STATE_PATH=/path/to/my-state.json occ commit myfile.txt
```

The state file is created on first use.  It contains the Ed25519 private key and
counter in plaintext — **do not commit it to version control**.  For production,
use a real TEE adapter; the key never leaves hardware.

### Proof verification fails after editing the file

`verify()` checks that `SHA-256(bytes) == proof.artifact.digestB64`.  Any
modification to the committed file after the fact will produce `{ valid: false }`.
This is the expected behavior — the proof is tied to the exact bytes committed.

---

## Local quickstart

```sh
# Clone and install
git clone git@github.com:mikeargento/occ.git
cd occ
npm install
npm run build    # builds all packages

# Commit a file
occ README.md -o ./proofs -k my-api-key

# Start the mock commit service (local dev, no TEE)
node server/commit-service/dist/mock/mock-server.js
```

---

## CLI reference

```
occ [files...] -o <dir> [options]

  -o, --output <dir>       Output directory for .proof.zip files (required)
  -k, --key <key>          API key (or set OCC_API_KEY env var)
  -e, --endpoint <url>     Commit service URL (default: https://nitro.occproof.com)
                           (or set OCC_ENDPOINT env var)
  -c, --concurrency <n>    Max concurrent files (default: 4)
  -h, --help               Show help

Examples:
  occ photo.jpg -o ./proofs -k my-api-key
  occ *.png -o ./proofs -k my-api-key
  OCC_API_KEY=my-key occ document.pdf -o ./out
```

Each file produces `<filename>.proof.zip` containing:
- The original file
- `proof.json` (OCC proof with TEE signature)
- `VERIFY.txt` (verification instructions pointing to occproof.com)

---

## HTTP service reference

Start with `node server/commit-service/dist/mock/mock-server.js` (dev) or
`node server/commit-service/dist/parent/server.js` (production, Nitro Enclave).

### `GET /health`

```json
{ "ok": true }
```

### `POST /commit`

`Content-Type: application/json`, body:

```json
{
  "digests": [{ "digestB64": "<base64>", "hashAlg": "sha256" }],
  "metadata": {}
}
```

Headers:
```
Authorization: Bearer <api-key>   (required when API_KEYS env var is set)
```

Returns an array of `OCCProof` objects.

### API key authentication

- Set `API_KEYS` env var (comma-separated) to enable auth
- 401 if key is missing or invalid
- Open mode (no auth) when `API_KEYS` is unset — for development only

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

// After each commit, compute and store the proof's hash
const proofHash = Buffer.from(sha256(canonicalize(proof))).toString("base64");
stub.setLastProofHash(proofHash);

// On the next commit, feed it back in
const nextProof = await ctor.commit({
  bytes: nextBytes,
  prevProofHashB64: stub.getLastProofHash(),
});

// nextProof.commit.prevB64 === proofHash ✓
```

This creates a "living proof" — each output is linked to the one before it, making replay or insertion detectable. The demo service and CLI do this automatically.

---

## Proof Structure (`occ/1`)

Every `OCCProof` is a self-contained JSON document.  No server lookup is needed to verify one.

```jsonc
{
  "version": "occ/1",                          // schema version; forward-compatibility sentinel
  "artifact": {
    "hashAlg": "sha256",                    // algorithm used to hash the input bytes
    "digestB64": "<base64>"                 // H — SHA-256 of the raw input bytes
  },
  "commit": {
    "nonceB64": "<base64>",                 // N — boundary-fresh random nonce from the host
    "counter":  "42",                       // C — monotonic counter (decimal string, BigInt-safe)
    "time":     1700000000000,              // Unix ms at commit time (advisory; use counter for ordering)
    "prevB64":  "<base64>",                 // optional — SHA-256 of the previous proof's canonical form
    "epochId":  "<string>"                  // optional — enclave lifecycle identifier, changes on restart
  },
  "signer": {
    "publicKeyB64":  "<base64>",            // Ed25519 public key (32 bytes, standard base64)
    "signatureB64":  "<base64>"             // Ed25519 signature over the canonical SignedBody
  },
  "environment": {
    "enforcement": "measured-tee",          // "stub" | "hw-key" | "measured-tee" — signed, tamper-evident
    "measurement": "<string>",              // platform measurement (PCR0 on Nitro, MRENCLAVE on SGX, …)
    "attestation": {                        // optional — raw TEE attestation report
      "format":    "aws-nitro",             // identifies the document format (signed)
      "reportB64": "<base64>"              // raw bytes of the attestation document (vendor-signed)
    }
  },
  "metadata": { }                           // optional — caller-supplied; NOT signed
}
```

### Field reference

| Field | Role | Signed? | Notes |
|---|---|---|---|
| `version` | Schema sentinel | ✓ | Always `"occ/1"` |
| `artifact.hashAlg` | Hash algorithm | ✓ | Always `"sha256"` in v1 |
| `artifact.digestB64` | Content hash (H) | ✓ | SHA-256 of raw input bytes |
| `commit.nonceB64` | Freshness proof (N) | ✓ | Generated by host per commit |
| `commit.counter` | Ordering proof (C) | ✓ | Decimal string; strictly monotonic |
| `commit.time` | Wall-clock hint | ✓ | Unix ms; advisory only — not a sole ordering guarantee |
| `commit.prevB64` | Chain link | ✓ | SHA-256 of prior proof's canonical JSON |
| `commit.epochId` | Epoch identity | ✓ | Enclave lifecycle ID; changes on restart |
| `signer.publicKeyB64` | Identity | ✓ | Ed25519 32-byte key |
| `signer.signatureB64` | Integrity seal | — (is the seal) | Covers everything marked ✓ |
| `environment.enforcement` | Tier declaration | ✓ | Tamper-evident; not self-authenticating — verify via measurement |
| `environment.measurement` | Platform identity | ✓ | Primary trust anchor; pin with `allowedMeasurements` |
| `environment.attestation.format` | Report type | ✓ | Prevents semantic ambiguity via format rewrite |
| `environment.attestation.reportB64` | TEE report | ✗ | Vendor-signed; self-authenticating; not interpreted by library |
| `metadata` | Caller context | ✗ | Treat as advisory; anyone can edit it |

### What is signed

The signature covers the **canonical serialization** of this object (recursive sorted-key JSON → UTF-8):

```ts
{
  version:            proof.version,
  artifact:           proof.artifact,
  commit:             proof.commit,
  publicKeyB64:       proof.signer.publicKeyB64,
  enforcement:        proof.environment.enforcement,
  measurement:        proof.environment.measurement,
  attestationFormat:  proof.environment.attestation?.format,  // when present
}
```

`environment.attestation.reportB64` and `metadata` are **outside** the signature. The attestation report is vendor-signed and self-authenticating; `metadata` should never be used as a trust signal.

### StubHost vs. real TEE

| Property | `@occ/stub` (dev only) | Real TEE adapter |
|---|---|---|
| Key storage | Plaintext JSON file | Hardware-protected |
| Counter | Software; can be reset | Hardware; monotonic by construction |
| Measurement | Fixed placeholder string | Real PCR/MRENCLAVE |
| Attestation | None | NSM / DCAP report binding the nonce |

`@occ/stub` is **not a security boundary**.  It exists so you can develop and test without a TEE.

---

## Threat model

### What OCC proves

- That a process in possession of a specific private key committed specific bytes
- That the commitment happened after a specific authorization step (counter + nonce)
- That the commitment structure was not tampered with after signing
- That chained proofs were produced in the stated order (when `prevB64` is used)

### What OCC does NOT prove

- That the private key was generated inside a real TEE — this requires platform attestation verification (adapter-specific, out of scope here)
- That the committed bytes are true, correct, or authored by any party
- Anything about the contents of `metadata` (not signed)
- Liveness of the enclave at verification time

### StubHost is not a real TEE

`@occ/stub` is **development tooling only**:

- The signing key is held in process memory and optionally persisted as **plaintext JSON**
- The counter is software-only and can be reset or forged
- There is no hardware measurement — the measurement string is a fixed placeholder
- There is no attestation report

A proof produced by StubHost proves that OCC's signing and verification logic works correctly. It does **not** prove boundary enforcement. For real boundary enforcement, use a real TEE adapter (`@occ/adapter-nitro` when wired to a live Nitro Enclave, or a future SGX/SEV adapter).

---

## What OCC is NOT

This section exists because "cryptographic proof of X" is a phrase that invites creative misreading.

### Not a blockchain

OCC does not require consensus, peer nodes, or a distributed ledger.  There is no token, no chain of blocks, and no global ordering across parties.  Chained proofs (`prevB64`) create a locally verifiable sequence within a single process — not a public, replicated history.

### Not a content watermark or fingerprint

OCC proves that **a specific process committed specific bytes** — it does not embed anything inside the bytes themselves.  The proof is a separate document.  Modifying the bytes invalidates the proof, but anyone can produce a new valid proof for the modified bytes using a different key.  OCC does not prevent copying or modification; it makes tampering detectable.

### Not digital rights management (DRM)

OCC enforces nothing at access time.  There is no encrypted container, no license server, and no runtime enforcement that gates playback or reading.  OCC is a commit record, not a gating mechanism.

### Not a replacement for TEE attestation

When backed by a real TEE, an OCC proof includes a raw attestation report.  The library stores that report verbatim — it does **not** parse, validate, or chain-verify it.  Full attestation verification (certificate chains, PCR policy, revocation) is the responsibility of the caller.  OCC's job is to bind the signing key to the commit; attestation links the key to the hardware.  They are complementary, not interchangeable.

### Not a proof of authorship or truth

OCC proves **finalization**, not origin.  A proof says "this process committed these bytes at this counter".  It says nothing about who wrote the bytes, whether the bytes are accurate, or whether the process was acting on someone's behalf.  Authorship and provenance require additional out-of-band verification.

---

## Adapters

### `@occ/stub` — dev only

Full `HostCapabilities` implementation in software. Use for local development, testing, and demos.

```ts
import { StubHost } from "@occ/stub";

// Ephemeral (resets on restart)
const stub = await StubHost.create();

// Persistent (survives restarts — key and counter stored in JSON file)
const stub = await StubHost.createPersistent({ statePath: "./occ-state.json" });
```

### `@occ/adapter-nitro` — AWS Nitro Enclaves

Full `HostCapabilities` implementation for code running inside a Nitro Enclave.

- `getMeasurement()` — reads PCR0 via NSM `DescribePCR`
- `getFreshNonce()` — uses NSM `GetRandom` (hardware RNG)
- `getAttestation()` — produces an NSM attestation document bound to the proof body hash
- `nextCounter()` — KMS-backed monotonic counter sealed to PCR0; blob rollback closed by optional `anchorCounter` callback
- `enforcementTier: "measured-tee"`

```ts
import { NitroHost, KmsCounter } from "@occ/adapter-nitro";

const counter = new KmsCounter({
  kmsKeyId:    "arn:aws:kms:us-east-1:...",
  kmsRegion:   "us-east-1",
  kmsEndpoint: "http://localhost:8000",  // vsock proxy to KMS
  persistBlob: async (b) => { /* write ciphertext to storage */ },
  restoreBlob: async ()  => { /* read ciphertext from storage */ },
});
await counter.restore();

const host = new NitroHost({
  sign: async (data) => { /* Ed25519 sign */ },
  getPublicKey: async () => { /* Ed25519 public key */ },
  counter,
});
```

Requires a real AWS Nitro Enclave. Use `@occ/stub` for local development.

### `@occ/adapter-kit` — build your own adapter

For hardware TEE manufacturers and platform teams who want OCC on their hardware.

```ts
// 1. Copy the adapter template and fill in the TODOs
//    packages/adapter-kit/src/adapter-template.ts → src/my-tee-host.ts

// 2. Run the compliance suite against your implementation
import { runCompliance } from "@occ/adapter-kit";
import { MyTeeHost } from "./my-tee-host.js";

const host = await MyTeeHost.create();
runCompliance(host);  // 28 tests — green means OCC-compliant

// 3. node --test dist/compliance.test.js
```

Works with any test runner (node:test, Jest, Vitest) via the lower-level `runHostComplianceTests(host, { describe, it })` export.

---

## Verification policy (trust anchors)

```ts
const result = await verify({
  proof,
  bytes,
  trustAnchors: {
    allowedMeasurements: ["<expected measurement>"],  // exact match
    allowedPublicKeys:   ["<expected pubkey base64>"], // exact match
    minCounter: "100",    // reject proofs with counter < 100
    maxCounter: "999",    // reject proofs with counter > 999
    minTime: Date.now() - 5 * 60 * 1000,  // reject proofs older than 5 min
    maxTime: Date.now() + 60 * 1000,      // reject future-dated proofs
  },
});
```

All fields are optional. Omitting a field skips that check.

---

## Browser Demo (Playground)

A zero-dependency browser UI for exploring commit and verify interactively.
No build step, no framework, no cloud account.

```sh
# 1. Start the OCC mock server (uses StubHost — no TEE required)
node server/commit-service/dist/mock/mock-server.js

# 2. Start the Playground static server
npm run playground

# 3. Open your browser
open http://localhost:8788
```

The Playground page lets you:
- Upload any file (click or drag-and-drop)
- See the browser-computed SHA-256 alongside the server's proof
- Commit → inspect the full `OCCProof` JSON with syntax highlighting
- Verify → confirm the proof is still consistent with the file
- Copy the proof JSON to clipboard for use elsewhere

The Playground uses `StubHost` unless a real TEE adapter is configured on the server side.
All cryptographic operations happen server-side; the browser only displays results.

---

## Architecture

```
occ/
  src/                        occproof — core library (Constructor, verify, types)
    index.ts                  public re-exports
    types.ts                  OCCProof, VerificationPolicy, SignedBody
    host.ts                   HostCapabilities interface
    canonical.ts              deterministic JSON + constant-time equality
    constructor.ts            write path: atomic commit
    verifier.ts               offline verification
  packages/
    stub/                     @occ/stub — dev-only host
      src/
        stub-host.ts          StubHost.create() + StubHost.createPersistent()
    adapter-nitro/            @occ/adapter-nitro — AWS Nitro Enclaves adapter
      src/
        nitro-host.ts         NitroHost, DefaultNsmClient (NSM ioctl transport)
        kms-counter.ts        KmsCounter — KMS-backed monotonic counter, SigV4, anchorCounter
  server/
    commit-service/           TEE-backed commit endpoint
      src/
        enclave/app.ts        runs inside Nitro Enclave
        parent/server.ts      public HTTPS API + API key auth
        parent/tsa-client.ts  RFC 3161 timestamping
        parent/vsock-client.ts vsock transport
        mock/mock-server.ts   local dev server (StubHost)
        mock/mock-enclave.ts  mock enclave logic
        mock/verify-helper.ts signature verification
  cli/                        @occ/cli — command-line tool
    occ.ts                    occ [files...] -o <dir> [-k <key>]
  docs/
    proof-v1.md               wire format spec (occ/1)
    epoch-model.md            epoch lifecycle documentation
    trust-model.md            trust model and threat analysis
```

---

## Running tests

```sh
npm test                                            # all packages
npm test --workspace=packages/stub                  # stub + persistence tests
npm test --workspace=server/commit-service          # HTTP integration tests
```

---

## Cryptography

| Primitive | Algorithm | Library |
|---|---|---|
| Hashing | SHA-256 | `@noble/hashes` |
| Signatures | Ed25519 | `@noble/ed25519` |
| Canonicalization | Sorted-key JSON + UTF-8 | built-in |

`@noble/hashes` and `@noble/ed25519` are audited, zero-dependency pure-TypeScript.

---

## Publishing

**Do not publish until the library has received independent security review.**

Publishable packages: `occproof`, `@occ/stub`, `@occ/adapter-nitro`, `@occ/adapter-kit`.

Private packages (`@occ/cli`, `@occ/demo-service`, `@occ/playground`) are
marked `"private": true` and will not be published.

Pre-publish checklist:

```sh
# 1. Inspect tarball contents
npm pack --dry-run

# 2. Run full test suite
npm test

# 3. Verify test vectors
occ verify test-vectors/hello.txt test-vectors/hello.proof.json

# 4. Tag and release
git tag v1.0.0 && git push --tags
# create GitHub release from tag

# 5. Publish (when ready)
npm publish
```

---

## Keywords

occ · occproof · origin-controlled-computing · content integrity · tamper-evident · cryptographic proof · file attestation · verifiable proof · commit proof · Ed25519 · SHA-256 · hardware attestation · TEE · Trusted Execution Environment · AWS Nitro Enclave · PCR0 · provenance · audit trail · AI output attestation · dataset integrity · agent output verification · content provenance · proof of finalization · monotonic counter · canonical JSON · offline verification · supply chain integrity · AI agent tools · LLM tooling · agentic workflows

---

## License

Copyright 2024-2026 Mike Argento.

Licensed under the [Apache License, Version 2.0](./LICENSE).

All source files in this repository carry the SPDX header:

```
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento
```

This software depends on [`@noble/ed25519`](https://github.com/paulmillr/noble-ed25519)
and [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) (both MIT-licensed).

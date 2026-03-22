# Origin Controlled Computing: Executive Summary

**Target audience:** Technical decision makers
**Reading time:** ~5 minutes

---

## What Is OCC?

Origin Controlled Computing (OCC) is a cryptographic proof system that answers a question no existing technology answers cleanly:

> *How does an autonomous process prove that it—and only it—finalized specific bytes, at a specific point in time, inside a verified hardware boundary?*

OCC produces **self-contained, offline-verifiable proofs of finalization**. Each proof cryptographically binds a specific payload (bytes) to the hardware boundary that produced it, the exact authorization step at which it was committed, and the sequence of all prior commits. No central server. No account. No token. Any recipient can verify a proof with nothing but the proof itself and a known public key.

---

## How It Works

Every OCC commit executes a 10-step atomic sequence:

1. Obtain a **monotonic counter** value from the host (enforces ordering)
2. Obtain a **fresh boundary nonce** (≥128 bits, prevents replay)
3. Compute **SHA-256** of the input bytes
4. Retrieve the enclave's **hardware measurement** (PCR0 or equivalent) and Ed25519 public key
5. Build a **canonical signed body** (deterministic, sorted-key JSON)
6. **Sign** the canonical body with an Ed25519 key that never leaves the hardware boundary
7. Optionally obtain a **vendor attestation report** (e.g., AWS Nitro NSM) bound to this commit
8. Return the **complete proof** — or fail atomically with no partial output

The result is a single JSON document (`occ/1` format) containing the artifact digest, commit metadata, Ed25519 signature, enforcement tier, hardware measurement, and optional attestation. Verification is five sequential offline checks: structure, digest, canonical body reconstruction, signature, and policy.

---

## Why It Matters

AI agents, autonomous pipelines, and LLM-powered tools increasingly produce artifacts—reports, decisions, model outputs, tool call results—that downstream systems and humans need to trust. Three problems make this hard today:

**1. Finalization is unproven.** An agent can produce a signed output, but nothing prevents that signature from being applied after the fact, by a different process, or to modified bytes.

**2. Ordering is unverifiable.** Nothing stops an adversary from inserting, deleting, or reordering steps in an agent's audit trail.

**3. Verification requires trust in a service.** Existing provenance systems require accounts, API calls, or consensus nodes to verify a record.

OCC solves all three. The monotonic counter proves ordering. The hardware measurement proves *which* code ran. The nonce prevents replay. The Ed25519 signature makes tampering detectable. And the self-contained format makes all of this verifiable offline, forever.

---

## How OCC Differs from Existing Approaches

| | Digital Signatures | TEEs | C2PA | Blockchain | **OCC** |
|---|---|---|---|---|---|
| **Proves who signed** | ✓ | — | ✓ | ✓ | ✓ |
| **Proves when/where** | — | — | Partial | Partial | ✓ |
| **Hardware binding** | — | ✓ | — | — | ✓ |
| **Offline verification** | ✓ | — | — | — | ✓ |
| **Monotonic ordering** | — | — | — | ✓ | ✓ |
| **No central authority** | ✓ | — | — | — | ✓ |
| **Process-bound** | — | — | — | — | ✓ |

**vs. Digital Signatures:** Signatures prove authorship; OCC proves *finalization under specific conditions*. A signature can be applied any time, by anyone with the key. An OCC proof can only be produced by a process in possession of a hardware-bound key at a specific authorized step.

**vs. TEEs:** Trusted Execution Environments (Intel SGX, AWS Nitro) provide hardware isolation—they are the boundary OCC runs *inside*. TEEs don't produce structured, chainable proofs on their own. OCC provides the proof layer that TEE attestation makes trustworthy.

**vs. C2PA:** C2PA addresses content provenance and creative lineage (who made this, what edits were made). OCC addresses *process finalization* (this code in this hardware committed these bytes at this counter). The two are complementary—C2PA can use OCC as a notarization layer.

**vs. Blockchain:** Blockchain provides global consensus ordering across independent parties with no single authority. OCC provides local, process-bound, single-successor ordering within one hardware boundary—no peer nodes, no distributed ledger, no token, no latency. Chained OCC proofs create a locally verifiable sequence, not a public replicated history.

---

## Key Properties

- **Fail-closed:** Partial commits are impossible. A proof is either complete and valid or nothing is returned.
- **Single-successor:** The counter + nonce + measurement guarantee at most one valid successor per state. Fork and duplication attacks are detectable.
- **Tiered enforcement:** `stub` (development), `hw-key` (non-exportable hardware key), `measured-tee` (full TEE enforcement). The enforcement tier is signed into every proof.
- **Chainable:** The `prevB64` field hashes the prior proof into each new one—insertion, deletion, or reordering breaks the chain.
- **Epoch-aware:** Each enclave lifecycle has a unique `epochId`. Key rotation, restarts, and counter continuity are all tracked.

---

## Who Should Use OCC

OCC is designed for teams building systems where autonomous processes produce outputs that must be trusted downstream—without trusting a central authority. Concrete use cases:

- **AI output provenance:** Commit model outputs inside a TEE; downstream systems verify the exact bytes that left the enclave.
- **Tamper-evident audit trails:** Every agent action committed = any modification is immediately detectable.
- **Dataset admission gates:** Verify incoming training data hasn't changed before a run.
- **Agent-to-agent handoffs:** Pass proofs alongside data so receiving agents can verify integrity in transit.
- **Content integrity for RAG:** Prove retrieved documents match what was indexed.

---

*OCC is open source. Core library: `occproof`. Adapters available for AWS Nitro Enclaves and local development. MCP integration available for Claude and compatible LLM agents.*

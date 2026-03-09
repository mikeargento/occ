# OCC Wire Format — `occ/1`

Normative specification for the `occ/1` proof format.

Every statement in this document is derived from the reference implementation
in `src/`. The core library is authoritative.

**Status:** Stable for v0.1.x. See [§12 Versioning](#12-versioning).

---

## Contents

1. [Proof JSON Schema](#1-proof-json-schema)
2. [Signed Body Definition](#2-signed-body-definition)
3. [Canonical Serialization Algorithm](#3-canonical-serialization-algorithm)
4. [Proof Digest for Timestamping](#4-proof-digest-for-timestamping)
5. [Time Semantics](#5-time-semantics)
6. [Signer Key Trust Model](#6-signer-key-trust-model)
7. [Commit Chain Semantics](#7-commit-chain-semantics)
8. [Field Classification](#8-field-classification)
9. [Algorithm Declarations](#9-algorithm-declarations)
10. [Verifier Algorithm](#10-verifier-algorithm)
11. [Worked Example](#11-worked-example)
12. [Versioning](#12-versioning)

---

## 1. Proof JSON Schema

An `OCCProof` is a JSON object. Fields marked **required** MUST be present.
Optional fields MUST be absent — not `null`, not `""` — when the condition
for their presence is not met.

```jsonc
{
  "version": "occ/1",                  // string, REQUIRED — exact value
  "artifact": {                       // object, REQUIRED
    "hashAlg": "sha256",              //   string, REQUIRED — "sha256" only in v1
    "digestB64": "<base64>"           //   string, REQUIRED — RFC 4648 §4, 32 decoded bytes
  },
  "commit": {                         // object, REQUIRED
    "nonceB64": "<base64>",           //   string, REQUIRED — ≥16 decoded bytes
    "counter":  "42",                 //   string, OPTIONAL — decimal integer, no leading zeros
    "time":     1700000000000,        //   number, OPTIONAL — Unix ms, finite, ≥0
    "prevB64":  "<base64>",           //   string, OPTIONAL — 32 decoded bytes
    "epochId":  "<hex>"               //   string, OPTIONAL — hex SHA-256
  },
  "signer": {                         // object, REQUIRED
    "publicKeyB64":  "<base64>",      //   string, REQUIRED — 32 decoded bytes
    "signatureB64":  "<base64>"       //   string, REQUIRED — 64 decoded bytes
  },
  "environment": {                    // object, REQUIRED
    "enforcement": "measured-tee",    //   string, REQUIRED — "stub"|"hw-key"|"measured-tee"
    "measurement": "<opaque>",        //   string, REQUIRED — non-empty
    "attestation": {                  //   object, OPTIONAL
      "format":    "aws-nitro",       //     string, REQUIRED when parent present — non-empty
      "reportB64": "<base64>"         //     string, REQUIRED when parent present — non-empty
    }
  },
  "timestamps": {                     // object, OPTIONAL — external timestamps
    "artifact": { TsaToken },         //   OPTIONAL — RFC 3161 over artifact digest
    "proof":    { TsaToken }          //   OPTIONAL — RFC 3161 over proofCore digest
  },
  "claims":   { },                    // object, OPTIONAL — NOT signed, advisory
  "metadata": { }                     // object, OPTIONAL — NOT signed, advisory (v1 compat)
}
```

### TsaToken structure

```jsonc
{
  "authority":  "http://freetsa.org/tsr",  // string — TSA URL
  "time":       "2026-03-07T12:00:00Z",    // string — ISO 8601 timestamp from TSA
  "digestAlg":  "sha256",                  // string — hash algorithm
  "digestB64":  "<base64>",               // string — digest that was timestamped
  "tokenB64":   "<base64>"                // string — raw DER RFC 3161 TimeStampToken
}
```

### Base64 encoding

All `*B64` fields use standard Base64 (RFC 4648 §4) with `=` padding.
URL-safe Base64 (RFC 4648 §5) MUST NOT be used.

Verifiers MUST validate round-trip fidelity: `base64encode(base64decode(value)) === value`.

---

## 2. Signed Body Definition

The Ed25519 signature covers the canonical serialization of a `SignedBody` object.

### 2.1 SignedBody structure

```typescript
interface SignedBody {
  version: "occ/1";
  artifact: {
    hashAlg: "sha256";
    digestB64: string;
  };
  commit: {
    nonceB64: string;
    counter?: string;    // present iff proof.commit.counter is present
    time?: number;       // present iff proof.commit.time is present
    prevB64?: string;    // present iff proof.commit.prevB64 is present
    epochId?: string;    // present iff proof.commit.epochId is present
  };
  publicKeyB64: string;
  enforcement: EnforcementTier;
  measurement: string;
  attestationFormat?: string;  // present iff proof.environment.attestation is present
}
```

### 2.2 Construction rule

Given an `OCCProof p`, the signed body is constructed as:

```
signedBody.version           = p.version
signedBody.artifact          = p.artifact
signedBody.commit            = p.commit           // ALL commit fields, including prevB64, epochId
signedBody.publicKeyB64      = p.signer.publicKeyB64
signedBody.enforcement       = p.environment.enforcement
signedBody.measurement       = p.environment.measurement
signedBody.attestationFormat = p.environment.attestation.format   // ONLY when attestation present
```

**Critical invariant:** The `commit` object is passed through verbatim.
Every field present in `proof.commit` — including `prevB64` and `epochId` —
is included in the signed body and therefore covered by the signature.

### 2.3 What is NOT signed

| Field | Reason |
|-------|--------|
| `signer.signatureB64` | The seal; cannot sign itself |
| `environment.attestation.reportB64` | Vendor-signed; self-authenticating separately |
| `timestamps` | Added post-signature by an external party (parent server, TSA) |
| `claims` | Advisory; not trusted |
| `metadata` | Advisory; not trusted (v1 legacy) |

### 2.4 Attestation re-sign flow

When attestation is present, the constructor performs a **two-pass sign**:

1. Build `signedBody` without `attestationFormat`
2. Canonicalize → `canonicalBytes₁`
3. `userData = SHA-256(canonicalBytes₁)` — binds attestation to this commit
4. `attestation = host.getAttestation(userData)`
5. Add `signedBody.attestationFormat = attestation.format`
6. Re-canonicalize → `canonicalBytes₂`
7. Re-sign → `signature₂`
8. The proof carries `signature₂` (covering `attestationFormat`)

Verifiers reconstruct the signed body **with** `attestationFormat` present and
verify against the final signature. The intermediate signature is discarded.

*Source: `src/constructor.ts`*

---

## 3. Canonical Serialization Algorithm

**Input:** An arbitrary JavaScript value (the `SignedBody` object).
**Output:** A `Uint8Array` of UTF-8 encoded bytes.

### 3.1 Algorithm

```
function canonicalize(obj) → Uint8Array:
  json_string = canonicalizeToString(obj)
  return UTF8_ENCODE(json_string)          // TextEncoder, no BOM

function canonicalizeToString(value) → string:
  return JSON.stringify(sortedReplacer(value))

function sortedReplacer(value):
  if value is null:              return null
  if value is boolean:           return value
  if value is number:            return value
  if value is string:            return value
  if value is undefined:         THROW TypeError
  if value is function:          THROW TypeError
  if value is symbol:            THROW TypeError
  if value is bigint:            THROW TypeError
  if value is Array:             return value.map(sortedReplacer)
  if value is Object:
    sorted = new empty ordered object
    for key in Object.keys(value).sort():    // Unicode code-point order
      child = value[key]
      if child is undefined: skip            // omit undefined-valued keys
      sorted[key] = sortedReplacer(child)
    return sorted
```

### 3.2 Properties

| Property | Guarantee |
|----------|-----------|
| Deterministic key ordering | `Object.keys().sort()` at every nesting level |
| No whitespace | `JSON.stringify` with no spacer argument |
| Stable numeric formatting | `JSON.stringify` uses shortest decimal representation |
| UTF-8 output | `TextEncoder` default encoding |
| No BOM | `TextEncoder` never emits BOM |
| Undefined omission | Object keys with `undefined` values are silently dropped |
| Array order preservation | Array elements are not reordered |

### 3.3 Canonical key order for SignedBody

At the top level, lexicographic sort produces:

```
artifact → attestationFormat? → commit → enforcement → measurement → publicKeyB64 → version
```

Within `artifact`: `digestB64` → `hashAlg`

Within `commit` (when all fields present): `counter` → `epochId` → `nonceB64` → `prevB64` → `time`

### 3.4 Constant-time comparison

Verifiers SHOULD use constant-time byte comparison (XOR accumulator) when
comparing digests and when comparing signature inputs. This mitigates timing
side-channels.

*Source: `src/canonical.ts` — `canonicalize()`, `sortedReplacer()`, `constantTimeEqual()`*

---

## 4. Proof Digest for Timestamping

External timestamps (RFC 3161 TSA) are bound to a proof via the **proofCore digest**.

### 4.1 proofCore definition

`proofCore` is the proof stripped of post-hoc additions:

```
proofCore = {
  artifact:    proof.artifact,
  commit:      proof.commit,
  environment: proof.environment,     // includes attestation if present
  signer:      proof.signer,
  version:     proof.version,
}
```

**Excluded from proofCore:** `timestamps`, `claims`, `metadata`.

### 4.2 proofCore digest computation

```
proofCoreDigest = BASE64(SHA-256(canonicalize(proofCore)))
```

The canonical serialization uses the same algorithm as §3. Top-level key order:

```
artifact → commit → environment → signer → version
```

### 4.3 Timestamp binding

| Timestamp | What is timestamped | Field checked |
|-----------|-------------------|---------------|
| `timestamps.artifact` | `artifact.digestB64` — the artifact hash | `tsa.digestB64 === proof.artifact.digestB64` |
| `timestamps.proof` | proofCore digest | `tsa.digestB64 === proofCoreDigest` |
| `metadata.tsa` (v1 legacy) | `artifact.digestB64` | `tsa.digestB64 === proof.artifact.digestB64` |

Timestamps are advisory. They are NOT covered by the Ed25519 signature and
MUST NOT be relied upon for cryptographic integrity. They provide an
independent time claim from a third-party TSA.

---

## 5. Time Semantics

Three distinct time sources appear in a proof. They have different trust levels.

### 5.1 `commit.time`

| Property | Value |
|----------|-------|
| Source | `host.secureTime()` or `Date.now()` |
| Units | Unix epoch milliseconds |
| Trust level | **Self-reported by the signing host** |
| Signed | **YES** — part of the signed body via `commit` |
| Clock guarantees | None. Software clocks may be skewed, spoofed, or drifted |

**`commit.time` MUST NOT be used as the sole ordering mechanism.** Use
`commit.counter` for intra-epoch ordering.

For `stub` tier: `Date.now()` — the host OS system clock.
For `measured-tee` tier: enclave-internal `Date.now()` — still subject to host VM clock skew.

### 5.2 `timestamps.artifact.time`

| Property | Value |
|----------|-------|
| Source | RFC 3161 Time Stamping Authority (e.g., freetsa.org) |
| Format | ISO 8601 string |
| Trust level | **Third-party attested** |
| Signed | No — added post-signature |
| Verifiable | Yes — via RFC 3161 token in `tokenB64` (requires TSA certificate) |

This timestamp proves "the artifact digest existed at this time" according to
the TSA. The TSA is an independent third party.

### 5.3 `timestamps.proof.time`

| Property | Value |
|----------|-------|
| Source | RFC 3161 TSA |
| Format | ISO 8601 string |
| Trust level | **Third-party attested** |
| Signed | No — added post-signature |
| What it covers | The complete proofCore (artifact + commit + environment + signer + version) |

This timestamp proves "this specific proof existed at this time" according to
the TSA. Strictly stronger than the artifact timestamp because it covers the
signature and all commit context.

### 5.4 Trust ordering

```
commit.time  <  timestamps.artifact.time  ≤  timestamps.proof.time
(self-claim)    (third-party, artifact)       (third-party, full proof)
```

A verifier requiring time-of-existence evidence SHOULD use the TSA timestamps,
not `commit.time`.

---

## 6. Signer Key Trust Model

### 6.1 Two orthogonal facts

Every proof encodes two independent claims:

**(A) Cryptographic identity** — "Who signed?"

Answered by `signer.publicKeyB64` + `signer.signatureB64`. Machine-checkable
by any party with access to the public key. No additional context required.

**(B) Enforcement context** — "Under what conditions was signing permitted?"

Answered by `environment.enforcement` + `environment.measurement` +
`environment.attestation` + verifier policy. This is where OCC's atomic
causality guarantee lives.

### 6.2 Enforcement tiers

| Tier | Key location | Commit gate | Causality | `measurement` semantics |
|------|-------------|-------------|-----------|------------------------|
| `stub` | Process memory | Software | None | MAY be a synthetic sentinel |
| `hw-key` | Hardware (HSM/SE/TPM) | Software (outside boundary) | Key-bound identity only | SHOULD identify key environment |
| `measured-tee` | TEE memory | Inside TEE boundary | **Full atomic causality** | MUST identify attested enclave image |

### 6.3 Trust anchor hierarchy

`environment.enforcement` is **signed** (tamper-evident) but **self-reported**.
A malicious adapter can claim any tier. Therefore:

```
requireEnforcement alone                    → prevents transit downgrade only
requireEnforcement + allowedMeasurements    → pins to specific enclave image
requireEnforcement + allowedMeasurements
  + requireAttestation                      → FULL TRUST (vendor-attested)
```

**Any two of three leave a gap:**

| Missing check | Gap |
|--------------|-----|
| No `requireEnforcement` | Downgrade to stub not detected |
| No `allowedMeasurements` | Any enclave image accepted |
| No `requireAttestation` | No hardware proof that measurement is authentic |

### 6.4 Key provenance

`verify()` accepts any structurally valid Ed25519 public key. It does NOT
confirm the key was generated inside a hardware boundary. To establish key
provenance:

1. Pin trusted keys via `allowedPublicKeys`
2. Verify attestation report binds key to enclave (platform-specific)
3. Cross-reference `epochId` with known enclave deployments

---

## 7. Commit Chain Semantics

### 7.1 Chain hash computation

```
proofHash = BASE64(SHA-256(canonicalize(proof)))
```

**Input:** The **complete** proof object — including `signer.signatureB64`,
`environment.attestation.reportB64`, `metadata`, `timestamps`, `claims`, and
all other fields.

**Output:** Standard Base64-encoded 32-byte SHA-256 digest.

This hash is passed as `prevProofHashB64` to the next commit, which stores it
in `commit.prevB64`.

### 7.2 Chain invariants

| Property | Guarantee |
|----------|-----------|
| Direction | Forward-only: each proof records hash of predecessor |
| First proof | `prevB64` is **absent** (not `null`, not `""`) |
| Signed | **YES** — `prevB64` is in `commit`, which is part of the signed body |
| Fork detection | Two proofs claiming the same `prevB64` = fork |
| Gap detection | Missing link breaks hash continuity |

### 7.3 What the verifier checks

`verify()` does NOT traverse the chain. It confirms:
- `prevB64` is a string (structural validation)
- `prevB64` is part of the signed body (cannot be forged post-signature)

Chain integrity verification (traversing the linked list, detecting gaps and
forks) is the **application layer's** responsibility.

### 7.4 Cross-epoch chaining

When an epoch boundary occurs (enclave restart), the chain breaks:
- New keypair → new `publicKeyB64`
- Counter may reset (see epoch model)
- First proof of new epoch has no `prevB64`

Cross-epoch continuity is maintained by the DynamoDB counter anchor, not by
proof chaining.

---

## 8. Field Classification

### 8.1 Security-critical fields (signed, verified)

These fields are included in the `SignedBody` and covered by the Ed25519
signature. Tampering with any of them invalidates the signature.

| Field | Purpose |
|-------|---------|
| `version` | Format version; determines verification algorithm |
| `artifact.hashAlg` | Hash algorithm declaration |
| `artifact.digestB64` | Artifact hash — the core binding |
| `commit.nonceB64` | Freshness; prevents replay |
| `commit.counter` | Monotonic ordering within epoch |
| `commit.time` | Self-reported timestamp |
| `commit.prevB64` | Chain link to predecessor proof |
| `commit.epochId` | Epoch lifecycle identifier |
| `signer.publicKeyB64` | Cryptographic identity (bound into signed body) |
| `environment.enforcement` | Self-reported enforcement tier |
| `environment.measurement` | Platform identity / enclave image hash |
| `environment.attestation.format` | Attestation format identifier (when present) |

### 8.2 Cryptographic output (not signed, self-authenticating or derived)

| Field | Purpose |
|-------|---------|
| `signer.signatureB64` | The Ed25519 signature itself |
| `environment.attestation.reportB64` | Vendor-signed attestation report |

### 8.3 Informational fields (not signed, advisory)

| Field | Purpose |
|-------|---------|
| `timestamps.artifact` | Third-party TSA timestamp over artifact digest |
| `timestamps.proof` | Third-party TSA timestamp over proofCore digest |
| `claims` | Structured advisory metadata |
| `metadata` | Legacy advisory metadata (v1 compat) |

**Security rule:** Verifiers MUST NOT make trust decisions based on
informational fields. They MAY be displayed to users but MUST be labeled
as unsigned/advisory.

---

## 9. Algorithm Declarations

### 9.1 Signature algorithm

| Property | Value |
|----------|-------|
| Algorithm | Ed25519 (RFC 8032) |
| Key size | 32 bytes (compressed public key) |
| Signature size | 64 bytes |
| Signing input | `canonicalize(signedBody)` — UTF-8 canonical JSON bytes |
| Library | `@noble/ed25519` — `signAsync()` / `verifyAsync()` |

### 9.2 Hash algorithm

| Property | Value |
|----------|-------|
| Algorithm | SHA-256 (FIPS 180-4) |
| Output size | 32 bytes (256 bits) |
| Encoding | Standard Base64 (RFC 4648 §4) with `=` padding |
| Usage: artifact | `SHA-256(raw_input_bytes)` — no preprocessing |
| Usage: chain | `SHA-256(canonicalize(complete_proof))` |
| Usage: proofCore | `SHA-256(canonicalize(proofCore))` |
| Usage: attestation | `SHA-256(canonicalize(signedBody_without_attestationFormat))` |
| Library | `@noble/hashes/sha256` |

### 9.3 Nonce generation

| Property | Value |
|----------|-------|
| Minimum entropy | 128 bits (16 bytes) |
| Typical size | 256 bits (32 bytes) |
| Source | `host.getFreshNonce()` — TEE-boundary random |

### 9.4 Base64 encoding

| Property | Value |
|----------|-------|
| Variant | Standard (RFC 4648 §4), NOT URL-safe |
| Padding | Required (`=` suffix) |
| Validation | Round-trip: `encode(decode(s)) === s` |

### 9.5 Counter format

| Property | Value |
|----------|-------|
| Encoding | Decimal string, ASCII digits only |
| Leading zeros | Forbidden (except `"0"` for value zero) |
| Leading `+` | Forbidden |
| Comparison | As `BigInt` (avoids IEEE-754 precision loss for values > 2^53) |
| Monotonicity | Strictly increasing within an epoch |

---

## 10. Verifier Algorithm

### 10.1 Core verification (5 steps)

**Input:** `proof: OCCProof`, `bytes: Uint8Array`, `policy?: VerificationPolicy`

**Output:** `{ valid: true }` or `{ valid: false, reason: string }`

```
STEP 1 — Structural validation
  REQUIRE proof is a non-null object
  REQUIRE proof.version ∈ ACCEPTED_VERSIONS ("occ/1", "proofwork/1", "provenclave/1", "prethereum/1")
  REQUIRE proof.artifact is object
  REQUIRE proof.artifact.hashAlg === "sha256"
  REQUIRE proof.artifact.digestB64 is non-empty string
  REQUIRE proof.commit is object
  REQUIRE proof.commit.nonceB64 is non-empty string
  IF proof.commit.counter present: REQUIRE type === string
  IF proof.commit.time present:    REQUIRE type === number, finite, ≥ 0
  IF proof.commit.prevB64 present: REQUIRE type === string
  IF proof.commit.epochId present: REQUIRE type === string
  REQUIRE proof.signer is object
  REQUIRE proof.signer.publicKeyB64 is non-empty string
  REQUIRE proof.signer.signatureB64 is non-empty string
  REQUIRE proof.environment is object
  REQUIRE proof.environment.enforcement ∈ {"stub", "hw-key", "measured-tee"}
  REQUIRE proof.environment.measurement is non-empty string
  IF proof.environment.attestation present:
    REQUIRE attestation.format is non-empty string
    REQUIRE attestation.reportB64 is non-empty string
  → FAIL with specific error message on any violation

STEP 2 — Artifact digest verification
  computedDigest = SHA-256(bytes)
  proofDigest = BASE64_DECODE(proof.artifact.digestB64)
  REQUIRE valid base64 (round-trip check)
  REQUIRE CONSTANT_TIME_EQUAL(computedDigest, proofDigest)
  → FAIL "artifact digest mismatch" if not equal

STEP 3 — Signed body reconstruction
  publicKeyBytes = BASE64_DECODE(proof.signer.publicKeyB64)
  REQUIRE valid base64 (round-trip check)
  REQUIRE publicKeyBytes.length === 32

  signedBody = {
    version:     proof.version,
    artifact:    proof.artifact,
    commit:      proof.commit,                    // ALL fields verbatim
    publicKeyB64: proof.signer.publicKeyB64,
    enforcement: proof.environment.enforcement,
    measurement: proof.environment.measurement,
  }
  IF proof.environment.attestation is present:
    signedBody.attestationFormat = proof.environment.attestation.format

  canonicalBytes = canonicalize(signedBody)

STEP 4 — Signature verification
  signatureBytes = BASE64_DECODE(proof.signer.signatureB64)
  REQUIRE valid base64 (round-trip check)
  REQUIRE signatureBytes.length === 64

  valid = ED25519_VERIFY(signatureBytes, canonicalBytes, publicKeyBytes)
  → FAIL "signature verification failed" if not valid

STEP 5 — Policy checks (only when policy is provided)
  IF policy.requireEnforcement:
    REQUIRE proof.environment.enforcement === policy.requireEnforcement
  IF policy.allowedMeasurements (non-empty array):
    REQUIRE proof.environment.measurement ∈ policy.allowedMeasurements
  IF policy.allowedPublicKeys (non-empty array):
    REQUIRE proof.signer.publicKeyB64 ∈ policy.allowedPublicKeys
  IF policy.requireAttestation === true:
    REQUIRE proof.environment.attestation is present
  IF policy.requireAttestationFormat (non-empty array):
    REQUIRE proof.environment.attestation is present
    REQUIRE proof.environment.attestation.format ∈ policy.requireAttestationFormat
  IF policy.minCounter or policy.maxCounter:
    REQUIRE proof.commit.counter is present
    counterVal = PARSE_BIGINT(proof.commit.counter)
    IF policy.minCounter: REQUIRE counterVal ≥ PARSE_BIGINT(policy.minCounter)
    IF policy.maxCounter: REQUIRE counterVal ≤ PARSE_BIGINT(policy.maxCounter)
  IF policy.minTime or policy.maxTime:
    REQUIRE proof.commit.time is present
    IF policy.minTime: REQUIRE proof.commit.time ≥ policy.minTime
    IF policy.maxTime: REQUIRE proof.commit.time ≤ policy.maxTime
  IF policy.requireEpochId === true:
    REQUIRE proof.commit.epochId is present and non-empty

RETURN { valid: true }
```

### 10.2 What the verifier does NOT check

| Item | Why |
|------|-----|
| `attestation.reportB64` content | Vendor-signed; platform-specific verification is caller's responsibility |
| `prevB64` chain integrity | Chain traversal is application-layer logic |
| Counter continuity / gap detection | Application-layer logic |
| Key provenance (was key generated in TEE?) | Requires attestation verification |
| Timestamp validity | TSA token parsing/verification is out of scope |
| `metadata` / `claims` content | Unsigned; ignored |

---

## 11. Worked Example

### Input

`hello occ\n` — 10 bytes, UTF-8.

### Artifact digest

```sh
printf 'hello occ\n' | openssl dgst -sha256 -binary | base64
# jYl9NHJP0VcRVh6OMEIU5VAGva6cu5kdrnPrlNr/RnU=
```

### Signed body (JSON, pre-canonicalization)

```json
{
  "version": "occ/1",
  "artifact": {
    "hashAlg": "sha256",
    "digestB64": "jYl9NHJP0VcRVh6OMEIU5VAGva6cu5kdrnPrlNr/RnU="
  },
  "commit": {
    "nonceB64": "SGVsbG9PQ0NOb25jZTAxIQ==",
    "counter": "1"
  },
  "publicKeyB64": "ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=",
  "enforcement": "stub",
  "measurement": "stub-measurement-v1"
}
```

### Canonical form (signing input)

```
{"artifact":{"digestB64":"jYl9NHJP0VcRVh6OMEIU5VAGva6cu5kdrnPrlNr/RnU=","hashAlg":"sha256"},"commit":{"counter":"1","nonceB64":"SGVsbG9PQ0NOb25jZTAxIQ=="},"enforcement":"stub","measurement":"stub-measurement-v1","publicKeyB64":"ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=","version":"occ/1"}
```

Key order: `artifact` → `commit` → `enforcement` → `measurement` → `publicKeyB64` → `version`

Within `commit`: `counter` → `nonceB64`

### Complete proof

```json
{
  "version": "occ/1",
  "artifact": {
    "hashAlg": "sha256",
    "digestB64": "jYl9NHJP0VcRVh6OMEIU5VAGva6cu5kdrnPrlNr/RnU="
  },
  "commit": {
    "nonceB64": "SGVsbG9PQ0NOb25jZTAxIQ==",
    "counter": "1"
  },
  "signer": {
    "publicKeyB64": "ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=",
    "signatureB64": "<Ed25519 signature over canonical bytes>"
  },
  "environment": {
    "enforcement": "stub",
    "measurement": "stub-measurement-v1"
  }
}
```

### Verification trace

```
Step 1: Structure valid ✓
Step 2: SHA-256("hello occ\n") = jYl9NH... === proof.artifact.digestB64 ✓
Step 3: SignedBody reconstructed, canonicalized
Step 4: Ed25519 verify(sig, canonical, pubkey) = true ✓
Step 5: No policy → skip
Result: { valid: true }
```

---

## 12. Versioning

### Current version: `occ/1`

All proofs produced by OCC v0.1.x carry `"version": "occ/1"`.

### Accepted legacy versions

The verifier also accepts these legacy version strings for backward compatibility:

| Version | Status |
|---------|--------|
| `"proofwork/1"` | Deprecated; pre-OCC format |
| `"provenclave/1"` | Deprecated; original format |
| `"prethereum/1"` | Deprecated; pre-rename |

Legacy versions use the same signed body composition and verification algorithm.

### Breaking changes (require new version string)

- Any change to which fields are in the signed body
- Any change to the canonicalization algorithm
- Any change to the hash algorithm (`hashAlg`)
- Any change to the signature algorithm
- Addition of new required top-level blocks

### Non-breaking additions (no version bump)

- New optional fields in `metadata` / `claims` (unsigned)
- New optional fields in `timestamps` (unsigned)
- New optional fields in `commit` that are absent in older implementations
  and ignored by older verifiers

---

## Source Files

| File | Role |
|------|------|
| `src/types.ts` | `OCCProof`, `SignedBody`, `EnforcementTier`, policy interfaces |
| `src/constructor.ts` | Proof assembly (10-step atomic commit) |
| `src/canonical.ts` | Canonical serialization |
| `src/verifier.ts` | Core verification (5-step) |
| `src/host.ts` | `HostCapabilities` interface |
| `server/commit-service/src/enclave/app.ts` | Nitro Enclave implementation |
| `docs/epoch-model.md` | Epoch lifecycle documentation |
| `docs/trust-model.md` | Trust model and threat analysis |

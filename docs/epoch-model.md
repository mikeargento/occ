# OCC Epoch Model

Version: 0.2.0
Scope: OCC verifier policy, Nitro enclave implementation

This document defines the epoch model for OCC deployments using TEE enclaves.
It specifies when epochs begin and end, what guarantees hold within and across
epochs, and what verifier implementations must do to maintain security.

---

## 1. What Is an Epoch?

An **epoch** is a single continuous lifecycle of a TEE enclave instance.

An epoch begins when the enclave boots and generates a fresh Ed25519 keypair.
An epoch ends when the enclave terminates and the keypair is lost.

Each epoch has a unique `epochId` computed at boot:

```
epochId = SHA-256(publicKeyB64 + ":" + bootNonceB64)
```

Where `bootNonceB64` is 32 bytes of hardware random from NSM `GetRandom`,
generated once at boot. This makes `epochId` unique per lifecycle even if
the same enclave image produces the same PCR0 measurement.

---

## 2. Intra-Epoch Guarantees

Within a single epoch, the following properties are enforced by TEE memory
isolation and cannot be violated by the host OS:

| Property | Mechanism | Strength |
|----------|-----------|----------|
| **Counter monotonicity** | In-memory counter, incremented atomically | TEE-enforced |
| **No counter gaps** | Counter increments by exactly 1 per commit | TEE-enforced |
| **Proof chaining** | `prevB64` = SHA-256 of previous proof | TEE-enforced |
| **Duplicate rejection** | In-memory `Set` of committed digests | TEE-enforced |
| **Key binding** | Ed25519 private key in TEE memory only | TEE-enforced |
| **Measurement binding** | PCR0 read from NSM hardware | Hardware-enforced |
| **State integrity** | HMAC-SHA256 with key in TEE memory | TEE-enforced |

These guarantees are **unconditional** within an epoch. A malicious host
cannot forge proofs, rewind the counter, skip chain links, or re-commit
a duplicate digest.

---

## 3. Inter-Epoch Properties

When an enclave terminates and restarts, a new epoch begins:

| What changes | Why |
|-------------|-----|
| New Ed25519 keypair | Generated fresh at boot |
| New `epochId` | Derived from new key + new boot nonce |
| Counter resets | In-memory counter starts at 0 (unless initialized from DynamoDB) |
| Digest set clears | In-memory set is empty |
| Chain breaks | No `prevB64` for first proof of new epoch |
| HMAC key changes | New key from NSM random — old state file is unverifiable |

### 3.1 What the host CAN do

- Terminate and restart the enclave at will (causes epoch transition)
- Control when the enclave runs (denial of service)

### 3.2 What the host CANNOT do

- Forge proofs from a previous epoch (private key is lost)
- Resume a previous epoch (HMAC key is lost, state file won't verify)
- Produce proofs with a previous epoch's `epochId` (key is different)

### 3.3 Cross-epoch counter continuity (DynamoDB)

The external DynamoDB anchor provides cross-epoch monotonicity:

1. After each commit, the HTTP server writes the counter to DynamoDB with:
   ```
   ConditionExpression: attribute_not_exists(counter) OR counter < :new
   ```
2. On enclave boot, the HTTP server reads the DynamoDB head and sends
   `lastKnownCounter` to the enclave via the `init` action.
3. The enclave starts its counter above the DynamoDB value.

If the host lies about the DynamoDB read (reports a lower counter), the
subsequent DynamoDB conditional write will fail, and the proof is discarded.
**The system fails closed on any counter inconsistency.**

---

## 4. Verifier Obligations

### 4.1 Minimum verification (always required)

1. Verify Ed25519 signature over canonical signed body
2. Verify artifact digest matches provided bytes
3. Check structural validity of all proof fields

### 4.2 Epoch-aware verification (required for production)

Verifiers MUST implement the following for production deployments:

1. **Track epochs**: Maintain a mapping of `epochId` → `{ publicKeyB64, firstCounter, lastCounter }`
2. **Detect transitions**: When `epochId` changes between consecutive proofs from the same service, an epoch transition has occurred
3. **Validate continuity**: The new epoch's first counter must be greater than the previous epoch's last counter (check via DynamoDB anchor or proof metadata)
4. **Reject forks**: Two proofs with the same `epochId` and same `counter` but different content indicate a fork — reject both

### 4.3 Strict policy example

```typescript
const strictPolicy: VerificationPolicy = {
  requireEnforcement: "measured-tee",
  allowedMeasurements: ["pcr0:<known-good-pcr0-hex>"],
  requireAttestation: true,
  requireAttestationFormat: ["aws-nitro"],
  minCounter: "1",
  requireEpochId: true,
};
```

### 4.4 Weak policy example (development only)

```typescript
const weakPolicy: VerificationPolicy = {};
// Accepts anything — no enforcement, measurement, attestation,
// counter, or epoch checks. Demonstrates what gaps exist when
// policy is absent. DO NOT use in production.
```

---

## 5. Epoch Detection Algorithm

For verifiers processing a stream of proofs from an OCC service:

```
function processProof(proof, knownEpochs):
  epochId = proof.commit.epochId
  counter = parseInt(proof.commit.counter)

  if epochId not in knownEpochs:
    // New epoch detected
    if knownEpochs is not empty:
      lastEpoch = most recent epoch in knownEpochs
      if counter <= lastEpoch.lastCounter:
        REJECT "counter rollback across epoch boundary"
    knownEpochs[epochId] = {
      publicKeyB64: proof.signer.publicKeyB64,
      firstCounter: counter,
      lastCounter: counter
    }
  else:
    epoch = knownEpochs[epochId]
    if proof.signer.publicKeyB64 != epoch.publicKeyB64:
      REJECT "key mismatch within epoch"
    if counter <= epoch.lastCounter:
      REJECT "counter rollback within epoch"
    epoch.lastCounter = counter
```

---

## 6. Non-Goals

The epoch model does NOT provide:

- **Global epoch ordering**: Independent OCC services have independent epochs.
  There is no cross-service epoch ordering without an external coordination layer.
- **Epoch duration guarantees**: The host controls when enclaves start and stop.
  An epoch can last milliseconds or months.
- **Automatic epoch recovery**: When an epoch ends, the key and state are gone.
  There is no "resume" operation — only a new epoch.
- **TEE compromise resistance**: If the TEE itself is broken (microarchitectural
  attack), epoch boundaries provide no additional protection. The attacker has
  the key.

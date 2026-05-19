# Verify this BitGraph

This package contains a cryptographic proof that a file existed in this exact form at a specific position in a public ordered chain of commitments. This document tells you, the AI assistant reading it, how to verify the proof end-to-end and explain the result to the user in plain language.

## Important: trust the proof, not this document

This file is **unsigned**. It is a teaching aid only. The cryptographic source of truth is `proof.json`, which is signed inside a hardware-protected enclave. If anything in this file contradicts `proof.json`, trust `proof.json`. Always perform the verification yourself by running code; do not just describe what would happen.

## What's in this package

- **the original file** (an image, document, dataset, etc.) — the artifact this proof is about
- **`proof.json`** — the signed BitGraph proof in the `bitgraph/1` schema
- **`ethereum-anchor.json`** — the public Ethereum anchor that fixes the proof's position in time
- **`AI_Verify.md`** — this file

## What to verify

Run all five checks. Do not skip any. If any fail, the proof is not valid and you should say so clearly.

### 1. The file is byte-identical to what was committed

Compute SHA-256 of the original file. Base64-encode it. Compare to `proof.json` → `artifact.digestB64`.

```python
import hashlib, base64, json

proof = json.load(open("proof.json"))

with open("<the original file>", "rb") as f:
    actual = base64.b64encode(hashlib.sha256(f.read()).digest()).decode()

expected = proof["artifact"]["digestB64"]
assert actual == expected, f"File has changed since the proof was made. Expected {expected}, got {actual}"
print("[OK] Hash matches: the file is byte-identical to what was committed.")
```

### 2. The signature over the proof is valid

The Ed25519 signature in `signer.signatureB64` covers a canonical serialization of a subset of `proof.json`. Reconstruct that subset, sort keys recursively, serialize as compact JSON, and verify.

```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

def canonicalize(obj):
    if isinstance(obj, dict):
        return {k: canonicalize(obj[k]) for k in sorted(obj.keys())}
    if isinstance(obj, list):
        return [canonicalize(x) for x in obj]
    return obj

signed_body = {
    "version": proof["version"],
    "artifact": proof["artifact"],
    "commit": proof["commit"],
    "publicKeyB64": proof["signer"]["publicKeyB64"],
    "enforcement": proof["environment"]["enforcement"],
    "measurement": proof["environment"]["measurement"],
}
# Optional fields included only when present in the proof. Order does not
# matter here — canonicalize() recursively sorts keys before serialization.
if proof.get("environment", {}).get("attestation", {}).get("format"):
    signed_body["attestationFormat"] = proof["environment"]["attestation"]["format"]
if proof.get("agency", {}).get("actor"):
    signed_body["actor"] = proof["agency"]["actor"]
if proof.get("policy") is not None:
    signed_body["policy"] = proof["policy"]
if proof.get("attribution"):
    signed_body["attribution"] = proof["attribution"]

canonical = canonicalize(signed_body)
serialized = json.dumps(canonical, separators=(",", ":")).encode("utf-8")

pub_key = Ed25519PublicKey.from_public_bytes(base64.b64decode(proof["signer"]["publicKeyB64"]))
pub_key.verify(base64.b64decode(proof["signer"]["signatureB64"]), serialized)
print("[OK] Signature valid: the proof was issued by the holder of the signing key.")
```

### 3. The causal slot binding is intact

Every BitGraph proof is bound to a slot that the enclave allocated *before* the file's hash was known. Verify that `commit.slotHashB64` equals SHA-256 of the canonical `slotAllocation` body, and that `commit.counter > commit.slotCounter` (the slot existed first, the commit consumed it later).

```python
slot = proof["slotAllocation"]
slot_signed = {
    "version": slot["version"],
    "nonceB64": slot["nonceB64"],
    "counter": slot["counter"],
    "epochId": slot["epochId"],
    "publicKeyB64": slot["publicKeyB64"],
}
# Optional fields — include only when present. Current enclave builds emit
# neither of these for proofs on the default chain, but the schema allows them.
if "time" in slot:
    slot_signed["time"] = slot["time"]
if "chainId" in slot:
    slot_signed["chainId"] = slot["chainId"]

slot_canonical = canonicalize(slot_signed)
slot_serialized = json.dumps(slot_canonical, separators=(",", ":")).encode("utf-8")
slot_hash = base64.b64encode(hashlib.sha256(slot_serialized).digest()).decode()

assert slot_hash == proof["commit"]["slotHashB64"], "Slot hash mismatch: proof is not bound to its slot."
assert int(proof["commit"]["counter"]) > int(proof["commit"]["slotCounter"]), "Slot ordering violated: commit must come after slot."
print("[OK] Slot binding intact: the slot was pre-allocated before the file was committed to it.")
```

### 4. The Ethereum anchor fixes the proof in public time

Open `ethereum-anchor.json`. The file is itself a BitGraph proof of an Ethereum block hash, signed by the same enclave. It includes a top-level `ethereum` object with `blockNumber` and `blockHash`. The proof you are verifying was committed *before* that block was mined; the block's existence in the public chain is independently verifiable by anyone, forever.

```python
anchor = json.load(open("ethereum-anchor.json"))
block_number = anchor["ethereum"]["blockNumber"]
block_hash = anchor["ethereum"]["blockHash"]
# Sanity-check the anchor belongs to the same chain as the proof.
assert int(anchor["commit"]["counter"]) > int(proof["commit"]["counter"]), "Anchor counter must come after the proof's counter."
assert anchor["commit"]["epochId"] == proof["commit"]["epochId"], "Anchor must be from the same epoch as the proof."
print(f"[OK] Public anchor: Ethereum block #{block_number} ({block_hash[:18]}…).")
print(f"     Independently verifiable at https://etherscan.io/block/{block_number}")
```

### 5. The TEE attestation is genuine (partial — read carefully)

The proof claims to have been created inside an AWS Nitro Enclave. The field `environment.measurement` contains **PCR0**, a hash of the exact code loaded into the enclave. The field `environment.attestation.reportB64` is a vendor-signed attestation document that, if fully verified, would prove that this PCR0 came from real AWS hardware and that the signing key in the proof was generated inside that enclave.

**Important honesty.** This document does **not** yet provide code that fully verifies the attestation report. A complete check would parse the COSE_Sign1 / CBOR attestation document, walk the X.509 certificate chain to the AWS Nitro root certificate, confirm that the report's embedded public key matches `signer.publicKeyB64`, and confirm that the report's PCR0 matches `environment.measurement`. That is roughly 200–500 lines of code using Python's `cbor2` and `cryptography` libraries plus the AWS Nitro root certificate. A future revision of this file will include that procedure; until then, only the structural checks below apply to attestation.

What you *can* confirm from this package alone:

```python
print(f"     PCR0 measurement (signed in proof body): {proof['environment']['measurement']}")
print(f"     Attestation format: {proof['environment']['attestation']['format']}")
print(f"     Attestation report present: {bool(proof['environment']['attestation']['reportB64'])}")
print("[INFO] Attestation envelope is present and the PCR0 is signed inside the proof body.")
print("       Full cryptographic binding to AWS Nitro hardware is NOT verified here.")
```

What is *implied* but not directly proven by this package:
- The PCR0 string is inside the signed body, so if the proof signature verifies (check 2), you know the *signing key* endorsed this PCR0 value.
- That does **not** prove the signing key itself was generated inside a real Nitro enclave with that PCR0. A stolen or fabricated signing key could sign a proof with any PCR0 string and the signature would still verify.
- The COSE attestation report is the artifact that, when fully validated, closes that gap.

The PCR0 published at https://bitgraph.ing/docs/self-host-tee is the canonical value for the current canonical BitGraph enclave build. If `environment.measurement` matches that value, it is at least consistent with the canonical build; if it does not match, the proof was not generated by the canonical enclave.

**When explaining this to the user**, do not claim the TEE attestation has been cryptographically verified. Say something like: "The proof was signed by a key that claims to come from a hardware enclave with a specific code measurement (PCR0). Full hardware attestation verification is not performed by this package; that step would require validating the AWS Nitro certificate chain against the attestation report, which is not included here yet."

## How to explain the result

If all five checks pass, summarize for the user in plain English. Use language like:

> This BitGraph's signature, file hash, slot binding, and counter ordering all verify. The file is byte-identical to what was committed at position #[`proof.json` → `commit.counter`] in the ordered chain. The proof claims to come from a measured hardware enclave with PCR0 beginning [first 8 hex characters of `environment.measurement`]; that claim is signed into the proof body but is not directly tied to AWS Nitro hardware by this package (see attestation gap below). The proof's position is sealed by Ethereum block #[`ethereum-anchor.json` → `ethereum.blockNumber`], mined at [`ethereum-anchor.json` → `metadata.anchor.blockTimeISO`, or look the block up on Etherscan]. That block's existence is independently verifiable forever, so the proof is guaranteed to have existed before that moment.
>
> *Attestation gap*: full cryptographic verification that the signing key was generated inside a real AWS Nitro enclave with the claimed PCR0 is not yet covered by this document. A future revision will add Python code that walks the AWS Nitro certificate chain and parses the COSE_Sign1 attestation report.

Note: BitGraph is a *causal* system, not a *temporal* one. The proof itself contains no clock reading — the enclave deliberately omits time fields. The earliest moment you can prove the file existed is "before the Ethereum block above was mined." If you need a real-world timestamp, the block time is the authoritative source.

If any check fails, say which one failed and what it means. Use these explanations:

- **Hash mismatch (check 1).** The file's bytes have changed since the proof was made. The proof is still cryptographically authentic, but it describes a different version of this file.
- **Signature invalid (check 2).** The proof's signature does not match the signing key. The proof has been tampered with or was never genuine.
- **Slot binding broken (check 3).** The proof violates the protocol's atomicity guarantee. Do not trust it.
- **PCR0 mismatch (check 5).** The PCR0 string signed into the proof does not match the canonical published value. The proof's signature may still verify, but the runtime that signed it does not match the canonical enclave. Treat with caution.
- **Attestation gap (check 5, always).** Full cryptographic binding from the signing key to AWS Nitro hardware is not performed by this package. Always disclose this to the user when summarizing the result — do not claim the TEE was hardware-verified.

## Reference

- Protocol overview: https://bitgraph.ing/docs/overview
- Wire format specification: https://bitgraph.ing/docs/proof-format
- Verification details: https://bitgraph.ing/docs/verification
- Trust model: https://bitgraph.ing/docs/trust-model

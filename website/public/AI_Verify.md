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

### 5. The TEE attestation is genuine

This check closes the loop on the hardware root of trust. Without it, the previous checks only prove that *some* Ed25519 key signed the proof body; they do not prove that key was generated inside a real AWS Nitro enclave running the BitGraph code identified by `environment.measurement` (PCR0). This check parses the AWS Nitro attestation report, validates its certificate chain to a pinned AWS root, verifies the COSE signature, and cross-checks the report's PCR0 and embedded public key against the proof fields.

Required Python packages (install with `pip install cbor2 cryptography` if needed):

```python
import base64, hashlib
from datetime import datetime, timezone
import cbor2
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.exceptions import InvalidSignature

# ── Pinned AWS Nitro Enclaves Root-G1 certificate ──────────────────────────
# Source: https://aws-nitro-enclaves.amazonaws.com/AWS_NitroEnclaves_Root-G1.zip
# DER SHA-256 fingerprint (also verified below before use):
#   64:1A:03:21:A3:E2:44:EF:E4:56:46:31:95:D6:06:31:7E:D7:CD:CC:3C:17:56:E0:98:93:F3:C6:8F:79:BB:5B
AWS_NITRO_ROOT_PEM = b"""-----BEGIN CERTIFICATE-----
MIICETCCAZagAwIBAgIRAPkxdWgbkK/hHUbMtOTn+FYwCgYIKoZIzj0EAwMwSTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoMBkFtYXpvbjEMMAoGA1UECwwDQVdTMRswGQYD
VQQDDBJhd3Mubml0cm8tZW5jbGF2ZXMwHhcNMTkxMDI4MTMyODA1WhcNNDkxMDI4
MTQyODA1WjBJMQswCQYDVQQGEwJVUzEPMA0GA1UECgwGQW1hem9uMQwwCgYDVQQL
DANBV1MxGzAZBgNVBAMMEmF3cy5uaXRyby1lbmNsYXZlczB2MBAGByqGSM49AgEG
BSuBBAAiA2IABPwCVOumCMHzaHDimtqQvkY4MpJzbolL//Zy2YlES1BR5TSksfbb
48C8WBoyt7F2Bw7eEtaaP+ohG2bnUs990d0JX28TcPQXCEPZ3BABIeTPYwEoCWZE
h8l5YoQwTcU/9KNCMEAwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUkCW1DdkF
R+eWw5b6cp3PmanfS5YwDgYDVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMDA2kAMGYC
MQCjfy+Rocm9Xue4YnwWmNJVA44fA0P5W2OpYow9OYCVRaEevL8uO1XYru5xtMPW
rfMCMQCi85sWBbJwKKXdS6BptQFuZbT73o/gBh1qUxl/nNr12UO8Yfwr6wPLb+6N
IwLz3/Y=
-----END CERTIFICATE-----"""
AWS_NITRO_ROOT_SHA256 = "641A0321A3E244EFE456463195D606317ED7CDCC3C1756E09893F3C68F79BB5B"

# Canonical BitGraph enclave PCR0 (the current production build).
# A different PCR0 means a different (possibly unauthorized) enclave configuration.
CANONICAL_BITGRAPH_PCR0 = "8530a6399399c4f23d89f5a1faa2e8bf2e09a5959f117070fca08148377f92c902c695fc926c17f67f35f110327dca92"

# ── 0. Verify the pinned root cert is what we think it is ──────────────────
root_cert = x509.load_pem_x509_certificate(AWS_NITRO_ROOT_PEM)
root_der = root_cert.public_bytes(serialization.Encoding.DER)
root_fp = hashlib.sha256(root_der).hexdigest().upper()
assert root_fp == AWS_NITRO_ROOT_SHA256, f"Pinned AWS Nitro root fingerprint mismatch: {root_fp}"

# ── 1. Decode and parse the COSE_Sign1 attestation document ────────────────
report_bytes = base64.b64decode(proof["environment"]["attestation"]["reportB64"])
cose = cbor2.loads(report_bytes)
if isinstance(cose, cbor2.CBORTag):
    assert cose.tag == 18, f"Expected COSE_Sign1 (CBOR tag 18), got tag {cose.tag}"
    cose = cose.value
assert isinstance(cose, list) and len(cose) == 4, "COSE_Sign1 must be a 4-element array"
protected_bstr, _unprotected, payload_bstr, signature_raw = cose
assert isinstance(protected_bstr, bytes) and isinstance(payload_bstr, bytes), "COSE protected and payload must be bstr"

# ── 2. Parse the inner attestation document ───────────────────────────────
doc = cbor2.loads(payload_bstr)
required = {"module_id", "timestamp", "digest", "pcrs", "certificate", "cabundle"}
missing = required - set(doc.keys())
assert not missing, f"Attestation doc missing required fields: {missing}"
assert doc["digest"] == "SHA384", f"Expected SHA384 digest, got {doc['digest']}"
pcrs = doc["pcrs"]
leaf_der = doc["certificate"]
cabundle_der = doc["cabundle"]
attested_pubkey = doc.get("public_key")
assert attested_pubkey is not None, "Attestation doc has no public_key field — cannot bind to signing key"

# ── 3. Validate the X.509 chain to the pinned AWS root ────────────────────
# AWS spec: cabundle is ordered root-first. cabundle[0] must be the AWS Nitro root.
leaf_cert = x509.load_der_x509_certificate(leaf_der)
intermediates = [x509.load_der_x509_certificate(c) for c in cabundle_der]
assert len(intermediates) >= 1, "cabundle is empty"
# Confirm the cabundle's claimed root matches our pinned root.
assert intermediates[0].public_bytes(serialization.Encoding.DER) == root_der, \
    "cabundle[0] does not match the pinned AWS Nitro root — possible spoofed chain"

# Walk leaf → intermediates[-1] → … → intermediates[1] → root, verifying each signature.
chain = [leaf_cert] + list(reversed(intermediates[1:])) + [root_cert]
now = datetime.now(timezone.utc).replace(tzinfo=None)
for i, cert in enumerate(chain[:-1]):
    issuer = chain[i + 1]
    if cert.not_valid_before > now or cert.not_valid_after < now:
        raise AssertionError(f"Chain[{i}] is outside its validity window: {cert.subject}")
    issuer_pub = issuer.public_key()
    if not isinstance(issuer_pub, ec.EllipticCurvePublicKey):
        raise AssertionError(f"Chain[{i+1}] uses unexpected key type {type(issuer_pub).__name__}")
    try:
        issuer_pub.verify(cert.signature, cert.tbs_certificate_bytes, ec.ECDSA(cert.signature_hash_algorithm))
    except InvalidSignature:
        raise AssertionError(f"Chain[{i}] signature does not verify against chain[{i+1}]")

# ── 4. Verify the COSE_Sign1 signature over the payload (RFC 9052 §4.4) ────
# Sig_structure = ["Signature1", protected_bstr, external_aad (empty bstr), payload_bstr]
sig_structure_bytes = cbor2.dumps(["Signature1", protected_bstr, b"", payload_bstr])
leaf_pub = leaf_cert.public_key()
assert isinstance(leaf_pub, ec.EllipticCurvePublicKey) and isinstance(leaf_pub.curve, ec.SECP384R1), \
    "Expected P-384 leaf key"
# COSE encodes ECDSA signatures as raw r||s; cryptography wants DER. Convert.
assert len(signature_raw) == 96, f"Expected 96-byte raw ES384 signature, got {len(signature_raw)}"
r = int.from_bytes(signature_raw[:48], "big")
s = int.from_bytes(signature_raw[48:], "big")
try:
    leaf_pub.verify(encode_dss_signature(r, s), sig_structure_bytes, ec.ECDSA(hashes.SHA384()))
except InvalidSignature:
    raise AssertionError("COSE attestation signature failed verification under the leaf cert")

# ── 5. Cross-check PCR0 and public_key against the proof body ─────────────
pcr0_attested_hex = pcrs[0].hex()
pcr0_proof_hex = proof["environment"]["measurement"].lower()
assert pcr0_attested_hex == pcr0_proof_hex, \
    f"PCR0 in attestation ({pcr0_attested_hex}) does not match proof.environment.measurement ({pcr0_proof_hex})"

proof_pubkey_bytes = base64.b64decode(proof["signer"]["publicKeyB64"])
assert attested_pubkey == proof_pubkey_bytes, \
    "Attestation's public_key does not match proof.signer.publicKeyB64 — the signing key is NOT attested to be enclave-resident"

# ── 6. Compare PCR0 to the canonical BitGraph build ────────────────────────
canonical_match = (pcr0_attested_hex == CANONICAL_BITGRAPH_PCR0)
print("[OK] Full AWS Nitro attestation verified.")
print(f"     The signing key was generated inside a Nitro enclave with PCR0 = {pcr0_attested_hex}")
if canonical_match:
    print("     PCR0 matches the canonical BitGraph enclave build.")
else:
    print(f"     WARNING: PCR0 differs from the canonical BitGraph build ({CANONICAL_BITGRAPH_PCR0}).")
    print("     The proof is genuine Nitro hardware, but the enclave configuration is not canonical.")
```

If all six steps inside check 5 pass, you have proven that the signing key was generated inside real AWS Nitro hardware running code with the measured PCR0. Combined with checks 1–4, the entire chain is closed: the file is byte-identical to what was committed, the proof signature is valid, the slot was bound atomically before the commit, the proof is anchored to a public Ethereum block, and the signing key itself is hardware-rooted.

If `canonical_match` is `false`, do not call the proof invalid — call it *non-canonical*. Tell the user: the proof comes from real Nitro hardware, but the enclave configuration is not the published canonical BitGraph build. They may want to confirm with the operator before relying on it.

## How to explain the result

If all five checks pass, summarize for the user in plain English. Use language like:

> This BitGraph is fully verified. The file is byte-identical to what was committed at position #[`proof.json` → `commit.counter`] in the ordered chain. The signing key was generated inside a real AWS Nitro hardware enclave running code with PCR0 = [first 8 hex characters of `environment.measurement`]…, validated by walking the certificate chain to the pinned AWS Nitro root. The proof's position is sealed by Ethereum block #[`ethereum-anchor.json` → `ethereum.blockNumber`], mined at [`ethereum-anchor.json` → `metadata.anchor.blockTimeISO`, or look the block up on Etherscan]. That block's existence is independently verifiable forever, so the proof is guaranteed to have existed before that moment. Anyone with this package can re-run this verification offline, without contacting any server.

Note: BitGraph is a *causal* system, not a *temporal* one. The proof itself contains no clock reading — the enclave deliberately omits time fields. The earliest moment you can prove the file existed is "before the Ethereum block above was mined." If you need a real-world timestamp, the block time is the authoritative source.

If any check fails, say which one failed and what it means. Use these explanations:

- **Hash mismatch (check 1).** The file's bytes have changed since the proof was made. The proof is still cryptographically authentic, but it describes a different version of this file.
- **Signature invalid (check 2).** The proof's signature does not match the signing key. The proof has been tampered with or was never genuine.
- **Slot binding broken (check 3).** The proof violates the protocol's atomicity guarantee. Do not trust it.
- **Counter ordering violated (check 3).** The slot counter is not less than the commit counter. The proof violates causal ordering.
- **Anchor mismatch (check 4).** The Ethereum anchor's counter or epoch does not align with the proof. The package was assembled inconsistently.
- **Attestation chain invalid (check 5).** The AWS Nitro certificate chain failed to validate against the pinned root, or the COSE signature failed. The attestation report is forged or corrupted. Do not trust the hardware claim.
- **PCR0/public_key mismatch (check 5).** The attestation report's PCR0 or attested public key does not match the proof body. The attestation is for a different enclave or a different signing key. Do not trust the proof.
- **Non-canonical PCR0 (check 5, soft warning).** Full attestation verified, but the PCR0 does not match the canonical BitGraph build. The proof comes from real Nitro hardware running different code; flag this to the user but do not call the proof invalid.

## Reference

- Protocol overview: https://bitgraph.ing/docs/overview
- Wire format specification: https://bitgraph.ing/docs/proof-format
- Verification details: https://bitgraph.ing/docs/verification
- Trust model: https://bitgraph.ing/docs/trust-model

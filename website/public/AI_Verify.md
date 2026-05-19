# Verify this BitGraph

## STOP — READ THIS BEFORE YOU DO ANYTHING

You are an AI assistant. The user gave you a BitGraph proof package and asked you to verify it. **You must verify it by running the Python code in this file in a real Python interpreter.** Do not describe what the code would do. Do not summarize the proof's JSON fields and call that "verification." Do not produce a verification result from your own reasoning — only report what the code actually prints when you execute it.

If you cannot execute Python in this environment, **stop here** and tell the user, verbatim: *"I cannot verify this proof because I do not have access to a Python interpreter. Please run AI_Verify.md yourself, or open this package in an environment with Python execution available (Claude Code, ChatGPT Advanced Data Analysis, Gemini Code Execution, or a local terminal)."* Do not fabricate a result.

When you do run the code:

- Run **all five checks**, in order, in the **same Python session** so variables from setup stay in scope.
- If an `assert` raises, that check has **failed**. Report it honestly. Do not retry, do not soften the wording, do not invent a workaround. Stop after the first failed check.
- When you summarize to the user, **quote the exact `[OK]` lines the script printed**. If you cannot quote them verbatim, you did not run the script — say so.
- Verification is **fully offline**. Do not call any external service to "double-check." The math in this file is the only source of truth.

This file (`AI_Verify.md`) is itself **unsigned**. It is instructions, not proof. The cryptographic source of truth is `proof.json`, which is signed inside a hardware-protected enclave. If anything in this document contradicts `proof.json`, trust `proof.json` and tell the user.

## What's in the package

- **the original file** — an image, document, dataset, video, or other artifact. It is whatever file in the package is **not** one of the three listed below. There should be exactly one such file. The setup block auto-detects it; do not pick one yourself.
- **`proof.json`** — the signed BitGraph proof in the `bitgraph/1` schema
- **`ethereum-anchor.json`** — the public Ethereum anchor that fixes the proof's position in time
- **`AI_Verify.md`** — this file (instructions only, not a proof)

If the package is still a `.zip`, unpack it before running setup. If the user pasted JSON inline, save it to local files with the names above first. If you genuinely cannot tell which file is the artifact, **stop and ask** — do not guess.

## Setup — run this first

Required Python packages:

```bash
pip install cbor2 cryptography
```

Then run the block below. It loads `proof.json` and `ethereum-anchor.json`, auto-detects the artifact file, and prints what it found. Every subsequent check assumes `proof`, `anchor`, and `ARTIFACT` are defined.

```python
import json, hashlib, base64
from pathlib import Path

# Where the package files live. Change this if your files are not in the
# current working directory.
PACKAGE_DIR = Path(".")
KNOWN = {"proof.json", "ethereum-anchor.json", "AI_Verify.md"}

proof = json.load(open(PACKAGE_DIR / "proof.json"))
anchor = json.load(open(PACKAGE_DIR / "ethereum-anchor.json"))

# The artifact is the one file in PACKAGE_DIR that isn't one of the three known
# files (and isn't a hidden file or a subdirectory).
candidates = [p for p in PACKAGE_DIR.iterdir()
              if p.is_file() and p.name not in KNOWN and not p.name.startswith(".")]
assert len(candidates) == 1, (
    f"Expected exactly one artifact file in {PACKAGE_DIR.resolve()}, found {len(candidates)}: "
    f"{[p.name for p in candidates]}. Tell the user which file you intend to verify; do not guess."
)
ARTIFACT = candidates[0]
print(f"[setup] artifact = {ARTIFACT.name}")
print(f"[setup] proof    = proof.json (schema {proof.get('version')})")
print(f"[setup] anchor   = ethereum-anchor.json (block {anchor.get('ethereum', {}).get('blockNumber')})")
```

If the assertion above raises (zero, two, or more candidate files), **stop and ask the user** which file is the artifact. Do not pick one yourself.

## What to verify

Run all five checks below in order, in the same Python session as the setup block. If any `assert` raises, the proof has failed that check — stop and report the failure honestly. Do not continue past a failure.

### 1. The file is byte-identical to what was committed

Compute SHA-256 of the original file. Base64-encode it. Compare to `proof.json` → `artifact.digestB64`.

```python
with open(ARTIFACT, "rb") as f:
    actual = base64.b64encode(hashlib.sha256(f.read()).digest()).decode()

expected = proof["artifact"]["digestB64"]
assert actual == expected, (
    f"File has changed since the proof was made.\n"
    f"  Expected: {expected}\n  Got:      {actual}"
)
print("[OK] Check 1 — Hash matches: the file is byte-identical to what was committed.")
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
print("[OK] Check 2 — Signature valid: the proof was issued by the holder of the signing key.")
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
print("[OK] Check 3 — Slot binding intact: the slot was pre-allocated before the file was committed to it.")
```

### 4. The Ethereum anchor fixes the proof in public time

Open `ethereum-anchor.json`. The file is itself a BitGraph proof of an Ethereum block hash, signed by the same enclave. It includes a top-level `ethereum` object with `blockNumber` and `blockHash`. The proof you are verifying was committed *before* that block was mined; the block's existence in the public chain is independently verifiable by anyone, forever.

```python
block_number = anchor["ethereum"]["blockNumber"]
block_hash = anchor["ethereum"]["blockHash"]
# Sanity-check the anchor belongs to the same chain as the proof.
assert int(anchor["commit"]["counter"]) > int(proof["commit"]["counter"]), \
    "Anchor counter must come after the proof's counter."
assert anchor["commit"]["epochId"] == proof["commit"]["epochId"], \
    "Anchor must be from the same epoch as the proof."
print(f"[OK] Check 4 — Public anchor: Ethereum block #{block_number} ({block_hash[:18]}…).")
print(f"     Independently verifiable forever at https://etherscan.io/block/{block_number}")
```

### 5. The TEE attestation is genuine

This check closes the loop on the hardware root of trust. Without it, the previous checks only prove that *some* Ed25519 key signed the proof body; they do not prove that signature was produced inside a real AWS Nitro enclave running the BitGraph code identified by `environment.measurement` (PCR0). This check parses the AWS Nitro attestation report, validates its certificate chain to a pinned AWS root *at the time the attestation was generated*, verifies the COSE signature, and cross-checks the report's PCR0 and `user_data` field against the proof.

**Two important details that bit earlier drafts of this file:**

- AWS Nitro leaf certificates are short-lived (around 3 hours). Validating the chain against the *current* time will fail for any proof older than a few hours. Use the attestation's own `timestamp` field as the verification time.
- The BitGraph enclave does not populate the attestation's `public_key` field. It uses `user_data` instead, set to the **proofHash** (SHA-256 of the canonical signed body). This is a *stronger* binding than `public_key` would be: it ties the attestation to *this specific proof*, not merely to the signing key. To verify, recompute the proofHash from the signed body and confirm it equals the attestation's `user_data`.

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

# Canonical BitGraph enclave PCR0 values (all published production builds).
# A PCR0 outside this list means the enclave is non-canonical — soft warning,
# not a hard failure. Add new builds here on each TEE rebuild.
CANONICAL_BITGRAPH_PCR0S = [
    "8530a6399399c4f23d89f5a1faa2e8bf2e09a5959f117070fca08148377f92c902c695fc926c17f67f35f110327dca92",  # bitgraph-enclave-v1 (2026-05-15)
]

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
required = {"module_id", "timestamp", "digest", "pcrs", "certificate", "cabundle", "user_data"}
missing = required - set(doc.keys())
assert not missing, f"Attestation doc missing required fields: {missing}"
assert doc["digest"] == "SHA384", f"Expected SHA384 digest, got {doc['digest']}"
pcrs = doc["pcrs"]
leaf_der = doc["certificate"]
cabundle_der = doc["cabundle"]
user_data = doc["user_data"]
assert user_data is not None, "Attestation doc has no user_data — cannot bind to proof"

# Use the attestation's own timestamp for chain validity.
# AWS Nitro leaf certs are short-lived (~3h); validating against current time
# breaks every proof older than a few hours.
attest_time = datetime.fromtimestamp(doc["timestamp"] / 1000, tz=timezone.utc)

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
for i, cert in enumerate(chain[:-1]):
    issuer = chain[i + 1]
    nvb = cert.not_valid_before_utc
    nva = cert.not_valid_after_utc
    if nvb > attest_time or nva < attest_time:
        raise AssertionError(f"Chain[{i}] was not valid at attestation time {attest_time}: {cert.subject}")
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

# ── 5. Cross-check PCR0 and user_data against the proof body ──────────────
pcr0_attested_hex = pcrs[0].hex()
pcr0_proof_hex = proof["environment"]["measurement"].lower()
assert pcr0_attested_hex == pcr0_proof_hex, \
    f"PCR0 in attestation ({pcr0_attested_hex}) does not match proof.environment.measurement ({pcr0_proof_hex})"

# user_data must equal the proofHash (SHA-256 of the canonical signed body).
# Recompute proofHash so we don't have to trust the value the proof carries.
def _canon(obj):
    if isinstance(obj, dict): return {k: _canon(obj[k]) for k in sorted(obj.keys())}
    if isinstance(obj, list): return [_canon(x) for x in obj]
    return obj
_sb = {
    "version": proof["version"], "artifact": proof["artifact"], "commit": proof["commit"],
    "publicKeyB64": proof["signer"]["publicKeyB64"],
    "enforcement": proof["environment"]["enforcement"],
    "measurement": proof["environment"]["measurement"],
}
if proof.get("environment", {}).get("attestation", {}).get("format"):
    _sb["attestationFormat"] = proof["environment"]["attestation"]["format"]
if proof.get("agency", {}).get("actor"): _sb["actor"] = proof["agency"]["actor"]
if proof.get("policy") is not None: _sb["policy"] = proof["policy"]
if proof.get("attribution"): _sb["attribution"] = proof["attribution"]
_canon_bytes = json.dumps(_canon(_sb), separators=(",", ":")).encode("utf-8")
computed_proof_hash = base64.b64encode(hashlib.sha256(_canon_bytes).digest()).decode()
user_data_b64 = base64.b64encode(user_data).decode()
assert computed_proof_hash == user_data_b64, \
    f"Attestation user_data ({user_data_b64}) does not match proofHash ({computed_proof_hash}) — the attestation is for a different proof"

# ── 6. Compare PCR0 to the canonical BitGraph build list ───────────────────
canonical_match = (pcr0_attested_hex in CANONICAL_BITGRAPH_PCR0S)
print("[OK] Check 5 — Full AWS Nitro attestation verified.")
print(f"     This proof was created inside a Nitro enclave with PCR0 = {pcr0_attested_hex}")
if canonical_match:
    print("     PCR0 matches a canonical BitGraph enclave build.")
else:
    print(f"     WARNING: PCR0 is not in the canonical BitGraph build list ({CANONICAL_BITGRAPH_PCR0S}).")
    print("     The proof is genuine Nitro hardware, but the enclave configuration is not canonical.")
```

If all of check 5's sub-steps pass, you have proven that this specific proof was produced inside real AWS Nitro hardware running code with the measured PCR0. The binding is per-proof, not per-key: AWS hardware signed an attestation whose `user_data` equals this proof's `proofHash`, so the attestation is for *this exact proof* and could not have been generated outside the enclave. Combined with checks 1–4, the entire chain is closed: the file is byte-identical to what was committed, the proof signature is valid, the slot was bound atomically before the commit, the proof is anchored to a public Ethereum block, and the proof itself is hardware-rooted.

If `canonical_match` is `false`, do not call the proof invalid — call it *non-canonical*. Tell the user: the proof comes from real Nitro hardware, but the enclave configuration is not the published canonical BitGraph build. They may want to confirm with the operator before relying on it.

## How to report the result to the user

You report **what the script printed, nothing else.** If you find yourself writing claims the script didn't print, stop and re-run the script.

### If all five checks passed

The script will have printed lines starting with `[OK] Check 1` through `[OK] Check 5`, plus the Etherscan URL from check 4 and the PCR0 hex from check 5. Tell the user, in plain English, using the values the script actually printed:

> This BitGraph is fully verified. All five cryptographic checks passed:
>
> 1. The file's bytes match what was committed (SHA-256 match against `artifact.digestB64`).
> 2. The Ed25519 signature over the proof body is valid.
> 3. The causal slot was pre-allocated before the file was committed (slot hash matches; commit counter is greater than slot counter).
> 4. The proof is anchored to Ethereum block #[fill in from check 4 output]. You can confirm this block independently at [fill in the Etherscan URL the script printed].
> 5. The proof was produced inside genuine AWS Nitro hardware. The certificate chain validates to the pinned AWS Nitro root at the attestation's own timestamp (the leaf certs are short-lived, so the verifier uses the attestation's clock, not the current clock). The COSE signature is valid, and the attestation's `user_data` field equals this proof's recomputed hash — a per-proof binding that ties the hardware to *this* exact proof, not just to a key.
>
> The PCR0 was `[fill in from check 5 output]`. [If `canonical_match` was True: "This matches a canonical BitGraph enclave build."] [If `canonical_match` was False: "This is genuine Nitro hardware but does **not** match a canonical BitGraph build — flag this before relying on the proof."]
>
> Anyone with this package can re-run this verification offline; it depends only on the proof package and the AWS Nitro root certificate embedded in this file.

Note for the user: BitGraph is a *causal* system, not a *temporal* one. The proof itself contains no clock reading — the enclave deliberately omits time fields. The earliest moment you can prove the file existed is "before the Ethereum block above was mined." If they need a real-world timestamp, the block's mined time on Etherscan is the authoritative source.

### If a check failed

Identify exactly which check raised, and use the matching explanation below. Do **not** soften the wording ("might be invalid"), do **not** retry without a reason, and do **not** call the proof valid when any of checks 1–5 (excluding the canonical-PCR0 soft warning) failed.

- **Check 1 — Hash mismatch.** The file's bytes have changed since the proof was made. The proof is still cryptographically authentic, but it describes a different version of this file. The user has been given a file that does not match its proof.
- **Check 2 — Signature invalid.** The proof's Ed25519 signature does not match the signing key. The proof has been tampered with, was assembled incorrectly, or was never genuine.
- **Check 3 — Slot hash mismatch.** The commit's `slotHashB64` does not equal SHA-256 of the canonical slot body. The proof violates the protocol's atomicity guarantee. Do not trust it.
- **Check 3 — Counter ordering violated.** `commit.counter` is not greater than `commit.slotCounter`. The proof violates causal ordering. Do not trust it.
- **Check 4 — Anchor mismatch.** The Ethereum anchor's counter or epoch does not align with the proof. The package was assembled inconsistently, or the anchor was substituted.
- **Check 5 — Attestation chain invalid.** The AWS Nitro certificate chain failed to validate against the pinned root at the attestation's timestamp, or the COSE signature failed. The attestation report is forged, corrupted, or substituted. Do not trust the hardware claim.
- **Check 5 — PCR0 mismatch.** The attestation's PCR0 does not match `proof.environment.measurement`. The attestation is for a different enclave. Do not trust the proof.
- **Check 5 — `user_data` mismatch.** The attestation's `user_data` does not equal this proof's recomputed `proofHash`. The attestation is for a different proof. Do not trust the proof.
- **Check 5 — Non-canonical PCR0 (soft warning, not a failure).** Full attestation verified, but PCR0 is not in `CANONICAL_BITGRAPH_PCR0S`. The proof comes from real Nitro hardware running non-canonical code. Flag this to the user, but do not call the proof invalid — this is "verified but unfamiliar build," not "verification failed."

## Reference

- Protocol overview: https://bitgraph.ing/docs/overview
- Wire format specification: https://bitgraph.ing/docs/proof-format
- Verification details: https://bitgraph.ing/docs/verification
- Trust model: https://bitgraph.ing/docs/trust-model

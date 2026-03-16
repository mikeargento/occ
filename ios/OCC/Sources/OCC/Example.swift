// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/// Example usage of AgencySigner + OCCClient.
///
/// This file shows the complete flow from enrollment to proof generation.
/// It is not compiled into the library — it serves as documentation.
///
/// ```swift
/// import OCC
///
/// // 1. Setup (once, at app launch)
/// let signer = AgencySigner()
/// let client = OCCClient(
///     baseURL: URL(string: "https://commit.occ.wtf")!,
///     apiKey: "your-api-key"
/// )
///
/// // 2. Enroll device key (once, creates Secure Enclave P-256 key)
/// let actor = try signer.enroll()
/// print("Enrolled: \(actor.keyId)")
/// //  → keyId:     "d4e5f6..." (hex SHA-256 of SPKI DER)
/// //  → provider:  "apple-secure-enclave"
/// //  → algorithm: "ES256"
///
/// // 3. Commit with agency (every proof)
/// // This triggers Face ID → P-256 sign → POST /commit
/// let photoData: Data = ... // your artifact bytes
/// let proof = try await client.commitWithAgency(
///     data: photoData,
///     signer: signer,
///     metadata: ["source": "camera", "device": "iPhone 16 Pro"]
/// )
///
/// // 4. The proof now contains:
/// //   proof.version     → "occ/1"
/// //   proof.artifact    → { hashAlg: "sha256", digestB64: "..." }
/// //   proof.signer      → { publicKeyB64: "...", signatureB64: "..." }  (Ed25519 TEE)
/// //   proof.agency      → {
/// //     actor: { keyId: "d4e5f6...", provider: "apple-secure-enclave", ... }
/// //     authorization: { purpose: "occ/commit-authorize/v1", signatureB64: "..." }
/// //   }
/// //
/// // Two independent signatures:
/// //   P-256 ECDSA (device Secure Enclave) → proves WHO authorized it
/// //   Ed25519 (Nitro Enclave)              → proves it was committed inside the TEE
/// ```
///
/// ## Step-by-step flow:
///
/// ```
/// iPhone (Secure Enclave)              OCC Server              Nitro Enclave (TEE)
/// ───────────────────────              ──────────              ───────────────────
/// 1. POST /challenge ──────────────► 2. Forward ─────────► 3. Generate fresh nonce
///                                                             Store in pending set
/// 4. Receive { challenge } ◄────────── Return ◄──────────── Return { challenge }
///
/// 5. SHA-256(photo) → artifactHash
/// 6. Build canonical payload:
///    { actorKeyId, artifactHash,
///      challenge, purpose, timestamp }
/// 7. Face ID → unlock P-256 key
/// 8. P-256.sign(canonicalPayload)
///
/// 9. POST /commit ─────────────────► 10. Forward ────────► 11. Verify:
///    { digests: [...],                                         - challenge pending & unused
///      agency: { actor, authorization } }                      - P-256 sig valid
///                                                              - artifactHash == digest
///                                                              - keyId == SHA-256(pubkey)
///                                                              - timestamp within 60s
///                                                          12. Ed25519 sign (covers actor)
///                                    13. Attach TSA ◄──── Return { proof }
/// 14. Receive proof ◄──────────────── Return JSON
/// ```

// This file intentionally contains no executable code.
// It exists solely as usage documentation for the OCC Swift library.

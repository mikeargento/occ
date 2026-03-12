"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FileDrop } from "@/components/file-drop";
import { ProofViewer } from "@/components/proof-viewer";
import { ProofMeta } from "@/components/proof-meta";
import { hashFile, hashBytes, commitDigest, commitBatch, requestChallenge, formatFileSize, type OCCProof } from "@/lib/occ";
import {
  isWebAuthnAvailable,
  isPlatformAuthenticatorAvailable,
  getStoredCredential,
  registerPasskey,
  requestAssertion,
  buildAgencyEnvelope,
  type StoredCredential,
} from "@/lib/webauthn";
import { zipSync, unzipSync, strFromU8 } from "fflate";
import { verifyAsync as ed25519Verify } from "@noble/ed25519";

// ─── Types ───────────────────────────────────────────────────────────────────

type CreateStatus = "idle" | "hashing" | "challenging" | "authorizing" | "signing" | "done" | "error";
type AuthorshipMode = "none" | "passkey";

interface CheckResult {
  label: string;
  status: "pass" | "fail" | "warn" | "info";
  detail: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Decode standard base64 to Uint8Array */
function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Convert DER-encoded ECDSA signature to IEEE P1363 (raw r||s) format.
 * WebAuthn returns DER, but WebCrypto subtle.verify expects P1363.
 */
function derToP1363(der: Uint8Array, n: number = 32): Uint8Array {
  // DER: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
  if (der[0] !== 0x30) throw new Error("Not a DER sequence");
  let offset = 2; // skip 0x30 + length byte
  // Handle multi-byte length
  if (der[1]! & 0x80) offset = 2 + (der[1]! & 0x7f);

  if (der[offset] !== 0x02) throw new Error("Expected INTEGER tag for r");
  const rLen = der[offset + 1]!;
  const rStart = offset + 2;
  const rBytes = der.slice(rStart, rStart + rLen);

  const sOffset = rStart + rLen;
  if (der[sOffset] !== 0x02) throw new Error("Expected INTEGER tag for s");
  const sLen = der[sOffset + 1]!;
  const sStart = sOffset + 2;
  const sBytes = der.slice(sStart, sStart + sLen);

  // Pad or trim to n bytes (strip leading zero padding from DER)
  const out = new Uint8Array(n * 2);
  const rTrimmed = rBytes[0] === 0 && rBytes.length > n ? rBytes.slice(1) : rBytes;
  const sTrimmed = sBytes[0] === 0 && sBytes.length > n ? sBytes.slice(1) : sBytes;
  out.set(rTrimmed, n - rTrimmed.length);
  out.set(sTrimmed, n * 2 - sTrimmed.length);
  return out;
}

/**
 * Canonical JSON serialization matching occ-core/canonical.ts.
 * Sorts object keys lexicographically at every level, no whitespace.
 */
function canonicalize(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(sortKeys(obj)));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (typeof child === "undefined") continue;
    sorted[key] = sortKeys(child);
  }
  return sorted;
}

// ─── Studio Page ─────────────────────────────────────────────────────────────

export default function StudioPage() {
  // Create state
  const [files, setFiles] = useState<File[]>([]);
  const [proofs, setProofs] = useState<OCCProof[]>([]);
  const [createStatus, setCreateStatus] = useState<CreateStatus>("idle");
  const [createError, setCreateError] = useState<string | null>(null);

  // Attribution state
  const [attrName, setAttrName] = useState("");
  const [attrTitle, setAttrTitle] = useState("");
  const [attrMessage, setAttrMessage] = useState("");

  // Destination folder state (File System Access API)
  const [destDir, setDestDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [destDirName, setDestDirName] = useState<string | null>(null);
  const [fsDirSupported, setFsDirSupported] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // Check File System Access API support on mount
  useEffect(() => {
    setFsDirSupported(typeof window !== "undefined" && typeof (window as unknown as Record<string, unknown>).showDirectoryPicker === "function");
  }, []);

  // Authorship state
  const [authorshipMode, setAuthorshipMode] = useState<AuthorshipMode>("none");
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [storedCredential, setStoredCredential] = useState<StoredCredential | null>(null);
  const [registering, setRegistering] = useState(false);

  // Check WebAuthn availability on mount
  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setPasskeyAvailable);
    setStoredCredential(getStoredCredential());
  }, []);

  // Verify state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [verifyResults, setVerifyResults] = useState<CheckResult[] | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [extractedName, setExtractedName] = useState<string | null>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);

  // ── Create handlers ──

  const handleFiles = useCallback((newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles]);
    setProofs([]);
    setCreateError(null);
    setCreateStatus("idle");
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setProofs([]);
    setCreateError(null);
    setCreateStatus("idle");
  }, []);

  const handleClearFiles = useCallback(() => {
    setFiles([]);
    setProofs([]);
    setCreateError(null);
    setCreateStatus("idle");
  }, []);

  const handlePickDestination = async () => {
    try {
      const dirHandle = await (window as unknown as { showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: "readwrite" });
      setDestDir(dirHandle);
      setDestDirName(dirHandle.name);
    } catch {
      // User cancelled the picker
    }
  };

  const handleClearDestination = useCallback(() => {
    setDestDir(null);
    setDestDirName(null);
  }, []);

  const handleRegisterPasskey = async () => {
    setRegistering(true);
    try {
      const cred = await registerPasskey();
      setStoredCredential(cred);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Passkey registration failed");
    } finally {
      setRegistering(false);
    }
  };

  const handleGenerate = async () => {
    if (files.length === 0) return;
    setCreateError(null);
    setVerifyResults(null);

    const isBatch = files.length > 1;

    try {
      // Step 1: Hash all files
      setCreateStatus("hashing");
      const fileDigests: Array<{ digestB64: string; hashAlg: "sha256" }> = [];
      for (const f of files) {
        const digestB64 = await hashFile(f);
        fileDigests.push({ digestB64, hashAlg: "sha256" });
      }

      // Step 2: Biometric authorization (once for entire batch)
      let agency: ReturnType<typeof buildAgencyEnvelope> | undefined;

      if (authorshipMode === "passkey" && storedCredential) {
        setCreateStatus("challenging");
        const challengeB64 = await requestChallenge();

        setCreateStatus("authorizing");
        const assertion = await requestAssertion(
          challengeB64,
          storedCredential.credentialIdB64
        );

        // Agency bound to first file's digest
        agency = buildAgencyEnvelope(
          storedCredential,
          assertion,
          fileDigests[0].digestB64,
          challengeB64
        );
      }

      // Build attribution object (only if any field is non-empty)
      const attrObj: { name?: string; title?: string; message?: string } = {};
      if (attrName.trim()) attrObj.name = attrName.trim();
      if (attrTitle.trim()) attrObj.title = attrTitle.trim();
      if (attrMessage.trim()) attrObj.message = attrMessage.trim();
      const attribution = Object.keys(attrObj).length > 0 ? attrObj : undefined;

      // Build metadata with verification details
      const metadata: Record<string, unknown> = {
        source: "occ-studio",
      };
      if (authorshipMode === "passkey" && storedCredential) {
        metadata.userVerified = true;
        metadata.authMethod = "platform-biometric";
        metadata.deviceKey = storedCredential.keyId;
      }

      setCreateStatus("signing");

      let generatedProofs: OCCProof[];

      if (isBatch) {
        // Batch mode: one commit request, multiple digests
        const batchId = crypto.randomUUID();
        metadata.authorizationMode = "batch";
        metadata.batchId = batchId;
        metadata.batchSize = files.length;
        metadata.fileNames = files.map(f => f.name);

        generatedProofs = await commitBatch(fileDigests, metadata, agency, attribution);
      } else {
        // Single file mode
        metadata.fileName = files[0].name;
        const result = await commitDigest(
          fileDigests[0].digestB64,
          metadata,
          agency,
          attribution
        );
        generatedProofs = [result];
      }

      setProofs(generatedProofs);

      // Auto-save to destination folder if set
      if (destDir) {
        let saved = 0;
        for (let i = 0; i < files.length; i++) {
          if (files[i] && generatedProofs[i]) {
            try {
              const zipped = await buildProofZip(files[i], generatedProofs[i]);
              const fileName = `${files[i].name}.proof.zip`.replace(/^\./, "");
              const fileHandle = await destDir.getFileHandle(fileName, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer);
              await writable.close();
              saved++;
            } catch {
              // If folder write fails, user can still download manually
            }
          }
        }
        setSavedCount(saved);
      }

      setCreateStatus("done");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unknown error");
      setCreateStatus("error");
    }
  };

  /** Build a proof.zip for a single file+proof pair */
  const buildProofZip = async (f: File, p: OCCProof): Promise<Uint8Array> => {
    const originalData = new Uint8Array(await f.arrayBuffer());
    const proofJson = JSON.stringify(p, null, 2);

    const verifyTxt = `VERIFICATION INSTRUCTIONS
========================

This proof.zip was created by ProofStudio (https://proofstudio.wtf).

It contains:
  - ${f.name}  (the original file)
  - proof.json           (the cryptographic proof)
  - VERIFY.txt           (this file)

The proof demonstrates that "${f.name}" existed in its current form
at the time the proof was created. The file was hashed locally in your
browser. Only the SHA-256 digest of the file was sent to the commit
service. The original file was never uploaded.

To verify this proof:
  1. Visit https://proofstudio.wtf/studio
  2. Drop this proof.zip file onto the Verify section
  3. The verifier checks the SHA-256 hash and Ed25519 signature

Proof details:
  Version:     ${p.version}
  Digest:      ${p.artifact.digestB64}
  Algorithm:   ${p.artifact.hashAlg}
  Public Key:  ${p.signer.publicKeyB64}
${p.attribution ? `
Attribution (sealed into proof):${p.attribution.name ? `\n  Name:        ${p.attribution.name}` : ""}${p.attribution.title ? `\n  Title:       ${p.attribution.title}` : ""}${p.attribution.message ? `\n  Message:     ${p.attribution.message}` : ""}
` : ""}
Powered by OCC (Origin Controlled Computing)
Learn more: https://proofstudio.wtf
`;

    return zipSync({
      [f.name]: originalData,
      "proof.json": new TextEncoder().encode(proofJson),
      "VERIFY.txt": new TextEncoder().encode(verifyTxt),
    });
  };

  const downloadBlob = (data: Uint8Array, filename: string) => {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Download proof.zip for a specific file index */
  const handleDownloadZip = async (index: number) => {
    const f = files[index];
    const p = proofs[index];
    if (!f || !p) return;
    const zipped = await buildProofZip(f, p);
    downloadBlob(zipped, `${f.name}.proof.zip`.replace(/^\./, ""));
  };

  /** Download all proof.zips (one per file) */
  const handleDownloadAll = async () => {
    for (let i = 0; i < files.length; i++) {
      if (files[i] && proofs[i]) {
        const zipped = await buildProofZip(files[i], proofs[i]);
        downloadBlob(zipped, `${files[i].name}.proof.zip`.replace(/^\./, ""));
      }
    }
  };

  // ── Verify handlers ──

  const handleZipFile = useCallback((f: File) => {
    setZipFile(f);
    setVerifyResults(null);
    setExtractedName(null);
  }, []);

  const handleClearZip = useCallback(() => {
    setZipFile(null);
    setVerifyResults(null);
    setExtractedName(null);
  }, []);

  const handleVerify = async () => {
    if (!zipFile) return;
    setVerifying(true);
    setVerifyResults(null);
    setProofs([]);

    const checks: CheckResult[] = [];

    try {
      const zipData = new Uint8Array(await zipFile.arrayBuffer());
      let entries: Record<string, Uint8Array>;

      try {
        entries = unzipSync(zipData);
      } catch {
        checks.push({ label: "ZIP extraction", status: "fail", detail: "Could not extract the file. Make sure it is a valid proof.zip." });
        setVerifyResults(checks);
        setVerifying(false);
        return;
      }

      const proofEntry = entries["proof.json"];
      if (!proofEntry) {
        checks.push({ label: "ZIP structure", status: "fail", detail: "No proof.json found inside the archive." });
        setVerifyResults(checks);
        setVerifying(false);
        return;
      }

      let vProof: OCCProof;
      try {
        vProof = JSON.parse(strFromU8(proofEntry));
      } catch {
        checks.push({ label: "Proof parsing", status: "fail", detail: "proof.json is not valid JSON." });
        setVerifyResults(checks);
        setVerifying(false);
        return;
      }

      checks.push({ label: "ZIP structure", status: "pass", detail: `Extracted ${Object.keys(entries).length} files, proof.json found` });

      const originalFileName = Object.keys(entries).find((k) => k !== "proof.json" && k !== "VERIFY.txt");

      if (!originalFileName) {
        checks.push({ label: "Original file", status: "fail", detail: "No original file found in the archive." });
        setVerifyResults(checks);
        setVerifying(false);
        return;
      }

      setExtractedName(originalFileName);
      const originalBytes = entries[originalFileName];
      checks.push({ label: "Original file", status: "pass", detail: `${originalFileName} (${formatFileSize(originalBytes.length)})` });

      // Structural
      checks.push(vProof.version === "occ/1"
        ? { label: "Version", status: "pass", detail: "occ/1" }
        : { label: "Version", status: "fail", detail: `Expected "occ/1", got "${vProof.version}"` });

      checks.push(vProof.artifact?.hashAlg === "sha256" && vProof.artifact?.digestB64
        ? { label: "Artifact structure", status: "pass", detail: "hashAlg: sha256, digestB64 present" }
        : { label: "Artifact structure", status: "fail", detail: "Missing or invalid artifact fields" });

      checks.push(vProof.commit?.nonceB64
        ? { label: "Commit nonce", status: "pass", detail: `${vProof.commit.nonceB64.length} chars` }
        : { label: "Commit nonce", status: "fail", detail: "Missing nonceB64" });

      checks.push(vProof.signer?.publicKeyB64 && vProof.signer?.signatureB64
        ? { label: "Signer fields", status: "pass", detail: "publicKeyB64 and signatureB64 present" }
        : { label: "Signer fields", status: "fail", detail: "Missing signer fields" });

      const validEnforcements = ["stub", "hw-key", "measured-tee"];
      checks.push(vProof.environment?.enforcement && validEnforcements.includes(vProof.environment.enforcement)
        ? { label: "Enforcement tier", status: "pass", detail: vProof.environment.enforcement }
        : { label: "Enforcement tier", status: "fail", detail: `Invalid: "${vProof.environment?.enforcement}"` });

      checks.push(vProof.environment?.measurement
        ? { label: "Measurement", status: "pass", detail: `${vProof.environment.measurement.slice(0, 32)}…` }
        : { label: "Measurement", status: "fail", detail: "Missing measurement" });

      // Digest
      const computedDigest = await hashBytes(originalBytes);
      checks.push(computedDigest === vProof.artifact?.digestB64
        ? { label: "Artifact digest match", status: "pass", detail: "SHA-256 of original file matches proof.artifact.digestB64" }
        : { label: "Artifact digest match", status: "fail", detail: `Mismatch — computed: ${computedDigest.slice(0, 24)}…` });

      // Ed25519 signature verification
      try {
        const pubBytes = b64ToBytes(vProof.signer.publicKeyB64);
        const sigBytes = b64ToBytes(vProof.signer.signatureB64);

        if (pubBytes.length !== 32) {
          checks.push({ label: "Ed25519 signature", status: "fail", detail: `Public key is ${pubBytes.length} bytes; expected 32` });
        } else if (sigBytes.length !== 64) {
          checks.push({ label: "Ed25519 signature", status: "fail", detail: `Signature is ${sigBytes.length} bytes; expected 64` });
        } else {
          // Reconstruct the signed body exactly as occ-core does
          const signedBody: Record<string, unknown> = {
            version: vProof.version,
            artifact: vProof.artifact,
            commit: vProof.commit,
            publicKeyB64: vProof.signer.publicKeyB64,
            enforcement: vProof.environment.enforcement,
            measurement: vProof.environment.measurement,
          };
          if (vProof.environment.attestation) {
            signedBody.attestationFormat = vProof.environment.attestation.format;
          }
          // Include actor in signed body when agency is present
          if (vProof.agency) {
            signedBody.actor = vProof.agency.actor;
          }
          // Include attribution in signed body when present
          if (vProof.attribution) {
            signedBody.attribution = vProof.attribution;
          }

          const canonicalBytes = canonicalize(signedBody);
          const valid = await ed25519Verify(sigBytes, canonicalBytes, pubBytes);

          checks.push(valid
            ? { label: "Enclave commit signature", status: "pass", detail: "Proof committed inside AWS Nitro Enclave" }
            : { label: "Enclave commit signature", status: "fail", detail: "Signature does not match the signed body" });
        }
      } catch (sigErr) {
        checks.push({ label: "Ed25519 signature", status: "fail", detail: `Verification error: ${sigErr instanceof Error ? sigErr.message : "unknown"}` });
      }

      // Attestation
      checks.push(vProof.environment?.attestation
        ? { label: "Attestation", status: "pass", detail: `Format: ${vProof.environment.attestation.format}` }
        : { label: "Attestation", status: "warn", detail: "No attestation report. Hardware verification not available." });

      // Timestamps
      const tsa = vProof.timestamps?.artifact || vProof.timestamps?.proof;
      checks.push(tsa
        ? { label: "Timestamp (TSA)", status: "pass", detail: `${tsa.authority} — ${tsa.time}` }
        : { label: "Timestamp (TSA)", status: "warn", detail: "No RFC 3161 timestamp. Time is self-reported only." });

      // Chain
      checks.push(vProof.commit?.prevB64
        ? { label: "Chain link", status: "pass", detail: `Linked: ${vProof.commit.prevB64.slice(0, 16)}…` }
        : { label: "Chain link", status: "info", detail: "No chain link. First proof in epoch or chaining not used." });

      if (vProof.commit?.counter) checks.push({ label: "Counter", status: "pass", detail: `Value: ${vProof.commit.counter}` });
      if (vProof.commit?.epochId) checks.push({ label: "Epoch", status: "pass", detail: `${vProof.commit.epochId.slice(0, 20)}…` });

      // Agency verification
      if (vProof.agency) {
        const { actor, authorization } = vProof.agency;

        // Structural checks
        checks.push(actor.keyId && actor.publicKeyB64 && actor.algorithm === "ES256" && actor.provider
          ? { label: "Actor identity", status: "pass", detail: `${actor.provider} — ${actor.keyId.slice(0, 16)}…` }
          : { label: "Actor identity", status: "fail", detail: "Missing or invalid actor fields" });

        checks.push(authorization.purpose === "occ/commit-authorize/v1"
          ? { label: "Agency purpose", status: "pass", detail: authorization.purpose }
          : { label: "Agency purpose", status: "fail", detail: `Expected "occ/commit-authorize/v1", got "${authorization.purpose}"` });

        // Artifact hash binding (batch-aware: agency binds to first digest,
        // batchContext.batchDigests lists all authorized digests)
        const bc = vProof.agency.batchContext;
        const artifactBindingOk =
          authorization.artifactHash === vProof.artifact.digestB64 ||
          (bc &&
            Array.isArray(bc.batchDigests) &&
            bc.batchDigests.includes(vProof.artifact.digestB64) &&
            bc.batchDigests[0] === authorization.artifactHash);
        checks.push(artifactBindingOk
          ? { label: "Agency artifact binding", status: "pass", detail: bc
              ? `Batch proof ${bc.batchIndex + 1}/${bc.batchSize} — authorized via first artifact`
              : "authorization.artifactHash matches proof.artifact.digestB64" }
          : { label: "Agency artifact binding", status: "fail", detail: "artifactHash does not match proof artifact digest" });

        // actorKeyId consistency
        checks.push(authorization.actorKeyId === actor.keyId
          ? { label: "Agency key ID binding", status: "pass", detail: "authorization.actorKeyId matches actor.keyId" }
          : { label: "Agency key ID binding", status: "fail", detail: "actorKeyId does not match actor.keyId" });

        // P-256 signature verification via WebCrypto
        try {
          const pubKeyDer = b64ToBytes(actor.publicKeyB64);
          // Compute keyId = hex(SHA-256(SPKI DER pubkey bytes))
          const keyIdHash = await crypto.subtle.digest("SHA-256", pubKeyDer as unknown as BufferSource);
          const computedKeyId = Array.from(new Uint8Array(keyIdHash))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          checks.push(computedKeyId === actor.keyId
            ? { label: "Actor keyId derivation", status: "pass", detail: "keyId = SHA-256(SPKI pubkey) matches" }
            : { label: "Actor keyId derivation", status: "fail", detail: "keyId does not match SHA-256 of public key" });

          // Import P-256 SPKI key
          const cryptoKey = await crypto.subtle.importKey(
            "spki",
            pubKeyDer as unknown as BufferSource,
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["verify"]
          );

          const sigBytesRaw = b64ToBytes(authorization.signatureB64);
          const isWebAuthnFormat = "format" in authorization && (authorization as Record<string, unknown>).format === "webauthn";

          let p256Valid: boolean;
          if (isWebAuthnFormat) {
            // WebAuthn: verify over authenticatorData || SHA-256(clientDataJSON)
            const wa = authorization as Record<string, string>;
            const authData = b64ToBytes(wa.authenticatorDataB64);
            const clientDataHash = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(wa.clientDataJSON) as unknown as BufferSource
            );
            const signedData = new Uint8Array(authData.length + 32);
            signedData.set(authData, 0);
            signedData.set(new Uint8Array(clientDataHash), authData.length);

            // Check UP/UV flags
            if (authData.length >= 33) {
              const flags = authData[32];
              const UP = (flags & 0x01) !== 0;
              const UV = (flags & 0x04) !== 0;
              checks.push(UP && UV
                ? { label: "Biometric verification", status: "pass", detail: "User Present and User Verified flags set" }
                : { label: "Biometric verification", status: "fail", detail: `Flags: UP=${UP}, UV=${UV}` });
            }

            // WebAuthn signatures are DER-encoded; WebCrypto expects P1363 (raw r||s)
            const sigP1363 = sigBytesRaw[0] === 0x30 ? derToP1363(sigBytesRaw) : sigBytesRaw;

            p256Valid = await crypto.subtle.verify(
              { name: "ECDSA", hash: "SHA-256" },
              cryptoKey,
              sigP1363 as unknown as BufferSource,
              signedData as unknown as BufferSource
            );

            checks.push(p256Valid
              ? { label: "Device authorization (WebAuthn)", status: "pass", detail: "Proof authorized by device key" }
              : { label: "Device authorization (WebAuthn)", status: "fail", detail: "WebAuthn signature verification failed" });
          } else {
            // Direct: verify over canonical JSON payload
            const canonicalPayload: Record<string, unknown> = {
              actorKeyId: authorization.actorKeyId,
              artifactHash: authorization.artifactHash,
              challenge: authorization.challenge,
              purpose: authorization.purpose,
              timestamp: authorization.timestamp,
            };
            // Include protocolVersion when present (backward-compatible)
            if ("protocolVersion" in authorization && (authorization as Record<string, unknown>).protocolVersion !== undefined) {
              canonicalPayload.protocolVersion = (authorization as Record<string, unknown>).protocolVersion;
            }
            const payloadBytes = new TextEncoder().encode(
              JSON.stringify(canonicalPayload, Object.keys(canonicalPayload).sort())
            );

            p256Valid = await crypto.subtle.verify(
              { name: "ECDSA", hash: "SHA-256" },
              cryptoKey,
              sigBytesRaw as unknown as BufferSource,
              payloadBytes as unknown as BufferSource
            );

            checks.push(p256Valid
              ? { label: "Device authorization", status: "pass", detail: "Proof authorized by device key" }
              : { label: "Device authorization", status: "fail", detail: "Device authorization signature verification failed" });
          }
        } catch (agencyErr) {
          checks.push({ label: "P-256 actor signature", status: "fail", detail: `Verification error: ${agencyErr instanceof Error ? agencyErr.message : "unknown"}` });
        }
      } else {
        checks.push({ label: "Agency", status: "info", detail: "No actor identity. Proof does not identify WHO authorized the commitment." });
      }

      // Attribution
      if (vProof.attribution) {
        const parts: string[] = [];
        if (vProof.attribution.name) parts.push(vProof.attribution.name);
        if (vProof.attribution.title) parts.push(vProof.attribution.title);
        if (vProof.attribution.message) parts.push(`"${vProof.attribution.message}"`);
        checks.push({
          label: "Attribution",
          status: "pass",
          detail: `Sealed claim: ${parts.join(" — ")}`,
        });
      }

    } catch (err) {
      checks.push({ label: "Verification error", status: "fail", detail: err instanceof Error ? err.message : "Unknown error" });
    }

    setVerifyResults(checks);
    setVerifying(false);
  };

  const busy = createStatus === "hashing" || createStatus === "challenging" || createStatus === "authorizing" || createStatus === "signing";
  const allPass = verifyResults?.every((r) => r.status === "pass" || r.status === "info");
  const anyFail = verifyResults?.some((r) => r.status === "fail");

  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-3xl font-semibold tracking-tight mb-3">
          Studio
        </h1>
        <p className="text-text-secondary max-w-2xl">
          Generate cryptographic proof for any file, or verify existing proofs.
          Everything runs locally in your browser — files are never uploaded.
        </p>
      </div>

      {/* Two-column input panels */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* ── Create ── */}
        <div className="flex flex-col">
          <h2 className="text-xl font-semibold tracking-tight mb-2">
            Make a proof.
          </h2>
          <p className="text-text-secondary text-sm mb-6 lg:min-h-[40px]">
            Drop any file. Your browser hashes it locally, sends only the digest
            to an AWS Nitro Enclave, and returns a signed proof.
          </p>

          <div className="flex-1 flex flex-col gap-4">
            <div className="flex-1">
              <FileDrop
                multiple
                onFiles={handleFiles}
                files={files}
                onRemoveFile={handleRemoveFile}
                onClearAll={handleClearFiles}
                disabled={busy}
              />
            </div>

            {/* ── Proof Authorship toggle ── */}
            {passkeyAvailable && (
              <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary mb-3">
                  Device Authorization
                </div>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="authorship"
                      checked={authorshipMode === "none"}
                      onChange={() => setAuthorshipMode("none")}
                      className="mt-0.5 accent-text"
                    />
                    <div>
                      <div className="text-sm font-medium text-text group-hover:text-text/80">None</div>
                      <div className="text-xs text-text-tertiary">Proof attests the commit boundary only</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="authorship"
                      checked={authorshipMode === "passkey"}
                      onChange={() => setAuthorshipMode("passkey")}
                      className="mt-0.5 accent-text"
                    />
                    <div>
                      <div className="text-sm font-medium text-text group-hover:text-text/80">Authorize with device biometrics</div>
                      <div className="text-xs text-text-tertiary">A device key, unlocked by biometrics, authorizes proof creation</div>
                    </div>
                  </label>
                </div>

                {authorshipMode === "passkey" && !storedCredential && (
                  <button
                    onClick={handleRegisterPasskey}
                    disabled={registering}
                    className="mt-3 w-full h-9 rounded-md border border-border text-xs font-semibold text-text-secondary hover:text-text hover:border-text-tertiary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {registering ? "Registering…" : "Register Passkey"}
                  </button>
                )}

                {authorshipMode === "passkey" && storedCredential && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 text-xs text-success">
                      <span className="inline-flex w-4 h-4 items-center justify-center rounded-full bg-success/20 text-[10px]">✓</span>
                      <span>Device identity registered</span>
                      <span className="text-text-tertiary font-mono ml-1">{storedCredential.keyId.slice(0, 12)}…</span>
                    </div>
                    <div className="text-[11px] text-text-tertiary mt-1 ml-6">
                      Biometric verification required when creating proofs.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Attribution fields ── */}
            <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary mb-3">
                Attribution
              </div>
              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    placeholder="Name"
                    value={attrName}
                    onChange={(e) => setAttrName(e.target.value)}
                    className="w-full h-9 rounded-md border border-border-subtle bg-bg px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary transition-colors"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Title"
                    value={attrTitle}
                    onChange={(e) => setAttrTitle(e.target.value)}
                    className="w-full h-9 rounded-md border border-border-subtle bg-bg px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary transition-colors"
                  />
                </div>
                <div>
                  <textarea
                    placeholder="Message"
                    value={attrMessage}
                    onChange={(e) => setAttrMessage(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-border-subtle bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary transition-colors resize-none"
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-tertiary mt-2">
                This text will be sealed into the proof and travel with the artifact.
              </p>
            </div>

            {/* ── Destination folder ── */}
            {fsDirSupported && (
              <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary mb-3">
                  Save To
                </div>
                {destDir ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary shrink-0">
                        <path d="M2 4.5V12a1 1 0 001 1h10a1 1 0 001-1V6.5a1 1 0 00-1-1H8.5L7 4H3a1 1 0 00-1 .5z" />
                      </svg>
                      <span className="text-sm text-text truncate">{destDirName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <button
                        onClick={handlePickDestination}
                        className="text-xs text-text-secondary hover:text-text transition-colors"
                      >
                        Change
                      </button>
                      <button
                        onClick={handleClearDestination}
                        className="text-xs text-text-tertiary hover:text-text transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handlePickDestination}
                    className="w-full h-9 rounded-md border border-border-subtle text-xs font-medium text-text-secondary hover:text-text hover:border-text-tertiary transition-colors cursor-pointer"
                  >
                    Choose folder…
                  </button>
                )}
                <p className="text-[11px] text-text-tertiary mt-2">
                  {destDir
                    ? "Proof files will be saved here automatically."
                    : "Pick a folder to auto-save proof.zip files. Otherwise they download to your default location."}
                </p>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={files.length === 0 || busy || (authorshipMode === "passkey" && !storedCredential)}
              className={`
                w-full h-11 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all shrink-0
                ${files.length === 0 || busy || (authorshipMode === "passkey" && !storedCredential)
                  ? "bg-bg-subtle text-text-tertiary cursor-not-allowed"
                  : "bg-text text-bg hover:opacity-85 cursor-pointer"
                }
              `}
            >
              {createStatus === "hashing"
                ? "Hashing…"
                : createStatus === "challenging"
                ? "Requesting authorization challenge…"
                : createStatus === "authorizing"
                ? "Waiting for device authorization…"
                : createStatus === "signing"
                ? "Committing in enclave…"
                : files.length > 1 ? `Make ${files.length} Proofs` : "Make a Proof"}
            </button>

            {createError && (
              <div className="rounded-lg border border-error/30 bg-error/5 p-4">
                <div className="text-sm text-error font-medium mb-1">Error</div>
                <div className="text-sm text-text-secondary">{createError}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Verify ── */}
        <div className="flex flex-col">
          <h2 className="text-xl font-semibold tracking-tight mb-2">
            Verify a proof.
          </h2>
          <p className="text-text-secondary text-sm mb-6 lg:min-h-[40px]">
            Drop a <code className="text-xs bg-bg-subtle px-1.5 py-0.5 rounded border border-border-subtle font-mono">proof.zip</code> to
            extract, re-hash, and check the digest against the proof.
          </p>

          <div className="flex-1 flex flex-col gap-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragover(false);
                if (e.dataTransfer.files.length) handleZipFile(e.dataTransfer.files[0]);
              }}
              onClick={() => !zipFile && zipInputRef.current?.click()}
              className={`
                flex-1 relative rounded-lg border-2 border-dashed transition-all cursor-pointer min-h-[160px] flex items-center
                ${dragover ? "border-text/30 bg-text/5" : zipFile ? "border-border bg-bg-elevated" : "border-border-subtle hover:border-border bg-bg-elevated/50 hover:bg-bg-elevated"}
              `}
            >
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,.proof.zip"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleZipFile(e.target.files[0]);
                }}
              />

              {zipFile ? (
                <div className="flex items-center justify-between px-6 py-5 w-full">
                  <div>
                    <div className="text-sm font-medium text-text">{zipFile.name}</div>
                    <div className="text-xs text-text-tertiary mt-0.5">
                      {formatFileSize(zipFile.size)}
                      {extractedName && (
                        <span className="ml-2 text-text-secondary">
                          → <span className="font-mono">{extractedName}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleClearZip(); }}
                    className="text-xs text-text-tertiary hover:text-text transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center py-12 px-6 w-full">
                  <div className="w-10 h-10 rounded-lg border border-border-subtle bg-bg-subtle flex items-center justify-center mb-4">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                      <path d="M10 2L3 5.5v4.5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V5.5L10 2z" />
                      <path d="M7 10l2.5 2.5L13 8" />
                    </svg>
                  </div>
                  <div className="text-sm text-text-secondary">
                    Drop <code className="text-xs bg-bg-subtle px-1 py-0.5 rounded border border-border-subtle font-mono">proof.zip</code> files
                    here, or <span className="text-text font-medium">click to select</span>
                  </div>
                  <div className="text-xs text-text-tertiary mt-1">
                    Runs entirely in your browser
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleVerify}
              disabled={!zipFile || verifying}
              className={`
                w-full h-11 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all shrink-0
                ${!zipFile || verifying
                  ? "bg-bg-subtle text-text-tertiary cursor-not-allowed"
                  : "bg-text text-bg hover:opacity-85 cursor-pointer"
                }
              `}
            >
              {verifying ? "Verifying…" : "Verify Proof"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Create Results (full width) ── */}
      {proofs.length > 0 && (
        <div className="mt-10 pt-8 border-t border-border-subtle space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-sm font-medium text-success">
                {proofs.length === 1 ? "Proof generated" : `${proofs.length} proofs generated`}
              </span>
              {savedCount > 0 && destDirName && (
                <span className="text-xs text-text-tertiary">
                  · Saved {savedCount === 1 ? "1 file" : `${savedCount} files`} to {destDirName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {proofs.length > 1 && (
                <button
                  onClick={handleDownloadAll}
                  className="inline-flex items-center gap-2 rounded-md bg-success px-4 py-2 text-xs font-semibold text-bg hover:bg-success/85 transition-colors cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M7 2v7M4 6l3 3 3-3" />
                    <path d="M2 10v1.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V10" />
                  </svg>
                  Download all
                </button>
              )}
              {proofs.length === 1 && (
                <button
                  onClick={() => handleDownloadZip(0)}
                  className="inline-flex items-center gap-2 rounded-md bg-success px-4 py-2 text-xs font-semibold text-bg hover:bg-success/85 transition-colors cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M7 2v7M4 6l3 3 3-3" />
                    <path d="M2 10v1.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V10" />
                  </svg>
                  Download proof.zip
                </button>
              )}
            </div>
          </div>

          {proofs.map((p, idx) => (
            <div key={idx} className={proofs.length > 1 ? "rounded-lg border border-border-subtle p-4 space-y-4" : "space-y-4"}>
              {proofs.length > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text">{files[idx]?.name || `Proof ${idx + 1}`}</span>
                  <button
                    onClick={() => handleDownloadZip(idx)}
                    className="text-xs text-text-secondary hover:text-text transition-colors"
                  >
                    Download
                  </button>
                </div>
              )}
              <ProofMeta proof={p} fileName={files[idx]?.name} fileSize={files[idx]?.size} />
              {proofs.length === 1 && <ProofViewer proof={p} />}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                <InfoCard
                  title="Artifact"
                  items={[
                    { label: "Hash Algorithm", value: p.artifact.hashAlg },
                    { label: "Digest", value: p.artifact.digestB64 },
                  ]}
                />
                <InfoCard
                  title="Commit"
                  items={[
                    { label: "Nonce", value: p.commit.nonceB64 },
                    ...(p.commit.counter ? [{ label: "Counter", value: p.commit.counter }] : []),
                    ...(p.commit.epochId ? [{ label: "Epoch", value: p.commit.epochId }] : []),
                    ...(p.commit.prevB64 ? [{ label: "Chain Link", value: p.commit.prevB64 }] : []),
                  ]}
                />
                <InfoCard
                  title="Environment"
                  items={[
                    { label: "Enforcement", value: p.environment.enforcement },
                    { label: "Measurement", value: p.environment.measurement },
                    ...(p.environment.attestation ? [{ label: "Attestation", value: p.environment.attestation.format }] : []),
                  ]}
                />
                <InfoCard
                  title="Signer"
                  items={[
                    { label: "Public Key", value: p.signer.publicKeyB64 },
                    { label: "Signature", value: p.signer.signatureB64 },
                  ]}
                />
                {p.agency && (
                  <InfoCard
                    title="Agency"
                    items={[
                      { label: "Actor", value: p.agency.actor.keyId },
                      { label: "Provider", value: p.agency.actor.provider },
                      { label: "Algorithm", value: p.agency.actor.algorithm },
                      { label: "Purpose", value: p.agency.authorization.purpose },
                    ]}
                  />
                )}
                {p.attribution && (
                  <InfoCard
                    title="Attribution"
                    items={[
                      ...(p.attribution.name ? [{ label: "Name", value: p.attribution.name }] : []),
                      ...(p.attribution.title ? [{ label: "Title", value: p.attribution.title }] : []),
                      ...(p.attribution.message ? [{ label: "Message", value: p.attribution.message }] : []),
                    ]}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Verify Results (full width) ── */}
      {verifyResults && (
        <div className="mt-10 pt-8 border-t border-border-subtle space-y-4">
          <div className={`rounded-lg border p-4 ${
            anyFail ? "border-error/30 bg-error/5" :
            allPass ? "border-success/30 bg-success/5" :
            "border-warning/30 bg-warning/5"
          }`}>
            <div className={`text-sm font-semibold ${
              anyFail ? "text-error" : allPass ? "text-success" : "text-warning"
            }`}>
              {anyFail ? "Verification Failed" : allPass ? "Verification Passed" : "Passed with Warnings"}
            </div>
            <p className="text-xs text-text-secondary mt-1">
              {anyFail
                ? "One or more checks failed. This proof may not be valid for the provided file."
                : allPass
                ? "All checks passed. The artifact digest matches and the proof structure is valid."
                : "Core checks passed, but some optional fields are missing or could not be fully verified."}
            </p>
          </div>

          <div className="rounded-lg border border-border-subtle overflow-hidden">
            {verifyResults.map((check, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? "border-t border-border-subtle" : ""}`}
              >
                <div className="mt-0.5 shrink-0">
                  {check.status === "pass" && <span className="inline-flex w-4 h-4 items-center justify-center rounded-full bg-success/20 text-success text-[10px]">✓</span>}
                  {check.status === "fail" && <span className="inline-flex w-4 h-4 items-center justify-center rounded-full bg-error/20 text-error text-[10px]">✕</span>}
                  {check.status === "warn" && <span className="inline-flex w-4 h-4 items-center justify-center rounded-full bg-warning/20 text-warning text-[10px]">!</span>}
                  {check.status === "info" && <span className="inline-flex w-4 h-4 items-center justify-center rounded-full bg-info/20 text-info text-[10px]">i</span>}
                </div>
                <div>
                  <div className="text-sm font-medium text-text">{check.label}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{check.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function InfoCard({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-3">{title}</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between gap-4">
            <span className="text-xs text-text-tertiary shrink-0">{item.label}</span>
            <span className="text-xs font-mono text-text-secondary truncate">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

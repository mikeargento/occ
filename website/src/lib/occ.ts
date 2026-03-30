export const OCC_ENDPOINT = "https://nitro.occproof.com";

export interface ActorIdentity {
  keyId: string;
  publicKeyB64: string;
  algorithm: "ES256";
  provider: string;
}

export interface AgencyEnvelope {
  actor: ActorIdentity;
  authorization: {
    format: string;
    purpose: "occ/commit-authorize/v1";
    actorKeyId: string;
    artifactHash: string;
    challenge: string;
    timestamp: number;
    signatureB64: string;
    clientDataJSON?: string;
    authenticatorDataB64?: string;
  };
  batchContext?: {
    batchSize: number;
    batchIndex: number;
    batchDigests: string[];
  };
}

export interface OCCProof {
  version: string;
  artifact: {
    hashAlg: string;
    digestB64: string;
  };
  commit: {
    nonceB64: string;
    counter?: string;
    time?: number;
    prevB64?: string;
    epochId?: string;
    slotCounter?: string;
    slotHashB64?: string;
  };
  signer: {
    publicKeyB64: string;
    signatureB64: string;
  };
  environment: {
    enforcement: string;
    measurement: string;
    attestation?: {
      format: string;
      reportB64: string;
    };
  };
  timestamps?: {
    artifact?: TsaToken;
    proof?: TsaToken;
  };
  agency?: AgencyEnvelope;
  attribution?: {
    name?: string;
    title?: string;
    message?: string;
  };
  slotAllocation?: {
    version: string;
    nonceB64: string;
    counter: string;
    time: number;
    epochId: string;
    publicKeyB64: string;
    signatureB64: string;
  };
  metadata?: Record<string, unknown>;
  claims?: Record<string, unknown>;
}

export interface TsaToken {
  authority: string;
  time: string;
  digestAlg: string;
  digestB64: string;
  tokenB64: string;
}

export async function hashFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuf)));
}

/* ── Browser-side proof verification ── */

export interface ProofVerifyResult {
  valid: boolean;
  reason?: string;
  checks: {
    label: string;
    status: "pass" | "fail" | "info";
    detail?: string;
  }[];
}

/**
 * Detect whether a file's text content is an OCC proof JSON.
 */
export function isOCCProof(text: string): OCCProof | null {
  try {
    const obj = JSON.parse(text);
    if (
      obj &&
      typeof obj === "object" &&
      typeof obj.version === "string" &&
      obj.version.startsWith("occ/") &&
      obj.artifact?.digestB64 &&
      obj.signer?.publicKeyB64 &&
      obj.signer?.signatureB64
    ) {
      return obj as OCCProof;
    }
  } catch {
    // not JSON
  }
  return null;
}

/**
 * Verify an OCC proof's Ed25519 signature in the browser.
 * Does NOT require the original file — verifies the cryptographic
 * structure of the proof itself.
 */
export async function verifyProofSignature(proof: OCCProof): Promise<ProofVerifyResult> {
  const ed = await import("@noble/ed25519");

  // Noble v3 requires SHA-512 to be configured for browser use
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ed as any).etc.sha512Async = async (message: Uint8Array) => {
    const hash = await crypto.subtle.digest("SHA-512", message as unknown as BufferSource);
    return new Uint8Array(hash);
  };

  const checks: ProofVerifyResult["checks"] = [];

  // 1. Reconstruct signed body (must match constructor.ts exactly)
  const signedBody: Record<string, unknown> = {
    version: proof.version,
    artifact: proof.artifact,
    commit: proof.commit,
    publicKeyB64: proof.signer.publicKeyB64,
    enforcement: proof.environment.enforcement,
    measurement: proof.environment.measurement,
  };

  if (proof.environment.attestation !== undefined) {
    signedBody.attestationFormat = proof.environment.attestation.format;
  }
  const proofAny = proof as unknown as Record<string, unknown>;
  if (proofAny.agency !== undefined) {
    signedBody.actor = (proofAny.agency as { actor: unknown }).actor;
  }
  if (proofAny.policy !== undefined) {
    signedBody.policy = proofAny.policy;
  }
  if (proof.attribution !== undefined) {
    signedBody.attribution = proof.attribution;
  }

  // 2. Canonicalize (sorted keys, no whitespace, UTF-8)
  const canonicalJson = JSON.stringify(sortKeys(signedBody));
  const canonicalBytes = new TextEncoder().encode(canonicalJson);

  // 3. Decode signature and public key
  let sigBytes: Uint8Array;
  let pubBytes: Uint8Array;
  try {
    sigBytes = base64ToBytes(proof.signer.signatureB64);
    pubBytes = base64ToBytes(proof.signer.publicKeyB64);
  } catch {
    return {
      valid: false,
      reason: "Invalid base64 in signer fields",
      checks: [{ label: "Base64 decoding", status: "fail", detail: "signer fields contain invalid base64" }],
    };
  }

  // 4. Verify Ed25519 signature
  let sigValid = false;
  try {
    sigValid = await ed.verifyAsync(sigBytes, canonicalBytes, pubBytes);
  } catch (e) {
    checks.push({ label: "Signature", status: "fail", detail: `Verification error: ${e}` });
  }

  if (sigValid) {
    checks.push({ label: "Signature", status: "pass", detail: "Ed25519 signature valid" });
  } else if (!checks.some(c => c.label === "Signature")) {
    checks.push({ label: "Signature", status: "fail", detail: "Ed25519 signature does not match" });
  }

  // 5. Chain info
  if (proof.commit.counter) {
    checks.push({ label: "Chain position", status: "info", detail: `Proof #${proof.commit.counter}` });
  }
  if (proof.commit.prevB64) {
    checks.push({ label: "Causal link", status: "pass", detail: `Links to previous proof` });
  }

  // 6. Enforcement tier
  const enforcement = proof.environment.enforcement;
  if (enforcement === "measured-tee") {
    checks.push({ label: "Enforcement", status: "pass", detail: "Measured TEE (hardware enclave)" });
  } else if (enforcement === "hw-key") {
    checks.push({ label: "Enforcement", status: "pass", detail: "Hardware key" });
  } else {
    checks.push({ label: "Enforcement", status: "info", detail: `Software-only (${enforcement})` });
  }

  // 7. Attestation
  if (proof.environment.attestation) {
    checks.push({
      label: "Attestation",
      status: "pass",
      detail: `${proof.environment.attestation.format} report present (${proof.environment.measurement.slice(0, 16)}...)`,
    });
  }

  // 8. Timestamp
  if (proof.timestamps?.artifact) {
    checks.push({
      label: "Timestamp",
      status: "pass",
      detail: `RFC 3161 via ${proof.timestamps.artifact.authority} at ${proof.timestamps.artifact.time}`,
    });
  }

  // 9. Slot allocation
  if (proof.slotAllocation) {
    checks.push({
      label: "Slot allocation",
      status: "pass",
      detail: `Slot #${proof.slotAllocation.counter} allocated and signed`,
    });
  }

  return {
    valid: sigValid,
    reason: sigValid ? undefined : "Signature verification failed",
    checks,
  };
}

/** Recursively sort object keys for canonical JSON. */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== undefined) sorted[key] = sortKeys(val);
  }
  return sorted;
}

/** Decode standard base64 to Uint8Array. */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuf)));
}

export async function commitDigest(
  digestB64: string,
  metadata?: Record<string, unknown>,
  agency?: AgencyEnvelope,
  attribution?: { name?: string; title?: string; message?: string }
): Promise<OCCProof> {
  const body: Record<string, unknown> = {
    digests: [{ digestB64, hashAlg: "sha256" }],
    metadata,
  };
  if (agency) body.agency = agency;
  if (attribution) body.attribution = attribution;

  const resp = await fetch(`${OCC_ENDPOINT}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Enclave returned ${resp.status}`);
  }

  const proofs = await resp.json();
  const raw = Array.isArray(proofs) ? proofs[0] : proofs;

  // Canonical field order first, then any extra enclave fields at the end
  const proof: OCCProof = {
    version: raw.version || "occ/1",
    artifact: raw.artifact,
    commit: raw.commit,
    signer: raw.signer,
    environment: raw.environment,
    timestamps: raw.timestamps,
    agency: raw.agency,
    attribution: raw.attribution,
    slotAllocation: raw.slotAllocation,
    metadata: raw.metadata,
    claims: raw.claims,
    ...raw, // any extra/unknown fields go at the end
  };

  // Promote legacy tsa from metadata
  if (!proof.timestamps && raw.metadata?.tsa) {
    proof.timestamps = { artifact: raw.metadata.tsa };
  }

  // Auto-index in explorer
  try {
    await fetch(`${typeof window !== "undefined" ? "" : "https://www.occ.wtf"}/api/proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof }),
    });
  } catch { /* non-critical — proof still valid even if indexing fails */ }

  return proof;
}

/**
 * Commit multiple digests in a single enclave request (batch mode).
 * Agency is verified once against the first digest.
 * Returns one OCCProof per digest, in order.
 */
export async function commitBatch(
  digests: Array<{ digestB64: string; hashAlg: "sha256" }>,
  metadata?: Record<string, unknown>,
  agency?: AgencyEnvelope,
  attribution?: { name?: string; title?: string; message?: string }
): Promise<OCCProof[]> {
  const body: Record<string, unknown> = { digests, metadata };
  if (agency) body.agency = agency;
  if (attribution) body.attribution = attribution;

  const resp = await fetch(`${OCC_ENDPOINT}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Enclave returned ${resp.status}`);
  }

  const raw = await resp.json();
  const rawProofs = Array.isArray(raw) ? raw : [raw];

  const results = rawProofs.map((r: Record<string, unknown>) => {
    const proof: OCCProof = {
      version: (r.version as string) || "occ/1",
      artifact: r.artifact as OCCProof["artifact"],
      commit: r.commit as OCCProof["commit"],
      signer: r.signer as OCCProof["signer"],
      environment: r.environment as OCCProof["environment"],
      timestamps: r.timestamps as OCCProof["timestamps"],
      agency: r.agency as OCCProof["agency"],
      attribution: r.attribution as OCCProof["attribution"],
      slotAllocation: r.slotAllocation as OCCProof["slotAllocation"],
      metadata: r.metadata as OCCProof["metadata"],
      claims: r.claims as OCCProof["claims"],
      ...r, // any extra/unknown fields go at the end
    };

    // Promote legacy tsa from metadata
    const meta = r.metadata as Record<string, unknown> | undefined;
    if (!proof.timestamps && meta?.tsa) {
      proof.timestamps = { artifact: meta.tsa as TsaToken };
    }

    return proof;
  });

  // Auto-index all proofs in explorer
  try {
    await fetch(`${typeof window !== "undefined" ? "" : "https://www.occ.wtf"}/api/proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proofs: results }),
    });
  } catch { /* non-critical */ }

  return results;
}

export async function getEnclaveInfo(): Promise<{
  publicKeyB64: string;
  measurement: string;
  enforcement: string;
}> {
  const resp = await fetch(`${OCC_ENDPOINT}/key`);
  if (!resp.ok) throw new Error("Failed to fetch enclave info");
  return resp.json();
}

/**
 * Request a fresh challenge nonce from the enclave for agency signing.
 * The challenge must be signed by the device (P-256) and included in the
 * commit request's agency envelope.
 */
export async function requestChallenge(): Promise<string> {
  const resp = await fetch(`${OCC_ENDPOINT}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Challenge request failed: ${resp.status}`);
  }

  const result = await resp.json();
  return result.challenge;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// B&W Demo - TEE-proven grayscale conversion
// ---------------------------------------------------------------------------

export interface BWConversionResult {
  imageB64: string;
  proof: OCCProof;
  digestB64: string;
}

/**
 * Send a base64-encoded image to the enclave for grayscale conversion.
 * The enclave converts to B&W, hashes the output, and returns a proof.
 */
export async function convertToBW(imageB64: string): Promise<BWConversionResult> {
  const resp = await fetch(`${OCC_ENDPOINT}/convert-bw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageB64 }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Enclave returned ${resp.status}`);
  }

  const result = await resp.json();

  const proof: OCCProof = {
    version: "occ/1",
    artifact: result.proof.artifact,
    commit: result.proof.commit,
    signer: result.proof.signer,
    environment: result.proof.environment,
    timestamps: result.proof.timestamps,
    slotAllocation: result.proof.slotAllocation,
    metadata: result.proof.metadata,
    claims: result.proof.claims,
  };

  return {
    imageB64: result.imageB64,
    proof,
    digestB64: result.digestB64,
  };
}

/**
 * Resize an image to max `maxEdge` pixels on its longest edge.
 * Returns a base64-encoded JPEG string (without the data URI prefix).
 */
export function resizeImageToBase64(
  file: File,
  maxEdge: number = 512
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxEdge || height > maxEdge) {
        const scale = maxEdge / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas 2D context not available")); return; }

      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const b64 = dataUrl.split(",")[1];
      if (!b64) { reject(new Error("Failed to encode image")); return; }
      resolve(b64);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

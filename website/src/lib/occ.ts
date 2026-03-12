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
    purpose: "occ/commit-authorize/v1";
    actorKeyId: string;
    artifactHash: string;
    challenge: string;
    timestamp: number;
    signatureB64: string;
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

  // Normalize to occ/1 canonical field order
  const proof: OCCProof = {
    version: "occ/1",
    artifact: raw.artifact,
    commit: raw.commit,
    signer: raw.signer,
    environment: raw.environment,
    timestamps: raw.timestamps,
    agency: raw.agency,
    attribution: raw.attribution,
    metadata: raw.metadata,
    claims: raw.claims,
  };

  // Promote legacy tsa from metadata
  if (!proof.timestamps && raw.metadata?.tsa) {
    proof.timestamps = { artifact: raw.metadata.tsa };
  }

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

  return rawProofs.map((r: Record<string, unknown>) => {
    const proof: OCCProof = {
      version: "occ/1",
      artifact: r.artifact as OCCProof["artifact"],
      commit: r.commit as OCCProof["commit"],
      signer: r.signer as OCCProof["signer"],
      environment: r.environment as OCCProof["environment"],
      timestamps: r.timestamps as OCCProof["timestamps"],
      agency: r.agency as OCCProof["agency"],
      attribution: r.attribution as OCCProof["attribution"],
      metadata: r.metadata as OCCProof["metadata"],
      claims: r.claims as OCCProof["claims"],
    };

    // Promote legacy tsa from metadata
    const meta = r.metadata as Record<string, unknown> | undefined;
    if (!proof.timestamps && meta?.tsa) {
      proof.timestamps = { artifact: meta.tsa as TsaToken };
    }

    return proof;
  });
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
// B&W Demo — TEE-proven grayscale conversion
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

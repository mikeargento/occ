export const OCC_ENDPOINT = "https://nitro.occproof.com";

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
  metadata?: Record<string, unknown>
): Promise<OCCProof> {
  const resp = await fetch(`${OCC_ENDPOINT}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      digests: [{ digestB64, hashAlg: "sha256" }],
      metadata,
    }),
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
    metadata: raw.metadata,
    claims: raw.claims,
  };

  // Promote legacy tsa from metadata
  if (!proof.timestamps && raw.metadata?.tsa) {
    proof.timestamps = { artifact: raw.metadata.tsa };
  }

  return proof;
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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

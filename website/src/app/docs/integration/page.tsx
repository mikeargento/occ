import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Integration Guide",
  description: "How to commit artifacts, verify proofs, and integrate OCC into your application.",
};

export default function IntegrationPage() {
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight mb-4">Integration Guide</h1>
      <p className="text-text-secondary mb-8">
        How to commit artifacts, verify proofs, and integrate OCC into your application.
      </p>

      <h2 className="text-xl font-semibold mt-12 mb-4">Quick start: commit via API</h2>
      <p className="text-text-secondary mb-4">
        Hash your artifact locally, then send only the digest to the OCC endpoint:
      </p>
      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4 overflow-x-auto mb-8">
        <pre className="text-xs font-mono leading-relaxed text-text-secondary">{`# 1. Hash your file
DIGEST=$(openssl dgst -sha256 -binary myfile.pdf | base64)

# 2. Send to OCC endpoint
curl -X POST https://nitro.occproof.com/commit \\
  -H "Content-Type: application/json" \\
  -d '{
    "digests": [{
      "digestB64": "'$DIGEST'",
      "hashAlg": "sha256"
    }],
    "metadata": {
      "source": "my-app"
    }
  }'`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">TypeScript / JavaScript</h2>
      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4 overflow-x-auto mb-8">
        <pre className="text-xs font-mono leading-relaxed text-text-secondary">{`// Hash locally
const bytes = new Uint8Array(await file.arrayBuffer());
const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
const digestB64 = btoa(String.fromCharCode(...new Uint8Array(hashBuf)));

// Commit to enclave (with optional attribution)
const resp = await fetch("https://nitro.occproof.com/commit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    digests: [{ digestB64, hashAlg: "sha256" }],
    attribution: { name: "Jane Doe", title: "Project Photo" },
    metadata: { source: "my-app", fileName: file.name },
  }),
});

const [proof] = await resp.json();
// proof is a complete OCCProof JSON object
console.log(proof.commit.counter);
console.log(proof.slotAllocation);   // causal slot record
console.log(proof.attribution);      // signed creator metadata`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Batch commit</h2>
      <p className="text-text-secondary mb-4">
        Send multiple digests in one request. The enclave allocates a slot and commits each digest sequentially. If using actor-bound proofs (passkey), all proofs in the batch receive actor identity.
      </p>
      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4 overflow-x-auto mb-8">
        <pre className="text-xs font-mono leading-relaxed text-text-secondary">{`const resp = await fetch("https://nitro.occproof.com/commit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    digests: [
      { digestB64: digest1, hashAlg: "sha256" },
      { digestB64: digest2, hashAlg: "sha256" },
      { digestB64: digest3, hashAlg: "sha256" },
    ],
    attribution: { name: "Jane Doe" },
    metadata: { source: "my-app", batchId: "abc123" },
  }),
});

const proofs = await resp.json();
// proofs[0], proofs[1], proofs[2] — one per digest`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Verify a proof</h2>
      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4 overflow-x-auto mb-8">
        <pre className="text-xs font-mono leading-relaxed text-text-secondary">{`import { verify } from "occproof";

const result = await verify({
  proof: myProof,
  bytes: originalFileBytes,
  trustAnchors: {
    requireEnforcement: "measured-tee",
    allowedMeasurements: ["ac813febd1ac4261..."],
    requireAttestation: true,
    requireAttestationFormat: ["aws-nitro"],
  },
});

if (result.valid) {
  console.log("Proof verified successfully");
} else {
  console.error("Verification failed:", result.reason);
}`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Enclave info</h2>
      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4 overflow-x-auto mb-8">
        <pre className="text-xs font-mono leading-relaxed text-text-secondary">{`# Get enclave public key and measurement
curl https://nitro.occproof.com/key

# Response:
# {
#   "publicKeyB64": "...",
#   "measurement": "ac813febd1ac4261...",
#   "enforcement": "measured-tee"
# }`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Important notes</h2>
      <ul className="space-y-2 text-sm text-text-secondary">
        <li>• <strong className="text-text">Files are never uploaded.</strong> Only the SHA-256 digest crosses the network.</li>
        <li>• <strong className="text-text">The proof is portable.</strong> Store it alongside the artifact or in a separate system.</li>
        <li>• <strong className="text-text">Verification is offline.</strong> No API calls needed to verify. Just the public key and original bytes.</li>
        <li>• <strong className="text-text">Pin measurements.</strong> For production, always pin allowedMeasurements and require attestation.</li>
        <li>• <strong className="text-text">Track counters.</strong> Store the last accepted counter value to prevent replay.</li>
        <li>• <strong className="text-text">Causal slots.</strong> Every proof includes a pre-allocated slot that proves the enclave committed to a counter position before seeing the artifact hash.</li>
        <li>• <strong className="text-text">Attribution is signed.</strong> Name, title, and message in the attribution field are covered by the Ed25519 signature and cannot be tampered with.</li>
      </ul>
    </article>
  );
}

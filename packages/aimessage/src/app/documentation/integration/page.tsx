export default function IntegrationPage() {
  return (
    <div style={page}>
      <a href="/documentation" style={backLink}>&larr; Back</a>

      <h1 style={h1}>Integration Guide</h1>
      <p style={leadText}>
        How to commit artifacts, verify proofs, and integrate OCC into your application.
      </p>

      <h2 style={h2}>Quick start: commit via API</h2>
      <p style={body}>
        Hash your artifact locally, then send only the digest to the OCC endpoint:
      </p>
      <div style={codeBlock}>
        <div style={codeHeader}><span>Shell</span></div>
        <pre style={pre}>{`# 1. Hash your file
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

      <h2 style={h2}>TypeScript / JavaScript</h2>
      <div style={codeBlock}>
        <div style={codeHeader}><span>TypeScript</span></div>
        <pre style={pre}>{`// Hash locally
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

      <h2 style={h2}>Batch commit</h2>
      <p style={body}>
        Send multiple digests in one request. The enclave allocates a slot and commits each digest sequentially. If using actor-bound proofs (passkey), all proofs in the batch receive actor identity.
      </p>
      <div style={codeBlock}>
        <div style={codeHeader}><span>TypeScript</span></div>
        <pre style={pre}>{`const resp = await fetch("https://nitro.occproof.com/commit", {
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
// proofs[0], proofs[1], proofs[2] - one per digest`}</pre>
      </div>

      <h2 style={h2}>Verify a proof</h2>
      <div style={codeBlock}>
        <div style={codeHeader}><span>TypeScript</span></div>
        <pre style={pre}>{`import { verify } from "occproof";

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

      <h2 style={h2}>Enclave info</h2>
      <div style={codeBlock}>
        <div style={codeHeader}><span>Shell</span></div>
        <pre style={pre}>{`# Get enclave public key and measurement
curl https://nitro.occproof.com/key

# Response:
# {
#   "publicKeyB64": "...",
#   "measurement": "ac813febd1ac4261...",
#   "enforcement": "measured-tee"
# }`}</pre>
      </div>

      <h2 style={h2}>Important notes</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        <p style={body}><strong style={{ color: "#000" }}>Files are never uploaded.</strong> Only the SHA-256 digest crosses the network.</p>
        <p style={body}><strong style={{ color: "#000" }}>The proof is portable.</strong> Store it alongside the artifact or in a separate system.</p>
        <p style={body}><strong style={{ color: "#000" }}>Verification is offline.</strong> No API calls needed to verify. Just the public key and original bytes.</p>
        <p style={body}><strong style={{ color: "#000" }}>Pin measurements.</strong> For production, always pin allowedMeasurements and require attestation.</p>
        <p style={body}><strong style={{ color: "#000" }}>Track counters.</strong> Store the last accepted counter value to prevent replay.</p>
        <p style={body}><strong style={{ color: "#000" }}>Causal slots.</strong> Every proof includes a pre-allocated slot that proves the enclave committed to a counter position before seeing the artifact hash.</p>
        <p style={body}><strong style={{ color: "#000" }}>Attribution is signed.</strong> Name, title, and message in the attribution field are covered by the Ed25519 signature and cannot be tampered with.</p>
      </div>

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <div style={{ borderTop: "1px solid #e5e5ea", marginTop: 48, paddingTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: "#000", margin: 0 }}>OCC (Origin Controlled Computing)</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <a href="/documentation/what-is-occ" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>What is OCC</a>
        <a href="/documentation/whitepaper" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Whitepaper</a>
        <a href="/documentation/trust-model" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Trust Model</a>
        <a href="/documentation/proof-format" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Proof Format</a>
        <a href="/documentation/integration" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Integration Guide</a>
        <a href="https://occ.wtf" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>occ.wtf</a>
        <a href="https://github.com/mikeargento/occ" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>GitHub</a>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
  background: "#fff",
  color: "#000",
  padding: "48px 24px",
  maxWidth: 640,
  margin: "0 auto",
  lineHeight: 1.6,
};

const backLink: React.CSSProperties = { fontSize: 14, color: "#007aff", textDecoration: "none" };
const h1: React.CSSProperties = { fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", margin: "32px 0 24px" };
const h2: React.CSSProperties = { fontSize: 20, fontWeight: 600, margin: "48px 0 16px" };
const leadText: React.CSSProperties = { fontSize: 16, color: "#636366", lineHeight: 1.7, marginBottom: 40 };
const body: React.CSSProperties = { fontSize: 14, color: "#636366", lineHeight: 1.7, margin: "0 0 16px" };

const codeBlock: React.CSSProperties = {
  marginBottom: 32,
  border: "1px solid #e5e5ea",
  overflow: "hidden",
};

const codeHeader: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 12,
  color: "#636366",
  background: "#f2f2f7",
  borderBottom: "1px solid #e5e5ea",
  fontFamily: "ui-monospace, 'SF Mono', monospace",
};

const pre: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  color: "#636366",
  overflow: "auto",
  margin: 0,
  lineHeight: 1.6,
  whiteSpace: "pre",
  background: "#fff",
};

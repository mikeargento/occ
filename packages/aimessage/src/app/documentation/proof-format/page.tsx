export default function ProofFormatPage() {
  return (
    <div style={page}>
      <a href="/documentation" style={backLink}>&larr; Back</a>

      <h1 style={h1}>Proof Format: occ/1</h1>
      <p style={leadText}>
        Normative specification for the <code style={code}>occ/1</code> proof format. Derived from the reference implementation.
      </p>

      <h2 style={h2}>Proof JSON schema</h2>
      <div style={codeBlock}>
        <div style={codeHeader}><span>proof.json</span></div>
        <pre style={pre}>{`{
  "version": "occ/1",                // REQUIRED - exact value
  "artifact": {
    "hashAlg": "sha256",             // REQUIRED - "sha256" only in v1
    "digestB64": "<base64>"          // REQUIRED - SHA-256, 32 decoded bytes
  },
  "commit": {
    "nonceB64": "<base64>",          // REQUIRED - >=16 decoded bytes
    "counter":  "42",                // OPTIONAL - decimal string, monotonic
    "slotCounter": "41",             // OPTIONAL - slot's counter (< commit counter)
    "slotHashB64": "<base64>",       // OPTIONAL - SHA-256 of canonical slot body
    "time":     1700000000000,       // OPTIONAL - Unix ms
    "prevB64":  "<base64>",          // OPTIONAL - chain link, 32 bytes
    "epochId":  "<hex>"              // OPTIONAL - SHA-256 hex
  },
  "signer": {
    "publicKeyB64":  "<base64>",     // REQUIRED - Ed25519, 32 bytes
    "signatureB64":  "<base64>"      // REQUIRED - Ed25519, 64 bytes
  },
  "environment": {
    "enforcement": "measured-tee",   // REQUIRED - "stub"|"hw-key"|"measured-tee"
    "measurement": "<opaque>",       // REQUIRED - non-empty string
    "attestation": {                 // OPTIONAL
      "format":    "aws-nitro",      // REQUIRED when parent present
      "reportB64": "<base64>"        // REQUIRED when parent present
    }
  },
  "slotAllocation": {                // OPTIONAL - causal slot record
    "version":      "occ/slot/1",
    "nonceB64":     "<base64>",      // same as commit.nonceB64
    "counter":      "41",            // same as commit.slotCounter
    "time":         1700000000000,
    "epochId":      "<hex>",
    "publicKeyB64": "<base64>",      // enclave Ed25519 key
    "signatureB64": "<base64>"       // Ed25519 over canonical slot body
  },
  "agency": {                         // OPTIONAL - actor-bound proof
    "actor": { keyId, publicKeyB64, algorithm, provider },
    "authorization": { purpose, actorKeyId, artifactHash, challenge, timestamp, signatureB64 },
    "batchContext": {                 // OPTIONAL - present on batch proofs
      "batchSize": 8,
      "batchIndex": 0,
      "batchDigests": ["<base64>", ...]
    }
  },
  "attribution": {                   // OPTIONAL - signed creator metadata
    "name":    "string",
    "title":   "string",
    "message": "string"
  },
  "timestamps": {                    // OPTIONAL - external timestamps
    "artifact": { TsaToken },
    "proof":    { TsaToken }
  },
  "metadata": { },                   // OPTIONAL - NOT signed, advisory
  "claims": { }                      // OPTIONAL - NOT signed, advisory
}`}</pre>
      </div>

      <h2 style={h2}>Signed body</h2>
      <p style={body}>
        The Ed25519 signature covers the canonical serialization of a <code style={code}>SignedBody</code> object:
      </p>
      <div style={codeBlock}>
        <div style={codeHeader}><span>SignedBody</span></div>
        <pre style={pre}>{`{
  version:           proof.version,
  artifact:          proof.artifact,
  actor:             proof.agency?.actor,        // when present
  attribution:       proof.attribution,          // when present
  commit:            proof.commit,               // ALL fields verbatim
  publicKeyB64:      proof.signer.publicKeyB64,
  enforcement:       proof.environment.enforcement,
  measurement:       proof.environment.measurement,
  attestationFormat: proof.environment.attestation?.format  // when present
}`}</pre>
      </div>

      <h3 style={h3}>What is NOT signed</h3>
      <div style={{ overflowX: "auto", marginBottom: 32 }}>
        <table style={table}>
          <thead>
            <tr style={borderRow}>
              <th style={th}>Field</th>
              <th style={{ ...th, paddingRight: 0 }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            <tr style={borderRow}>
              <td style={td}><code style={code}>signatureB64</code></td>
              <td style={{ ...td, paddingRight: 0 }}>The seal &mdash; cannot sign itself</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}><code style={code}>attestation.reportB64</code></td>
              <td style={{ ...td, paddingRight: 0 }}>Vendor-signed, self-authenticating separately</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}><code style={code}>slotAllocation</code></td>
              <td style={{ ...td, paddingRight: 0 }}>Self-authenticating (own Ed25519 signature); bound via commit.slotHashB64</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}><code style={code}>agency</code></td>
              <td style={{ ...td, paddingRight: 0 }}>P-256 signature independently verifiable; actor identity IS in signed body</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}><code style={code}>timestamps</code></td>
              <td style={{ ...td, paddingRight: 0 }}>Added post-signature by external TSA</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}><code style={code}>metadata</code></td>
              <td style={{ ...td, paddingRight: 0 }}>Advisory, not trusted</td>
            </tr>
            <tr>
              <td style={td}><code style={code}>claims</code></td>
              <td style={{ ...td, paddingRight: 0 }}>Advisory, not trusted</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 style={h2}>Causal slot allocation</h2>
      <p style={body}>
        Every proof is causally bound to a pre-allocated slot. The slot is created <em>before</em> the artifact hash is known, proving the enclave committed to a nonce and counter independently of the artifact content.
      </p>
      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <table style={table}>
          <thead>
            <tr style={borderRow}>
              <th style={th}>Binding</th>
              <th style={{ ...th, paddingRight: 0 }}>How</th>
            </tr>
          </thead>
          <tbody>
            <tr style={borderRow}>
              <td style={td}>Nonce binding</td>
              <td style={{ ...td, paddingRight: 0 }}><code style={code}>commit.nonceB64 === slotAllocation.nonceB64</code></td>
            </tr>
            <tr style={borderRow}>
              <td style={td}>Counter ordering</td>
              <td style={{ ...td, paddingRight: 0 }}><code style={code}>commit.slotCounter &lt; commit.counter</code></td>
            </tr>
            <tr style={borderRow}>
              <td style={td}>Hash binding</td>
              <td style={{ ...td, paddingRight: 0 }}><code style={code}>commit.slotHashB64 === SHA-256(canonicalize(slotBody))</code></td>
            </tr>
            <tr>
              <td style={td}>Same enclave</td>
              <td style={{ ...td, paddingRight: 0 }}><code style={code}>slotAllocation.publicKeyB64 === signer.publicKeyB64</code></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 13, color: "#636366", marginBottom: 32 }}>
        The slot has its own Ed25519 signature proving the enclave created it. The commit signature includes <code style={code}>slotHashB64</code>, cryptographically binding the proof to that exact slot.
      </p>

      <h2 style={h2}>Canonical serialization</h2>
      <p style={body}>
        The signed body is serialized to bytes using a deterministic algorithm:
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24, paddingLeft: 16, fontSize: 14, color: "#636366", lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>1. Recursively sort all object keys in Unicode code-point order</p>
        <p style={{ margin: 0 }}>2. Serialize with <code style={code}>JSON.stringify()</code> &mdash; no whitespace</p>
        <p style={{ margin: 0 }}>3. Encode the resulting string as UTF-8 (no BOM)</p>
      </div>
      <p style={body}>Top-level key order after sort:</p>
      <div style={codeBlock}>
        <pre style={pre}>
          actor? &rarr; artifact &rarr; attestationFormat? &rarr; attribution? &rarr; commit &rarr; enforcement &rarr; measurement &rarr; publicKeyB64 &rarr; version
        </pre>
      </div>

      <h2 style={h2}>Field classification</h2>
      <h3 style={h3}>Signed (security-critical)</h3>
      <p style={{ fontSize: 14, color: "#636366", marginBottom: 8 }}>
        These fields are in the SignedBody. Tampering invalidates the signature:
      </p>
      <p style={{ fontSize: 14, color: "#636366", marginBottom: 24 }}>
        <code style={code}>version</code>, <code style={code}>artifact.*</code>, <code style={code}>agency.actor</code> (when present), <code style={code}>attribution.*</code> (when present), <code style={code}>commit.*</code>, <code style={code}>signer.publicKeyB64</code>, <code style={code}>environment.enforcement</code>, <code style={code}>environment.measurement</code>, <code style={code}>attestation.format</code>
      </p>

      <h3 style={h3}>Self-authenticating</h3>
      <p style={{ fontSize: 14, color: "#636366", marginBottom: 8 }}>
        Not in the signed body, but independently verifiable:
      </p>
      <p style={{ fontSize: 14, color: "#636366", marginBottom: 24 }}>
        <code style={code}>signatureB64</code> (Ed25519), <code style={code}>attestation.reportB64</code> (vendor-signed), <code style={code}>slotAllocation</code> (own Ed25519 signature), <code style={code}>agency.authorization</code> (P-256)
      </p>

      <h3 style={h3}>Advisory (unsigned)</h3>
      <p style={{ fontSize: 14, color: "#636366", marginBottom: 24 }}>
        Not signed. Must not be used for security decisions: <code style={code}>timestamps</code>, <code style={code}>metadata</code>, <code style={code}>claims</code>.
      </p>

      <h2 style={h2}>Algorithms</h2>
      <div style={{ overflowX: "auto", marginBottom: 32 }}>
        <table style={table}>
          <thead>
            <tr style={borderRow}>
              <th style={th}>Purpose</th>
              <th style={th}>Algorithm</th>
              <th style={{ ...th, paddingRight: 0 }}>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr style={borderRow}>
              <td style={td}>Proof signature</td>
              <td style={td}>Ed25519 (RFC 8032)</td>
              <td style={{ ...td, paddingRight: 0 }}>32-byte key, 64-byte signature</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}>Agency signature</td>
              <td style={td}>ECDSA P-256 / ES256</td>
              <td style={{ ...td, paddingRight: 0 }}>WebAuthn or direct; device-bound key</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}>Hash</td>
              <td style={td}>SHA-256 (FIPS 180-4)</td>
              <td style={{ ...td, paddingRight: 0 }}>32 bytes, Base64 encoded</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}>Encoding</td>
              <td style={td}>Base64 (RFC 4648 &sect;4)</td>
              <td style={{ ...td, paddingRight: 0 }}>Standard, with = padding</td>
            </tr>
            <tr>
              <td style={td}>Counter</td>
              <td style={td}>Decimal string</td>
              <td style={{ ...td, paddingRight: 0 }}>BigInt-safe, no leading zeros</td>
            </tr>
          </tbody>
        </table>
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
const h3: React.CSSProperties = { fontSize: 17, fontWeight: 600, margin: "32px 0 12px" };
const leadText: React.CSSProperties = { fontSize: 16, color: "#636366", lineHeight: 1.7, marginBottom: 40 };
const body: React.CSSProperties = { fontSize: 14, color: "#636366", lineHeight: 1.7, margin: "0 0 16px" };

const code: React.CSSProperties = {
  fontSize: 12,
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  background: "#f2f2f7",
  padding: "2px 6px",
};

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

const table: React.CSSProperties = { width: "100%", fontSize: 14, borderCollapse: "collapse" };
const borderRow: React.CSSProperties = { borderBottom: "1px solid #e5e5ea" };

const th: React.CSSProperties = {
  textAlign: "left" as const,
  padding: "8px 16px 8px 0",
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  color: "#636366",
};

const td: React.CSSProperties = {
  padding: "8px 16px 8px 0",
  fontSize: 14,
  color: "#636366",
};

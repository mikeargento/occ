export default function WhatIsOCCPage() {
  return (
    <div style={page}>
      <a href="/documentation" style={backLink}>&larr; Back</a>

      <h1 style={h1}>WTF is OCC</h1>

      <p style={leadText}>
        OCC (Origin Controlled Computing) is a protocol that produces portable
        cryptographic proof when bytes are committed through an authorized
        execution boundary. The proof attests that a specific digital state was
        demonstrably possessed and committed in a specific form, by a specific
        boundary, no later than a specific moment.
      </p>

      <h2 style={h2}>The core idea</h2>
      <p style={bodyText}>
        Most systems produce artifacts first and try to prove things about
        them later, attaching signatures, metadata, timestamps, or ledger
        entries after the fact.
      </p>
      <p style={bodyText}>
        OCC inverts this. Valid proof can only exist if the artifact was
        committed through a protected path. The proof is not added to the
        artifact. It is caused by the act of committing through the
        authorized boundary.
      </p>

      <div style={blockquote}>
        <p style={{ fontSize: 14, color: "#000", fontStyle: "italic", margin: 0 }}>
          If proof exists, the authorized commit path was traversed.
        </p>
      </div>

      <h2 style={h2}>How it works</h2>
      <p style={bodyText}>
        Authorization, cryptographic binding, and commit happen as one
        indivisible operation:
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        <p style={bodyText}>
          <strong style={{ color: "#000" }}>1. Allocate</strong> &mdash; The enclave pre-allocates a
          causal slot (nonce + counter) before the artifact hash is known,
          proving the commitment position was reserved independently.
        </p>
        <p style={bodyText}>
          <strong style={{ color: "#000" }}>2. Bind</strong> &mdash; The artifact&apos;s SHA-256 digest is
          bound to the pre-allocated slot, combined with the monotonic counter,
          and signed with Ed25519 inside the TEE.
        </p>
        <p style={bodyText}>
          <strong style={{ color: "#000" }}>3. Commit</strong> &mdash; The artifact and its proof are
          produced together. Fail-closed: if any step fails, nothing is
          produced. The proof includes the signed slot record as causal evidence.
        </p>
      </div>

      <h2 style={h2}>What you get</h2>
      <p style={bodyText}>
        An OCC proof is a JSON object (schema version <code style={code}>occ/1</code>) containing:
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        <p style={bodyText}><strong style={{ color: "#000" }}>artifact</strong> &mdash; SHA-256 digest of the committed bytes</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>commit</strong> &mdash; fresh nonce, monotonic counter, slot binding (slotCounter, slotHashB64), epoch identity, optional chain link</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>signer</strong> &mdash; Ed25519 public key and signature over the canonical signed body</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>environment</strong> &mdash; enforcement tier, platform measurement (PCR0), hardware attestation</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>slotAllocation</strong> &mdash; the pre-allocated causal slot record, independently signed by the enclave</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>agency</strong> &mdash; optional actor-bound proof via device biometrics (passkey/WebAuthn), with batch support</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>attribution</strong> &mdash; optional signed creator metadata (name, title, message)</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>timestamps</strong> &mdash; optional RFC 3161 TSA timestamps from an independent time authority</p>
      </div>

      <h2 style={h2}>Key properties</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        <p style={bodyText}><strong style={{ color: "#000" }}>Portable</strong> &mdash; a self-contained JSON object. Any verifier can check it offline with only the public key and the original bytes.</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>Atomic</strong> &mdash; fail-closed. Either a complete, valid proof is produced, or nothing is.</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>Causal</strong> &mdash; every proof is bound to a pre-allocated slot created before the artifact hash was known.</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>Ordered</strong> &mdash; monotonic counter within its epoch. Counter + epoch + chain link establish sequencing.</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>Measured</strong> &mdash; binds to a specific execution environment via measurement (PCR0 on Nitro, MRENCLAVE on SGX).</p>
        <p style={bodyText}><strong style={{ color: "#000" }}>Verifiable</strong> &mdash; Ed25519 signature, SHA-256 digest, canonical serialization. Standard cryptographic primitives.</p>
      </div>

      <h2 style={h2}>Enforcement tiers</h2>
      <div style={{ overflowX: "auto", marginBottom: 32 }}>
        <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e5ea" }}>
              <th style={th}>Tier</th>
              <th style={th}>Key Location</th>
              <th style={th}>Boundary</th>
              <th style={{ ...th, paddingRight: 0 }}>Use Case</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #e5e5ea" }}>
              <td style={td}><code style={code}>stub</code></td>
              <td style={td}>Process memory</td>
              <td style={td}>Software</td>
              <td style={{ ...td, paddingRight: 0 }}>Development, testing</td>
            </tr>
            <tr style={{ borderBottom: "1px solid #e5e5ea" }}>
              <td style={td}><code style={code}>hw-key</code></td>
              <td style={td}>HSM / Secure Enclave</td>
              <td style={td}>Software</td>
              <td style={{ ...td, paddingRight: 0 }}>Key custody</td>
            </tr>
            <tr>
              <td style={td}><code style={code}>measured-tee</code></td>
              <td style={td}>TEE memory</td>
              <td style={td}>Hardware enclave</td>
              <td style={{ ...td, paddingRight: 0 }}>Production, highest assurance</td>
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

const leadText: React.CSSProperties = { fontSize: 16, color: "#636366", lineHeight: 1.7, marginBottom: 40 };

const bodyText: React.CSSProperties = { fontSize: 15, color: "#636366", lineHeight: 1.7, margin: "0 0 16px" };

const blockquote: React.CSSProperties = {
  borderLeft: "2px solid #636366",
  paddingLeft: 24,
  margin: "32px 0",
};

const code: React.CSSProperties = {
  fontSize: 12,
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  background: "#f2f2f7",
  padding: "2px 6px",
};

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

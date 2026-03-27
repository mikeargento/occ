export default function TrustModelPage() {
  return (
    <div style={page}>
      <a href="/documentation" style={backLink}>&larr; Back</a>

      <h1 style={h1}>Trust Model</h1>

      <div style={blockquote}>
        <p style={{ fontSize: 14, color: "#000", fontStyle: "italic", lineHeight: 1.7, margin: 0 }}>
          OCC guarantees single-successor semantics within the verifier-accepted
          measurement and monotonicity domain of the enforcing boundary.
        </p>
      </div>

      <h2 style={h2}>Assumptions</h2>
      <div style={{ overflowX: "auto", marginBottom: 32 }}>
        <table style={table}>
          <thead>
            <tr style={borderRow}>
              <th style={th}>Assumption</th>
              <th style={{ ...th, paddingRight: 0 }}>If it fails</th>
            </tr>
          </thead>
          <tbody>
            <tr style={borderRow}>
              <td style={td}>Boundary isolation &mdash; TEE prevents external key access</td>
              <td style={{ ...td, paddingRight: 0 }}>All guarantees collapse</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}>Key secrecy &mdash; Ed25519 private key never leaves boundary</td>
              <td style={{ ...td, paddingRight: 0 }}>Proof forgery becomes possible</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}>Nonce freshness &mdash; &ge;128 bits, never reused</td>
              <td style={{ ...td, paddingRight: 0 }}>Replay within a session</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}>Honest measurement &mdash; hardware correctly measures enclave</td>
              <td style={{ ...td, paddingRight: 0 }}>Delegated to TEE vendor</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}>Monotonic counter durability &mdash; survives restarts</td>
              <td style={{ ...td, paddingRight: 0 }}>Anti-rollback degrades to single session</td>
            </tr>
            <tr style={borderRow}>
              <td style={td}>Causal slot integrity &mdash; slot allocated before artifact hash known</td>
              <td style={{ ...td, paddingRight: 0 }}>Without pre-allocation, commit order could be forged</td>
            </tr>
            <tr>
              <td style={td}>Strict verifier policy &mdash; caller pins measurements + counters</td>
              <td style={{ ...td, paddingRight: 0 }}>Weak policy accepts more than intended</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 style={h2}>Threat model</h2>
      <h3 style={h3}>In-scope threats</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
        {[
          { threat: "Proof replay", mitigation: "minCounter in policy rejects old proofs" },
          { threat: "Measurement substitution", mitigation: "allowedMeasurements pins exact values" },
          { threat: "Signature forgery", mitigation: "Ed25519 unforgeability" },
          { threat: "Downgrade attack", mitigation: "Enforcement tier is signed; requireEnforcement rejects weaker tiers" },
          { threat: "Chain gap insertion", mitigation: "prevB64 chaining: any removed link breaks hash continuity" },
          { threat: "Counter position forgery", mitigation: "Causal slot pre-allocation: slotHashB64 binding + slotCounter < counter ordering proves pre-allocation" },
          { threat: "Agency replay across batches", mitigation: "Single-use challenge consumed on first validation; batch context scoped to declared digests" },
        ].map((t) => (
          <div key={t.threat} style={{ display: "flex", gap: 16, borderLeft: "2px solid #636366", paddingLeft: 16, padding: "4px 0 4px 16px" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#000", flexShrink: 0, width: 176 }}>{t.threat}</div>
            <div style={{ fontSize: 14, color: "#636366" }}>{t.mitigation}</div>
          </div>
        ))}
      </div>

      <h3 style={h3}>Out-of-scope threats</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
        <p style={body}>Signing key exfiltration &mdash; assumes boundary is secure</p>
        <p style={body}>TEE firmware vulnerability &mdash; delegated to hardware vendor</p>
        <p style={body}>Weak verifier policy &mdash; caller responsibility</p>
        <p style={body}>Physical access to enclave host &mdash; outside threat model</p>
      </div>

      <h2 style={h2}>Non-goals</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
        <p style={body}><strong style={{ color: "#000" }}>Global ordering</strong> &mdash; no total ordering across independent boundaries</p>
        <p style={body}><strong style={{ color: "#000" }}>Cross-boundary double-spend</strong> &mdash; same artifact can be submitted to separate boundaries</p>
        <p style={body}><strong style={{ color: "#000" }}>Copy prevention</strong> &mdash; OCC does not prevent raw byte copying</p>
        <p style={body}><strong style={{ color: "#000" }}>Consensus replacement</strong> &mdash; OCC constrains a single boundary, not distributed parties</p>
        <p style={body}><strong style={{ color: "#000" }}>Metadata integrity</strong> &mdash; the metadata field is advisory and unsigned</p>
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
const h3: React.CSSProperties = { fontSize: 16, fontWeight: 600, margin: "24px 0 12px" };
const body: React.CSSProperties = { fontSize: 14, color: "#636366", lineHeight: 1.7, margin: 0 };

const blockquote: React.CSSProperties = {
  borderLeft: "2px solid #636366",
  paddingLeft: 24,
  marginBottom: 32,
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

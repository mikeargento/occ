import Link from "next/link";

export default function Home() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "80px 24px 64px" }}>
      {/* Hero */}
      <div style={{ marginBottom: 80 }}>
        <h1 style={{
          fontSize: "clamp(36px, 6vw, 56px)", fontWeight: 700,
          letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16,
        }}>
          Define what your AI does.
        </h1>
        <p style={{
          fontSize: 18, lineHeight: 1.6, color: "var(--c-text-secondary)",
          maxWidth: 560, marginBottom: 32,
        }}>
          Origin Controlled Computing. AI actions are only executable if authorized by a previously committed, cryptographically bound policy.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="https://agent.occ.wtf" style={{
            display: "inline-flex", alignItems: "center", height: 44, padding: "0 24px",
            borderRadius: 8, fontSize: 15, fontWeight: 600,
            background: "var(--c-text)", color: "var(--bg)",
            textDecoration: "none", transition: "opacity 0.15s",
          }}>
            Get started
          </a>
          <Link href="/docs" style={{
            display: "inline-flex", alignItems: "center", height: 44, padding: "0 24px",
            borderRadius: 8, fontSize: 15, fontWeight: 500,
            border: "1px solid var(--c-border)", color: "var(--c-text)",
            textDecoration: "none", transition: "all 0.15s",
          }}>
            Documentation
          </Link>
        </div>
      </div>

      {/* Three columns */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 24, marginBottom: 80,
      }}>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Default deny</h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
            Nothing executes unless explicitly authorized. No permission object means no execution path.
          </p>
        </div>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Proof = authorization</h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
            The proof that authorized the action and the record that it happened are the same cryptographic object.
          </p>
        </div>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Causal chain</h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
            Every proof links to the previous one. No gaps, no rewrites, no forks. Each action must fit the last.
          </p>
        </div>
      </div>

      {/* Quick setup */}
      <div style={{
        background: "var(--bg-elevated)", borderRadius: 12,
        border: "1px solid var(--c-border-subtle)", padding: 32, marginBottom: 48,
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Quick setup</h2>
        <pre style={{
          fontSize: 14, fontFamily: "var(--font-mono)",
          color: "var(--c-text-secondary)", lineHeight: 2,
          overflow: "auto",
        }}>{`curl -fsSL https://agent.occ.wtf/install | bash`}</pre>
        <p style={{ fontSize: 14, color: "var(--c-text-tertiary)", marginTop: 12 }}>
          Installs the OCC hook for Claude Code. Every action goes through OCC.
        </p>
      </div>
    </div>
  );
}

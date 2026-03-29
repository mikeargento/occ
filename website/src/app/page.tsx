import Link from "next/link";

export default function Home() {
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 24px 64px" }}>
      {/* Hero */}
      <div style={{ marginBottom: 80, textAlign: "center" }}>
        <h1 style={{
          fontSize: "clamp(36px, 6vw, 56px)", fontWeight: 700,
          letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16,
        }}>
          Define what your AI does.
        </h1>
        <p style={{
          fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.2, color: "var(--c-text-secondary)",
          fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 32,
        }}>
          Artificial Intelligence. Human Authority.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <a href="https://agent.occ.wtf" style={{
            display: "inline-flex", alignItems: "center", height: 44, padding: "0 24px",
            borderRadius: 8, fontSize: 15, fontWeight: 600,
            background: "var(--c-text)", color: "var(--bg)",
            textDecoration: "none",
          }}>
            Get started
          </a>
          <Link href="/docs" style={{
            display: "inline-flex", alignItems: "center", height: 44, padding: "0 24px",
            borderRadius: 8, fontSize: 15, fontWeight: 500,
            border: "1px solid var(--c-border)", color: "var(--c-text)",
            textDecoration: "none",
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
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>No action without you</h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
            AI can think freely. But nothing executes unless you authorize it. No approval, no execution path.
          </p>
        </div>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Approval becomes execution</h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
            Your authorization creates the cryptographic object that makes the action possible. The proof is the command.
          </p>
        </div>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Every action must follow the last</h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
            Each proof links to the previous one. No gaps, no rewrites, no forks. A causal chain of human decisions.
          </p>
        </div>
      </div>

      <div style={{ height: 48 }} />
    </div>
  );
}

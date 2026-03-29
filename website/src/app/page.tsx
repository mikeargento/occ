export default function Home() {
  return (
    <div
      style={{ maxWidth: 1120, margin: "0 auto", padding: "180px 24px 64px" }}
    >
      {/* Hero */}
      <div style={{ marginBottom: 100, textAlign: "center" }}>
        <h1
          style={{
            fontSize: "clamp(54px, 9vw, 84px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          Define what your AI does.
        </h1>
        <p
          style={{
            fontSize: "clamp(24px, 3.5vw, 36px)",
            lineHeight: 1.2,
            color: "var(--c-text-secondary)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginBottom: 48,
          }}
        >
          Artificial Intelligence. Human Authority.
        </p>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.5,
            color: "var(--c-text-tertiary)",
            marginBottom: 48,
          }}
        >
          AI proposes. You authorize. Nothing else runs.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <a
            href="https://agent.occ.wtf"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 52,
              padding: "0 40px",
              borderRadius: 8,
              fontSize: 17,
              fontWeight: 600,
              background: "var(--c-text)",
              color: "var(--bg)",
              textDecoration: "none",
            }}
          >
            Get started
          </a>
        </div>
      </div>

      <div style={{ height: 48 }} />
    </div>
  );
}

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

      {/* Three columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 48,
          marginBottom: 80,
          textAlign: "left",
        }}
      >
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
            Nothing runs without you
          </h3>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--c-text-secondary)",
            }}
          >
            AI thinks freely. Execution requires your command. No command, no action.
          </p>
        </div>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
            Your authorization creates the command
          </h3>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--c-text-secondary)",
            }}
          >
            When you say yes, a signed object is created inside a hardware enclave. That object is what makes execution possible.
          </p>
        </div>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
            Every command links to the last
          </h3>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--c-text-secondary)",
            }}
          >
            One authorization follows another. No gaps. No rewrites. A permanent chain of your decisions.
          </p>
        </div>
      </div>

      <div style={{ height: 48 }} />
    </div>
  );
}

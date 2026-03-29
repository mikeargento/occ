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
          No proof, no action. You hold the key.
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
            AI thinks. You decide. Without your authorization, no execution path exists.
          </p>
        </div>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
            Your yes forges the proof
          </h3>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--c-text-secondary)",
            }}
          >
            Authorization creates a cryptographic object inside a hardware enclave. That object — and nothing else — makes the action possible.
          </p>
        </div>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
            Every proof chains to the last
          </h3>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--c-text-secondary)",
            }}
          >
            One decision links to the next. No gaps. No rewrites. An unbroken record of human authority.
          </p>
        </div>
      </div>

      <div style={{ height: 48 }} />
    </div>
  );
}

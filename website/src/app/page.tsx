export default function Home() {
  return (
    <div style={{
      minHeight: "80vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      textAlign: "center",
      padding: "0 24px",
    }}>
      <h1 style={{
        fontSize: "clamp(36px, 6vw, 56px)",
        fontWeight: 700,
        letterSpacing: "-0.03em",
        lineHeight: 1.1,
        marginBottom: 48,
      }}>
        Sign in to OCC
      </h1>
      <a href="https://agent.occ.wtf" style={{
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
      }}>
        Sign in
      </a>
    </div>
  );
}

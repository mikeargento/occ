"use client";

export function Footer() {
  return (
    <footer style={{
      padding: "20px 22px",
      borderTop: "0.5px solid rgba(255, 255, 255, 0.08)",
    }}>
      <div style={{
        maxWidth: 980, margin: "0 auto",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 16,
      }}>
        <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.32)" }}>
          Origin Controlled Computing
        </span>
        <div style={{ display: "flex", gap: 20 }}>
          <a href="/docs" style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.44)", textDecoration: "none" }}>Docs</a>
          <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.44)", textDecoration: "none" }}>GitHub</a>
        </div>
      </div>
    </footer>
  );
}

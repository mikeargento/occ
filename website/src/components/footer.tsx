"use client";

export function Footer() {
  return (
    <footer style={{
      padding: "48px 24px 32px",
      borderTop: "1px solid #e5e7eb",
      marginTop: 64,
    }}>
      <div style={{
        maxWidth: 1120, margin: "0 auto",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 16,
      }}>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>
          Origin Controlled Computing
        </span>
        <div style={{ display: "flex", gap: 24 }}>
          <a href="/docs" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>Docs</a>
          <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>GitHub</a>
        </div>
      </div>
    </footer>
  );
}

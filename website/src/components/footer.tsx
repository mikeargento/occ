"use client";

export function Footer() {
  return (
    <footer style={{
      padding: "48px 24px 32px",
      borderTop: "1px solid #e5e7eb",
      marginTop: 64,
      background: "#f9fafb",
    }}>
      <div style={{
        maxWidth: 1120, margin: "0 auto",
        textAlign: "center",
      }}>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>
          Origin Controlled Computing — Patent Pending
        </span>
      </div>
    </footer>
  );
}

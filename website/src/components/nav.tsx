"use client";

export function Nav() {
  return (
    <div style={{ textAlign: "center", paddingTop: 32, paddingBottom: 8 }}>
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--c-text)" }}>
        OCC
      </span>
    </div>
  );
}

export function Footer() {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
      textAlign: "center", padding: "12px 0",
      display: "flex", justifyContent: "center", gap: 24,
      background: "linear-gradient(transparent, var(--bg) 40%)",
      pointerEvents: "none",
    }}>
      <a href="/docs" target="_blank" rel="noopener" style={{ fontSize: 13, color: "var(--c-text-tertiary)", textDecoration: "none", pointerEvents: "auto" }}>Docs</a>
      <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 13, color: "var(--c-text-tertiary)", textDecoration: "none", pointerEvents: "auto" }}>GitHub</a>
    </div>
  );
}

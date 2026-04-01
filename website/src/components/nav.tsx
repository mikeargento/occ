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
    <div style={{ textAlign: "center", padding: "48px 0 32px", display: "flex", justifyContent: "center", gap: 24 }}>
      <a href="/docs" target="_blank" rel="noopener" style={{ fontSize: 13, color: "var(--c-text-tertiary)", textDecoration: "none" }}>Docs</a>
      <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 13, color: "var(--c-text-tertiary)", textDecoration: "none" }}>GitHub</a>
    </div>
  );
}

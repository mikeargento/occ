"use client";

import Link from "next/link";

export function Nav() {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "var(--bg)",
      borderBottom: "1px solid var(--c-border)",
    }}>
      <div style={{
        width: "90%", maxWidth: 1400, margin: "0 auto", height: 52,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--c-text)", textDecoration: "none" }}>
          OCC
        </Link>
        <div style={{ display: "flex", gap: 20 }}>
          <Link href="/docs" style={{ fontSize: 13, color: "var(--c-text-secondary)", textDecoration: "none" }}>Docs</Link>
          <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 13, color: "var(--c-text-secondary)", textDecoration: "none" }}>GitHub</a>
        </div>
      </div>
    </header>
  );
}

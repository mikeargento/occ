"use client";

import Link from "next/link";

export function SiteNav() {
  return (
    <div id="site-nav" style={{
      borderBottom: "none",
      background: "#f9fafb",
      position: "sticky", top: 0, zIndex: 50,
    }}>
      <div style={{
        maxWidth: 1120, margin: "0 auto", padding: "0 24px",
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{
          fontSize: 20, fontWeight: 900, color: "#111827",
          textDecoration: "none", letterSpacing: "-0.02em",
        }}>
          ProofChain
        </Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link href="/docs" style={{
            fontSize: 14, fontWeight: 600, color: "#111827",
            textDecoration: "none",
          }}>
            Docs
          </Link>
          <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{
            fontSize: 14, fontWeight: 600, color: "#111827",
            textDecoration: "none",
          }}>
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";

export function SiteNav() {
  return (
    <div id="site-nav" style={{
      borderBottom: "none",
      background: "#f5f5f5",
      position: "sticky", top: 0, zIndex: 50,
    }}>
      <div style={{
        maxWidth: 1120, margin: "0 auto", padding: "0 24px",
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{
          fontSize: 22, fontWeight: 900, color: "#111827",
          textDecoration: "none", letterSpacing: "-0.03em",
          WebkitTextStroke: "0.6px #111827",
        }}>
          OCC
        </Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link href="/overview" style={{
            fontSize: 14, fontWeight: 600, color: "#111827",
            textDecoration: "none",
          }}>
            Overview
          </Link>
          <Link href="/docs" style={{
            fontSize: 14, fontWeight: 600, color: "#111827",
            textDecoration: "none",
          }}>
            Docs
          </Link>
          <Link href="/contact" style={{
            fontSize: 14, fontWeight: 600, color: "#111827",
            textDecoration: "none",
          }}>
            Contact
          </Link>
        </div>
      </div>
    </div>
  );
}

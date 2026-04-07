"use client";

import Link from "next/link";

/**
 * Chrome offline T-Rex logo — uses the actual Chromium dino image.
 */
function ChromeDino() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/dino.png" alt="OCC" width={36} height={36} style={{ display: "block" }} />;
}

export function SiteNav() {
  return (
    <div id="site-nav" style={{
      borderBottom: "none",
      background: "transparent",
      position: "sticky", top: 0, zIndex: 50,
    }}>
      <div style={{
        maxWidth: 1120, margin: "0 auto", padding: "0 24px",
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" aria-label="OCC home" style={{
          display: "flex", alignItems: "center", textDecoration: "none",
        }}>
          <ChromeDino />
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

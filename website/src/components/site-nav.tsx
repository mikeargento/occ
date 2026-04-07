"use client";

import Link from "next/link";

/**
 * Chrome offline T-Rex logo, drawn as inline SVG rectangles.
 * Each rect = 1 pixel in the original 22x24 sprite.
 * Color: #535353 (the canonical Chrome dino gray).
 */
function ChromeDino() {
  // Pixel coordinates for the dino body (x, y) — from the canonical Chrome sprite
  const pixels: [number, number, number, number][] = [
    // head
    [14, 0, 7, 1], [14, 1, 1, 1], [16, 1, 5, 1], [14, 2, 7, 1],
    [14, 3, 7, 1], [14, 4, 7, 1], [14, 5, 7, 1], [14, 6, 6, 1],
    [14, 7, 4, 1], [14, 8, 7, 1], [14, 9, 7, 1],
    // body & front leg
    [0, 8, 1, 1], [0, 9, 2, 1],
    [0, 10, 12, 1], [13, 10, 8, 1],
    [0, 11, 13, 1], [13, 11, 6, 1],
    [0, 12, 13, 1],
    [1, 13, 12, 1],
    [2, 14, 11, 1],
    [3, 15, 10, 1],
    [4, 16, 9, 1],
    [4, 17, 8, 1],
    [4, 18, 4, 1], [10, 18, 2, 1],
    [4, 19, 3, 1], [10, 19, 2, 1],
    [4, 20, 2, 1], [11, 20, 1, 1],
    [4, 21, 2, 1], [11, 21, 1, 1],
  ];
  return (
    <svg width="44" height="48" viewBox="0 0 22 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {pixels.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="#535353" />
      ))}
      {/* eye (white pixel) */}
      <rect x="19" y="2" width="1" height="1" fill="#fff" />
    </svg>
  );
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

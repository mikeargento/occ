"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links: { href: string; label: string; external?: boolean }[] = [
  { href: "/docs", label: "Docs" },
  { href: "https://github.com/mikeargento/occ", label: "GitHub", external: true },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "var(--bg)",
      borderBottom: "none",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    }}>
     <div style={{
      maxWidth: 1120, margin: "0 auto", height: 56,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 36px",
     }}>
      <Link href="/" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--c-text)", textDecoration: "none" }}>
        OCC
      </Link>

      {/* Desktop */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }} className="nav-desktop">
        {links.map((l) => {
          const isActive = !l.external && pathname.startsWith(l.href);
          const style: React.CSSProperties = {
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 8,
            fontSize: 14, fontWeight: isActive ? 500 : 400,
            color: isActive ? "var(--c-text)" : "var(--c-text-secondary)",
            textDecoration: "none", background: "none", border: "none",
            cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
          };
          return l.external ? (
            <a key={l.href} href={l.href} target="_blank" rel="noopener" className="nav-link" style={style}>{l.label}</a>
          ) : (
            <Link key={l.href} href={l.href} className="nav-link" style={style}>{l.label}</Link>
          );
        })}
        <div style={{ width: 8 }} />
        <a href="https://agent.occ.wtf" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: 32, padding: "0 14px", borderRadius: 8,
          fontSize: 13, fontWeight: 500,
          background: "var(--c-text)", color: "var(--bg)",
          textDecoration: "none", transition: "opacity 0.15s",
        }}>
          Sign in
        </a>
      </div>

      {/* Mobile */}
      <div className="nav-mobile" style={{ display: "none", alignItems: "center", gap: 4 }}>
        <button onClick={() => setOpen(!open)} style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: 8,
          background: "none", border: "none", color: "var(--c-text)", cursor: "pointer",
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            {open ? (
              <><line x1="3" y1="3" x2="13" y2="13" /><line x1="13" y1="3" x2="3" y2="13" /></>
            ) : (
              <><line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="12" x2="14" y2="12" /></>
            )}
          </svg>
        </button>
      </div>

     </div>
      {/* Mobile dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: 52, left: 0, right: 0,
          background: "var(--bg)", borderBottom: "1px solid var(--c-border-subtle)",
          padding: "8px 16px 16px", animation: "slideDownFade 0.2s ease-out",
        }}>
          {links.map((l) => l.external ? (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
              display: "block", padding: "10px 12px", fontSize: 15, fontWeight: 500,
              color: "var(--c-text-secondary)", textDecoration: "none",
            }}>{l.label}</a>
          ) : (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
              display: "block", padding: "10px 12px", fontSize: 15, fontWeight: 500,
              color: pathname.startsWith(l.href) ? "var(--c-text)" : "var(--c-text-secondary)",
              textDecoration: "none",
            }}>{l.label}</Link>
          ))}
          <a href="https://agent.occ.wtf" style={{
            display: "block", padding: "10px 12px", fontSize: 15, fontWeight: 500,
            color: "var(--c-accent)", textDecoration: "none",
          }}>Sign in →</a>
        </div>
      )}
    </header>
  );
}

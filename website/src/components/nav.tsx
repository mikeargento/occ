"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const tabs: { href: string; label: string }[] = [
  { href: "/", label: "Explorer" },
  { href: "/maker", label: "Prove" },
];

const rightLinks: { href: string; label: string; external?: boolean }[] = [
  { href: "/docs", label: "Docs" },
  { href: "https://github.com/mikeargento/occ", label: "GitHub", external: true },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "var(--bg)",
      borderBottom: "1px solid var(--c-border)",
    }}>
     <div style={{
      maxWidth: 1200, margin: "0 auto", height: 56,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 24px",
     }}>
      {/* Left: logo + tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <Link href="/" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--c-text)", textDecoration: "none" }}>
          OCC
        </Link>

        {/* Tab buttons — desktop */}
        <div style={{ display: "flex", gap: 4 }} className="nav-desktop">
          {tabs.map((t) => {
            const active = isActive(t.href);
            return (
              <Link key={t.href} href={t.href} style={{
                padding: "6px 14px", borderRadius: 6, border: "none",
                background: active ? "var(--bg-elevated)" : "transparent",
                color: active ? "var(--c-text)" : "var(--c-text-secondary)",
                fontSize: 13, fontWeight: 500, textDecoration: "none",
                transition: "all 0.15s",
              }}>{t.label}</Link>
            );
          })}
        </div>
      </div>

      {/* Right: links + sign in — desktop */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }} className="nav-desktop">
        {rightLinks.map((l) => {
          const active = !l.external && isActive(l.href);
          const style: React.CSSProperties = {
            fontSize: 13, fontWeight: active ? 500 : 400,
            color: active ? "var(--c-text)" : "var(--c-text-secondary)",
            textDecoration: "none", transition: "all 0.15s",
          };
          return l.external ? (
            <a key={l.href} href={l.href} target="_blank" rel="noopener" className="nav-link" style={style}>{l.label}</a>
          ) : (
            <Link key={l.href} href={l.href} className="nav-link" style={style}>{l.label}</Link>
          );
        })}
        <a href="https://agent.occ.wtf" style={{
          fontSize: 13, fontWeight: 500, color: "var(--c-accent)", textDecoration: "none",
          padding: "6px 14px", borderRadius: 6, border: "1px solid var(--c-accent)",
          transition: "opacity 0.15s",
        }}>
          Sign in
        </a>
      </div>

      {/* Mobile hamburger */}
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
          position: "absolute", top: 56, left: 0, right: 0,
          background: "var(--bg)", borderBottom: "1px solid var(--c-border)",
          padding: "8px 16px 16px", animation: "slideDownFade 0.2s ease-out",
        }}>
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} onClick={() => setOpen(false)} style={{
              display: "block", padding: "10px 12px", fontSize: 15, fontWeight: 500,
              color: isActive(t.href) ? "var(--c-text)" : "var(--c-text-secondary)",
              textDecoration: "none",
            }}>{t.label}</Link>
          ))}
          <div style={{ height: 1, background: "var(--c-border)", margin: "8px 12px" }} />
          {rightLinks.map((l) => l.external ? (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
              display: "block", padding: "10px 12px", fontSize: 15, fontWeight: 500,
              color: "var(--c-text-secondary)", textDecoration: "none",
            }}>{l.label}</a>
          ) : (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
              display: "block", padding: "10px 12px", fontSize: 15, fontWeight: 500,
              color: isActive(l.href) ? "var(--c-text)" : "var(--c-text-secondary)",
              textDecoration: "none",
            }}>{l.label}</Link>
          ))}
          <a href="https://agent.occ.wtf" style={{
            display: "block", padding: "10px 12px", fontSize: 15, fontWeight: 500,
            color: "var(--c-accent)", textDecoration: "none",
          }}>Sign in</a>
        </div>
      )}
    </header>
  );
}

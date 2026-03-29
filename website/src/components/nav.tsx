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
      background: "rgba(0, 0, 0, 0.72)",
      borderBottom: "0.5px solid rgba(255, 255, 255, 0.08)",
      backdropFilter: "saturate(180%) blur(20px)",
      WebkitBackdropFilter: "saturate(180%) blur(20px)",
    }}>
     <div style={{
      maxWidth: 980, margin: "0 auto", height: 48,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 22px",
     }}>
      <Link href="/" style={{
        fontSize: 17, fontWeight: 600,
        letterSpacing: "-0.02em",
        color: "var(--c-text)",
        textDecoration: "none",
      }}>
        OCC
      </Link>

      {/* Desktop */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }} className="nav-desktop">
        {links.map((l) => {
          const isActive = !l.external && pathname.startsWith(l.href);
          const El = l.external ? "a" : Link;
          const props = l.external
            ? { href: l.href, target: "_blank", rel: "noopener" }
            : { href: l.href };
          return (
            <El key={l.href} {...props as any} className="nav-link" style={{
              fontSize: 14,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? "var(--c-text)" : "rgba(255, 255, 255, 0.56)",
              textDecoration: "none",
              transition: "color 0.25s",
            }}>
              {l.label}
            </El>
          );
        })}
        <a href="https://agent.occ.wtf" style={{
          fontSize: 14, fontWeight: 500,
          color: "var(--c-accent)",
          textDecoration: "none",
          transition: "opacity 0.2s",
        }}>
          Sign in
        </a>
      </div>

      {/* Mobile */}
      <div className="nav-mobile" style={{ display: "none", alignItems: "center" }}>
        <button onClick={() => setOpen(!open)} style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: 8,
          background: "none", border: "none",
          color: "rgba(255, 255, 255, 0.56)", cursor: "pointer",
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
            {open ? (
              <><line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" /></>
            ) : (
              <><line x1="2" y1="5" x2="16" y2="5" /><line x1="2" y1="9" x2="16" y2="9" /><line x1="2" y1="13" x2="16" y2="13" /></>
            )}
          </svg>
        </button>
      </div>

     </div>
      {open && (
        <div style={{
          position: "absolute", top: 48, left: 0, right: 0,
          background: "rgba(0, 0, 0, 0.92)",
          borderBottom: "0.5px solid rgba(255, 255, 255, 0.08)",
          padding: "8px 22px 16px",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
          animation: "slideDownFade 0.2s ease-out",
        }}>
          {links.map((l) => l.external ? (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
              display: "block", padding: "12px 0", fontSize: 15,
              color: "rgba(255, 255, 255, 0.56)", textDecoration: "none",
            }}>{l.label}</a>
          ) : (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
              display: "block", padding: "12px 0", fontSize: 15,
              color: pathname.startsWith(l.href) ? "var(--c-text)" : "rgba(255, 255, 255, 0.56)",
              textDecoration: "none",
            }}>{l.label}</Link>
          ))}
          <a href="https://agent.occ.wtf" style={{
            display: "block", padding: "12px 0", fontSize: 15,
            color: "var(--c-accent)", textDecoration: "none",
          }}>Sign in</a>
        </div>
      )}
    </header>
  );
}

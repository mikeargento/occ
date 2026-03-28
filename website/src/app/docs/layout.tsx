"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/what-is-occ", label: "What is OCC" },
  { href: "/docs/proof-format", label: "Proof Format (occ/1)" },
  { href: "/docs/verification", label: "Verification" },
  { href: "/docs/trust-model", label: "Trust Model" },
  { href: "/docs/integration", label: "Integration Guide" },
  { href: "/docs/agent-sdk", label: "Agent SDK" },
  { href: "/docs/what-occ-is-not", label: "What OCC is Not" },
  { href: "/docs/faq", label: "FAQ" },
];

const extras = [
  { href: "/docs/whitepaper", label: "Whitepaper" },
  { href: "/api-reference", label: "API Reference" },
  { href: "https://github.com/mikeargento/occ", label: "GitHub", external: true },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px 64px" }}>
      {/* Mobile nav */}
      <div className="visible-mobile" style={{ marginBottom: 24 }}>
        <select
          onChange={(e) => window.location.href = e.target.value}
          value={pathname}
          style={{
            width: "100%", height: 44, padding: "0 16px",
            background: "var(--bg-elevated)", border: "1px solid var(--c-border-subtle)",
            borderRadius: 8, fontSize: 14, fontWeight: 500,
            color: "var(--c-text)", fontFamily: "inherit",
            appearance: "none", cursor: "pointer",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23707070' stroke-width='1.5'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center",
          }}
        >
          {sections.map((s) => <option key={s.href} value={s.href}>{s.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 48 }}>
        {/* Sidebar — desktop only */}
        <aside className="hidden-mobile" style={{ width: 200, flexShrink: 0 }}>
          <div style={{ position: "sticky", top: 68 }}>
            <div style={{
              fontSize: 11, fontWeight: 500, textTransform: "uppercase",
              letterSpacing: "0.1em", color: "var(--c-text-tertiary)", marginBottom: 16,
            }}>
              Documentation
            </div>
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {sections.map((s) => (
                <Link key={s.href} href={s.href} style={{
                  display: "block", padding: "6px 12px", fontSize: 14,
                  fontWeight: pathname === s.href ? 600 : 400,
                  color: pathname === s.href ? "var(--c-text)" : "var(--c-text-secondary)",
                  textDecoration: "none", borderRadius: 6,
                  background: pathname === s.href ? "var(--bg-elevated)" : "transparent",
                  transition: "all 0.15s",
                }}>
                  {s.label}
                </Link>
              ))}
            </nav>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--c-border-subtle)" }}>
              {extras.map((e) => e.external ? (
                <a key={e.href} href={e.href} target="_blank" rel="noopener" style={{
                  display: "block", padding: "6px 12px", fontSize: 13,
                  color: "var(--c-text-tertiary)", textDecoration: "none",
                }}>
                  {e.label}
                </a>
              ) : (
                <Link key={e.href} href={e.href} style={{
                  display: "block", padding: "6px 12px", fontSize: 13,
                  color: pathname.startsWith(e.href) ? "var(--c-text)" : "var(--c-text-tertiary)",
                  textDecoration: "none",
                }}>
                  {e.label}
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* Content */}
        <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

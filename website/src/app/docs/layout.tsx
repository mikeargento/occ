"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

const sections = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/what-is-occ", label: "What is OCC" },
  { href: "/docs/whitepaper", label: "Whitepaper" },
  { href: "/docs/proof-format", label: "Proof Format (occ/1)" },
  { href: "/docs/verification", label: "Verification" },
  { href: "/docs/trust-model", label: "Trust Model" },
  { href: "/docs/self-host-tee", label: "Self-Host TEE" },
  { href: "/docs/integration", label: "Integration Guide" },
  { href: "/docs/agent-sdk", label: "Agent SDK" },
  { href: "/docs/what-occ-is-not", label: "What OCC is Not" },
  { href: "/docs/faq", label: "FAQ" },
];

const extras = [
  { href: "https://github.com/mikeargento/occ", label: "GitHub", external: true },
];

function SidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div style={{
        fontSize: 11, fontWeight: 500, textTransform: "uppercase",
        letterSpacing: "0.1em", color: "var(--c-text-tertiary)", marginBottom: 16, paddingTop: 8,
      }}>
        Documentation
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {sections.map((s) => (
          <Link key={s.href} href={s.href} onClick={onNavigate} style={{
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
          <Link key={e.href} href={e.href} onClick={onNavigate} style={{
            display: "block", padding: "6px 12px", fontSize: 13,
            color: pathname.startsWith(e.href) ? "var(--c-text)" : "var(--c-text-tertiary)",
            textDecoration: "none",
          }}>
            {e.label}
          </Link>
        ))}
      </div>
    </>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px 64px" }}>

      {/* Mobile menu button */}
      <div className="visible-mobile" style={{ marginBottom: 16 }}>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--c-border)",
            borderRadius: 8,
            padding: "10px 16px",
            color: "var(--c-text)",
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            {mobileMenuOpen
              ? <path d="M4 4l8 8M12 4l-8 8" />
              : <><path d="M2 4h12" /><path d="M2 8h12" /><path d="M2 12h12" /></>
            }
          </svg>
          {sections.find(s => s.href === pathname)?.label || "Documentation"}
        </button>

        {mobileMenuOpen && (
          <div style={{
            marginTop: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--c-border)",
            borderRadius: 8,
            padding: "8px",
          }}>
            <SidebarNav pathname={pathname} onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 48 }}>
        {/* Sidebar — desktop only */}
        <aside className="hidden-mobile" style={{ width: 200, flexShrink: 0 }}>
          <div style={{ position: "sticky", top: 32 }}>
            <SidebarNav pathname={pathname} />
          </div>
        </aside>

        {/* Content */}
        <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
      </div>
    </div>
    <Footer />
    </>
  );
}

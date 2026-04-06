"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Chat } from "@/components/chat";

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

function SidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {sections.map((s) => (
        <Link key={s.href} href={s.href} onClick={onNavigate} style={{
          display: "block", padding: "6px 12px", fontSize: 14,
          fontWeight: pathname === s.href ? 600 : 400,
          color: pathname === s.href ? "#111827" : "#6b7280",
          textDecoration: "none", borderRadius: 6,
          background: pathname === s.href ? "#f3f4f6" : "transparent",
        }}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const currentLabel = sections.find(s => s.href === pathname)?.label || "Docs";

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px 80px" }}>
      <div style={{ display: "flex", gap: 48 }}>
        {/* Sidebar — desktop only */}
        <aside className="hidden-mobile" style={{ width: 200, flexShrink: 0 }}>
          <div style={{ position: "sticky", top: 88 }}>
            <div style={{
              fontSize: 11, fontWeight: 500, textTransform: "uppercase",
              letterSpacing: "0.1em", color: "#9ca3af", marginBottom: 16, paddingTop: 8,
            }}>
              Documentation
            </div>
            <SidebarNav pathname={pathname} />
          </div>
        </aside>

        {/* Content */}
        <div style={{ minWidth: 0, flex: 1 }}>
          {children}
        </div>
      </div>

      {/* Floating chat */}
      {chatOpen ? (
        <div className="docs-chat-container" style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 100,
          width: 400, maxWidth: "calc(100vw - 48px)",
          maxHeight: "calc(100vh - 120px)",
          borderRadius: 16, overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
        }}>
          <style>{`
            @media (max-width: 640px) {
              .docs-chat-container {
                position: fixed !important;
                inset: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                max-height: 100% !important;
                border-radius: 0 !important;
                bottom: 0 !important;
                right: 0 !important;
              }
            }
          `}</style>
          <Chat defaultOpen onOpenChange={setChatOpen} />
        </div>
      ) : (
        <button
          onClick={() => setChatOpen(true)}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 100,
            width: 52, height: 52, borderRadius: 14,
            background: "#0065A4", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0,101,164,0.3)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,101,164,0.4)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,101,164,0.3)"; }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
    </div>
  );
}

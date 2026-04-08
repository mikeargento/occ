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
            <div style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: "1px solid #e5e7eb",
            }}>
              <a
                href="https://github.com/mikeargento/occ"
                target="_blank"
                rel="noopener"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  fontSize: 14,
                  fontWeight: 400,
                  color: "#6b7280",
                  textDecoration: "none",
                  borderRadius: 6,
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#111827";
                  e.currentTarget.style.background = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#6b7280";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                GitHub
              </a>
            </div>
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

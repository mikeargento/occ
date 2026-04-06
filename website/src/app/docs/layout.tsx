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
            {!chatOpen && (
              <div style={{ marginTop: 24 }}>
                <Chat onOpenChange={setChatOpen} />
              </div>
            )}
          </div>
        </aside>

        {/* Content */}
        <div style={{ minWidth: 0, flex: 1 }}>
          {chatOpen ? (
            <Chat defaultOpen onOpenChange={setChatOpen} />
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

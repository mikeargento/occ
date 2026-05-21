"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const sections = [
  { href: "/docs/overview", label: "Overview" },
  { href: "/docs/what-is-bitgraph", label: "What is BitGraph" },
  { href: "/docs/whitepaper", label: "Whitepaper" },
  { href: "/docs/proof-format", label: "Proof Format (bitgraph/1)" },
  { href: "/docs/verification", label: "Verification" },
  { href: "/docs/trust-model", label: "Trust Model" },
  { href: "/docs/self-host-tee", label: "Self-Host TEE" },
  { href: "/docs/integration", label: "Integration Guide" },
  { href: "/docs/what-bitgraph-is-not", label: "What BitGraph is Not" },
  { href: "/docs/faq", label: "FAQ" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentLabel = sections.find(s => s.href === pathname)?.label || "Docs";
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div style={{ width: "90%", maxWidth: 800, margin: "0 auto", padding: "32px 0 80px" }}>
      {/* Section dropdown — used at every viewport now */}
      <div ref={menuRef} className="docs-section-nav" style={{
        position: "sticky", top: 56, zIndex: 40,
        background: "#f5f5f5", marginBottom: 24,
        paddingTop: 8, paddingBottom: 8,
      }}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          aria-expanded={menuOpen}
          aria-label="Documentation sections"
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", fontSize: 14, fontWeight: 600, color: "#111827",
            background: "#fff", border: "1px solid #d0d5dd", borderRadius: 0,
            cursor: "pointer",
          }}
        >
          <span>{currentLabel}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {menuOpen && (
          <div style={{
            marginTop: 8, padding: 8,
            background: "#fff", border: "1px solid #d0d5dd", borderRadius: 0,
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
          }}>
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {sections.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: "block", padding: "8px 12px", fontSize: 14,
                    fontWeight: pathname === s.href ? 600 : 400,
                    color: pathname === s.href ? "#111827" : "#4b5563",
                    textDecoration: "none", borderRadius: 0,
                    background: pathname === s.href ? "#f3f4f6" : "transparent",
                  }}
                >
                  {s.label}
                </Link>
              ))}
              {/* GitHub as a final, separated entry */}
              <a
                href="https://github.com/mikeargento/bitgraph"
                target="_blank"
                rel="noopener"
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                  paddingTop: 12,
                  borderTop: "1px solid #e5e7eb",
                  padding: "12px 12px 8px 12px",
                  fontSize: 14,
                  fontWeight: 400,
                  color: "#4b5563",
                  textDecoration: "none",
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
            </nav>
          </div>
        )}
      </div>

      {/* Content */}
      <div>{children}</div>
    </div>
  );
}

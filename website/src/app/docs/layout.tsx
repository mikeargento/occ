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
  { href: "/docs/what-occ-is-not", label: "What OCC is Not" },
  { href: "/docs/faq", label: "FAQ" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Mobile nav */}
      <div className="lg:hidden mb-8">
        <select
          onChange={(e) => window.location.href = e.target.value}
          value={pathname}
          className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-4 py-2 text-sm text-text-secondary"
        >
          {sections.map((s) => (
            <option key={s.href} value={s.href}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-12">
        {/* Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-20">
            <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary mb-4">
              Documentation
            </div>
            <nav className="space-y-0.5">
              {sections.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className={`block rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                    pathname === s.href
                      ? "text-text bg-bg-subtle font-medium"
                      : "text-text-secondary hover:text-text hover:bg-bg-subtle/50"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 pt-4 border-t border-border-subtle">
              <Link href="/api-reference" className="block text-[13px] text-text-secondary hover:text-text transition-colors px-3 py-1.5">
                API Reference →
              </Link>
              <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" className="block text-[13px] text-text-secondary hover:text-text transition-colors px-3 py-1.5">
                GitHub ↗
              </a>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 max-w-3xl">{children}</div>
      </div>
    </div>
  );
}

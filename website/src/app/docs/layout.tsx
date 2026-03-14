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

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
      {/* Mobile nav */}
      <div className="lg:hidden mb-10">
        <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
          <select
            onChange={(e) => window.location.href = e.target.value}
            value={pathname}
            className="w-full h-12 bg-transparent px-5 text-sm font-semibold text-text appearance-none cursor-pointer focus:outline-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23707070' stroke-width='1.5'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center' }}
          >
            {sections.map((s) => (
              <option key={s.href} value={s.href}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-16">
        {/* Sidebar */}
        <aside className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-24">
            <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary mb-6">
              Documentation
            </div>
            <nav className="space-y-1">
              {sections.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className={`block rounded-lg px-4 py-2 text-sm transition-colors ${
                    pathname === s.href
                      ? "sidebar-active text-text font-semibold"
                      : "text-text-secondary hover:text-text"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 pt-4 border-t border-border-subtle">
              <Link href="/api-reference" className="block text-sm text-text-secondary hover:text-text transition-colors px-4 py-2">
                API Reference
              </Link>
              <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" className="block text-sm text-text-secondary hover:text-text transition-colors px-4 py-2">
                GitHub
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

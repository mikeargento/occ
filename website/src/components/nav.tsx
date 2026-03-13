"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links: { href: string; label: string; external?: boolean }[] = [
  { href: "/studio", label: "Studio" },
  { href: "/docs", label: "Docs" },
  { href: "/api-reference", label: "API" },
  { href: "https://github.com/mikeargento/occ", label: "GitHub", external: true },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6">
        <nav className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-text"
          >
            <span className="text-xl font-extrabold tracking-[-0.01em]" style={{ fontFamily: '"acumin-variable", "acumin-pro", sans-serif' }}>ProofStudio</span>
          </Link>

          {/* Desktop */}
          <div className="hidden flex-1 items-center justify-end gap-1 md:flex">
            {links.map((l, i) => {
              const isExternal = l.external;
              // Add separator before GitHub (external) link
              const separator = isExternal ? (
                <div key="sep" className="w-px h-4 bg-border-subtle mx-2" />
              ) : null;

              const linkEl = isExternal ? (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener"
                  className="text-sm font-semibold px-3 py-1.5 transition-colors text-text-tertiary hover:text-text"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`text-sm font-semibold px-3 py-1.5 transition-colors ${
                    pathname.startsWith(l.href)
                      ? "text-text"
                      : "text-text-tertiary hover:text-text"
                  }`}
                >
                  {l.label}
                </Link>
              );

              return separator ? [separator, linkEl] : linkEl;
            })}
          </div>

          {/* Mobile hamburger */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setOpen(!open)}
              className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-bg-subtle"
              aria-label="Toggle menu"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                {open ? (
                  <>
                    <line x1="3" y1="3" x2="13" y2="13" />
                    <line x1="13" y1="3" x2="3" y2="13" />
                  </>
                ) : (
                  <>
                    <line x1="2" y1="4" x2="14" y2="4" />
                    <line x1="2" y1="8" x2="14" y2="8" />
                    <line x1="2" y1="12" x2="14" y2="12" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="mobile-menu-enter border-t border-border-subtle bg-bg px-6 py-6 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) =>
              l.external ? (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-text-secondary hover:text-text"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${
                    pathname.startsWith(l.href)
                      ? "text-text"
                      : "text-text-secondary hover:text-text"
                  }`}
                >
                  {l.label}
                </Link>
              )
            )}
          </div>
        </div>
      )}
    </header>
  );
}


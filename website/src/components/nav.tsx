"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links: { href: string; label: string; external?: boolean; indicator?: boolean }[] = [
  { href: "/explorer", label: "Explorer" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#e5e5ea]">
      <div className="mx-auto max-w-6xl px-6">
        <nav className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="text-[28px] tracking-[-0.03em] font-black text-black"
          >
            OCC
          </Link>

          {/* Desktop */}
          <div className="hidden flex-1 items-center justify-end gap-4 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm font-semibold px-3 py-1.5 transition-colors ${
                  pathname.startsWith(l.href)
                    ? "text-black"
                    : "text-black hover:opacity-70"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 md:hidden">
            <button
              onClick={() => setOpen(!open)}
              className="flex h-9 w-9 items-center justify-center hover:bg-bg-subtle"
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
                  onClick={() => setOpen(false)}
                  className="px-3 py-2.5 text-sm font-semibold text-text-secondary hover:text-text"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`px-3 py-2.5 text-sm font-semibold inline-flex items-center gap-1.5 ${
                    pathname.startsWith(l.href)
                      ? "text-text"
                      : "text-text-secondary hover:text-text"
                  }`}
                >
                  {l.indicator && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                  )}
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

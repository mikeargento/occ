"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/components/theme-provider";

const links: { href: string; label: string; external?: boolean }[] = [
  { href: "/studio", label: "Studio" },
  { href: "/docs", label: "Docs" },
  { href: "/api-reference", label: "API" },
  { href: "https://github.com/mikeargento/occ", label: "GitHub", external: true },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6">
        <nav className="flex h-14 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-text"
          >
            <span className="text-xl font-extrabold tracking-wide" style={{ fontFamily: '"acumin-variable", "acumin-pro", sans-serif' }}>ProofStudio</span>
          </Link>

          {/* Desktop */}
          <div className="hidden flex-1 items-center justify-end gap-4 md:flex">
            {links.map((l) =>
              l.external ? (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener"
                  className="text-[13px] font-semibold rounded-md px-3 py-1.5 transition-colors text-text-secondary hover:text-text hover:bg-bg-subtle/50"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`text-[13px] font-semibold rounded-md px-3 py-1.5 transition-colors ${
                    pathname.startsWith(l.href)
                      ? "text-text bg-bg-subtle/50"
                      : "text-text-secondary hover:text-text hover:bg-bg-subtle/50"
                  }`}
                >
                  {l.label}
                </Link>
              )
            )}
            {/* Theme toggle */}
            <ThemeToggle theme={theme} toggle={toggle} />
          </div>

          {/* Mobile: theme toggle + hamburger */}
          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle theme={theme} toggle={toggle} />
            <button
              onClick={() => setOpen(!open)}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-bg-subtle"
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
        <div className="border-t border-border-subtle bg-bg px-6 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) =>
              l.external ? (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2 text-sm font-semibold text-text-secondary hover:text-text"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${
                    pathname.startsWith(l.href)
                      ? "text-text bg-bg-subtle"
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

function ThemeToggle({ theme, toggle }: { theme: string; toggle: () => void }) {
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      className="ml-2 flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-bg-subtle/50 transition-colors cursor-pointer"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? (
        /* Sun — shown in dark mode, click to go light */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M6.34 17.66l-1.41 1.41" />
          <path d="M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        /* Moon — shown in light mode, click to go dark */
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  );
}

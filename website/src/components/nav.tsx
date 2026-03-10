"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/components/theme-provider";

const links = [
  { href: "/studio", label: "Studio" },
  { href: "/docs", label: "Docs" },
  { href: "/api-reference", label: "API" },
  { href: "/use-cases", label: "Use Cases" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 border-b border-border-subtle">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-wider uppercase text-text"
        >
          <span className="text-base font-black tracking-wide">OCC.WTF</span>
        </Link>

        {/* Desktop */}
        <div className="hidden flex-1 items-center justify-end gap-6 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-[13px] transition-colors ${
                pathname.startsWith(l.href)
                  ? "text-text"
                  : "text-text-secondary hover:text-text"
              }`}
            >
              {l.label}
            </Link>
          ))}
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

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border-subtle bg-bg px-6 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`rounded-md px-3 py-2 text-sm ${
                  pathname.startsWith(l.href)
                    ? "text-text bg-bg-subtle"
                    : "text-text-secondary hover:text-text"
                }`}
              >
                {l.label}
              </Link>
            ))}
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

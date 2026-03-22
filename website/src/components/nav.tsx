"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "./theme-provider";

const links: { href: string; label: string; external?: boolean; indicator?: boolean }[] = [
  { href: "/studio", label: "Policy Studio" },
  { href: "/docs", label: "Docs" },
  { href: "/explorer", label: "Explorer" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl border-b border-border-subtle/50">
      <div className="mx-auto max-w-6xl px-6">
        <nav className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-text"
          >
            <Image
              src={theme === "dark" ? "/logo-dark.png" : "/logo.png"}
              alt="OCC"
              width={28}
              height={28}
              className="shrink-0"
              priority
            />
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
                  className="text-sm font-semibold px-3 py-1.5 transition-colors duration-150 text-text-tertiary hover:text-text"
                >
                  {l.label}
                </a>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`text-sm font-semibold px-3 py-1.5 transition-colors inline-flex items-center gap-1.5 ${
                    pathname.startsWith(l.href)
                      ? "text-text"
                      : "text-text-tertiary hover:text-text"
                  }`}
                >
                  {l.indicator && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                  )}
                  {l.label}
                </Link>
              );

              return separator ? [separator, linkEl] : linkEl;
            })}
            <div className="w-px h-4 bg-border-subtle mx-2" />
            <button
              onClick={toggle}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-bg-subtle transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8" cy="8" r="3" />
                  <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M3.75 12.25l1.06-1.06M11.19 4.81l1.06-1.06" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7z" />
                </svg>
              )}
            </button>
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 md:hidden">
            <button
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-bg-subtle transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8" cy="8" r="3" />
                  <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M3.75 12.25l1.06-1.06M11.19 4.81l1.06-1.06" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7z" />
                </svg>
              )}
            </button>
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
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold inline-flex items-center gap-1.5 ${
                    pathname.startsWith(l.href)
                      ? "text-text"
                      : "text-text-secondary hover:text-text"
                  }`}
                >
                  {l.indicator && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
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


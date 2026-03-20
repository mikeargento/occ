"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProxy } from "@/lib/use-proxy";
import { useTheme } from "./theme-provider";

const NAV_ITEMS = [
  { href: "/agents", label: "Agents" },
  { href: "/policies", label: "Policies" },
  { href: "/audit", label: "Proof Log" },
  { href: "/connections", label: "Connections", icon: "plug" as const },
  { href: "/keys", label: "API Keys", icon: "key" as const },
  { href: "/setup", label: "Setup" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { isConnected, proxyId } = useProxy();
  const { theme, toggle } = useTheme();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="w-60 flex-shrink-0 border-r border-border bg-bg-elevated flex flex-col h-screen select-none">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 flex items-center justify-between">
        <div className="text-[22px] font-black tracking-[-0.02em] text-text" style={{ fontFamily: "var(--font-inter)" }}>
          OCC.WTF
        </div>
        <button
          onClick={toggle}
          className="p-1.5 rounded-md text-text-tertiary hover:text-text transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1.5v1M8 13.5v1M3.4 3.4l.7.7M11.9 11.9l.7.7M1.5 8h1M13.5 8h1M3.4 12.6l.7-.7M11.9 4.1l.7-.7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.2 1.6a6.5 6.5 0 0 0 8.2 8.2 6.5 6.5 0 1 1-8.2-8.2z" />
            </svg>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-4 py-2 text-sm transition-colors ${
                active
                  ? "bg-bg-subtle text-text font-semibold"
                  : "text-text-secondary hover:text-text"
              }`}
            >
              {"icon" in item && item.icon === "plug" && (
                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2v4M10 2v4M4 6h8v2a4 4 0 0 1-4 4v0a4 4 0 0 1-4-4V6zM8 12v2.5" />
                </svg>
              )}
              {"icon" in item && item.icon === "key" && (
                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="5.5" cy="10.5" r="3" />
                  <path d="M7.5 8.5L13 3M11.5 3H14M14 3v2.5" />
                </svg>
              )}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-3 space-y-1">
        <Link
          href="/settings"
          className={`block rounded-lg px-4 py-2 text-sm transition-colors ${
            isActive("/settings")
              ? "bg-bg-subtle text-text font-semibold"
              : "text-text-secondary hover:text-text"
          }`}
        >
          Settings
        </Link>
        <div className="mx-2 mt-2 pt-3 border-t border-border-subtle">
          <div className="flex items-center gap-2 px-2 py-2">
            <div
              className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
                isConnected ? "bg-success" : "bg-error"
              }`}
            />
            <span className="text-[11px] text-text-tertiary truncate">
              {isConnected ? proxyId || "Connected" : "No connection"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

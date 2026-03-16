"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProxy } from "@/lib/use-proxy";

const NAV_ITEMS = [
  { href: "/agents", label: "Agents" },
  { href: "/policies", label: "Policies" },
  { href: "/audit", label: "Proof Log" },
  { href: "/setup", label: "Setup" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { isConnected, proxyId } = useProxy();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="w-60 flex-shrink-0 border-r border-border bg-bg-elevated flex flex-col h-screen select-none">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary">
          OCC Agent
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`block rounded-lg px-4 py-2 text-sm transition-colors ${
                active
                  ? "bg-bg-subtle text-text font-semibold"
                  : "text-text-secondary hover:text-text"
              }`}
            >
              {label}
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

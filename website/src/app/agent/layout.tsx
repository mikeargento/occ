"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProxyProvider, useProxy } from "@/lib/agent/use-proxy";

const sections = [
  { href: "/agent", label: "Agents", exact: true },
  { href: "/agent/log", label: "Proof Log" },
  { href: "/agent/settings", label: "Settings" },
];

function AgentSidebar() {
  const pathname = usePathname();
  const { isConnected, proxyId } = useProxy();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  // Agent detail pages should highlight "Agents"
  const isAgentDetail = pathname.startsWith("/agent/") &&
    !pathname.startsWith("/agent/log") &&
    !pathname.startsWith("/agent/settings") &&
    pathname !== "/agent";

  return (
    <aside className="hidden lg:block w-60 shrink-0">
      <div className="sticky top-24">
        <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary mb-6">
          OCC Agent
        </div>
        <nav className="space-y-1">
          {sections.map((s) => {
            const active = isActive(s.href, s.exact) || (s.href === "/agent" && isAgentDetail);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`block rounded-lg px-4 py-2 text-sm transition-colors ${
                  active
                    ? "sidebar-active text-text font-semibold"
                    : "text-text-secondary hover:text-text"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 pt-4 border-t border-border-subtle">
          <div className="flex items-center gap-2 px-4 py-2">
            <div
              className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
                isConnected ? "bg-success" : "bg-error"
              }`}
            />
            <span className="text-[11px] text-text-tertiary truncate">
              {isConnected ? proxyId ?? "Connected" : "No connection"}
            </span>
          </div>
          <p className="px-4 mt-2 text-[11px] text-text-tertiary leading-relaxed">
            Run <code className="text-[10px] font-mono bg-bg-subtle px-1 py-0.5 rounded">npx occ-mcp-proxy</code> to connect
          </p>
        </div>
      </div>
    </aside>
  );
}

function AgentMobileNav() {
  const pathname = usePathname();

  return (
    <div className="lg:hidden mb-10">
      <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
        <select
          onChange={(e) => (window.location.href = e.target.value)}
          value={
            sections.find((s) =>
              s.exact
                ? pathname === s.href
                : pathname === s.href || pathname.startsWith(s.href + "/")
            )?.href ?? "/agent"
          }
          className="w-full h-12 bg-transparent px-5 text-sm font-semibold text-text appearance-none cursor-pointer focus:outline-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23707070' stroke-width='1.5'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 1rem center",
          }}
        >
          {sections.map((s) => (
            <option key={s.href} value={s.href}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AgentContent({ children }: { children: React.ReactNode }) {
  const { isConnected } = useProxy();

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="flex justify-center">{children}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
      <AgentMobileNav />
      <div className="flex gap-16">
        <AgentSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProxyProvider>
      <AgentContent>{children}</AgentContent>
    </ProxyProvider>
  );
}

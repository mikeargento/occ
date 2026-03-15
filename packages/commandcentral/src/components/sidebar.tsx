"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProxy } from "@/lib/use-proxy";

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}

const CONTROL_ITEMS = [
  { href: "/agents", label: "Agents", icon: AgentsIcon },
  { href: "/policies", label: "Policies", icon: ShieldIcon },
] as const;

const OBSERVE_ITEMS = [
  { href: "/audit", label: "Proof Log", icon: LogIcon },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { isConnected, proxyId } = useProxy();

  return (
    <aside className="w-[216px] flex-shrink-0 border-r border-border bg-bg-elevated flex flex-col h-screen select-none">
      {/* Brand */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-bg-subtle border border-border flex items-center justify-center">
            <ShieldMark className="w-4 h-4 text-text-secondary" />
          </div>
          <div>
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-text leading-tight">
              OCC Agent
            </p>
            <p className="text-[10px] text-text-tertiary font-medium uppercase tracking-[0.06em] leading-tight mt-0.5">
              Control Plane
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-4 overflow-y-auto pt-1">
        <NavSection label="Control">
          {CONTROL_ITEMS.map(({ href, label, icon: Icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={Icon}
              active={pathname.startsWith(href)}
            />
          ))}
        </NavSection>

        <NavSection label="Observe">
          {OBSERVE_ITEMS.map(({ href, label, icon: Icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={Icon}
              active={pathname.startsWith(href)}
            />
          ))}
        </NavSection>
      </nav>

      {/* Footer */}
      <div className="px-2 pb-2 space-y-1">
        <NavItem
          href="/settings"
          label="Settings"
          icon={GearIcon}
          active={pathname.startsWith("/settings")}
        />
        <div className="mx-2 mt-1 pt-2 border-t border-border-subtle">
          <div className="flex items-center gap-2 px-1 py-1.5">
            <div
              className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
                isConnected ? "bg-success" : "bg-error"
              }`}
            />
            <span className="text-[11px] text-text-tertiary truncate leading-none">
              {isConnected ? (proxyId || "Connected") : "No connection"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({ href, label, icon: Icon, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] transition-colors duration-100 ${
        active
          ? "bg-bg-subtle text-text font-medium"
          : "text-text-secondary hover:text-text hover:bg-bg-subtle/60"
      }`}
    >
      <Icon
        className={`w-4 h-4 flex-shrink-0 ${
          active ? "text-text" : "text-text-tertiary group-hover:text-text-secondary"
        } transition-colors duration-100`}
      />
      {label}
    </Link>
  );
}

/* ── Icons ── */

function ShieldMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.5L3 3.75V7.5C3 11 5.5 13.5 8 14.5C10.5 13.5 13 11 13 7.5V3.75L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M5.75 8.25L7.25 9.75L10.25 6.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AgentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" />
    </svg>
  );
}

function LogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 4h7M4.5 7h7M4.5 10h5M4.5 13h3" />
      <circle cx="2.5" cy="4" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="7" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="10" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="13" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </svg>
  );
}

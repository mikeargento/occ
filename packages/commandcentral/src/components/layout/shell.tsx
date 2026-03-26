"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  Activity,
  Play,
  FileCheck,
  Shield,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Approvals", href: "/approvals", icon: ShieldCheck },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Runs", href: "/runs", icon: Play },
  { label: "Proofs", href: "/proofs", icon: FileCheck },
  { label: "Policy", href: "/policy", icon: Shield },
  { label: "Settings", href: "/settings", icon: Settings },
];

function NavLink({
  item,
  active,
  pendingCount,
}: {
  item: NavItem;
  active: boolean;
  pendingCount?: number;
}) {
  const Icon = item.icon;
  const showBadge = item.label === "Approvals" && pendingCount && pendingCount > 0;

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
        active
          ? "bg-[var(--bg)] text-[var(--text-primary)] font-medium"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/50"
      )}
    >
      <Icon size={16} strokeWidth={active ? 2 : 1.5} />
      <span className="flex-1">{item.label}</span>
      {showBadge && (
        <span className="min-w-[20px] h-5 flex items-center justify-center px-1.5 text-xs font-medium bg-[#f59e0b] text-white">
          {pendingCount}
        </span>
      )}
    </Link>
  );
}

interface ShellProps {
  children: React.ReactNode;
  pendingCount?: number;
}

export function Shell({ children, pendingCount }: ShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-[var(--bg-elevated)] border-r border-[var(--border)] flex flex-col">
        {/* Logo */}
        <div className="h-12 flex items-center px-4 border-b border-[var(--border)]">
          <Link href="/" className="text-lg font-black tracking-tight text-[var(--text-primary)]">
            OCC
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
              }
              pendingCount={pendingCount}
            />
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <header className="h-12 shrink-0 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center justify-between px-4">
          <div />
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Settings size={16} />
            </Link>
            <div className="w-6 h-6 bg-[var(--border)] flex items-center justify-center text-xs font-medium text-[var(--text-secondary)]">
              U
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-[var(--bg)] p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

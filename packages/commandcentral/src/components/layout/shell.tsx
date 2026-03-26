"use client";

import { useEffect, useState } from "react";
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

function NavLink({ item, active, pendingCount }: { item: NavItem; active: boolean; pendingCount?: number }) {
  const Icon = item.icon;
  const showBadge = item.label === "Approvals" && pendingCount && pendingCount > 0;
  return (
    <Link href={item.href}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
        active
          ? "bg-[var(--bg)] text-[var(--text-primary)] font-medium"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/50"
      )}>
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

// ── Login Screen ──

function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="max-w-sm w-full px-6">
        <h1 className="text-3xl font-black tracking-tight mb-2">OCC</h1>
        <p className="text-sm text-[var(--text-tertiary)] mb-8">Control plane for your AI agents</p>
        <div className="space-y-3">
          <a href="/auth/login/github"
            className="flex items-center justify-center gap-2 h-10 bg-[var(--text-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity w-full">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            Continue with GitHub
          </a>
          <a href="/auth/login/google"
            className="flex items-center justify-center gap-2 h-10 bg-[var(--bg-elevated)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors w-full">
            Continue with Google
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Shell ──

interface ShellProps {
  children: React.ReactNode;
  pendingCount?: number;
}

export function Shell({ children, pendingCount }: ShellProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--text-primary)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-[var(--bg-elevated)] border-r border-[var(--border)] flex flex-col">
        <div className="h-12 flex items-center px-4 border-b border-[var(--border)]">
          <Link href="/" className="text-lg font-black tracking-tight text-[var(--text-primary)]">
            OCC
          </Link>
        </div>
        <nav className="flex-1 py-2 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item}
              active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
              pendingCount={pendingCount} />
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 shrink-0 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex items-center justify-between px-4">
          <div />
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              <Settings size={16} />
            </Link>
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 bg-[var(--border)] flex items-center justify-center text-xs font-medium text-[var(--text-secondary)]">
                {user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-[var(--bg)] p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { getMe, getFeed, approve, deny, type FeedItem } from "@/lib/api";

/* ═══════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════ */

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function toolName(raw: string): string {
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function statusColor(s: string): string {
  if (s === "pending") return "bg-amber-400";
  if (s === "approved" || s === "auto_approved") return "bg-emerald-400";
  if (s === "denied" || s === "expired") return "bg-red-400";
  return "bg-gray-300";
}

function statusLabel(s: string): string {
  if (s === "auto_approved") return "Auto";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ArgsDetails({ args }: { args: unknown }) {
  if (!args || typeof args !== "object" || Object.keys(args as Record<string, unknown>).length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="text-[11px] text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)] select-none">
        Details
      </summary>
      <pre className="mt-2 text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg)] rounded-lg p-3 overflow-auto max-h-32">
        {JSON.stringify(args, null, 2)}
      </pre>
    </details>
  );
}

/* ═══════════════════════════════════════════
   App
   ═══════════════════════════════════════════ */

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then(d => setUser(d.user)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Page><div className="flex items-center justify-center h-[60vh]"><Spinner /></div></Page>;
  if (!user) return <Login />;
  return <Feed user={user} />;
}

/* ═══════════════════════════════════════════
   Login
   ═══════════════════════════════════════════ */

function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-[320px] px-6">
        <div className="mb-10">
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--text)]">OCC</h1>
          <p className="text-[15px] text-[var(--text-secondary)] mt-1">Control plane for your AI agents</p>
        </div>
        <div className="space-y-3">
          <AuthButton provider="github" label="Continue with GitHub" />
          <AuthButton provider="google" label="Continue with Google" />
          <AuthButton provider="apple" label="Continue with Apple" />
        </div>
      </div>
    </div>
  );
}

function AuthButton({ provider, label }: { provider: string; label: string }) {
  const icons: Record<string, React.ReactNode> = {
    github: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>,
    google: <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>,
    apple: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>,
  };

  return (
    <a href={`/auth/${provider}`}
      className="flex items-center justify-center gap-2.5 w-full h-11 text-[13px] font-medium bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg hover:border-[var(--text-tertiary)] transition-colors">
      {icons[provider]}
      {label}
    </a>
  );
}

/* ═══════════════════════════════════════════
   Feed — the entire product
   ═══════════════════════════════════════════ */

function Feed({ user }: { user: { id: string; name: string; email: string; avatar: string } }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [acting, setActing] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const data = await getFeed();
      setItems(data.requests ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleApprove(id: number, mode: "once" | "always") {
    setActing(id);
    try {
      await approve(id, mode);
      setDismissed(prev => new Set(prev).add(id));
      setTimeout(() => refresh(), 300);
    } finally { setActing(null); }
  }

  async function handleDeny(id: number) {
    setActing(id);
    try {
      await deny(id, "once");
      setDismissed(prev => new Set(prev).add(id));
      setTimeout(() => refresh(), 300);
    } finally { setActing(null); }
  }

  const pending = items.filter(i => i.status === "pending");
  const resolved = items.filter(i => i.status !== "pending");

  return (
    <Page>
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--bg)]/80 backdrop-blur-xl border-b border-[var(--border-light)]">
        <div className="max-w-2xl mx-auto flex items-center justify-between h-14 px-5">
          <h1 className="text-[17px] font-bold tracking-[-0.02em]">OCC</h1>
          <div className="flex items-center gap-3">
            {pending.length > 0 && (
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {pending.length}
              </div>
            )}
            <a href="/settings" className="text-[var(--text-tertiary)] hover:text-[var(--text)] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </a>
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--border)] flex items-center justify-center text-[11px] font-semibold text-[var(--text-secondary)]">
                {user.name?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-6">
        {/* Pending */}
        {pending.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.08em] mb-4">
              Waiting
            </h2>
            <div className="space-y-2">
              {pending.map((item, i) => (
                <div
                  key={item.id}
                  className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 animate-in ${dismissed.has(item.id) ? "animate-out" : ""}`}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[var(--text)] leading-snug">
                      {item.summary || toolName(item.tool)}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[12px] font-mono text-[var(--text-tertiary)]">{item.tool}</span>
                      <span className="text-[var(--text-tertiary)]">·</span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">{timeAgo(item.createdAt)}</span>
                    </div>
                  </div>

                  <ArgsDetails args={item.args} />

                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => handleApprove(item.id, "always")}
                      disabled={acting === item.id}
                      className="h-9 px-5 text-[13px] font-semibold bg-[var(--text)] text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      Allow
                    </button>
                    <button
                      onClick={() => handleApprove(item.id, "once")}
                      disabled={acting === item.id}
                      className="h-9 px-4 text-[13px] font-medium text-[var(--text-secondary)] bg-[var(--bg)] rounded-lg hover:bg-[var(--border-light)] disabled:opacity-40 transition-colors"
                    >
                      Once
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => handleDeny(item.id)}
                      disabled={acting === item.id}
                      className="h-9 px-4 text-[13px] font-medium text-[var(--red)] hover:bg-red-50 rounded-lg disabled:opacity-40 transition-colors"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* History */}
        {resolved.length > 0 && (
          <section>
            <h2 className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.08em] mb-4">
              History
            </h2>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border-light)]">
              {resolved.map((item, i) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 animate-in"
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColor(item.status)}`} />
                  <p className="flex-1 text-[13px] text-[var(--text)] truncate min-w-0">
                    {item.summary || toolName(item.tool)}
                  </p>
                  <span className="text-[11px] text-[var(--text-tertiary)] flex-shrink-0">
                    {statusLabel(item.status)}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)] flex-shrink-0 w-8 text-right tabular-nums">
                    {timeAgo(item.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div className="text-center py-24">
            <h2 className="text-[17px] font-semibold text-[var(--text)] mb-2">No activity yet</h2>
            <p className="text-[14px] text-[var(--text-tertiary)] max-w-xs mx-auto leading-relaxed">
              Install the hook and start using Claude Code. Every action will appear here.
            </p>
            <div className="mt-6 inline-block bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-left">
              <code className="text-[12px] font-mono text-[var(--text-secondary)]">
                curl -fsSL https://agent.occ.wtf/install | bash
              </code>
            </div>
          </div>
        )}
      </main>
    </Page>
  );
}

/* ═══════════════════════════════════════════
   Layout primitives
   ═══════════════════════════════════════════ */

function Page({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[var(--bg)]">{children}</div>;
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--text)] rounded-full animate-spin" />;
}

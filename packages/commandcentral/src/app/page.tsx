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

function fullTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function toolName(raw: string): string {
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function statusDot(s: string): string {
  if (s === "pending") return "bg-amber-400";
  if (s === "approved" || s === "auto_approved") return "bg-emerald-400";
  if (s === "denied" || s === "expired") return "bg-red-400";
  return "bg-neutral-300";
}

function statusText(s: string): string {
  if (s === "auto_approved") return "Auto-approved";
  if (s === "expired") return "Expired";
  return s.charAt(0).toUpperCase() + s.slice(1);
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

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-4 h-4 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Login />;
  return <Feed user={user} />;
}

/* ═══════════════════════════════════════════
   Login
   ═══════════════════════════════════════════ */

function Login() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-[280px]">
        <h1 className="text-[32px] font-black tracking-[-0.04em] text-black leading-none">OCC</h1>
        <p className="text-[14px] text-neutral-400 mt-2 mb-8">Control plane for AI agents</p>
        <div className="space-y-2">
          <AuthBtn provider="github" label="GitHub" icon={<GithubIcon />} />
          <AuthBtn provider="google" label="Google" icon={<GoogleIcon />} />
          <AuthBtn provider="apple" label="Apple" icon={<AppleIcon />} />
        </div>
      </div>
    </div>
  );
}

function AuthBtn({ provider, label, icon }: { provider: string; label: string; icon: React.ReactNode }) {
  return (
    <a href={`/auth/login/${provider}`}
      className="flex items-center gap-3 w-full h-11 px-4 text-[13px] font-medium text-black bg-white border border-neutral-200 hover:border-neutral-400 transition-colors">
      <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
      Continue with {label}
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
  const [expanded, setExpanded] = useState<number | null>(null);

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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-20 h-12 bg-white/90 backdrop-blur-lg border-b border-neutral-100">
        <div className="max-w-xl mx-auto flex items-center justify-between h-full px-4">
          <span className="text-[15px] font-black tracking-[-0.03em] text-black">OCC</span>
          <div className="flex items-center gap-2.5">
            {pending.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {pending.length}
              </span>
            )}
            <a href="/settings" className="text-neutral-400 hover:text-black transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </a>
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-500">
                {user.name?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-5">

        {/* ── Pending ── */}
        {pending.length > 0 && (
          <section className="mb-8">
            <SectionLabel>Waiting for you</SectionLabel>
            <div className="space-y-2">
              {pending.map(item => (
                <div key={item.id}
                  className={`bg-white border border-neutral-200 p-4 transition-all ${dismissed.has(item.id) ? "opacity-0 -translate-y-1 h-0 p-0 overflow-hidden" : ""}`}>
                  <p className="text-[14px] font-medium text-black leading-snug">
                    {item.summary || toolName(item.tool)}
                  </p>
                  <p className="text-[12px] font-mono text-neutral-400 mt-1">{item.tool}</p>

                  {/* Args preview */}
                  {typeof item.args === "object" && item.args !== null && Object.keys(item.args as Record<string,unknown>).length > 0 && (
                    <div className="mt-3 bg-neutral-50 border border-neutral-100 p-3">
                      {Object.entries(item.args as Record<string, unknown>).slice(0, 4).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-[12px] leading-relaxed">
                          <span className="text-neutral-400 flex-shrink-0">{k}:</span>
                          <span className="text-neutral-600 truncate">{typeof v === "string" ? v : JSON.stringify(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-4">
                    <button onClick={() => handleApprove(item.id, "always")} disabled={acting === item.id}
                      className="h-8 px-4 text-[12px] font-semibold bg-black text-white hover:bg-neutral-800 disabled:opacity-40 transition-colors">
                      Allow
                    </button>
                    <button onClick={() => handleApprove(item.id, "once")} disabled={acting === item.id}
                      className="h-8 px-3 text-[12px] font-medium text-neutral-500 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 transition-colors">
                      Once
                    </button>
                    <div className="flex-1" />
                    <button onClick={() => handleDeny(item.id)} disabled={acting === item.id}
                      className="h-8 px-3 text-[12px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors">
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── History ── */}
        {resolved.length > 0 && (
          <section>
            <SectionLabel>Proofs</SectionLabel>
            <div className="border border-neutral-200 divide-y divide-neutral-100">
              {resolved.map(item => {
                const isOpen = expanded === item.id;
                return (
                  <div key={item.id}>
                    {/* Row */}
                    <button onClick={() => setExpanded(isOpen ? null : item.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 transition-colors">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot(item.status)}`} />
                      <span className="flex-1 text-[13px] text-black truncate">
                        {item.summary || toolName(item.tool)}
                      </span>
                      <span className="text-[11px] text-neutral-400 flex-shrink-0">{statusText(item.status)}</span>
                      <span className="text-[11px] text-neutral-300 flex-shrink-0 w-6 text-right tabular-nums">{timeAgo(item.createdAt)}</span>
                      <svg className={`w-3.5 h-3.5 text-neutral-300 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                    </button>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div className="px-4 pb-4 bg-neutral-50 border-t border-neutral-100 animate-in">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 py-4">
                          <Field label="Tool" value={item.tool} mono />
                          <Field label="Decision" value={statusText(item.status)} />
                          <Field label="Time" value={fullTime(item.createdAt)} />
                          <Field label="Source" value={item.originClient || "Claude Code"} />
                          {item.riskLane && <Field label="Category" value={item.riskLane} />}
                          {item.label && <Field label="Label" value={item.label} />}
                        </div>

                        {/* Args */}
                        {typeof item.args === "object" && item.args !== null && Object.keys(item.args as Record<string,unknown>).length > 0 && (
                          <div className="mt-2">
                            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Arguments</p>
                            <pre className="text-[11px] font-mono text-neutral-600 bg-white border border-neutral-100 p-3 overflow-auto max-h-40">
{JSON.stringify(item.args, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Empty ── */}
        {items.length === 0 && (
          <div className="text-center py-24">
            <h2 className="text-[16px] font-semibold text-black mb-2">No activity yet</h2>
            <p className="text-[13px] text-neutral-400 max-w-[260px] mx-auto leading-relaxed mb-6">
              Install the hook and start using Claude Code. Every action will appear here.
            </p>
            <code className="inline-block text-[12px] font-mono text-neutral-500 bg-neutral-50 border border-neutral-200 px-4 py-2.5">
              curl -fsSL https://agent.occ.wtf/install | bash
            </code>
          </div>
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Primitives
   ═══════════════════════════════════════════ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.08em] mb-3">{children}</h2>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">{label}</p>
      <p className={`text-[13px] text-black mt-0.5 ${mono ? "font-mono text-[12px]" : ""}`}>{value}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Icons
   ═══════════════════════════════════════════ */

function GithubIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>;
}

function GoogleIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
}

function AppleIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>;
}

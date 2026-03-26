"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { getMe, getFeed, getProofs, approve, deny, type FeedItem, type ProofEntry } from "@/lib/api";

/* ── Helpers ── */

function timeAgo(ts: string | number): string {
  const ms = Date.now() - (typeof ts === "number" ? ts : new Date(ts).getTime());
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function toolName(raw: string): string {
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function truncHash(h: string | null, len = 12): string {
  if (!h) return "—";
  return h.length > len ? h.slice(0, len) + "..." : h;
}

/* ── Page ── */

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then(d => setUser(d.user)).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-4 h-4 border-2 border-border-subtle border-t-text rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      {/* Header */}
      {user ? (
        <div className="flex items-center justify-between mb-0">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
            Hello, {user.name?.split(" ")[0] ?? "there"}.
          </h1>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-text-tertiary hover:text-text transition-colors">
              Settings
            </Link>
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-text-tertiary">
                {user.name?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-0">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
            Define what your AI does.
          </h1>
          <div className="flex items-center gap-2">
            <a href="/auth/login/github" className="text-sm text-text-tertiary hover:text-text transition-colors">Sign in</a>
          </div>
        </div>
      )}

      {/* Pending approvals */}
      {user && <PendingSection />}

      {/* Proofs */}
      {user ? <UserProofs /> : <PublicProofs />}
    </div>
  );
}

/* ── Pending Section ── */

function PendingSection() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [acting, setActing] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const data = await getFeed();
      setItems((data.requests ?? []).filter((i: FeedItem) => i.status === "pending"));
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
      setTimeout(() => refresh(), 400);
    } finally { setActing(null); }
  }

  async function handleDeny(id: number) {
    setActing(id);
    try {
      await deny(id, "once");
      setDismissed(prev => new Set(prev).add(id));
      setTimeout(() => refresh(), 400);
    } finally { setActing(null); }
  }

  const pending = items.filter(i => !dismissed.has(i.id));
  if (pending.length === 0) return null;

  return (
    <div className="mt-12">
      <h2 className="text-sm font-medium text-text-tertiary uppercase tracking-wider mb-4">
        Waiting for you
      </h2>
      <div className="border border-border-subtle bg-bg-elevated overflow-hidden divide-y divide-border-subtle">
        {pending.map(item => (
          <div key={item.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">{item.summary || toolName(item.tool)}</p>
                <code className="text-xs font-mono text-text-tertiary mt-1 block">{item.tool}</code>
              </div>
              <span className="text-[10px] text-text-tertiary shrink-0">{timeAgo(item.createdAt)}</span>
            </div>

            {typeof item.args === "object" && item.args !== null && Object.keys(item.args as Record<string, unknown>).length > 0 && (
              <div className="mt-3 bg-bg border border-border-subtle p-3">
                {Object.entries(item.args as Record<string, unknown>).slice(0, 4).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs leading-relaxed">
                    <span className="text-text-tertiary shrink-0">{k}:</span>
                    <span className="text-text-secondary truncate">{typeof v === "string" ? v : JSON.stringify(v)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => handleApprove(item.id, "always")} disabled={acting === item.id}
                className="h-9 px-5 text-xs font-medium bg-text text-bg hover:bg-text/90 disabled:opacity-40 transition-colors">
                Allow
              </button>
              <button onClick={() => handleApprove(item.id, "once")} disabled={acting === item.id}
                className="h-9 px-4 text-xs font-medium text-text-secondary bg-bg-subtle hover:bg-border transition-colors disabled:opacity-40">
                Once
              </button>
              <div className="flex-1" />
              <button onClick={() => handleDeny(item.id)} disabled={acting === item.id}
                className="h-9 px-4 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors">
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── User Proofs — identical to homepage explorer layout ── */

function UserProofs() {
  const [proofs, setProofs] = useState<ProofEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getProofs()
      .then(d => setProofs(d.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-text-tertiary uppercase tracking-wider">
          Your Proofs
        </h2>
        {proofs.length > 0 && (
          <span className="text-xs text-text-tertiary">{proofs.length} total</span>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-text-tertiary animate-pulse">Loading...</div>
      ) : proofs.length === 0 ? (
        <div className="border border-border-subtle bg-bg-elevated p-8 text-center">
          <div className="text-text-secondary">No proofs yet.</div>
          <div className="text-sm text-text-tertiary mt-1">
            Install OCC and start using Claude Code to see proofs here.
          </div>
          <code className="block mt-4 text-xs font-mono text-text-tertiary">
            curl -fsSL https://agent.occ.wtf/install | bash
          </code>
        </div>
      ) : (
        <div className="border border-border-subtle bg-bg-elevated overflow-hidden divide-y divide-border-subtle">
          {proofs.map(p => {
            const key = p.id;
            const isOpen = expanded === key;
            const allowed = p.decision.allowed;
            return (
              <div key={key}>
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full flex items-center px-4 sm:px-5 py-3.5 hover:bg-bg-subtle/40 transition-colors text-left"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className={`shrink-0 mr-2 sm:mr-3 text-text-tertiary transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}>
                    <path d="M3 1.5L7 5L3 8.5" />
                  </svg>
                  <code className="text-xs sm:text-sm font-mono text-text truncate min-w-0 flex-1">
                    {p.proofDigestB64 || `#${p.id}`}
                  </code>
                  <span className={`text-[10px] sm:text-xs font-medium shrink-0 ml-3 ${allowed ? "text-blue-600" : "text-red-500"}`}>
                    {allowed ? "Allowed" : "Denied"}
                  </span>
                  <span className="text-[10px] sm:text-xs text-text-tertiary shrink-0 ml-3 w-14 sm:w-16 text-right">
                    {timeAgo(p.timestamp)}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 sm:px-5 pb-4 pt-1 bg-bg-subtle/20">
                    <div className="space-y-3">
                      {p.proofDigestB64 && (
                        <div>
                          <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">SHA-256 Digest</div>
                          <code className="text-xs font-mono text-text break-all">{p.proofDigestB64}</code>
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                        <div>
                          <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Tool</div>
                          <code className="font-mono text-text">{p.tool}</code>
                        </div>
                        <div>
                          <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Decision</div>
                          <span className={`font-medium ${allowed ? "text-blue-600" : "text-red-500"}`}>
                            {allowed ? "Allowed" : "Denied"}
                          </span>
                        </div>
                        <div>
                          <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Time</div>
                          <span className="text-text">{new Date(p.timestamp).toLocaleString()}</span>
                        </div>
                        {p.agentId && (
                          <div>
                            <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Agent</div>
                            <span className="text-text">{p.agentId}</span>
                          </div>
                        )}
                        {p.decision.reason && (
                          <div className="col-span-2">
                            <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Reason</div>
                            <span className="text-text">{p.decision.reason}</span>
                          </div>
                        )}
                      </div>
                      {p.proofDigestB64 && (
                        <a href={`https://occ.wtf/explorer/${encodeURIComponent(p.proofDigestB64)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-500 transition-colors mt-1">
                          View full proof
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Public Proofs (not logged in) ── */

function PublicProofs() {
  return (
    <div className="mt-12">
      <div className="border border-border-subtle bg-bg-elevated p-8 text-center">
        <div className="text-text-secondary">Sign in to see your proofs.</div>
        <div className="text-sm text-text-tertiary mt-1">
          Every action your AI takes through OCC produces a proof. Sign in to view yours.
        </div>
      </div>
    </div>
  );
}

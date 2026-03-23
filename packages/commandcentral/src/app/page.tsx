"use client";

import { useEffect, useState, useCallback } from "react";
import { getPendingPermissions, getActivePermissions, approvePermission, denyPermission, revokePermission, getConnectConfig } from "@/lib/api";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

interface User { id: string; name: string; email: string; avatar: string; }
interface PendingRequest { id: number; agentId: string; tool: string; clientName: string; requestedAt: number; }
interface ActivePerm { id: number; agentId: string; tool: string; status: string; resolvedAt: number | null; proofDigest: string | null; explorerUrl: string | null; }

// ── Nav Bar (matches occ.wtf) ──
function NavBar({ user, onLogout }: { user: User | null; onLogout?: () => void }) {
  return (
    <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl border-b border-border/30">
      <div className="mx-auto max-w-3xl px-6">
        <nav className="flex h-14 items-center justify-between">
          <a href="https://occ.wtf" className="text-[18px] tracking-[-0.02em] font-black text-text">
            OCC.WTF
          </a>
          <div className="flex items-center gap-5 text-sm">
            <a href="https://occ.wtf/explorer" className="text-text-tertiary hover:text-text transition-colors">Explorer</a>
            <a href="https://occ.wtf/docs" className="text-text-tertiary hover:text-text transition-colors">Docs</a>
            {user && (
              <a href="/auth/logout" className="flex items-center">
                {user.avatar && <img src={user.avatar} className="w-6 h-6 rounded-full" alt="" />}
              </a>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

// ── Login Screen ──
function LoginScreen() {
  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={null} />
      <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 56px)" }}>
        <div className="text-center max-w-md px-6">
          <h1 className="text-5xl sm:text-6xl font-black tracking-[-0.04em] text-text leading-[1.05] mb-4">
            Control wtf<br />your AI<br />can do.
          </h1>
          <p className="text-base text-text-tertiary mb-10">Sign in to get started. Free.</p>
          <div className="space-y-3 max-w-[280px] mx-auto">
            <a href="/auth/login/google"
              className="flex items-center justify-center gap-3 w-full px-5 py-3 text-sm font-semibold rounded-xl bg-text text-bg hover:opacity-90 transition-all active:scale-[0.98]">
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </a>
            <a href="/auth/login/github"
              className="flex items-center justify-center gap-3 w-full px-5 py-3 text-sm font-semibold rounded-xl border border-border text-text hover:bg-bg-subtle transition-all active:scale-[0.98]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ──
function Dashboard({ user }: { user: User }) {
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [active, setActive] = useState<ActivePerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<Set<number>>(new Set());
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([getPendingPermissions(), getActivePermissions()]);
      setPending(p.requests);
      setActive(a.permissions);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    getConnectConfig().then(c => setMcpUrl(c.mcpUrl)).catch(() => {});
    const es = new EventSource("/api/events");
    es.onmessage = () => refresh();
    const interval = setInterval(refresh, 5000);
    return () => { es.close(); clearInterval(interval); };
  }, [refresh]);

  async function handleApprove(id: number) {
    setResolving(s => new Set(s).add(id));
    try { await approvePermission(id); await refresh(); }
    finally { setResolving(s => { const n = new Set(s); n.delete(id); return n; }); }
  }

  async function handleDeny(id: number) {
    setResolving(s => new Set(s).add(id));
    try { await denyPermission(id); await refresh(); }
    finally { setResolving(s => { const n = new Set(s); n.delete(id); return n; }); }
  }

  async function handleRevoke(agentId: string, tool: string) {
    await revokePermission(agentId, tool); await refresh();
  }

  function copyUrl() {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isEmpty = !loading && pending.length === 0 && active.length === 0;

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Hero */}
        <h1 className="text-4xl sm:text-5xl font-black tracking-[-0.04em] text-text leading-[1.1] mb-2">
          Permissions
        </h1>
        <p className="text-base text-text-tertiary mb-8">
          When your AI tries something new, it shows up here. You say yes or no.
        </p>

        {/* Connect section */}
        {isEmpty && !loading && (
          <div className="mb-12 rounded-2xl border border-border/40 bg-bg-subtle/30 p-8">
            <h2 className="text-2xl font-bold text-text mb-2">Step 1: Copy your link</h2>
            <p className="text-sm text-text-tertiary mb-5">
              This is your personal OCC link. You'll paste it into your AI tool in the next step.
            </p>
            <div className="flex items-center gap-2 mb-6">
              <code className="flex-1 text-sm font-mono bg-bg rounded-xl border border-border px-4 py-3 text-text-secondary truncate select-all">
                {mcpUrl || "Loading..."}
              </code>
              <button onClick={copyUrl}
                className="px-5 py-3 text-sm font-semibold rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all active:scale-[0.97] flex-shrink-0">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <h2 className="text-2xl font-bold text-text mb-2">Step 2: Paste it into your AI</h2>
            <p className="text-sm text-text-tertiary mb-4">
              Find your AI tool below and follow the instructions.
            </p>

            <div className="space-y-4">
              <div className="rounded-xl border border-border/40 bg-bg p-4">
                <p className="text-sm font-semibold text-text mb-1">Cursor</p>
                <p className="text-sm text-text-tertiary">Open Cursor → Settings → search "MCP" → click "Add Custom MCP" → paste your link → save.</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-bg p-4">
                <p className="text-sm font-semibold text-text mb-1">Claude Code (terminal)</p>
                <p className="text-sm text-text-tertiary">Open your terminal and run:</p>
                <code className="block mt-2 text-xs font-mono bg-bg-inset rounded-lg px-3 py-2 text-emerald-500 select-all">
                  claude mcp add occ --transport http {mcpUrl}
                </code>
              </div>
              <div className="rounded-xl border border-border/40 bg-bg p-4">
                <p className="text-sm font-semibold text-text mb-1">Other AI tools</p>
                <p className="text-sm text-text-tertiary">Look for "MCP" or "tool server" in your AI's settings. Paste your link there.</p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border/30">
              <p className="text-sm text-text-tertiary">
                <span className="font-semibold text-text">Step 3:</span> Use your AI normally. When it tries to do something new, you'll see a request here. Tap Allow or Deny — that's it.
              </p>
            </div>
          </div>
        )}

        {/* Non-empty state: small connect bar */}
        {!isEmpty && mcpUrl && (
          <div className="flex items-center gap-3 mb-8 text-xs text-text-tertiary">
            <span>Your MCP URL:</span>
            <code className="font-mono truncate max-w-[300px]">{mcpUrl}</code>
            <button onClick={copyUrl} className="hover:text-text transition-colors font-semibold">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
          </div>
        )}

        {/* Pending */}
        {pending.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-500 mb-4">
              Needs your decision
            </h2>
            {pending.map((req) => (
              <div key={req.id} className="flex items-center gap-4 py-4 border-b border-border/30 last:border-0">
                <div className="relative flex-shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping opacity-30" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-medium text-text truncate">{req.tool}</p>
                  <p className="text-[11px] text-text-tertiary">{req.clientName} &middot; {timeAgo(req.requestedAt)}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => handleApprove(req.id)} disabled={resolving.has(req.id)}
                    className="px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-40 active:scale-[0.97]">
                    Allow
                  </button>
                  <button onClick={() => handleDeny(req.id)} disabled={resolving.has(req.id)}
                    className="px-4 py-2 text-sm font-semibold rounded-xl text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 active:scale-[0.97]">
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Active */}
        {active.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-4">
              Allowed
            </h2>
            {active.map((perm) => (
              <div key={`${perm.agentId}-${perm.tool}`}
                className="flex items-center gap-4 py-3 border-b border-border/20 last:border-0">
                <div className="w-2 h-2 rounded-full bg-emerald-500/50 flex-shrink-0" />
                <p className="flex-1 text-sm font-mono text-text/70 truncate">{perm.tool}</p>
                <div className="flex items-center gap-3 flex-shrink-0 text-[11px]">
                  {perm.explorerUrl && (
                    <a href={perm.explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="text-emerald-500/60 hover:text-emerald-500 transition-colors">proof</a>
                  )}
                  <button onClick={() => handleRevoke(perm.agentId, perm.tool)}
                    className="text-text-tertiary/40 hover:text-red-400 transition-colors">revoke</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root ──
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  if (checking) return (
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="w-5 h-5 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
    </div>
  );

  if (!user) return <LoginScreen />;
  return <Dashboard user={user} />;
}

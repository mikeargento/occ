"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAllPermissions, approvePermission, denyPermission, revokePermission, getConnectConfig, type Permission } from "@/lib/api";

/* ── Types ── */
interface User { id: string; name: string; email: string; avatar: string; }

/* ── The whole app is one page ── */

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/auth/me").then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null)).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Shell><Loader /></Shell>;
  if (!user) return <Shell><SignIn /></Shell>;
  return <Shell user={user}><Main /></Shell>;
}

/* ── Shell: consistent frame ── */

function Shell({ user, children }: { user?: User | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="h-11 px-5 flex items-center justify-between bg-white border-b border-black/5 sticky top-0 z-10">
        <span className="text-[14px] font-black tracking-[-0.02em]">OCC</span>
        <div className="flex items-center gap-4">
          <a href="https://occ.wtf/docs" className="text-[11px] text-black/30 hover:text-black/60">Docs</a>
          {user?.avatar && <a href="/auth/logout"><img src={user.avatar} className="w-5 h-5 rounded-full opacity-60 hover:opacity-100" alt="" /></a>}
        </div>
      </header>
      {children}
    </div>
  );
}

/* ── Sign in ── */

function SignIn() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 44px)" }}>
      <div className="text-center px-6 -mt-16">
        <p className="text-[42px] font-black tracking-[-0.04em] text-black leading-[1.1] mb-3">
          Control wtf<br/>your AI can do.
        </p>
        <p className="text-[14px] text-black/40 mb-8">Sign in to start</p>
        <a href="/auth/login/github"
          className="inline-flex items-center gap-2.5 h-10 px-6 text-[13px] font-semibold rounded-lg bg-black text-white hover:bg-black/80 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          Sign in with GitHub
        </a>
      </div>
    </div>
  );
}

/* ── Main: everything on one screen ── */

function Main() {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [mcpUrl, setMcpUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try { const { permissions } = await getAllPermissions(); setPerms(permissions); }
    catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    getConnectConfig().then(c => setMcpUrl(c.mcpUrl)).catch(() => {});
    const es = new EventSource("/api/events");
    es.onmessage = () => refresh();
    const iv = setInterval(refresh, 4000);
    return () => { es.close(); clearInterval(iv); };
  }, [refresh]);

  const pending = useMemo(() => perms.filter(p => p.status === "pending"), [perms]);
  const active = useMemo(() => perms.filter(p => p.status === "approved"), [perms]);

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id); try { await fn(); await refresh(); } finally { setBusy(null); }
  }

  const copy = () => { navigator.clipboard.writeText(mcpUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (loading) return <Loader />;

  return (
    <div className="max-w-xl mx-auto px-4 py-6">

      {/* ── Connection bar ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-1.5 h-1.5 rounded-full ${active.length > 0 ? "bg-emerald-500" : "bg-black/15"}`} />
          <span className="text-[11px] text-black/40 font-medium">
            {active.length > 0 ? `${active.length} tool${active.length === 1 ? "" : "s"} authorized` : "No tools authorized yet"}
          </span>
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1 h-9 flex items-center px-3 rounded-lg bg-white border border-black/8 overflow-hidden">
            <span className="text-[11px] font-mono text-black/30 truncate select-all">{mcpUrl}</span>
          </div>
          <button onClick={copy}
            className="h-9 px-4 text-[11px] font-semibold rounded-lg bg-black text-white hover:bg-black/80 transition-colors flex-shrink-0">
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="text-[11px] text-black/25 mt-2">Paste into Cursor, Claude Code, or any MCP-compatible AI</p>
      </div>

      {/* ── Pending requests ── */}
      {pending.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-semibold text-black/40 uppercase tracking-[0.06em] mb-2.5">
            Needs your decision
          </p>
          <div className="space-y-2">
            {pending.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-black/8 p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-black truncate font-mono">{p.tool}</p>
                  <p className="text-[11px] text-black/35 mt-0.5">{p.clientName} wants to use this</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => act(p.id, () => approvePermission(p.id))} disabled={busy === p.id}
                    className="h-8 px-4 text-[12px] font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all active:scale-95 flex items-center gap-1.5">
                    {busy === p.id && <Spin />}
                    Allow
                  </button>
                  <button onClick={() => act(p.id, () => denyPermission(p.id))} disabled={busy === p.id}
                    className="h-8 px-4 text-[12px] font-medium rounded-lg bg-black/5 text-black/60 hover:bg-black/10 disabled:opacity-40 transition-all active:scale-95">
                    Block
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active tools ── */}
      {active.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-semibold text-black/40 uppercase tracking-[0.06em] mb-2.5">
            Authorized
          </p>
          <div className="bg-white rounded-xl border border-black/8 divide-y divide-black/5">
            {active.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 group">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-[13px] font-mono text-black/70 flex-1 truncate">{p.tool}</span>
                <button onClick={() => act(p.id, () => revokePermission(p.agentId, p.tool))}
                  className="text-[11px] text-black/20 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                  revoke
                </button>
                {p.explorerUrl && (
                  <a href={p.explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-mono text-black/15 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">
                    proof
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {pending.length === 0 && active.length === 0 && (
        <div className="text-center py-20">
          <p className="text-[14px] text-black/50 mb-1">Waiting for your AI...</p>
          <p className="text-[12px] text-black/25 max-w-[260px] mx-auto">Copy the link above, paste it into your AI tool, and start using it. Requests appear here automatically.</p>
        </div>
      )}
    </div>
  );
}

/* ── Tiny components ── */

function Loader() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 44px)" }}>
      <div className="w-4 h-4 border-2 border-black/10 border-t-black/50 rounded-full animate-spin" />
    </div>
  );
}

function Spin() {
  return <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />;
}

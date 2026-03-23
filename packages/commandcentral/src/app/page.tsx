"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAllPermissions, approvePermission, denyPermission, revokePermission, getConnectConfig, getAuthorizationChain, type Permission, type ChainEntry } from "@/lib/api";

/* ── Helpers ── */

function timeLabel(ts: number): string {
  const now = Date.now();
  const s = Math.floor((now - ts) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Types ── */

interface User { id: string; name: string; email: string; avatar: string; }
type View = "inbox" | "allowed" | "denied" | "all" | "connect";

/* ── Login ── */

function Login() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <h1 className="text-[clamp(2rem,7vw,3.5rem)] font-black tracking-[-0.04em] text-gray-900 leading-[1.05] text-center mb-2">
        Control wtf<br/>your AI can do.
      </h1>
      <p className="text-[15px] text-gray-400 mb-10 text-center">Sign in to get started</p>
      <div className="w-full max-w-xs space-y-2.5">
        <a href="/auth/login/github" className="flex items-center justify-center gap-3 w-full h-11 text-[14px] font-medium rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          Continue with GitHub
        </a>
        <a href="/auth/login/google" className="flex items-center justify-center gap-3 w-full h-11 text-[14px] font-medium rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </a>
      </div>
      <p className="text-[11px] text-gray-300 mt-8">
        <a href="https://occ.wtf" className="hover:text-gray-500">occ.wtf</a>
      </p>
    </div>
  );
}

/* ── Nav ── */

function Nav({ user, view, onViewChange, pendingCount }: {
  user: User | null; view: View;
  onViewChange: (v: View) => void; pendingCount: number;
}) {
  return (
    <header className="h-12 px-4 flex items-center justify-between bg-white border-b border-gray-100 flex-shrink-0">
      <div className="flex items-center gap-6">
        <a href="https://occ.wtf" className="text-[15px] font-black tracking-[-0.02em] text-gray-900">OCC</a>
        {user && (
          <nav className="flex items-center gap-1">
            <NavTab active={view === "inbox"} onClick={() => onViewChange("inbox")}
              label="Inbox" count={pendingCount} />
            <NavTab active={view === "allowed"} onClick={() => onViewChange("allowed")} label="Allowed" />
            <NavTab active={view === "denied"} onClick={() => onViewChange("denied")} label="Blocked" />
            <NavTab active={view === "connect"} onClick={() => onViewChange("connect")} label="Connect" />
          </nav>
        )}
      </div>
      <div className="flex items-center gap-4">
        <a href="https://occ.wtf/explorer" className="text-[12px] text-gray-400 hover:text-gray-600 hidden sm:block">Explorer</a>
        <a href="https://occ.wtf/docs" className="text-[12px] text-gray-400 hover:text-gray-600 hidden sm:block">Docs</a>
        {user?.avatar && <a href="/auth/logout"><img src={user.avatar} className="w-6 h-6 rounded-full" alt="" /></a>}
      </div>
    </header>
  );
}

function NavTab({ active, onClick, label, count }: {
  active: boolean; onClick: () => void; label: string; count?: number;
}) {
  return (
    <button onClick={onClick} className={`px-3 h-7 text-[12px] font-medium rounded-md transition-colors flex items-center gap-1.5 ${
      active ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
    }`}>
      {label}
      {count !== undefined && count > 0 && (
        <span className={`text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center ${
          active ? "bg-white/20" : "bg-blue-500 text-white"
        }`}>{count}</span>
      )}
    </button>
  );
}

/* ── Permission Row ── */

function PermRow({ perm, onApprove, onDeny, onRevoke, busy }: {
  perm: Permission;
  onApprove: () => void; onDeny: () => void; onRevoke: () => void;
  busy: boolean;
}) {
  const isPending = perm.status === "pending";
  const isAllowed = perm.status === "approved";

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 group ${
      isPending ? "bg-blue-50/30" : ""
    }`}>
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
        isPending ? "bg-blue-500" : isAllowed ? "bg-emerald-500" : "bg-gray-300"
      }`} />

      {/* Tool name + client */}
      <div className="flex-1 min-w-0">
        <span className={`text-[13px] font-mono block truncate ${isPending ? "font-semibold text-gray-900" : "text-gray-600"}`}>
          {perm.tool}
        </span>
        <span className="text-[11px] text-gray-400 block truncate">
          {perm.clientName} · {timeLabel(perm.resolvedAt ?? perm.requestedAt)}
        </span>
      </div>

      {/* Actions — always visible, not hidden in detail pane */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isPending && (
          <>
            <button onClick={onApprove} disabled={busy}
              className="h-7 px-3 text-[11px] font-semibold rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors flex items-center gap-1">
              {busy ? <Spinner /> : null}
              Allow
            </button>
            <button onClick={onDeny} disabled={busy}
              className="h-7 px-3 text-[11px] font-medium rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-colors">
              Block
            </button>
          </>
        )}
        {isAllowed && (
          <button onClick={onRevoke} disabled={busy}
            className="h-7 px-3 text-[11px] font-medium rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
            Revoke
          </button>
        )}
        {perm.explorerUrl && (
          <a href={perm.explorerUrl} target="_blank" rel="noopener noreferrer"
            className="h-7 px-2 text-[10px] font-mono rounded-md text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors flex items-center opacity-0 group-hover:opacity-100">
            proof
          </a>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />;
}

/* ── Connect page ── */

function Connect({ mcpUrl }: { mcpUrl: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(mcpUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="max-w-lg mx-auto px-6 py-16">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect your AI</h2>
      <p className="text-[14px] text-gray-400 mb-8">One link. Paste it into your AI tool. That&apos;s it.</p>

      <div className="flex gap-2 mb-10">
        <input readOnly value={mcpUrl}
          className="flex-1 h-10 text-[12px] font-mono bg-gray-50 rounded-lg border border-gray-200 px-3 text-gray-600 select-all truncate" />
        <button onClick={copy}
          className="h-10 px-5 text-[13px] font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 flex-shrink-0 transition-colors min-w-[80px]">
          {copied ? "✓" : "Copy"}
        </button>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-gray-150 p-5">
          <p className="text-[14px] font-semibold text-gray-900 mb-1">Cursor</p>
          <p className="text-[13px] text-gray-500">Settings → search &ldquo;MCP&rdquo; → Add Custom MCP → paste → save</p>
        </div>
        <div className="rounded-xl border border-gray-150 p-5">
          <p className="text-[14px] font-semibold text-gray-900 mb-1">Claude Code</p>
          <code className="block text-[12px] font-mono bg-gray-900 text-emerald-400 rounded-lg px-3 py-2.5 mt-2 select-all break-all">
            claude mcp add occ --transport http {mcpUrl}
          </code>
        </div>
        <div className="rounded-xl border border-gray-150 p-5">
          <p className="text-[14px] font-semibold text-gray-900 mb-1">Windsurf / Other</p>
          <p className="text-[13px] text-gray-500">Find &ldquo;MCP&rdquo; in your AI&apos;s settings. Paste your link.</p>
        </div>
      </div>
    </div>
  );
}

/* ── Empty state ── */

function Empty({ view, onConnect }: { view: View; onConnect: () => void }) {
  if (view === "inbox") return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </div>
      <p className="text-[15px] font-medium text-gray-900 mb-1">No requests yet</p>
      <p className="text-[13px] text-gray-400 max-w-[280px] mb-4">Connect your AI and start using it. When it needs a new ability, it&apos;ll show up here.</p>
      <button onClick={onConnect} className="text-[13px] font-semibold text-gray-900 hover:underline">Connect AI →</button>
    </div>
  );
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-[13px] text-gray-300">Nothing here</p>
    </div>
  );
}

/* ── Dashboard ── */

function Dashboard({ user }: { user: User }) {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [view, setView] = useState<View>("inbox");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [mcpUrl, setMcpUrl] = useState("");

  const refresh = useCallback(async () => {
    try {
      const { permissions } = await getAllPermissions();
      setPerms(permissions);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    getConnectConfig().then(c => setMcpUrl(c.mcpUrl)).catch(() => {});
    const es = new EventSource("/api/events");
    es.onmessage = () => refresh();
    const iv = setInterval(refresh, 5000);
    return () => { es.close(); clearInterval(iv); };
  }, [refresh]);

  const pending = useMemo(() => perms.filter(p => p.status === "pending"), [perms]);
  const allowed = useMemo(() => perms.filter(p => p.status === "approved"), [perms]);
  const denied = useMemo(() => perms.filter(p => p.status === "denied" || p.status === "revoked"), [perms]);

  const filtered = view === "inbox" ? pending : view === "allowed" ? allowed : view === "denied" ? denied : view === "all" ? perms : [];

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); await refresh(); } finally { setBusy(null); }
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <Nav user={user} view={view} onViewChange={setView} pendingCount={pending.length} />

      <div className="flex-1 overflow-y-auto">
        {view === "connect" ? (
          <Connect mcpUrl={mcpUrl} />
        ) : loading ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <Empty view={view} onConnect={() => setView("connect")} />
        ) : (
          <div className="max-w-2xl mx-auto">
            {filtered.map(p => (
              <PermRow key={p.id} perm={p} busy={busy === p.id}
                onApprove={() => act(p.id, () => approvePermission(p.id))}
                onDeny={() => act(p.id, () => denyPermission(p.id))}
                onRevoke={() => act(p.id, () => revokePermission(p.agentId, p.tool))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Root ── */

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/auth/me").then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null)).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" /></div>;
  if (!user) return <Login />;
  return <Dashboard user={user} />;
}

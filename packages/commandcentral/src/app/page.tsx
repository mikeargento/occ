"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAllPermissions, approvePermission, denyPermission, revokePermission, getConnectConfig, getAuthorizationChain, type Permission, type ChainEntry } from "@/lib/api";

/* ── Helpers ── */

function timeLabel(ts: number): string {
  const now = Date.now();
  const s = Math.floor((now - ts) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusColor(status: string) {
  if (status === "pending") return "bg-blue-500";
  if (status === "approved") return "bg-emerald-500";
  return "bg-red-400";
}

function statusLabel(status: string) {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Allowed";
  if (status === "denied") return "Denied";
  return "Revoked";
}

/* ── Types ── */

interface User { id: string; name: string; email: string; avatar: string; }
type Tab = "inbox" | "allowed" | "denied" | "all";

/* ── Login ── */

function Login() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav user={null} />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center w-full max-w-sm">
          <h1 className="text-[clamp(2.5rem,8vw,4rem)] font-black tracking-[-0.04em] text-gray-900 leading-[1.05] mb-3">
            Control wtf<br/>your AI<br/>can do.
          </h1>
          <p className="text-[15px] text-gray-400 mb-10">Free forever. Sign in to start.</p>
          <div className="space-y-2.5">
            <AuthButton href="/auth/login/google" label="Continue with Google"
              icon={<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>} />
            <AuthButton href="/auth/login/github" label="Continue with GitHub"
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthButton({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a href={href} className="flex items-center justify-center gap-3 w-full h-11 text-[13px] font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
      {icon}{label}
    </a>
  );
}

/* ── Nav ── */

function Nav({ user }: { user: User | null }) {
  return (
    <header className="h-14 px-5 flex items-center justify-between border-b border-gray-100 bg-white flex-shrink-0">
      <a href="https://occ.wtf" className="text-[16px] font-black tracking-[-0.02em] text-gray-900">OCC.WTF</a>
      <div className="flex items-center gap-5">
        <a href="https://occ.wtf/explorer" className="text-[13px] text-gray-400 hover:text-gray-700 transition-colors hidden sm:block">Explorer</a>
        <a href="https://occ.wtf/docs" className="text-[13px] text-gray-400 hover:text-gray-700 transition-colors hidden sm:block">Docs</a>
        {user?.avatar && (
          <a href="/auth/logout" title="Sign out"><img src={user.avatar} className="w-7 h-7 rounded-full" alt="" /></a>
        )}
      </div>
    </header>
  );
}

/* ── Sidebar ── */

function Sidebar({ tab, setTab, counts }: {
  tab: Tab | "setup"; setTab: (t: Tab | "setup") => void;
  counts: { pending: number; allowed: number; denied: number; total: number };
}) {
  const items: { id: Tab | "setup"; label: string; count?: number }[] = [
    { id: "inbox", label: "Inbox", count: counts.pending || undefined },
    { id: "allowed", label: "Allowed", count: counts.allowed || undefined },
    { id: "denied", label: "Denied", count: counts.denied || undefined },
    { id: "all", label: "All", count: counts.total || undefined },
    { id: "setup", label: "Connect AI" },
  ];

  return (
    <nav className="w-[200px] flex-shrink-0 hidden md:block pt-3 pl-3 pr-1">
      {items.map(item => (
        <button key={item.id} onClick={() => setTab(item.id)}
          className={`w-full flex items-center justify-between px-4 h-8 rounded-full text-[13px] mb-0.5 transition-colors ${
            tab === item.id ? "bg-blue-100 text-blue-800 font-semibold" : "text-gray-600 hover:bg-gray-100"
          }`}>
          <span>{item.label}</span>
          {item.count !== undefined && (
            <span className={`text-[11px] ${tab === item.id ? "text-blue-600" : "text-gray-400"}`}>{item.count}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

/* ── Permission Row ── */

function PermRow({ perm, isSelected, onClick }: { perm: Permission; isSelected: boolean; onClick: () => void }) {
  const isPending = perm.status === "pending";
  return (
    <button onClick={onClick}
      className={`w-full text-left flex items-center h-10 px-4 gap-3 border-b border-gray-50 transition-colors ${
        isSelected ? "bg-blue-50" : "hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
      }`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isPending ? "bg-blue-500" : "bg-transparent"}`} />
      <span className={`w-24 text-[13px] truncate flex-shrink-0 ${isPending ? "font-semibold text-gray-900" : "text-gray-400"}`}>
        {perm.clientName}
      </span>
      <span className={`flex-1 text-[13px] truncate ${isPending ? "text-gray-900" : "text-gray-500"}`}>
        <span className="font-mono">{perm.tool}</span>
      </span>
      <span className={`w-14 text-right text-[11px] flex-shrink-0 ${isPending ? "text-gray-900 font-medium" : "text-gray-300"}`}>
        {timeLabel(perm.resolvedAt ?? perm.requestedAt)}
      </span>
    </button>
  );
}

/* ── Detail Pane ── */

function Detail({ perm, onApprove, onDeny, onRevoke, busy }: {
  perm: Permission; onApprove: () => void; onDeny: () => void; onRevoke: () => void; busy: boolean;
}) {
  const [chain, setChain] = useState<ChainEntry[]>([]);

  useEffect(() => {
    if (perm.status !== "pending" && perm.agentId && perm.tool) {
      getAuthorizationChain(perm.agentId, perm.tool).then(r => setChain(r.chain)).catch(() => {});
    }
  }, [perm.agentId, perm.tool, perm.status]);

  return (
    <div className="flex-1 bg-white overflow-y-auto border-l border-gray-100">
      <div className="max-w-xl mx-auto px-8 py-8">
        {/* From / metadata */}
        <div className="mb-6 pb-6 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 font-mono leading-tight">{perm.tool}</h2>
              <p className="text-[13px] text-gray-400 mt-1">
                from <span className="text-gray-600 font-medium">{perm.clientName}</span> &middot; {new Date(perm.requestedAt).toLocaleString()}
              </p>
            </div>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
              perm.status === "pending" ? "bg-blue-50 text-blue-600" :
              perm.status === "approved" ? "bg-emerald-50 text-emerald-600" :
              "bg-red-50 text-red-500"
            }`}>
              {statusLabel(perm.status)}
            </span>
          </div>
        </div>

        {/* Body */}
        {perm.status === "pending" && (
          <div className="mb-8">
            <p className="text-[14px] text-gray-600 leading-relaxed mb-6">
              Your AI tried to use <strong className="font-mono text-gray-900">{perm.tool}</strong> and was blocked because no authorization object exists for it.
            </p>
            <div className="flex gap-2">
              <button onClick={onApprove} disabled={busy}
                className="h-9 px-5 text-[13px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2">
                {busy && <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {busy ? "Signing..." : "Create authorization"}
              </button>
              <button onClick={onDeny} disabled={busy}
                className="h-9 px-5 text-[13px] font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                Deny
              </button>
            </div>
          </div>
        )}

        {perm.status === "approved" && (
          <div className="mb-8">
            <p className="text-[14px] text-gray-600 leading-relaxed mb-6">
              An authorization object exists for <strong className="font-mono text-gray-900">{perm.tool}</strong>. Every execution references this object — the proof that authorized it and the record that it happened are the same chain.
            </p>
            <button onClick={onRevoke} disabled={busy}
              className="h-9 px-5 text-[13px] font-medium rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 disabled:opacity-40 transition-colors flex items-center gap-2">
              {busy && <div className="w-3 h-3 border-2 border-gray-300/40 border-t-gray-500 rounded-full animate-spin" />}
              {busy ? "Revoking..." : "Revoke authorization"}
            </button>
          </div>
        )}

        {(perm.status === "denied" || perm.status === "revoked") && (
          <p className="text-[14px] text-gray-600 leading-relaxed mb-8">
            No authorization object exists for <strong className="font-mono text-gray-900">{perm.tool}</strong>. Execution is not reachable.
          </p>
        )}

        {/* Authorization chain */}
        {chain.length > 0 && (
          <div className="pt-6 border-t border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Authorization chain</p>
            <div className="space-y-2">
              {chain.map((entry, i) => (
                <div key={entry.id} className="flex items-center gap-3 text-[12px]">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    entry.type === "authorization" ? "bg-emerald-500" : "bg-red-400"
                  }`} />
                  <span className="text-gray-500 font-mono truncate flex-1">
                    {entry.type === "authorization" ? "Authorization" : "Revocation"} — {entry.proofDigest?.slice(0, 16)}...
                  </span>
                  <span className="text-gray-300 flex-shrink-0">{timeLabel(entry.createdAt)}</span>
                  {entry.explorerUrl && (
                    <a href={entry.explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="text-blue-500 hover:underline flex-shrink-0">proof</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single proof link (for pending/denied without chain) */}
        {chain.length === 0 && perm.explorerUrl && (
          <div className="pt-6 border-t border-gray-100">
            <a href={perm.explorerUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-blue-600 hover:underline">
              View proof ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Empty States ── */

function EmptyInbox({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-white">
      <div className="text-center px-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-50 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>
        </div>
        <p className="text-[15px] font-medium text-gray-900 mb-1">Your inbox is empty</p>
        <p className="text-[13px] text-gray-400 mb-5 max-w-[260px] mx-auto">Connect an AI tool and start using it. When it needs a new ability, a request will appear here.</p>
        <button onClick={onSetup} className="text-[13px] font-semibold text-blue-600 hover:text-blue-700">Connect an AI →</button>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex-1 flex items-center justify-center bg-white border-l border-gray-100">
      <p className="text-[13px] text-gray-300">Select a permission</p>
    </div>
  );
}

/* ── Setup ── */

function Setup({ mcpUrl }: { mcpUrl: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(mcpUrl); setCopied(true); setTimeout(() => setCopied(false), 2e3); };
  return (
    <div className="flex-1 bg-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-8 py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Connect your AI</h2>
        <p className="text-[13px] text-gray-400 mb-8">Copy your link. Paste it into your AI tool. Done.</p>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block mb-2">Your OCC link</label>
        <div className="flex gap-2 mb-8">
          <input readOnly value={mcpUrl} className="flex-1 h-10 text-[13px] font-mono bg-gray-50 rounded-lg border border-gray-200 px-3 text-gray-600 select-all" />
          <button onClick={copy} className="h-10 px-5 text-[13px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex-shrink-0">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div className="space-y-3">
          <SetupCard title="Cursor" body="Settings → search &ldquo;MCP&rdquo; → Add Custom MCP → paste your link → save." />
          <SetupCard title="Claude Code" body="">
            <p className="text-[13px] text-gray-500 mb-2">Run in your terminal:</p>
            <code className="block text-[12px] font-mono bg-gray-900 text-emerald-400 rounded-lg px-3 py-2 select-all">claude mcp add occ --transport http {mcpUrl}</code>
          </SetupCard>
          <SetupCard title="Other" body='Look for &ldquo;MCP&rdquo; or &ldquo;tool server&rdquo; in your AI&apos;s settings. Paste your link.' />
        </div>
      </div>
    </div>
  );
}

function SetupCard({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-[13px] font-semibold text-gray-900 mb-1">{title}</p>
      {body && <p className="text-[13px] text-gray-500" dangerouslySetInnerHTML={{ __html: body }} />}
      {children}
    </div>
  );
}

/* ── App ── */

function Dashboard({ user }: { user: User }) {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [tab, setTab] = useState<Tab | "setup">("inbox");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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

  const counts = useMemo(() => ({
    pending: perms.filter(p => p.status === "pending").length,
    allowed: perms.filter(p => p.status === "approved").length,
    denied: perms.filter(p => p.status === "denied" || p.status === "revoked").length,
    total: perms.length,
  }), [perms]);

  const filtered = useMemo(() => {
    if (tab === "inbox") return perms.filter(p => p.status === "pending");
    if (tab === "allowed") return perms.filter(p => p.status === "approved");
    if (tab === "denied") return perms.filter(p => p.status === "denied" || p.status === "revoked");
    if (tab === "all") return perms;
    return [];
  }, [perms, tab]);

  const selected = perms.find(p => p.id === selectedId) ?? null;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await refresh(); setSelectedId(null); } finally { setBusy(false); }
  }

  return (
    <div className="h-screen flex flex-col bg-[#f6f8fc]">
      <Nav user={user} />

      {/* Mobile tabs */}
      <div className="md:hidden flex items-center gap-1 px-3 h-10 bg-white border-b border-gray-100 overflow-x-auto flex-shrink-0">
        {(["inbox","allowed","denied","all","setup"] as (Tab|"setup")[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelectedId(null); }}
            className={`px-3 py-1 text-[12px] font-medium rounded-full whitespace-nowrap ${
              tab === t ? "bg-blue-100 text-blue-700" : "text-gray-500"
            }`}>
            {t === "inbox" ? `Inbox${counts.pending ? ` (${counts.pending})` : ""}` :
             t === "setup" ? "Connect" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar tab={tab} setTab={(t) => { setTab(t); setSelectedId(null); }} counts={counts} />

        {tab === "setup" ? <Setup mcpUrl={mcpUrl} /> : (
          <>
            {/* List */}
            <div className={`w-full md:w-[420px] bg-white overflow-y-auto flex-shrink-0 ${selected ? "hidden md:block" : ""}`}>
              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                tab === "inbox" && perms.length === 0 ? (
                  <EmptyInbox onSetup={() => setTab("setup")} />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-[13px] text-gray-300">
                      {tab === "inbox" ? "All caught up" : `No ${tab} permissions`}
                    </p>
                  </div>
                )
              ) : (
                filtered.map(p => (
                  <PermRow key={p.id} perm={p} isSelected={selectedId === p.id} onClick={() => setSelectedId(p.id)} />
                ))
              )}
            </div>

            {/* Detail */}
            {selected ? (
              <Detail perm={selected} busy={busy}
                onApprove={() => act(() => approvePermission(selected.id))}
                onDeny={() => act(() => denyPermission(selected.id))}
                onRevoke={() => act(() => revokePermission(selected.agentId, selected.tool))} />
            ) : (
              <div className="hidden md:flex flex-1"><EmptyDetail /></div>
            )}

            {/* Mobile detail overlay */}
            {selected && (
              <div className="md:hidden fixed inset-0 z-30 bg-white overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-100 px-4 h-12 flex items-center z-10">
                  <button onClick={() => setSelectedId(null)} className="text-[13px] text-blue-600 font-medium">← Back</button>
                </div>
                <Detail perm={selected} busy={busy}
                  onApprove={() => act(() => approvePermission(selected.id))}
                  onDeny={() => act(() => denyPermission(selected.id))}
                  onRevoke={() => act(() => revokePermission(selected.agentId, selected.tool))} />
              </div>
            )}
          </>
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

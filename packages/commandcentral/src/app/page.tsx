"use client";

import { useEffect, useState, useCallback } from "react";
import { getPendingPermissions, getActivePermissions, approvePermission, denyPermission, revokePermission, getConnectConfig } from "@/lib/api";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface User { id: string; name: string; email: string; avatar: string; }
interface PermItem {
  id: number; agentId: string; tool: string; clientName: string;
  requestedAt: number; resolvedAt: number | null; status: "pending" | "approved" | "denied" | "revoked";
  proofDigest: string | null; explorerUrl: string | null;
}

// ── Login ──
function LoginScreen() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center justify-between px-6 h-14 border-b border-gray-200">
        <span className="text-[17px] tracking-[-0.02em] font-black text-gray-900">OCC.WTF</span>
        <div className="flex items-center gap-5 text-[13px]">
          <a href="https://occ.wtf/explorer" className="text-gray-500 hover:text-gray-900 transition-colors">Explorer</a>
          <a href="https://occ.wtf/docs" className="text-gray-500 hover:text-gray-900 transition-colors">Docs</a>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h1 className="text-5xl sm:text-6xl font-black tracking-[-0.04em] text-gray-900 leading-[1.05] mb-4">
            Control wtf<br />your AI<br />can do.
          </h1>
          <p className="text-base text-gray-500 mb-10">Sign in to get started. Free.</p>
          <div className="space-y-3 max-w-[300px] mx-auto">
            <a href="/auth/login/google"
              className="flex items-center justify-center gap-3 w-full px-5 py-3 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98] shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign in with Google
            </a>
            <a href="/auth/login/github"
              className="flex items-center justify-center gap-3 w-full px-5 py-3 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98] shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#24292f"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              Sign in with GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inbox ──
type Filter = "all" | "pending" | "allowed" | "denied";

function Inbox({ user }: { user: User }) {
  const [items, setItems] = useState<PermItem[]>([]);
  const [selected, setSelected] = useState<PermItem | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [pRes, aRes] = await Promise.all([getPendingPermissions(), getActivePermissions()]);
      const pending: PermItem[] = pRes.requests.map((r: any) => ({
        ...r, status: "pending" as const, resolvedAt: null, proofDigest: null, explorerUrl: null,
      }));
      const active: PermItem[] = aRes.permissions.map((r: any) => ({
        ...r, requestedAt: r.resolvedAt ?? Date.now(), clientName: "",
      }));
      setItems([...pending, ...active]);
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

  async function handleApprove() {
    if (!selected || selected.status !== "pending") return;
    setResolving(true);
    try { await approvePermission(selected.id); await refresh(); setSelected(null); }
    finally { setResolving(false); }
  }

  async function handleDeny() {
    if (!selected || selected.status !== "pending") return;
    setResolving(true);
    try { await denyPermission(selected.id); await refresh(); setSelected(null); }
    finally { setResolving(false); }
  }

  async function handleRevoke() {
    if (!selected || selected.status !== "approved") return;
    setResolving(true);
    try { await revokePermission(selected.agentId, selected.tool); await refresh(); setSelected(null); }
    finally { setResolving(false); }
  }

  function copyUrl() {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filtered = items.filter(i => {
    if (filter === "pending") return i.status === "pending";
    if (filter === "allowed") return i.status === "approved";
    if (filter === "denied") return i.status === "denied" || i.status === "revoked";
    return true;
  });

  const pendingCount = items.filter(i => i.status === "pending").length;
  const isEmpty = !loading && items.length === 0;

  return (
    <div className="min-h-screen bg-[#f6f8fc] flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 h-16 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[18px] tracking-[-0.02em] font-black text-gray-900">OCC</span>
          {pendingCount > 0 && (
            <span className="text-xs font-medium bg-red-500 text-white px-2 py-0.5 rounded-full">{pendingCount}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <a href="https://occ.wtf/explorer" className="text-[13px] text-gray-500 hover:text-gray-700 transition-colors hidden sm:block">Explorer</a>
          <a href="https://occ.wtf/docs" className="text-[13px] text-gray-500 hover:text-gray-700 transition-colors hidden sm:block">Docs</a>
          <button onClick={() => setShowSetup(!showSetup)}
            className="text-[13px] font-medium text-blue-600 hover:text-blue-700 transition-colors">
            {showSetup ? "Close" : "Connect AI"}
          </button>
          <a href="/auth/logout" title="Sign out">
            {user.avatar ? <img src={user.avatar} className="w-8 h-8 rounded-full border border-gray-200" alt="" /> : <span className="text-[13px] text-gray-500">Sign out</span>}
          </a>
        </div>
      </header>

      {/* Setup banner */}
      {showSetup && (
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-4">
          <div className="max-w-2xl mx-auto">
            <p className="text-sm font-medium text-gray-900 mb-1">Your OCC link</p>
            <p className="text-xs text-gray-500 mb-3">Paste this into your AI tool's settings.</p>
            <div className="flex items-center gap-2 mb-3">
              <input readOnly value={mcpUrl} className="flex-1 text-sm font-mono bg-white rounded-lg border border-gray-300 px-3 py-2 text-gray-700 select-all" />
              <button onClick={copyUrl} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all flex-shrink-0">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              <p><strong>Cursor:</strong> Settings → search "MCP" → Add Custom MCP → paste</p>
              <p><strong>Claude Code:</strong> <code className="bg-white px-1 rounded text-blue-700">claude mcp add occ --transport http {mcpUrl}</code></p>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 h-12 bg-white border-b border-gray-200 flex-shrink-0">
        {(["all", "pending", "allowed", "denied"] as Filter[]).map(f => (
          <button key={f} onClick={() => { setFilter(f); setSelected(null); }}
            className={`px-3 py-1.5 text-[13px] font-medium rounded-full transition-colors ${
              filter === f
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}>
            {f === "all" ? "All" :
             f === "pending" ? `Pending${pendingCount ? ` (${pendingCount})` : ""}` :
             f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: inbox list */}
        <div className={`w-full md:w-[420px] bg-white md:border-r md:border-gray-200 overflow-y-auto flex-shrink-0 ${selected ? "hidden md:block" : ""}`}>

          {loading && (
            <div className="flex justify-center py-20">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
          )}

          {isEmpty && !loading && (
            <div className="text-center py-20 px-8">
              <svg className="mx-auto mb-4 text-gray-300" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
              </svg>
              <p className="text-sm font-medium text-gray-900 mb-1">No permissions yet</p>
              <p className="text-xs text-gray-500 mb-4">Connect your AI tool and start using it.</p>
              <button onClick={() => setShowSetup(true)} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                Get started →
              </button>
            </div>
          )}

          {!loading && filtered.length === 0 && items.length > 0 && (
            <div className="text-center py-20 px-8">
              <p className="text-sm text-gray-500">No {filter} items</p>
            </div>
          )}

          {filtered.map(item => {
            const isPending = item.status === "pending";
            const isSelected = selected?.id === item.id && selected?.tool === item.tool;
            return (
              <button key={`${item.status}-${item.id}-${item.tool}`}
                onClick={() => setSelected(item)}
                className={`w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 transition-colors ${
                  isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                } ${isPending ? "" : "opacity-80"}`}>
                {/* Status indicator */}
                <div className="flex-shrink-0 w-5 flex justify-center">
                  {isPending && <div className="w-3 h-3 rounded-full bg-blue-600" />}
                  {item.status === "approved" && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                  )}
                  {(item.status === "denied" || item.status === "revoked") && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] truncate ${isPending ? "font-semibold text-gray-900" : "text-gray-600"}`}>
                      {item.clientName || "AI"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[13px] truncate ${isPending ? "font-medium text-gray-900" : "text-gray-500"}`}>
                      wants to use <span className="font-mono">{item.tool}</span>
                    </span>
                  </div>
                </div>

                {/* Time */}
                <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                  {timeAgo(isPending ? item.requestedAt : (item.resolvedAt ?? item.requestedAt))}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: detail */}
        <div className={`flex-1 bg-white overflow-y-auto ${!selected ? "hidden md:flex items-center justify-center" : ""}`}>
          {!selected && (
            <div className="text-center">
              <svg className="mx-auto mb-3 text-gray-300" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
              </svg>
              <p className="text-sm text-gray-400">Select a permission to view</p>
            </div>
          )}

          {selected && (
            <div className="max-w-2xl">
              {/* Detail header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <button onClick={() => setSelected(null)} className="md:hidden text-sm text-blue-600 mb-3 hover:text-blue-700">
                  ← Back to inbox
                </button>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-semibold text-gray-900 font-mono">{selected.tool}</h2>
                  {selected.status === "pending" && <span className="text-[11px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">NEEDS ACTION</span>}
                  {selected.status === "approved" && <span className="text-[11px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ALLOWED</span>}
                  {selected.status === "denied" && <span className="text-[11px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">DENIED</span>}
                  {selected.status === "revoked" && <span className="text-[11px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">REVOKED</span>}
                </div>
                <div className="text-sm text-gray-500 space-y-0.5">
                  {selected.clientName && <p>From <span className="text-gray-900 font-medium">{selected.clientName}</span></p>}
                  <p>{new Date(selected.requestedAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Detail body */}
              <div className="px-6 py-6">
                {selected.status === "pending" && (
                  <>
                    <p className="text-sm text-gray-700 leading-relaxed mb-6">
                      Your AI is trying to use <strong className="font-mono">{selected.tool}</strong> for the first time.
                      If you allow it, your AI can use this tool going forward. You can revoke access at any time.
                    </p>
                    <div className="flex gap-3">
                      <button onClick={handleApprove} disabled={resolving}
                        className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-sm">
                        Allow
                      </button>
                      <button onClick={handleDeny} disabled={resolving}
                        className="px-6 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40">
                        Deny
                      </button>
                    </div>
                  </>
                )}

                {selected.status === "approved" && (
                  <>
                    <p className="text-sm text-gray-700 leading-relaxed mb-6">
                      This tool is allowed. Your AI can use it freely. Every use is logged with a cryptographic proof.
                    </p>
                    <button onClick={handleRevoke} disabled={resolving}
                      className="px-5 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-40">
                      Revoke access
                    </button>
                  </>
                )}

                {(selected.status === "denied" || selected.status === "revoked") && (
                  <p className="text-sm text-gray-700 leading-relaxed">
                    This tool is blocked. Your AI cannot use it. If it tries, it will be denied.
                  </p>
                )}

                {selected.explorerUrl && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <a href={selected.explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      View cryptographic proof
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
    </div>
  );

  if (!user) return <LoginScreen />;
  return <Inbox user={user} />;
}

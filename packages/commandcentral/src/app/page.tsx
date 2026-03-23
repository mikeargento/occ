"use client";

import { useEffect, useState, useCallback } from "react";
import { getPendingPermissions, getActivePermissions, approvePermission, denyPermission, revokePermission, getConnectConfig, getAuditLog } from "@/lib/api";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

interface User { id: string; name: string; email: string; avatar: string; }
interface PermItem {
  id: number; agentId: string; tool: string; clientName: string;
  requestedAt: number; resolvedAt: number | null; status: "pending" | "approved" | "denied" | "revoked";
  proofDigest: string | null; explorerUrl: string | null;
}

// ── Nav ──
function NavBar({ user }: { user: User | null }) {
  return (
    <header className="flex items-center justify-between px-6 h-14 border-b border-border/30 flex-shrink-0 bg-bg">
      <a href="https://occ.wtf" className="text-[17px] tracking-[-0.02em] font-black text-text">OCC.WTF</a>
      <div className="flex items-center gap-5 text-[13px]">
        <a href="https://occ.wtf/explorer" className="text-text-tertiary hover:text-text transition-colors">Explorer</a>
        <a href="https://occ.wtf/docs" className="text-text-tertiary hover:text-text transition-colors">Docs</a>
        {user && (
          <a href="/auth/logout" title="Sign out">
            {user.avatar ? <img src={user.avatar} className="w-6 h-6 rounded-full" alt="" /> : <span className="text-text-tertiary">Sign out</span>}
          </a>
        )}
      </div>
    </header>
  );
}

// ── Login ──
function LoginScreen() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar user={null} />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h1 className="text-5xl sm:text-6xl font-black tracking-[-0.04em] text-text leading-[1.05] mb-4">
            Control wtf<br />your AI<br />can do.
          </h1>
          <p className="text-base text-text-tertiary mb-10">Sign in to get started. Free.</p>
          <div className="space-y-3 max-w-[280px] mx-auto">
            <a href="/auth/login/google"
              className="flex items-center justify-center gap-3 w-full px-5 py-3 text-sm font-semibold rounded-xl bg-text text-bg hover:opacity-90 transition-all active:scale-[0.98]">
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </a>
            <a href="/auth/login/github"
              className="flex items-center justify-center gap-3 w-full px-5 py-3 text-sm font-semibold rounded-xl border border-border text-text hover:bg-bg-subtle transition-all active:scale-[0.98]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              Continue with GitHub
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

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar user={user} />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 h-12 border-b border-border/20 flex-shrink-0">
        <div className="flex items-center gap-1">
          {(["all", "pending", "allowed", "denied"] as Filter[]).map(f => (
            <button key={f} onClick={() => { setFilter(f); setSelected(null); }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                filter === f ? "bg-bg-subtle text-text" : "text-text-tertiary hover:text-text"
              }`}>
              {f === "all" ? "All" : f === "pending" ? `Pending${pendingCount ? ` (${pendingCount})` : ""}` : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => setShowSetup(!showSetup)}
          className="text-xs text-text-tertiary hover:text-text transition-colors">
          {showSetup ? "Close setup" : "Connect AI"}
        </button>
      </div>

      {/* Setup panel */}
      {showSetup && (
        <div className="px-6 py-5 border-b border-border/20 bg-bg-subtle/30">
          <p className="text-sm font-medium text-text mb-1">Your OCC link</p>
          <p className="text-xs text-text-tertiary mb-3">Copy this and paste it into your AI tool's MCP settings.</p>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 text-xs font-mono bg-bg rounded-lg border border-border px-3 py-2 text-text-secondary truncate select-all">{mcpUrl}</code>
            <button onClick={copyUrl} className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all flex-shrink-0">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="text-xs text-text-tertiary space-y-1">
            <p><span className="text-text font-medium">Cursor:</span> Settings → search "MCP" → Add Custom MCP → paste</p>
            <p><span className="text-text font-medium">Claude Code:</span> <code className="text-emerald-500/80">claude mcp add occ --transport http {mcpUrl}</code></p>
          </div>
        </div>
      )}

      {/* Main content: list + detail */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: message list */}
        <div className={`w-full md:w-[380px] md:border-r md:border-border/20 overflow-y-auto flex-shrink-0 ${selected ? "hidden md:block" : ""}`}>
          {loading && (
            <div className="flex justify-center py-20">
              <div className="w-5 h-5 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-20 px-6">
              <p className="text-sm text-text-secondary font-medium mb-1">
                {filter === "pending" ? "No pending requests" : filter === "all" ? "Inbox empty" : `No ${filter} items`}
              </p>
              <p className="text-xs text-text-tertiary">
                {items.length === 0 ? "Connect your AI to get started." : "Try a different filter."}
              </p>
            </div>
          )}

          {filtered.map(item => (
            <button key={`${item.status}-${item.id}-${item.tool}`}
              onClick={() => setSelected(item)}
              className={`w-full text-left px-5 py-3.5 border-b border-border/10 transition-colors hover:bg-bg-subtle/50 ${
                selected?.id === item.id && selected?.tool === item.tool ? "bg-bg-subtle" : ""
              }`}>
              <div className="flex items-center gap-3">
                {item.status === "pending" && (
                  <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                )}
                {item.status === "approved" && (
                  <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                )}
                {(item.status === "denied" || item.status === "revoked") && (
                  <div className="w-2 h-2 rounded-full bg-red-500/50 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-mono truncate ${item.status === "pending" ? "font-semibold text-text" : "text-text/70"}`}>
                      {item.tool}
                    </span>
                    <span className="text-[10px] text-text-tertiary flex-shrink-0">
                      {timeAgo(item.status === "pending" ? item.requestedAt : (item.resolvedAt ?? item.requestedAt))}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-tertiary truncate mt-0.5">
                    {item.status === "pending" ? `${item.clientName || "AI"} is requesting access` :
                     item.status === "approved" ? "Allowed" :
                     item.status === "denied" ? "Denied" : "Revoked"}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Right: detail pane */}
        <div className={`flex-1 overflow-y-auto ${!selected ? "hidden md:flex items-center justify-center" : ""}`}>
          {!selected && (
            <p className="text-sm text-text-tertiary">Select a permission to view details</p>
          )}

          {selected && (
            <div className="p-6 max-w-xl">
              {/* Mobile back */}
              <button onClick={() => setSelected(null)} className="md:hidden text-xs text-text-tertiary mb-4 hover:text-text">
                ← Back
              </button>

              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-mono font-bold text-text">{selected.tool}</h2>
                {selected.status === "pending" && <span className="text-[10px] font-bold bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full">PENDING</span>}
                {selected.status === "approved" && <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full">ALLOWED</span>}
                {selected.status === "denied" && <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">DENIED</span>}
                {selected.status === "revoked" && <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">REVOKED</span>}
              </div>

              <div className="text-sm text-text-tertiary mb-6 space-y-1">
                {selected.clientName && <p>From: <span className="text-text">{selected.clientName}</span></p>}
                <p>When: {new Date(selected.requestedAt).toLocaleString()}</p>
                {selected.agentId && <p>Agent: <span className="text-text">{selected.agentId}</span></p>}
              </div>

              {selected.status === "pending" && (
                <div className="mb-6 p-4 rounded-xl bg-bg-subtle/50 border border-border/30">
                  <p className="text-sm text-text-secondary mb-4">
                    Your AI wants to use <span className="font-mono font-semibold text-text">{selected.tool}</span>.
                    If you allow it, your AI can use this tool from now on. You can revoke access anytime.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleApprove} disabled={resolving}
                      className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-40 active:scale-[0.97]">
                      Allow
                    </button>
                    <button onClick={handleDeny} disabled={resolving}
                      className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-border text-text-secondary hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-40 active:scale-[0.97]">
                      Deny
                    </button>
                  </div>
                </div>
              )}

              {selected.status === "approved" && (
                <div className="mb-6">
                  <p className="text-sm text-text-secondary mb-4">
                    This tool is currently allowed. Your AI can use it freely. Every use is logged with a cryptographic proof.
                  </p>
                  <button onClick={handleRevoke} disabled={resolving}
                    className="px-4 py-2 text-sm font-medium rounded-xl border border-border text-text-tertiary hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-40">
                    Revoke access
                  </button>
                </div>
              )}

              {(selected.status === "denied" || selected.status === "revoked") && (
                <p className="text-sm text-text-secondary mb-6">
                  This tool is blocked. Your AI cannot use it.
                </p>
              )}

              {selected.explorerUrl && (
                <a href={selected.explorerUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-emerald-500 hover:underline">
                  View proof on Explorer →
                </a>
              )}
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
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="w-5 h-5 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
    </div>
  );

  if (!user) return <LoginScreen />;
  return <Inbox user={user} />;
}

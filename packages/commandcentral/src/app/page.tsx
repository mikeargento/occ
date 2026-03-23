"use client";

import { useEffect, useState, useCallback } from "react";
import { getPendingPermissions, getActivePermissions, approvePermission, denyPermission, revokePermission, getConnectConfig } from "@/lib/api";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface User { id: string; name: string; email: string; avatar: string; }
interface PermItem {
  id: number; agentId: string; tool: string; clientName: string;
  requestedAt: number; resolvedAt: number | null; status: "pending" | "approved" | "denied" | "revoked";
  proofDigest: string | null; explorerUrl: string | null;
}

// Group permissions by client/agent — each "email" is one agent
interface AgentGroup {
  clientName: string;
  agentId: string;
  tools: PermItem[];
  pendingCount: number;
  latestTime: number;
  totalTools: number;
}

function groupByAgent(items: PermItem[]): AgentGroup[] {
  const map = new Map<string, PermItem[]>();
  for (const item of items) {
    const key = item.clientName || item.agentId || "Unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([clientName, tools]) => ({
    clientName,
    agentId: tools[0]?.agentId ?? "",
    tools: tools.sort((a, b) => {
      // pending first, then by time
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return (b.resolvedAt ?? b.requestedAt) - (a.resolvedAt ?? a.requestedAt);
    }),
    pendingCount: tools.filter(t => t.status === "pending").length,
    latestTime: Math.max(...tools.map(t => t.resolvedAt ?? t.requestedAt)),
    totalTools: tools.length,
  })).sort((a, b) => {
    // Groups with pending first, then by latest time
    if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
    if (b.pendingCount > 0 && a.pendingCount === 0) return 1;
    return b.latestTime - a.latestTime;
  });
}

// ── Login ──
function LoginScreen() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center justify-between px-6 h-14 border-b border-gray-200">
        <span className="text-[17px] tracking-[-0.02em] font-black text-gray-900">OCC.WTF</span>
        <div className="flex items-center gap-5 text-[13px]">
          <a href="https://occ.wtf/explorer" className="text-gray-500 hover:text-gray-900">Explorer</a>
          <a href="https://occ.wtf/docs" className="text-gray-500 hover:text-gray-900">Docs</a>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h1 className="text-5xl sm:text-6xl font-black tracking-[-0.04em] text-gray-900 leading-[1.05] mb-4">
            Control wtf<br />your AI<br />can do.
          </h1>
          <p className="text-base text-gray-500 mb-10">Sign in to get started. Free.</p>
          <div className="space-y-3 max-w-[300px] mx-auto">
            <a href="/auth/login/google" className="flex items-center justify-center gap-3 w-full px-5 py-3 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Sign in with Google
            </a>
            <a href="/auth/login/github" className="flex items-center justify-center gap-3 w-full px-5 py-3 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#24292f"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              Sign in with GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ──
type View = "inbox" | "allowed" | "denied" | "all" | "setup";

function Sidebar({ view, setView, pendingCount, allowedCount, deniedCount, totalCount }: {
  view: View; setView: (v: View) => void;
  pendingCount: number; allowedCount: number; deniedCount: number; totalCount: number;
}) {
  const items: { key: View; label: string; count?: number; icon: JSX.Element }[] = [
    {
      key: "inbox", label: "Inbox", count: pendingCount || undefined,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>,
    },
    {
      key: "allowed", label: "Allowed", count: allowedCount || undefined,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 6L9 17l-5-5"/></svg>,
    },
    {
      key: "denied", label: "Denied", count: deniedCount || undefined,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>,
    },
    {
      key: "all", label: "All Permissions", count: totalCount || undefined,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>,
    },
    {
      key: "setup", label: "Connect AI",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
    },
  ];

  return (
    <aside className="w-[220px] bg-[#f6f8fc] h-full flex-shrink-0 hidden lg:flex flex-col py-3 px-3">
      {items.map(item => (
        <button key={item.key} onClick={() => setView(item.key)}
          className={`flex items-center gap-3 px-4 py-2 rounded-full text-[13px] transition-colors mb-0.5 ${
            view === item.key
              ? "bg-blue-100 text-blue-900 font-semibold"
              : "text-gray-700 hover:bg-gray-200/60"
          }`}>
          <span className={view === item.key ? "text-blue-700" : "text-gray-500"}>{item.icon}</span>
          <span className="flex-1 text-left">{item.label}</span>
          {item.count && item.count > 0 && (
            <span className={`text-[11px] font-medium ${view === item.key ? "text-blue-700" : "text-gray-400"}`}>
              {item.count}
            </span>
          )}
        </button>
      ))}
    </aside>
  );
}

// ── Agent Detail (opened "email") ──
function AgentDetail({ group, onBack, onApprove, onDeny, onRevoke, resolving }: {
  group: AgentGroup; onBack: () => void;
  onApprove: (id: number) => void; onDeny: (id: number) => void;
  onRevoke: (agentId: string, tool: string) => void; resolving: boolean;
}) {
  const pending = group.tools.filter(t => t.status === "pending");
  const allowed = group.tools.filter(t => t.status === "approved");
  const denied = group.tools.filter(t => t.status === "denied" || t.status === "revoked");

  return (
    <div className="flex-1 bg-white overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 z-10">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-900 transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900">{group.clientName}</h2>
          <p className="text-xs text-gray-500">{group.totalTools} tool{group.totalTools !== 1 ? "s" : ""} requested</p>
        </div>
        {group.pendingCount > 0 && (
          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
            {group.pendingCount} pending
          </span>
        )}
      </div>

      <div className="px-6 py-5 max-w-2xl">
        {/* Pending tools */}
        {pending.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Needs your decision</h3>
            <div className="space-y-2">
              {pending.map(tool => (
                <div key={tool.id} className="flex items-center gap-3 py-3 px-4 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 flex-shrink-0" />
                  <span className="flex-1 text-sm font-mono font-medium text-gray-900">{tool.tool}</span>
                  <button onClick={() => onApprove(tool.id)} disabled={resolving}
                    className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                    Allow
                  </button>
                  <button onClick={() => onDeny(tool.id)} disabled={resolving}
                    className="px-3 py-1 text-xs font-semibold rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                    Deny
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Allowed tools */}
        {allowed.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Allowed</h3>
            <div className="space-y-1">
              {allowed.map(tool => (
                <div key={tool.id} className="flex items-center gap-3 py-2.5 px-4 rounded-lg hover:bg-gray-50 group">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" className="flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  <span className="flex-1 text-sm font-mono text-gray-700">{tool.tool}</span>
                  {tool.explorerUrl && (
                    <a href={tool.explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-blue-500 hover:underline opacity-0 group-hover:opacity-100 transition-opacity">proof</a>
                  )}
                  <button onClick={() => onRevoke(tool.agentId, tool.tool)}
                    className="text-[11px] text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    revoke
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Denied tools */}
        {denied.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Denied</h3>
            <div className="space-y-1">
              {denied.map(tool => (
                <div key={tool.id} className="flex items-center gap-3 py-2.5 px-4 rounded-lg">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" className="flex-shrink-0"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  <span className="flex-1 text-sm font-mono text-gray-400">{tool.tool}</span>
                  {tool.explorerUrl && (
                    <a href={tool.explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-blue-500 hover:underline">proof</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Setup View ──
function SetupView({ mcpUrl }: { mcpUrl: string }) {
  const [copied, setCopied] = useState(false);
  function copyUrl() {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex-1 bg-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Connect your AI</h2>
        <p className="text-sm text-gray-500 mb-8">Copy your link and paste it into your AI tool. That's it.</p>

        <div className="mb-8">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">Your OCC link</label>
          <div className="flex items-center gap-2">
            <input readOnly value={mcpUrl} className="flex-1 text-sm font-mono bg-gray-50 rounded-lg border border-gray-300 px-3 py-2.5 text-gray-700 select-all" />
            <button onClick={copyUrl} className="px-5 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex-shrink-0">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">Cursor</p>
            <p className="text-sm text-gray-500">Settings → search "MCP" → Add Custom MCP → paste your link → save.</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">Claude Code</p>
            <p className="text-sm text-gray-500 mb-2">Run this in your terminal:</p>
            <code className="block text-xs font-mono bg-gray-900 rounded-lg px-3 py-2 text-green-400 select-all">
              claude mcp add occ --transport http {mcpUrl}
            </code>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">Other AI tools</p>
            <p className="text-sm text-gray-500">Look for "MCP" or "tool server" in your AI's settings. Paste your link.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Inbox ──
function InboxApp({ user }: { user: User }) {
  const [items, setItems] = useState<PermItem[]>([]);
  const [view, setView] = useState<View>("inbox");
  const [selectedAgent, setSelectedAgent] = useState<AgentGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [mcpUrl, setMcpUrl] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [pRes, aRes] = await Promise.all([getPendingPermissions(), getActivePermissions()]);
      const pending: PermItem[] = pRes.requests.map((r: any) => ({
        ...r, status: "pending" as const, resolvedAt: null, proofDigest: null, explorerUrl: null,
      }));
      const active: PermItem[] = aRes.permissions.map((r: any) => ({
        ...r, requestedAt: r.resolvedAt ?? Date.now(), clientName: r.clientName || "",
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

  async function handleApprove(id: number) {
    setResolving(true);
    try { await approvePermission(id); await refresh(); } finally { setResolving(false); }
  }
  async function handleDeny(id: number) {
    setResolving(true);
    try { await denyPermission(id); await refresh(); } finally { setResolving(false); }
  }
  async function handleRevoke(agentId: string, tool: string) {
    setResolving(true);
    try { await revokePermission(agentId, tool); await refresh(); } finally { setResolving(false); }
  }

  // Filter items by view
  const viewItems = items.filter(i => {
    if (view === "inbox") return i.status === "pending";
    if (view === "allowed") return i.status === "approved";
    if (view === "denied") return i.status === "denied" || i.status === "revoked";
    return true; // "all"
  });

  const groups = groupByAgent(view === "all" || view === "inbox" ? viewItems : viewItems);
  const allGroups = groupByAgent(items);

  const pendingCount = items.filter(i => i.status === "pending").length;
  const allowedCount = items.filter(i => i.status === "approved").length;
  const deniedCount = items.filter(i => i.status === "denied" || i.status === "revoked").length;

  // Update selectedAgent when data refreshes
  useEffect(() => {
    if (selectedAgent) {
      const updated = groupByAgent(items).find(g => g.clientName === selectedAgent.clientName);
      if (updated) setSelectedAgent(updated);
    }
  }, [items]);

  return (
    <div className="h-screen bg-[#f6f8fc] flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 h-14 bg-white border-b border-gray-200 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <a href="https://occ.wtf" className="text-[17px] tracking-[-0.02em] font-black text-gray-900">OCC.WTF</a>
        </div>
        <div className="flex items-center gap-4">
          <a href="https://occ.wtf/explorer" className="text-[13px] text-gray-500 hover:text-gray-700 hidden sm:block">Explorer</a>
          <a href="https://occ.wtf/docs" className="text-[13px] text-gray-500 hover:text-gray-700 hidden sm:block">Docs</a>
          <a href="/auth/logout" title="Sign out">
            {user.avatar ? <img src={user.avatar} className="w-8 h-8 rounded-full border border-gray-200" alt="" /> : null}
          </a>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar view={view} setView={(v) => { setView(v); setSelectedAgent(null); }}
          pendingCount={pendingCount} allowedCount={allowedCount}
          deniedCount={deniedCount} totalCount={items.length} />

        {/* Content area */}
        {view === "setup" ? (
          <SetupView mcpUrl={mcpUrl} />
        ) : selectedAgent ? (
          <AgentDetail group={selectedAgent} onBack={() => setSelectedAgent(null)}
            onApprove={handleApprove} onDeny={handleDeny} onRevoke={handleRevoke} resolving={resolving} />
        ) : (
          <div className="flex-1 bg-white overflow-y-auto">
            {/* Mobile tabs */}
            <div className="lg:hidden flex items-center gap-1 px-4 h-11 border-b border-gray-200 overflow-x-auto">
              {(["inbox", "allowed", "denied", "all", "setup"] as View[]).map(v => (
                <button key={v} onClick={() => { setView(v); setSelectedAgent(null); }}
                  className={`px-3 py-1 text-[12px] font-medium rounded-full whitespace-nowrap ${
                    view === v ? "bg-blue-100 text-blue-700" : "text-gray-500"
                  }`}>
                  {v === "inbox" ? `Inbox${pendingCount ? ` (${pendingCount})` : ""}` :
                   v === "setup" ? "Connect" :
                   v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>

            {loading && (
              <div className="flex justify-center py-20">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              </div>
            )}

            {!loading && groups.length === 0 && (
              <div className="text-center py-20 px-8">
                <svg className="mx-auto mb-4 text-gray-300" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/>
                </svg>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  {view === "inbox" ? "All caught up" : `No ${view} permissions`}
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  {items.length === 0 ? "Connect your AI to get started." : "Nothing here."}
                </p>
                {items.length === 0 && (
                  <button onClick={() => setView("setup")} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                    Connect AI →
                  </button>
                )}
              </div>
            )}

            {/* Agent rows — like email rows */}
            {groups.map(group => (
              <button key={group.clientName}
                onClick={() => setSelectedAgent(group)}
                className="w-full text-left flex items-center gap-3 px-5 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
                {/* Unread dot */}
                <div className="w-4 flex justify-center flex-shrink-0">
                  {group.pendingCount > 0 && <div className="w-3 h-3 rounded-full bg-blue-600" />}
                </div>

                {/* Sender */}
                <span className={`w-[100px] text-[13px] truncate flex-shrink-0 ${
                  group.pendingCount > 0 ? "font-semibold text-gray-900" : "text-gray-500"
                }`}>
                  {group.clientName}
                </span>

                {/* Subject / preview */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className={`text-[13px] truncate ${group.pendingCount > 0 ? "font-semibold text-gray-900" : "text-gray-500"}`}>
                    {group.pendingCount > 0
                      ? `${group.pendingCount} tool${group.pendingCount > 1 ? "s" : ""} requesting access`
                      : `${group.totalTools} tool${group.totalTools > 1 ? "s" : ""}`}
                  </span>
                  <span className="text-[13px] text-gray-400 truncate hidden sm:inline">
                    — {group.tools.slice(0, 3).map(t => t.tool).join(", ")}{group.tools.length > 3 ? "..." : ""}
                  </span>
                </div>

                {/* Time */}
                <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                  {timeAgo(group.latestTime)}
                </span>
              </button>
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
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
    </div>
  );

  if (!user) return <LoginScreen />;
  return <InboxApp user={user} />;
}

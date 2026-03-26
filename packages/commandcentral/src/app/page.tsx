"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAllPermissions, approvePermission, denyPermission, revokePermission, getConnectConfig, getAgents, createAgent, deleteAgent, renameAgent, type Permission } from "@/lib/api";

/* ── Helpers ── */

function explorerUrl(digest: string): string {
  const safe = digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `https://occ.wtf/explorer/${safe}`;
}

function humanizeToolName(raw: string): string {
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function timeLabel(ts: number | string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* Categories removed — policy builds itself through approval decisions */

/* ═══════════════════════════════════════════════════════════════
   App Entry
   ═══════════════════════════════════════════════════════════════ */

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string; provider?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/auth/me").then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null)).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Shell><Center><Spinner size={20} /></Center></Shell>;
  if (!user) return <Shell><Login /></Shell>;
  return <Shell user={user}><Dashboard userName={user.name} provider={user.provider} /></Shell>;
}

/* ═══════════════════════════════════════════════════════════════
   Shell — matches occ.wtf nav
   ═══════════════════════════════════════════════════════════════ */

function Shell({ user, children }: { user?: any; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-[#000000]">
      <header className="sticky top-0 z-50 bg-[#efefef] border-b border-[#d9d9d9]/50">
        <nav className="mx-auto max-w-6xl px-6 flex h-16 items-center justify-between">
          <a href="https://occ.wtf" className="text-[28px] tracking-[-0.03em] font-black">OCC</a>
          <div className="flex items-center gap-1">
            <a href="https://occ.wtf/explorer" className="hidden sm:block text-sm font-semibold px-3 py-1.5 text-[#000000] hover:opacity-70 transition-opacity">Explorer</a>
            <a href="https://occ.wtf/docs" className="hidden sm:block text-sm font-semibold px-3 py-1.5 text-[#000000] hover:opacity-70 transition-opacity">Docs</a>
            {user && (
              <div className="flex items-center gap-3 ml-2">
                <a href="/settings" className="text-[#000000] hover:opacity-70 transition-opacity" title="Settings">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </a>
                {user.avatar ? <img src={user.avatar} className="w-7 h-7" alt="" /> : <div className="w-7 h-7 bg-[#d9d9d9]" />}
                <a href="/auth/logout" className="text-[13px] text-[#333333] hover:text-red-500 transition-colors">Sign out</a>
              </div>
            )}
          </div>
        </nav>
      </header>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Login
   ═══════════════════════════════════════════════════════════════ */

function Login() {
  return (
    <Center>
      <div className="text-center px-6 -mt-20 max-w-md">
        <h1 className="text-[44px] font-black tracking-[-0.04em] leading-[1.05] mb-4">
          Sign in to OCC
        </h1>
        <p className="text-[15px] text-[#333333] mb-10 leading-relaxed">
          Define what your AI agents can do.
        </p>
        <div className="flex flex-col gap-3">
          <AuthButton href="/auth/login/github" icon={<GitHubIcon />} label="Continue with GitHub" />
          <AuthButton href="/auth/login/google" icon={<GoogleIcon />} label="Continue with Google" />
          <AuthButton href="/auth/login/apple" icon={<AppleIcon />} label="Continue with Apple" />
        </div>
      </div>
    </Center>
  );
}

function AuthButton({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a href={href}
      className="inline-flex items-center justify-center gap-2.5 h-12 px-8 text-[14px] font-semibold border border-[#d9d9d9] bg-[#efefef] hover:bg-[#e5e5e5] transition-colors">
      {icon}
      {label}
    </a>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Dashboard — two columns: Rules (left) + Activity (right)
   ═══════════════════════════════════════════════════════════════ */

type Agent = { id: string; name: string; mcpUrl: string | null; status: string; totalCalls: number; createdAt: number; allowedTools?: string[]; blockedTools?: string[] };

function Dashboard({ userName, provider }: { userName: string; provider?: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("default");
  const [addingAgent, setAddingAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deathNotice, setDeathNotice] = useState<{ name: string; digest: string } | null>(null);

  const [perms, setPerms] = useState<Permission[]>([]);
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [expandedRequests, setExpandedRequests] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const [permData, configData, agentsData] = await Promise.all([
        getAllPermissions(),
        getConnectConfig().catch(() => ({ mcpUrl: "" })),
        getAgents().catch(() => ({ agents: [] })),
      ]);
      setPerms(permData.permissions ?? []);
      const agentList = (agentsData.agents ?? []) as Agent[];
      setAgents(agentList);

      const sel = agentList.find(a => a.id === selectedAgent);
      if (!sel && agentList.length > 0) {
        setSelectedAgent(agentList[0].id);
        setMcpUrl(agentList[0].mcpUrl ?? (configData as any).mcpUrl ?? "");
      } else {
        setMcpUrl(sel?.mcpUrl ?? (configData as any).mcpUrl ?? "");
      }
    } catch {}
  }, [selectedAgent]);

  useEffect(() => {
    refresh();
    const es = new EventSource("/api/events");
    es.onmessage = () => refresh();
    const iv = setInterval(refresh, 8000);
    return () => { es.close(); clearInterval(iv); };
  }, [refresh]);

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); await refresh(); }
    finally { setBusy(null); }
  }

  const currentAgent = useMemo(() => agents.find(a => a.id === selectedAgent), [agents, selectedAgent]);
  const agentPerms = useMemo(() => perms.filter(p => p.agentId === selectedAgent), [perms, selectedAgent]);
  const activity = useMemo(() =>
    agentPerms.filter(p => p.status !== "pending").sort((a, b) => (b.resolvedAt ?? b.requestedAt) - (a.resolvedAt ?? a.requestedAt)),
    [agentPerms]
  );
  const pending = useMemo(() => agentPerms.filter(p => p.status === "pending"), [agentPerms]);

  const firstName = userName?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">

      {/* Greeting */}
      <h1 className="text-2xl font-bold tracking-[-0.02em] mb-1">Hi, {firstName}</h1>
      {provider && <p className="text-xs text-[#333333] mb-4">Signed in via {provider}</p>}

      {/* Death notice */}
      {deathNotice && (
        <div className="mb-4 px-4 py-3 border border-red-300 bg-red-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-red-500 text-sm">&#x1F480;</span>
            <span className="text-sm text-red-700">
              Agent &quot;{deathNotice.name}&quot; terminated — death proof sealed on chain
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a href={explorerUrl(deathNotice.digest)} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:text-blue-400 transition-colors">
              View proof ↗
            </a>
            <button onClick={() => setDeathNotice(null)} className="text-xs text-[#333333] hover:text-[#000000]">✕</button>
          </div>
        </div>
      )}

      {/* Agent selector */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {agents.map(a => (
          <div key={a.id} className="flex items-center gap-0.5">
            {editingName === a.id ? (
              <div className="flex items-center gap-1 px-2 py-1 border border-blue-400 bg-[#efefef]">
                <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  className="bg-transparent outline-none w-28 text-sm text-[#000000]"
                  onKeyDown={async e => {
                    if (e.key === "Enter" && editName.trim()) {
                      await renameAgent(a.id, editName.trim()); setEditingName(null); await refresh();
                    }
                    if (e.key === "Escape") setEditingName(null);
                  }} />
                <button onClick={async () => { if (editName.trim()) { await renameAgent(a.id, editName.trim()); setEditingName(null); await refresh(); } }}
                  className="text-blue-500 hover:text-blue-400 text-sm font-bold px-1">✓</button>
                <button onClick={() => setEditingName(null)}
                  className="text-[#333333] hover:text-[#000000] text-sm px-0.5">✕</button>
              </div>
            ) : confirmDelete === a.id ? (
              <div className="flex items-center gap-2 px-3 py-1.5 border border-red-400 bg-[#efefef] text-sm">
                <span className="text-red-500 font-medium">Delete &quot;{a.name}&quot;?</span>
                <button onClick={async () => {
                  const result = await deleteAgent(a.id);
                  const digest = result?.deathProof?.artifact?.digestB64;
                  setConfirmDelete(null);
                  if (digest) {
                    setDeathNotice({ name: a.name, digest });
                    setTimeout(() => setDeathNotice(null), 10000);
                  }
                  if (selectedAgent === a.id) setSelectedAgent(agents[0]?.id ?? "");
                  await refresh();
                }}
                  className="text-red-500 hover:text-red-400 font-bold">Yes</button>
                <button onClick={() => setConfirmDelete(null)}
                  className="text-[#333333] hover:text-[#000000]">No</button>
              </div>
            ) : (
              <button onClick={() => setSelectedAgent(a.id)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 text-sm border transition-colors ${
                  selectedAgent === a.id
                    ? "bg-[#000000] text-white border-transparent font-semibold"
                    : "border-[#d9d9d9] text-[#333333] hover:text-[#000000] hover:border-[#b0ada8]"
                }`}>
                {a.name}
                <span onClick={e => { e.stopPropagation(); setEditingName(a.id); setEditName(a.name); }}
                  className={`opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity cursor-pointer text-[11px] ${
                    selectedAgent === a.id ? "text-white/60" : ""
                  }`}
                  title="Rename">✎</span>
                <span onClick={e => { e.stopPropagation(); setConfirmDelete(a.id); }}
                  className={`opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity cursor-pointer text-[11px] ${
                    selectedAgent === a.id ? "text-white/60" : ""
                  }`}
                  title="Delete">✕</span>
              </button>
            )}
          </div>
        ))}
        {addingAgent ? (
          <div className="flex items-center gap-1 px-2 py-1 border border-blue-400 bg-[#efefef]">
            <input value={newAgentName} onChange={e => setNewAgentName(e.target.value)} placeholder="Agent name" autoFocus
              className="bg-transparent outline-none w-32 text-sm text-[#000000] placeholder:text-[#666666] caret-blue-500"
              onKeyDown={async e => {
                if (e.key === "Enter" && newAgentName.trim()) {
                  await createAgent(newAgentName.trim());
                  setNewAgentName(""); setAddingAgent(false); await refresh();
                }
                if (e.key === "Escape") { setAddingAgent(false); setNewAgentName(""); }
              }} />
            <button onClick={async () => { if (newAgentName.trim()) { const result = await createAgent(newAgentName.trim()); setNewAgentName(""); setAddingAgent(false); await refresh(); if (result?.agent?.id) setSelectedAgent(result.agent.id); } }}
              className="text-blue-500 hover:text-blue-400 text-sm font-bold px-1">✓</button>
            <button onClick={() => { setAddingAgent(false); setNewAgentName(""); }}
              className="text-[#333333] hover:text-[#000000] text-sm px-0.5">✕</button>
          </div>
        ) : (
          <button onClick={() => setAddingAgent(true)}
            className="px-3 py-1.5 text-sm border border-dashed border-[#d9d9d9] text-[#333333] hover:text-[#000000] hover:border-[#b0ada8] transition-colors">
            + Add agent
          </button>
        )}
      </div>

      {/* No agents — prompt to create first one */}
      {agents.length === 0 && (
        <div className="text-center py-16">
          <h2 className="text-xl font-bold mb-2">Create your first agent</h2>
          <p className="text-sm text-[#333333] mb-6 max-w-xs mx-auto text-balance">
            Each agent gets its own MCP link, its own rules, and its own proof chain.
          </p>
          {addingAgent ? (
            <div className="flex items-center justify-center gap-2">
              <input value={newAgentName} onChange={e => setNewAgentName(e.target.value)} placeholder="Agent name" autoFocus
                className="px-3 py-2 text-sm border border-[#d9d9d9] bg-[#efefef] text-[#000000] outline-none focus:border-blue-500 w-48 caret-blue-500"
                onKeyDown={async e => {
                  if (e.key === "Enter" && newAgentName.trim()) {
                    const result = await createAgent(newAgentName.trim());
                    setNewAgentName(""); setAddingAgent(false); await refresh(); if (result?.agent?.id) setSelectedAgent(result.agent.id);
                  }
                  if (e.key === "Escape") { setAddingAgent(false); setNewAgentName(""); }
                }} />
              <button onClick={async () => { if (newAgentName.trim()) { const result = await createAgent(newAgentName.trim()); setNewAgentName(""); setAddingAgent(false); await refresh(); if (result?.agent?.id) setSelectedAgent(result.agent.id); } }}
                className="px-3 py-2 text-sm font-bold bg-blue-500 text-white hover:bg-blue-400 transition-colors">Create</button>
              <button onClick={() => { setAddingAgent(false); setNewAgentName(""); }}
                className="px-2 py-2 text-sm text-[#333333] hover:text-[#000000]">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAddingAgent(true)}
              className="px-6 py-2.5 text-sm font-semibold bg-[#000000] text-white hover:opacity-90 transition-opacity">
              + Create agent
            </button>
          )}
        </div>
      )}

      {/* Two column layout — only show when agents exist */}
      {agents.length > 0 && <div className="flex flex-col lg:flex-row gap-6">

        {/* ── LEFT: Allowed + Blocked ── */}
        <div className="lg:w-[400px] flex-shrink-0 space-y-4">

          {/* Allowed tools */}
          <div className="bg-[#efefef] border border-[#d9d9d9] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#d9d9d9]">
              <h2 className="text-[16px] font-bold">Allowed</h2>
            </div>
            {currentAgent?.allowedTools && currentAgent.allowedTools.length > 0 ? (
              <div className="divide-y divide-[#d9d9d9]">
                {currentAgent.allowedTools.map(tool => (
                  <div key={tool} className="flex items-center gap-3 px-5 py-3 group">
                    <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                    <span className="text-[14px] flex-1">{humanizeToolName(tool)}</span>
                    <code className="text-[11px] font-mono text-[#999] hidden group-hover:block">{tool}</code>
                    <button onClick={() => act(0, () => revokePermission(selectedAgent, tool))}
                      className="text-[11px] text-red-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-[13px] text-[#666]">No tools allowed yet</p>
                <p className="text-[11px] text-[#999] mt-1">Tools appear here when you approve requests</p>
              </div>
            )}
          </div>

          {/* Blocked tools */}
          {currentAgent?.blockedTools && currentAgent.blockedTools.length > 0 && (
            <div className="bg-[#efefef] border border-[#d9d9d9] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#d9d9d9]">
                <h2 className="text-[16px] font-bold">Blocked</h2>
              </div>
              <div className="divide-y divide-[#d9d9d9]">
                {currentAgent.blockedTools.map(tool => (
                  <div key={tool} className="flex items-center gap-3 px-5 py-3 group">
                    <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                    <span className="text-[14px] flex-1 text-[#666]">{humanizeToolName(tool)}</span>
                    <button onClick={async () => {
                      // Unblock = remove from blocked_tools via API
                      await fetch(`/api/agents/${encodeURIComponent(selectedAgent)}/tools/${encodeURIComponent(tool)}`, { method: "DELETE" });
                      await refresh();
                    }}
                      className="text-[11px] text-blue-500 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100">
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── RIGHT: Pending + Activity ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── PENDING REQUESTS — primary interaction ── */}
          {pending.length > 0 && (
            <div className="bg-white border border-amber-300 overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-200 bg-amber-50">
                <h2 className="text-[14px] font-bold text-amber-700">
                  {pending.length} pending request{pending.length > 1 ? "s" : ""}
                </h2>
              </div>
              <div className="divide-y divide-amber-100">
                {pending.map(p => {
                  const isOpen = expandedRequests.has(p.id);
                  const displayName = p.toolDescription || humanizeToolName(p.tool);
                  return (
                    <div key={p.id} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[15px] font-semibold">{displayName}</span>
                            <span className="text-[11px] text-[#666] px-1.5 py-0.5 bg-[#efefef]">{p.clientName}</span>
                            <span className="text-[11px] text-[#999]">{timeLabel(p.requestedAt)}</span>
                          </div>
                          <code className="text-[12px] font-mono text-[#666]">{p.tool}</code>

                          {/* Expand/collapse details */}
                          <button onClick={() => setExpandedRequests(prev => {
                            const next = new Set(prev);
                            isOpen ? next.delete(p.id) : next.add(p.id);
                            return next;
                          })}
                            className="block mt-2 text-[11px] text-blue-500 hover:text-blue-600 transition-colors">
                            {isOpen ? "Hide details" : "View details"}
                          </button>

                          {isOpen && (
                            <div className="mt-3 pl-3 border-l-2 border-amber-200 space-y-2">
                              {p.requestArgs != null && (
                                <div>
                                  <span className="text-[11px] text-[#666] font-medium">Arguments:</span>
                                  <pre className="mt-1 text-[11px] font-mono bg-[#f5f5f5] p-3 overflow-x-auto max-h-[200px] overflow-y-auto text-[#333]">
                                    {JSON.stringify(p.requestArgs, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Decision buttons — the four options */}
                          <div className="flex items-center gap-2 mt-3">
                            <button onClick={() => act(p.id, () => approvePermission(p.id, "always"))} disabled={busy === p.id}
                              className="h-8 px-4 text-[12px] font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-all active:scale-[0.97] flex items-center gap-1.5">
                              {busy === p.id && <Spinner size={10} color="white" />}
                              Always allow
                            </button>
                            <button onClick={() => act(p.id, () => approvePermission(p.id, "once"))} disabled={busy === p.id}
                              className="h-8 px-4 text-[12px] font-medium border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-all">
                              Allow once
                            </button>
                            <button onClick={() => act(p.id, () => denyPermission(p.id, "once"))} disabled={busy === p.id}
                              className="h-8 px-3 text-[12px] font-medium text-[#666] hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-all">
                              Deny
                            </button>
                            <button onClick={() => act(p.id, () => denyPermission(p.id, "always"))} disabled={busy === p.id}
                              className="h-8 px-3 text-[12px] font-medium text-[#999] hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-all">
                              Always deny
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity log */}
          <div className="bg-[#efefef] border border-[#d9d9d9] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#d9d9d9]">
              <h2 className="text-[16px] font-bold">Activity</h2>
            </div>

            {activity.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-10 h-10 bg-[#e5e5e5] flex items-center justify-center mx-auto mb-4">
                  <div className="w-2 h-2 rounded-full bg-[#d9d9d9] animate-pulse" />
                </div>
                <p className="text-[14px] text-[#333333]">No activity yet</p>
                <p className="text-[12px] text-[#666666] mt-1">Actions will appear here as your AI works</p>
              </div>
            ) : (
              <div className="divide-y divide-[#d9d9d9]">
                {activity.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#efefef] transition-colors group">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      p.status === "approved" ? "bg-blue-400" : "bg-red-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] font-medium">{p.tool}</span>
                      <span className="text-[12px] text-[#333333] ml-2">{p.clientName}</span>
                    </div>
                    <span className="text-[11px] text-[#666666] flex-shrink-0">{timeLabel(p.resolvedAt ?? p.requestedAt)}</span>
                    {p.proofDigest && (
                      <a href={explorerUrl(p.proofDigest)}                        className="text-[11px] text-blue-500 hover:text-blue-400 transition-colors flex-shrink-0">
                        proof ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>}

      {/* Footer */}
      <div className="mt-12 pb-8 text-center">
        <p className="text-[11px] text-[#666666]">
          Every action is created through a Trusted Execution Environment · <a href="https://occ.wtf" target="_self" className="hover:text-[#333333] transition-colors">occ.wtf</a>
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Components
   ═══════════════════════════════════════════════════════════════ */


function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 56px)" }}>{children}</div>;
}

function Spinner({ size = 16, color = "#999" }: { size?: number; color?: string }) {
  return (
    <div className="animate-spin rounded-full"
      style={{ width: size, height: size, border: `2px solid ${color}33`, borderTopColor: color }} />
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}

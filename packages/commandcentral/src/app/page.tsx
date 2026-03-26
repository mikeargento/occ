"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAllPermissions, approvePermission, denyPermission, revokePermission, getConnectConfig, getAgents, createAgent, deleteAgent, renameAgent, getAgentActivity, type Permission } from "@/lib/api";

/* ── Helpers ── */

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

type Agent = { id: string; name: string; mcpUrl: string | null; status: string; totalCalls: number; createdAt: number; allowedTools?: string[]; blockedTools?: string[] };
type View = { page: "agents" } | { page: "panel"; agentId: string } | { page: "explorer"; agentId: string };

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
   Dashboard — three-level navigation
   Level 1: Agent picker (cards)
   Level 2: Agent panel (pending / allowed / blocked)
   Level 3: Agent explorer (full proof log)
   ═══════════════════════════════════════════════════════════════ */

function Dashboard({ userName, provider }: { userName: string; provider?: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [view, setView] = useState<View>({ page: "agents" });
  const [addingAgent, setAddingAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [deletingAgent, setDeletingAgent] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [permData, agentsData] = await Promise.all([
        getAllPermissions(),
        getAgents().catch(() => ({ agents: [] })),
      ]);
      setPerms(permData.permissions ?? []);
      setAgents((agentsData.agents ?? []) as Agent[]);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const es = new EventSource("/api/events");
    es.onmessage = () => refresh();
    const iv = setInterval(refresh, 8000);
    return () => { es.close(); clearInterval(iv); };
  }, [refresh]);

  const firstName = userName?.split(" ")[0] ?? "there";

  // Count pending per agent
  const pendingByAgent = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of perms) {
      if (p.status === "pending") {
        map[p.agentId] = (map[p.agentId] ?? 0) + 1;
      }
    }
    return map;
  }, [perms]);

  const totalPending = Object.values(pendingByAgent).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">

      {/* Breadcrumb */}
      {view.page !== "agents" && (
        <div className="flex items-center gap-2 text-[13px] text-[#666] mb-4">
          <button onClick={() => setView({ page: "agents" })} className="hover:text-[#000] transition-colors">Agents</button>
          <span>/</span>
          {view.page === "panel" && (
            <span className="text-[#000] font-medium">{agents.find(a => a.id === view.agentId)?.name}</span>
          )}
          {view.page === "explorer" && (
            <>
              <button onClick={() => setView({ page: "panel", agentId: view.agentId })} className="hover:text-[#000] transition-colors">
                {agents.find(a => a.id === view.agentId)?.name}
              </button>
              <span>/</span>
              <span className="text-[#000] font-medium">Proofs</span>
            </>
          )}
        </div>
      )}

      {/* ── LEVEL 1: Agent Picker ── */}
      {view.page === "agents" && (
        <>
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-[-0.02em] mb-1">Hi, {firstName}</h1>
            {provider && <p className="text-xs text-[#333333]">Signed in via {provider}</p>}
          </div>

          {/* Pending banner */}
          {totalPending > 0 && (
            <div className="mb-6 px-4 py-3 border border-amber-300 bg-amber-50">
              <span className="text-sm font-medium text-amber-700">
                {totalPending} pending request{totalPending > 1 ? "s" : ""} across your agents
              </span>
            </div>
          )}

          {agents.length === 0 ? (
            <div className="text-center py-16">
              <h2 className="text-xl font-bold mb-2">Create your first agent</h2>
              <p className="text-sm text-[#333333] mb-6 max-w-xs mx-auto text-balance">
                Each agent gets its own MCP link, its own rules, and its own proof chain.
              </p>
              <CreateAgentInline
                adding={addingAgent}
                name={newAgentName}
                onNameChange={setNewAgentName}
                onAdd={() => setAddingAgent(true)}
                onCancel={() => { setAddingAgent(false); setNewAgentName(""); }}
                onCreate={async () => {
                  if (newAgentName.trim()) {
                    const result = await createAgent(newAgentName.trim());
                    setNewAgentName(""); setAddingAgent(false); await refresh();
                    if (result?.agent?.id) setView({ page: "panel", agentId: result.agent.id });
                  }
                }}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {agents.map(a => {
                  const pending = pendingByAgent[a.id] ?? 0;
                  const isDeleting = deletingAgent === a.id;

                  if (isDeleting) {
                    return (
                      <div key={a.id} className="px-5 py-4 bg-white border border-red-300">
                        <p className="text-[14px] font-medium text-red-600 mb-2">Delete &quot;{a.name}&quot;?</p>
                        <p className="text-[12px] text-[#666] mb-3">Type <strong>{a.name}</strong> to confirm</p>
                        <input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} autoFocus
                          placeholder={a.name}
                          className="w-full px-3 py-2 text-sm border border-[#d9d9d9] bg-[#efefef] outline-none focus:border-red-400 mb-3 caret-red-500"
                          onKeyDown={async e => {
                            if (e.key === "Enter" && deleteConfirmText === a.name) {
                              await deleteAgent(a.id); setDeletingAgent(null); setDeleteConfirmText(""); await refresh();
                            }
                            if (e.key === "Escape") { setDeletingAgent(null); setDeleteConfirmText(""); }
                          }} />
                        <div className="flex gap-2">
                          <button onClick={async () => {
                            if (deleteConfirmText === a.name) {
                              await deleteAgent(a.id); setDeletingAgent(null); setDeleteConfirmText(""); await refresh();
                            }
                          }}
                            disabled={deleteConfirmText !== a.name}
                            className="h-8 px-4 text-[12px] font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-30 transition-all">
                            Delete forever
                          </button>
                          <button onClick={() => { setDeletingAgent(null); setDeleteConfirmText(""); }}
                            className="h-8 px-3 text-[12px] text-[#666] hover:text-[#000]">Cancel</button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={a.id} className="bg-[#efefef] border border-[#d9d9d9] hover:border-[#999] transition-colors group">
                      <button onClick={() => setView({ page: "panel", agentId: a.id })}
                        className="text-left w-full px-5 pt-4 pb-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-[16px] font-bold">{a.name}</h3>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            className="text-[#ccc] group-hover:text-[#666] transition-colors">
                            <path d="M6 4l4 4-4 4" />
                          </svg>
                        </div>
                        <div className="flex items-center gap-3 text-[12px] text-[#666]">
                          {pending > 0 && (
                            <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                              {pending} pending
                            </span>
                          )}
                          {(a.allowedTools?.length ?? 0) > 0 && (
                            <span>{a.allowedTools!.length} allowed</span>
                          )}
                          {(a.blockedTools?.length ?? 0) > 0 && (
                            <span>{a.blockedTools!.length} blocked</span>
                          )}
                          {!pending && !(a.allowedTools?.length) && !(a.blockedTools?.length) && (
                            <span>No activity yet</span>
                          )}
                        </div>
                      </button>
                      <div className="px-5 pb-3 pt-0">
                        <button onClick={(e) => { e.stopPropagation(); setDeletingAgent(a.id); setDeleteConfirmText(""); }}
                          className="text-[11px] text-[#999] hover:text-red-500 transition-colors">
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add agent card */}
                {addingAgent ? (
                  <div className="px-5 py-4 border border-blue-400 bg-[#efefef]">
                    <input value={newAgentName} onChange={e => setNewAgentName(e.target.value)} placeholder="Agent name" autoFocus
                      className="bg-transparent outline-none w-full text-[16px] font-bold text-[#000000] placeholder:text-[#999] caret-blue-500 mb-3"
                      onKeyDown={async e => {
                        if (e.key === "Enter" && newAgentName.trim()) {
                          const result = await createAgent(newAgentName.trim());
                          setNewAgentName(""); setAddingAgent(false); await refresh();
                          if (result?.agent?.id) setView({ page: "panel", agentId: result.agent.id });
                        }
                        if (e.key === "Escape") { setAddingAgent(false); setNewAgentName(""); }
                      }} />
                    <div className="flex gap-2">
                      <button onClick={async () => {
                        if (newAgentName.trim()) {
                          const result = await createAgent(newAgentName.trim());
                          setNewAgentName(""); setAddingAgent(false); await refresh();
                          if (result?.agent?.id) setView({ page: "panel", agentId: result.agent.id });
                        }
                      }} className="px-3 py-1.5 text-sm font-bold bg-blue-500 text-white hover:bg-blue-600 transition-colors">Create</button>
                      <button onClick={() => { setAddingAgent(false); setNewAgentName(""); }}
                        className="px-3 py-1.5 text-sm text-[#666] hover:text-[#000]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingAgent(true)}
                    className="px-5 py-4 border border-dashed border-[#d9d9d9] text-[#666] hover:text-[#000] hover:border-[#999] transition-colors text-left">
                    <span className="text-[16px] font-bold">+ Add agent</span>
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── LEVEL 2: Agent Panel ── */}
      {view.page === "panel" && (
        <AgentPanel
          agent={agents.find(a => a.id === view.agentId)!}
          perms={perms.filter(p => p.agentId === view.agentId)}
          onRefresh={refresh}
          onViewExplorer={() => setView({ page: "explorer", agentId: view.agentId })}
        />
      )}

      {/* ── LEVEL 3: Agent Explorer ── */}
      {view.page === "explorer" && (
        <AgentExplorer
          agent={agents.find(a => a.id === view.agentId)!}
        />
      )}

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Agent Panel — Pending / Allowed / Blocked
   ═══════════════════════════════════════════════════════════════ */

function AgentPanel({ agent, perms, onRefresh, onViewExplorer }: {
  agent: Agent;
  perms: Permission[];
  onRefresh: () => Promise<void>;
  onViewExplorer: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [expandedRequests, setExpandedRequests] = useState<Set<number>>(new Set());
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(agent?.name ?? "");

  if (!agent) return null;

  const pending = perms.filter(p => p.status === "pending");

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); await onRefresh(); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">

      {/* Agent header */}
      <div className="flex items-center justify-between">
        <div>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                className="text-2xl font-bold tracking-[-0.02em] bg-transparent outline-none border-b-2 border-blue-500 caret-blue-500"
                onKeyDown={async e => {
                  if (e.key === "Enter" && editName.trim()) {
                    await renameAgent(agent.id, editName.trim());
                    setEditingName(false); await onRefresh();
                  }
                  if (e.key === "Escape") setEditingName(false);
                }} />
              <button onClick={async () => { if (editName.trim()) { await renameAgent(agent.id, editName.trim()); setEditingName(false); await onRefresh(); } }}
                className="text-blue-500 hover:text-blue-600 text-sm font-bold">Save</button>
            </div>
          ) : (
            <h1 className="text-2xl font-bold tracking-[-0.02em] group cursor-pointer"
              onClick={() => { setEditingName(true); setEditName(agent.name); }}>
              {agent.name}
              <span className="opacity-0 group-hover:opacity-40 ml-2 text-[14px]">✎</span>
            </h1>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onViewExplorer}
            className="h-9 px-4 text-[13px] font-semibold bg-[#3B82F6] text-white hover:bg-blue-600 transition-colors">
            View proofs
          </button>
        </div>
      </div>

      {/* ── PENDING REQUESTS ── */}
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

                      <button onClick={() => setExpandedRequests(prev => {
                        const next = new Set(prev);
                        isOpen ? next.delete(p.id) : next.add(p.id);
                        return next;
                      })}
                        className="block mt-2 text-[11px] text-blue-500 hover:text-blue-600 transition-colors">
                        {isOpen ? "Hide details" : "View details"}
                      </button>

                      {isOpen && p.requestArgs != null && (
                        <div className="mt-3 pl-3 border-l-2 border-amber-200">
                          <span className="text-[11px] text-[#666] font-medium">Arguments:</span>
                          <pre className="mt-1 text-[11px] font-mono bg-[#f5f5f5] p-3 overflow-x-auto max-h-[200px] overflow-y-auto text-[#333]">
                            {JSON.stringify(p.requestArgs, null, 2)}
                          </pre>
                        </div>
                      )}

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

      {/* ── ALLOWED + BLOCKED ── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Allowed */}
        <div className="flex-1 bg-[#efefef] border border-[#d9d9d9] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#d9d9d9]">
            <h2 className="text-[16px] font-bold">Allowed</h2>
          </div>
          {agent.allowedTools && agent.allowedTools.length > 0 ? (
            <div className="divide-y divide-[#d9d9d9]">
              {agent.allowedTools.map(tool => (
                <div key={tool} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                  <span className="text-[14px] flex-1">{humanizeToolName(tool)}</span>
                  <button onClick={() => act(0, () => revokePermission(agent.id, tool))}
                    className="h-7 px-3 text-[11px] font-medium border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors">
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-[#666]">No tools allowed yet</p>
              <p className="text-[11px] text-[#999] mt-1">Approve requests to build your policy</p>
            </div>
          )}
        </div>

        {/* Blocked */}
        <div className="flex-1 bg-[#efefef] border border-[#d9d9d9] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#d9d9d9]">
            <h2 className="text-[16px] font-bold">Blocked</h2>
          </div>
          {agent.blockedTools && agent.blockedTools.length > 0 ? (
            <div className="divide-y divide-[#d9d9d9]">
              {agent.blockedTools.map(tool => (
                <div key={tool} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                  <span className="text-[14px] flex-1 text-[#666]">{humanizeToolName(tool)}</span>
                  <button onClick={async () => {
                    await fetch(`/api/agents/${encodeURIComponent(agent.id)}/tools/${encodeURIComponent(tool)}/unblock`, { method: "POST" });
                    await onRefresh();
                  }}
                    className="h-7 px-3 text-[11px] font-medium border border-blue-200 text-blue-500 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-[#666]">Nothing blocked</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Agent Explorer — full proof log, same as occ.wtf/explorer
   ═══════════════════════════════════════════════════════════════ */

function AgentExplorer({ agent }: { agent: Agent }) {
  const [proofs, setProofs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProof, setExpandedProof] = useState<number | null>(null);

  const fetchProofs = useCallback(async () => {
    if (!agent?.id) return;
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/activity`);
      const data = await res.json();
      setProofs(data.entries ?? []);
    } catch {}
    setLoading(false);
  }, [agent?.id]);

  useEffect(() => {
    fetchProofs();
    const iv = setInterval(fetchProofs, 5000);
    return () => clearInterval(iv);
  }, [fetchProofs]);

  function enforcementLabel(receipt: any): { label: string; color: string } {
    const env = receipt?.occProof?.environment ?? receipt?.environment ?? {};
    const enforcement = env?.enforcement ?? receipt?.occProof?.artifact?.enforcement ?? "";
    if (enforcement === "measured-tee" || env?.attestation) return { label: "Hardware Enclave", color: "text-blue-600 bg-blue-50 border-blue-200" };
    if (enforcement === "hw-key") return { label: "Hardware Key", color: "text-blue-600 bg-blue-50 border-blue-200" };
    return { label: "Software", color: "text-amber-600 bg-amber-50 border-amber-200" };
  }

  function getDigest(p: any): string {
    return p.proof_digest ?? p.receipt?.occProof?.artifact?.digestB64 ?? "";
  }

  function getSigner(p: any): string {
    return p.receipt?.occProof?.signer?.publicKeyB64 ?? p.receipt?.occProof?.commit?.signerB64 ?? "";
  }

  function getCommitTime(p: any): string {
    const t = p.receipt?.occProof?.commit?.time ?? p.receipt?.occProof?.artifact?.committedAt;
    if (!t) return "";
    return new Date(typeof t === "number" ? t : t).toLocaleString();
  }

  function getCounter(p: any): number | null {
    return p.receipt?.occProof?.artifact?.counter ?? p.receipt?.occProof?.commit?.counter ?? null;
  }

  function getPrevB64(p: any): string {
    return p.receipt?.occProof?.artifact?.prevB64 ?? p.receipt?.occProof?.commit?.prevB64 ?? "";
  }

  function getSignature(p: any): string {
    return p.receipt?.occProof?.commit?.signatureB64 ?? p.receipt?.occProof?.artifact?.signatureB64 ?? "";
  }

  function getNonce(p: any): string {
    return p.receipt?.occProof?.artifact?.nonceB64 ?? p.receipt?.occProof?.commit?.nonceB64 ?? "";
  }

  function getVersion(p: any): string {
    return p.receipt?.occProof?.artifact?.version ?? "";
  }

  function getEpochId(p: any): string {
    return p.receipt?.occProof?.artifact?.epochId ?? p.receipt?.occProof?.commit?.epochId ?? "";
  }

  function getPublicKey(p: any): string {
    return p.receipt?.occProof?.signer?.publicKeyB64 ?? p.receipt?.occProof?.commit?.signerB64 ?? "";
  }

  if (loading) return <Center><Spinner size={20} /></Center>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">{agent.name} — Proofs</h1>
        <span className="text-[13px] text-[#666]">{proofs.length} entries</span>
      </div>

      {proofs.length === 0 ? (
        <div className="text-center py-16 bg-[#efefef] border border-[#d9d9d9]">
          <p className="text-[15px] text-[#666] font-medium">No proofs yet</p>
          <p className="text-[13px] text-[#999] mt-1">Proofs appear here as {agent.name} makes tool calls</p>
        </div>
      ) : (
        <div className="bg-[#efefef] border border-[#d9d9d9] divide-y divide-[#d9d9d9]">
          {proofs.map((p: any, i: number) => {
            const isExpanded = expandedProof === (p.id ?? i);
            const digest = getDigest(p);
            const enforcement = enforcementLabel(p.receipt);
            const counter = getCounter(p);
            return (
              <div key={p.id ?? i}>
                {/* Collapsed row */}
                <div className="flex items-center gap-3 px-5 py-3 hover:bg-[#e5e5e5] transition-colors cursor-pointer"
                  onClick={() => setExpandedProof(isExpanded ? null : (p.id ?? i))}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="text-[#999] flex-shrink-0 transition-transform duration-200"
                    style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.allowed ? "bg-blue-400" : "bg-red-400"}`} />
                  {digest && <code className="text-[11px] font-mono text-[#666] truncate max-w-[240px]">{digest}</code>}
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 border flex-shrink-0 ${enforcement.color}`}>
                    {enforcement.label}
                  </span>
                  {counter !== null && <span className="text-[10px] text-[#999] flex-shrink-0">#{counter}</span>}
                  <span className="text-[11px] text-[#999] flex-shrink-0 ml-auto">{timeLabel(p.created_at)}</span>
                </div>

                {/* Expanded detail — full explorer view */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 bg-white border-t border-[#d9d9d9]">
                    <div className="space-y-4">

                      {/* Proof fields — same layout as occ.wtf explorer */}
                      <div className="grid grid-cols-1 gap-3">
                        <ProofField label="Digest" value={digest} mono />
                        <ProofField label="Tool" value={`${humanizeToolName(p.tool)} (${p.tool})`} />
                        <ProofField label="Decision" value={p.allowed ? "Allowed" : "Denied"} color={p.allowed ? "text-blue-600" : "text-red-500"} />
                        {p.reason && <ProofField label="Reason" value={p.reason} />}
                        {counter !== null && <ProofField label="Counter" value={String(counter)} />}
                        {getEpochId(p) && <ProofField label="Epoch ID" value={getEpochId(p)} mono />}
                        {getVersion(p) && <ProofField label="Version" value={getVersion(p)} />}
                        {getNonce(p) && <ProofField label="Nonce (Base64)" value={getNonce(p)} mono />}
                        {getPublicKey(p) && <ProofField label="Public Key (Base64)" value={getPublicKey(p)} mono />}
                        {getSignature(p) && <ProofField label="Signature (Base64)" value={getSignature(p)} mono />}
                        {getPrevB64(p) && <ProofField label="Previous Proof Hash" value={getPrevB64(p)} mono />}
                        {getCommitTime(p) && <ProofField label="Committed" value={getCommitTime(p)} />}
                        <ProofField label="Enforcement" value={enforcement.label} />
                      </div>

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

/* ═══════════════════════════════════════════════════════════════
   Shared Components
   ═══════════════════════════════════════════════════════════════ */

function ProofField({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start border-b border-[#efefef] pb-2">
      <span className="text-[12px] text-[#999] w-[180px] flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-[13px] break-all ${mono ? "font-mono text-[12px]" : ""} ${color ?? "text-[#333]"}`}>{value}</span>
    </div>
  );
}

function CreateAgentInline({ adding, name, onNameChange, onAdd, onCancel, onCreate }: {
  adding: boolean; name: string; onNameChange: (v: string) => void; onAdd: () => void; onCancel: () => void; onCreate: () => void;
}) {
  if (adding) {
    return (
      <div className="flex items-center justify-center gap-2">
        <input value={name} onChange={e => onNameChange(e.target.value)} placeholder="Agent name" autoFocus
          className="px-3 py-2 text-sm border border-[#d9d9d9] bg-[#efefef] text-[#000000] outline-none focus:border-blue-500 w-48 caret-blue-500"
          onKeyDown={e => {
            if (e.key === "Enter" && name.trim()) onCreate();
            if (e.key === "Escape") onCancel();
          }} />
        <button onClick={onCreate} className="px-3 py-2 text-sm font-bold bg-blue-500 text-white hover:bg-blue-400 transition-colors">Create</button>
        <button onClick={onCancel} className="px-2 py-2 text-sm text-[#333333] hover:text-[#000000]">Cancel</button>
      </div>
    );
  }
  return (
    <button onClick={onAdd} className="px-6 py-2.5 text-sm font-semibold bg-[#000000] text-white hover:opacity-90 transition-opacity">
      + Create agent
    </button>
  );
}

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

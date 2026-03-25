"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAllPermissions, approvePermission, denyPermission, revokePermission, getConnectConfig, getPolicy, commitPolicy, getAgents, createAgent, deleteAgent, renameAgent, type Permission } from "@/lib/api";

/* ── Helpers ── */

function explorerUrl(digest: string): string {
  const safe = digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `https://occ.wtf/explorer/${safe}`;
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

/* ── Category definitions with sub-tools ── */

const CATEGORIES: { key: string; label: string; desc: string; tools: { key: string; label: string }[] }[] = [
  { key: "files", label: "Files", desc: "Read, write, delete, move", tools: [
    { key: "read_file", label: "Read files" },
    { key: "write_file", label: "Write files" },
    { key: "delete_file", label: "Delete files" },
    { key: "list_directory", label: "List directories" },
    { key: "move_file", label: "Move / rename files" },
  ]},
  { key: "web", label: "Web", desc: "Search, fetch, scrape", tools: [
    { key: "search_web", label: "Search the web" },
    { key: "fetch_url", label: "Fetch URLs" },
    { key: "scrape_page", label: "Scrape pages" },
    { key: "download_file", label: "Download files" },
  ]},
  { key: "code", label: "Code", desc: "Run, commit, deploy", tools: [
    { key: "run_code", label: "Run code" },
    { key: "git_commit", label: "Git commit" },
    { key: "git_push", label: "Git push" },
    { key: "deploy_app", label: "Deploy" },
    { key: "run_tests", label: "Run tests" },
  ]},
  { key: "data", label: "Data", desc: "Query, insert, delete", tools: [
    { key: "query_database", label: "Query database" },
    { key: "insert_record", label: "Insert records" },
    { key: "delete_record", label: "Delete records" },
    { key: "run_sql", label: "Run SQL" },
    { key: "export_csv", label: "Export CSV" },
  ]},
  { key: "messaging", label: "Messaging", desc: "Email, Slack, SMS", tools: [
    { key: "send_email", label: "Send email" },
    { key: "read_email", label: "Read email" },
    { key: "send_slack", label: "Send Slack message" },
    { key: "send_sms", label: "Send SMS" },
  ]},
  { key: "payments", label: "Payments", desc: "Charge, refund, transfer", tools: [
    { key: "charge_card", label: "Charge card" },
    { key: "send_invoice", label: "Send invoice" },
    { key: "process_refund", label: "Process refund" },
    { key: "check_balance", label: "Check balance" },
    { key: "transfer_funds", label: "Transfer funds" },
  ]},
  { key: "calendar", label: "Calendar", desc: "Events, scheduling", tools: [
    { key: "create_calendar_event", label: "Create event" },
    { key: "schedule_meeting", label: "Schedule meeting" },
  ]},
  { key: "contacts", label: "Contacts", desc: "People, profiles", tools: [
    { key: "list_contacts", label: "List contacts" },
    { key: "update_profile", label: "Update profile" },
  ]},
];

/* ═══════════════════════════════════════════════════════════════
   App Entry
   ═══════════════════════════════════════════════════════════════ */

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/auth/me").then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null)).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Shell><Center><Spinner size={20} /></Center></Shell>;
  if (!user) return <Shell><Login /></Shell>;
  return <Shell user={user}><Dashboard userName={user.name} /></Shell>;
}

/* ═══════════════════════════════════════════════════════════════
   Shell — matches occ.wtf nav
   ═══════════════════════════════════════════════════════════════ */

function Shell({ user, children }: { user?: any; children: React.ReactNode }) {
  // menuOpen removed — sign out is always visible

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] text-[#111] dark:text-[#e5e5e5]">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-[#ddd]/50 dark:border-[#1a1a1a]/50">
        <nav className="mx-auto max-w-6xl px-4 sm:px-6 flex h-14 items-center justify-between">
          <a href="https://occ.wtf" className="text-[18px] tracking-[-0.02em] font-black">OCC</a>
          <div className="flex items-center gap-1">
            <a href="https://occ.wtf/explorer" className="hidden sm:block text-[13px] px-3 py-1.5 text-[#999] dark:text-[#666] hover:text-[#111] dark:hover:text-[#e5e5e5] transition-colors">Explorer</a>
            <a href="https://occ.wtf/docs" className="hidden sm:block text-[13px] px-3 py-1.5 text-[#999] dark:text-[#666] hover:text-[#111] dark:hover:text-[#e5e5e5] transition-colors">Docs</a>
            <ThemeToggle />
            {user && (
              <div className="flex items-center gap-3 ml-2">
                {user.avatar ? <img src={user.avatar} className="w-7 h-7 rounded-full" alt="" /> : <div className="w-7 h-7 rounded-full bg-[#ddd] dark:bg-[#333]" />}
                <a href="/auth/logout" className="text-[13px] text-[#999] dark:text-[#666] hover:text-red-500 dark:hover:text-red-400 transition-colors">Sign out</a>
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
        <p className="text-[15px] text-[#999] dark:text-[#888] mb-10 leading-relaxed">
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
      className="inline-flex items-center justify-center gap-2.5 h-12 px-8 text-[14px] font-semibold rounded-full border border-[#e0e0e0] dark:border-[#2a2a2a] bg-white dark:bg-[#111] hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] transition-colors">
      {icon}
      {label}
    </a>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Dashboard — two columns: Rules (left) + Activity (right)
   ═══════════════════════════════════════════════════════════════ */

type Agent = { id: string; name: string; mcpUrl: string | null; status: string; totalCalls: number; createdAt: number };

function Dashboard({ userName }: { userName: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("default");
  const [addingAgent, setAddingAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const [perms, setPerms] = useState<Permission[]>([]);
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [connectTab, setConnectTab] = useState<"url" | "terminal" | "json">("url");
  const [busy, setBusy] = useState<number | null>(null);

  // Policy state
  const [categories, setCategories] = useState<Record<string, boolean>>({});
  const [customRules, setCustomRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");
  const [committedCategories, setCommittedCategories] = useState<Record<string, boolean>>({});
  const [committedCustomRules, setCommittedCustomRules] = useState<string[]>([]);
  const [lastCommitDigest, setLastCommitDigest] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Per-tool overrides within categories
  const [toolOverrides, setToolOverrides] = useState<Record<string, boolean>>({});
  const [committedToolOverrides, setCommittedToolOverrides] = useState<Record<string, boolean>>({});

  const isDirty = useMemo(() => {
    return JSON.stringify({ categories, customRules, toolOverrides }) !==
           JSON.stringify({ categories: committedCategories, customRules: committedCustomRules, toolOverrides: committedToolOverrides });
  }, [categories, customRules, toolOverrides, committedCategories, committedCustomRules, committedToolOverrides]);

  const refresh = useCallback(async () => {
    try {
      const [permData, policyData, configData, agentsData] = await Promise.all([
        getAllPermissions(),
        getPolicy().catch(() => ({ policy: null, policyDigestB64: null, committedAt: null })),
        getConnectConfig().catch(() => ({ mcpUrl: "" })),
        getAgents().catch(() => ({ agents: [] })),
      ]);
      setPerms(permData.permissions ?? []);
      const agentList = (agentsData.agents ?? []) as Agent[];
      setAgents(agentList);

      // Use selected agent's MCP URL if available, else fall back to user-level
      const sel = agentList.find(a => a.id === selectedAgent);
      setMcpUrl(sel?.mcpUrl ?? (configData as any).mcpUrl ?? "");

      if (policyData.policy) {
        const c = policyData.policy.categories ?? {};
        const cr = policyData.policy.customRules ?? [];
        setCategories(c);
        setCommittedCategories(c);
        setCustomRules(cr);
        setCommittedCustomRules(cr);
        setLastCommitDigest(policyData.policyDigestB64);
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

  const copy = () => {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCommit = async () => {
    setCommitting(true);
    try {
      const result = await commitPolicy(categories, customRules, selectedAgent);
      setCommittedCategories({ ...categories });
      setCommittedCustomRules([...customRules]);
      setCommittedToolOverrides({ ...toolOverrides });
      setLastCommitDigest(result.policyDigestB64);
      await refresh();
    } finally { setCommitting(false); }
  };

  const toggleCategory = (key: string) => {
    setCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTool = (toolKey: string, catEnabled: boolean) => {
    setToolOverrides(prev => {
      const current = prev[toolKey] ?? catEnabled;
      return { ...prev, [toolKey]: !current };
    });
  };

  const addCustomRule = () => {
    const r = newRule.trim();
    if (!r) return;
    setCustomRules(prev => [...prev, r]);
    setNewRule("");
  };

  const removeCustomRule = (idx: number) => {
    setCustomRules(prev => prev.filter((_, i) => i !== idx));
  };

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); await refresh(); }
    finally { setBusy(null); }
  }

  const activity = useMemo(() =>
    perms.filter(p => p.status !== "pending").sort((a, b) => (b.resolvedAt ?? b.requestedAt) - (a.resolvedAt ?? a.requestedAt)),
    [perms]
  );
  const pending = useMemo(() => perms.filter(p => p.status === "pending"), [perms]);

  const hasAnything = perms.length > 0 || Object.keys(committedCategories).length > 0;

  const firstName = userName?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">

      {/* Greeting */}
      <h1 className="text-2xl font-bold tracking-[-0.02em] mb-4">Hi, {firstName}</h1>

      {/* Agent selector */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {agents.map(a => (
          <div key={a.id} className="flex items-center gap-0.5">
            {editingName === a.id ? (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-400 dark:border-blue-500 bg-white dark:bg-[#111]">
                <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  className="bg-transparent outline-none w-28 text-sm text-[#111] dark:text-[#e5e5e5]"
                  onKeyDown={async e => {
                    if (e.key === "Enter" && editName.trim()) {
                      await renameAgent(a.id, editName.trim()); setEditingName(null); await refresh();
                    }
                    if (e.key === "Escape") setEditingName(null);
                  }} />
                <button onClick={async () => { if (editName.trim()) { await renameAgent(a.id, editName.trim()); setEditingName(null); await refresh(); } }}
                  className="text-emerald-500 hover:text-emerald-400 text-sm font-bold px-1">✓</button>
                <button onClick={() => setEditingName(null)}
                  className="text-[#999] hover:text-[#666] text-sm px-0.5">✕</button>
              </div>
            ) : (
              <button onClick={() => setSelectedAgent(a.id)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  selectedAgent === a.id
                    ? "bg-[#111] dark:bg-white text-white dark:text-[#111] border-transparent font-semibold"
                    : "border-[#ddd] dark:border-[#2a2a2a] text-[#666] dark:text-[#999] hover:text-[#111] dark:hover:text-white hover:border-[#bbb] dark:hover:border-[#444]"
                }`}>
                {a.name}
                <span onClick={e => { e.stopPropagation(); setEditingName(a.id); setEditName(a.name); }}
                  className={`opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity cursor-pointer text-[11px] ${
                    selectedAgent === a.id ? "text-white/60 dark:text-[#111]/60" : ""
                  }`}
                  title="Rename">✎</span>
              </button>
            )}
          </div>
        ))}
        {addingAgent ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-400 dark:border-blue-500 bg-white dark:bg-[#111]">
            <input value={newAgentName} onChange={e => setNewAgentName(e.target.value)} placeholder="Agent name" autoFocus
              className="bg-transparent outline-none w-28 text-sm text-[#111] dark:text-[#e5e5e5]"
              onKeyDown={async e => {
                if (e.key === "Enter" && newAgentName.trim()) {
                  await createAgent(newAgentName.trim());
                  setNewAgentName(""); setAddingAgent(false); await refresh();
                }
                if (e.key === "Escape") { setAddingAgent(false); setNewAgentName(""); }
              }} />
            <button onClick={async () => { if (newAgentName.trim()) { await createAgent(newAgentName.trim()); setNewAgentName(""); setAddingAgent(false); await refresh(); } }}
              className="text-emerald-500 hover:text-emerald-400 text-sm font-bold px-1">✓</button>
            <button onClick={() => { setAddingAgent(false); setNewAgentName(""); }}
              className="text-[#999] hover:text-[#666] text-sm px-0.5">✕</button>
          </div>
        ) : (
          <button onClick={() => setAddingAgent(true)}
            className="px-3 py-1.5 text-sm rounded-lg border border-dashed border-[#ccc] dark:border-[#333] text-[#999] dark:text-[#666] hover:text-[#111] dark:hover:text-white hover:border-[#999] dark:hover:border-[#555] transition-colors">
            + Add agent
          </button>
        )}
      </div>

      {/* Two column layout */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── LEFT: Rules ── */}
        <div className="lg:w-[400px] flex-shrink-0">
          <div className="bg-white dark:bg-[#111] rounded-2xl border border-[#ddd] dark:border-[#1a1a1a] overflow-hidden">

            {/* Connect link */}
            <div className="px-5 py-3.5 border-b border-[#f0f0f0] dark:border-[#1a1a1a]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex gap-1">
                  {(["url", "terminal", "json"] as const).map(t => (
                    <button key={t} onClick={() => setConnectTab(t)}
                      className={`px-2.5 py-0.5 text-[11px] font-medium rounded-md transition-colors ${
                        connectTab === t
                          ? "bg-[#f0f0f0] dark:bg-[#1a1a1a] text-[#111] dark:text-[#e5e5e5]"
                          : "text-[#888] dark:text-[#888] hover:text-[#888]"
                      }`}>
                      {t === "url" ? "URL" : t === "terminal" ? "Terminal" : "JSON"}
                    </button>
                  ))}
                </div>
                <button onClick={() => {
                  const text = connectTab === "url" ? mcpUrl
                    : connectTab === "terminal" ? `claude mcp add occ --transport http ${mcpUrl}`
                    : JSON.stringify({ mcpServers: { occ: { url: mcpUrl } } }, null, 2);
                  navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                  className="h-7 px-3 text-[11px] font-semibold rounded-md bg-[#111] dark:bg-white text-white dark:text-[#111] hover:bg-[#333] dark:hover:bg-[#ddd] transition-all active:scale-[0.97]">
                  {copied ? "✓" : "Copy"}
                </button>
              </div>
              <div className="h-8 flex items-center px-3 rounded-lg bg-[#f7f7f7] dark:bg-[#0a0a0a] border border-[#ddd] dark:border-[#151515] overflow-hidden">
                <code className="text-[11px] font-mono text-[#999] dark:text-[#888] truncate">
                  {connectTab === "url" && mcpUrl}
                  {connectTab === "terminal" && `claude mcp add occ --transport http ${mcpUrl}`}
                  {connectTab === "json" && `{ "mcpServers": { "occ": { "url": "${mcpUrl}" } } }`}
                </code>
              </div>
              <p className="text-[10px] text-[#999] dark:text-[#666] mt-1.5">
                {connectTab === "url" && "Paste into your AI's MCP settings"}
                {connectTab === "terminal" && "Run in your terminal"}
                {connectTab === "json" && "Add to your MCP config file"}
              </p>
            </div>

            {/* Header + commit button */}
            <div className="px-5 py-4 flex items-center justify-between border-b border-[#f0f0f0] dark:border-[#1a1a1a]">
              <h2 className="text-[16px] font-bold">Rules</h2>
              <button onClick={handleCommit} disabled={!isDirty || committing}
                className={`h-8 px-4 text-[12px] font-semibold rounded-lg transition-all active:scale-[0.97] flex items-center gap-2 ${
                  isDirty
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : "bg-[#f0f0f0] dark:bg-[#1a1a1a] text-[#999] dark:text-[#777] cursor-default"
                }`}>
                {committing && <Spinner size={12} color="white" />}
                {committing ? "Signing..." : isDirty ? "Commit to chain" : "Rules saved"}
              </button>
            </div>

            {/* Categories */}
            <div className="divide-y divide-[#f5f5f5] dark:divide-[#151515]">
              {CATEGORIES.map(cat => {
                const isOn = categories[cat.key] ?? false;
                const isExpanded = expanded === cat.key;
                return (
                  <div key={cat.key}>
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafafa] dark:hover:bg-[#0e0e0e] transition-colors">
                      <button onClick={() => setExpanded(isExpanded ? null : cat.key)}
                        className="text-[10px] text-[#999] dark:text-[#777] w-4 flex-shrink-0 transition-transform"
                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                        ▶
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-medium">{cat.label}</span>
                        <span className="text-[12px] text-[#888] dark:text-[#888] ml-2">{cat.desc}</span>
                      </div>
                      <Toggle on={isOn} onChange={() => toggleCategory(cat.key)} />
                    </div>
                    {isExpanded && (
                      <div className="bg-[#fafafa] dark:bg-[#0a0a0a] border-t border-[#f0f0f0] dark:border-[#151515]">
                        {cat.tools.map(tool => {
                          const toolOn = toolOverrides[tool.key] ?? isOn;
                          return (
                            <div key={tool.key} className="flex items-center gap-3 pl-12 pr-5 py-2.5">
                              <span className="text-[13px] text-[#666] dark:text-[#888] flex-1">{tool.label}</span>
                              <Toggle on={toolOn} onChange={() => toggleTool(tool.key, isOn)} small />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Custom rules */}
            <div className="border-t border-[#f0f0f0] dark:border-[#1a1a1a] px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#888] dark:text-[#888] mb-3">Custom rules</p>
              {customRules.map((rule, i) => (
                <div key={i} className="flex items-start gap-2 mb-2 group">
                  <span className="text-[13px] text-[#666] dark:text-[#888] flex-1 leading-snug">{rule}</span>
                  <button onClick={() => removeCustomRule(i)}
                    className="text-[11px] text-[#aaa] dark:text-[#666] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5">✕</button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input value={newRule} onChange={e => setNewRule(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCustomRule()}
                  placeholder="e.g. Never delete production files"
                  className="flex-1 h-9 px-3 text-[13px] rounded-lg bg-[#f7f7f7] dark:bg-[#0a0a0a] border border-[#ddd] dark:border-[#1a1a1a] placeholder:text-[#999] dark:placeholder:text-[#333] focus:outline-none focus:ring-1 focus:ring-emerald-400/30" />
                <button onClick={addCustomRule} disabled={!newRule.trim()}
                  className="h-9 px-3 text-[12px] font-medium rounded-lg bg-[#f0f0f0] dark:bg-[#1a1a1a] text-[#999] dark:text-[#888] hover:text-[#666] dark:hover:text-[#888] disabled:opacity-30 transition-colors">
                  Add
                </button>
              </div>
            </div>


            {/* Policy proof */}
            {lastCommitDigest && (
              <div className="border-t border-[#f0f0f0] dark:border-[#1a1a1a] px-5 py-3.5">
                <a href={explorerUrl(lastCommitDigest)}                  className="flex items-center gap-3 group">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">Rules committed to chain</p>
                    <p className="text-[11px] font-mono text-[#888] dark:text-[#777] group-hover:text-emerald-500 transition-colors truncate">{lastCommitDigest}</p>
                  </div>
                  <span className="text-[11px] text-[#999] dark:text-[#666] group-hover:text-emerald-500 transition-colors flex-shrink-0">View proof ↗</span>
                </a>
              </div>
            )}
          </div>

          {/* Pending requests */}
          {pending.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500 mb-2 px-1">
                {pending.length} pending request{pending.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {pending.map(p => (
                  <div key={p.id} className="bg-white dark:bg-[#111] rounded-xl border border-amber-200/50 dark:border-amber-500/10 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[14px] font-medium flex-1">{p.tool}</span>
                      <span className="text-[11px] text-[#888] dark:text-[#888]">{p.clientName}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => act(p.id, () => approvePermission(p.id))} disabled={busy === p.id}
                        className="h-8 px-4 text-[12px] font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all active:scale-[0.97] flex items-center gap-1.5">
                        {busy === p.id && <Spinner size={10} color="white" />}
                        Allow
                      </button>
                      <button onClick={() => act(p.id, () => denyPermission(p.id))} disabled={busy === p.id}
                        className="h-8 px-4 text-[12px] font-medium rounded-lg text-[#999] dark:text-[#888] hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] disabled:opacity-40 transition-all">
                        Block
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Activity ── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white dark:bg-[#111] rounded-2xl border border-[#ddd] dark:border-[#1a1a1a] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f0f0f0] dark:border-[#1a1a1a]">
              <h2 className="text-[16px] font-bold">Activity</h2>
            </div>

            {activity.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-10 h-10 rounded-full bg-[#f5f5f5] dark:bg-[#151515] flex items-center justify-center mx-auto mb-4">
                  <div className="w-2 h-2 rounded-full bg-[#ddd] dark:bg-[#333] animate-pulse" />
                </div>
                <p className="text-[14px] text-[#888] dark:text-[#777]">No activity yet</p>
                <p className="text-[12px] text-[#aaa] dark:text-[#2a2a2a] mt-1">Actions will appear here as your AI works</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f5f5f5] dark:divide-[#151515]">
                {activity.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#fafafa] dark:hover:bg-[#0e0e0e] transition-colors group">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      p.status === "approved" ? "bg-emerald-400" : "bg-red-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] font-medium">{p.tool}</span>
                      <span className="text-[12px] text-[#999] dark:text-[#777] ml-2">{p.clientName}</span>
                    </div>
                    <span className="text-[11px] text-[#aaa] dark:text-[#666] flex-shrink-0">{timeLabel(p.resolvedAt ?? p.requestedAt)}</span>
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
      </div>

      {/* Footer */}
      <div className="mt-12 pb-8 text-center">
        <p className="text-[11px] text-[#aaa] dark:text-[#2a2a2a]">
          Every action is signed through a Trusted Execution Environment · <a href="https://occ.wtf" target="_self" className="hover:text-[#999] dark:hover:text-[#555] transition-colors">occ.wtf</a>
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Components
   ═══════════════════════════════════════════════════════════════ */

function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    // Check localStorage first, then cross-domain cookie
    const saved = localStorage.getItem("occ-theme");
    const cookie = document.cookie.match(/occ-theme=(dark|light)/);
    const theme = saved ?? cookie?.[1] ?? "dark";
    const isDark = theme !== "light";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("occ-theme", next ? "dark" : "light");
    document.cookie = `occ-theme=${next ? "dark" : "light"}; path=/; domain=.occ.wtf; max-age=31536000; SameSite=Lax`;
  };
  return (
    <button onClick={toggle} className="p-2 text-[#888] dark:text-[#888] hover:text-[#666] dark:hover:text-[#999] transition-colors" aria-label="Toggle theme">
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
        </svg>
      )}
    </button>
  );
}

function Toggle({ on, onChange, small }: { on: boolean; onChange: () => void; small?: boolean }) {
  const w = small ? "w-8" : "w-10";
  const h = small ? "h-[18px]" : "h-[22px]";
  const dot = small ? "w-3.5 h-3.5" : "w-[18px] h-[18px]";
  const translate = small ? "translate-x-[14px]" : "translate-x-[20px]";
  return (
    <button onClick={onChange}
      className={`${w} ${h} rounded-full transition-colors duration-150 flex items-center px-[2px] flex-shrink-0 ${
        on ? "bg-emerald-500" : "bg-[#ccc] dark:bg-[#2a2a2a]"
      }`}>
      <div className={`${dot} rounded-full bg-white shadow-sm transition-transform duration-150 ${on ? translate : "translate-x-0"}`} />
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

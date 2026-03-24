"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { getAllPermissions, approvePermission, denyPermission, revokePermission, getConnectConfig, getPolicy, commitPolicy, type Permission } from "@/lib/api";

/* ── Helpers ── */

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
  return <Shell user={user}><Dashboard /></Shell>;
}

/* ═══════════════════════════════════════════════════════════════
   Shell — matches occ.wtf nav
   ═══════════════════════════════════════════════════════════════ */

function Shell({ user, children }: { user?: any; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] text-[#111] dark:text-[#e5e5e5]">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-[#eee] dark:border-[#1a1a1a]">
        <nav className="mx-auto max-w-7xl px-6 flex h-14 items-center justify-between">
          <a href="https://occ.wtf" className="text-[20px] tracking-[-0.02em] font-black">OCC</a>
          <div className="flex items-center gap-1">
            <a href="https://occ.wtf/explorer" target="_blank" rel="noopener noreferrer"
              className="text-sm px-3 py-1.5 text-[#999] dark:text-[#555] hover:text-[#111] dark:hover:text-[#e5e5e5] transition-colors">Explorer</a>
            <a href="https://occ.wtf/docs" target="_blank" rel="noopener noreferrer"
              className="text-sm px-3 py-1.5 text-[#999] dark:text-[#555] hover:text-[#111] dark:hover:text-[#e5e5e5] transition-colors">Docs</a>
            {user && (
              <a href="/auth/logout" className="flex items-center gap-2 ml-4 text-[12px] text-[#bbb] dark:text-[#555] hover:text-[#666] dark:hover:text-[#999] transition-colors">
                {user.avatar && <img src={user.avatar} className="w-6 h-6 rounded-full" alt="" />}
              </a>
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
          Define what your<br />AI agents can do.
        </h1>
        <p className="text-[15px] text-[#999] dark:text-[#666] mb-10 leading-relaxed">
          Every rule is cryptographically proven before a single action can exist.
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

function Dashboard() {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);
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
      const [permData, policyData, configData] = await Promise.all([
        getAllPermissions(),
        getPolicy().catch(() => ({ policy: null, policyDigestB64: null, committedAt: null })),
        getConnectConfig().catch(() => ({ mcpUrl: "" })),
      ]);
      setPerms(permData.permissions ?? []);
      setMcpUrl((configData as any).mcpUrl ?? "");
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
  }, []);

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
      const result = await commitPolicy(categories, customRules);
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

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">

      {/* Connect bar */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 h-10 flex items-center px-4 rounded-lg bg-white dark:bg-[#111] border border-[#eee] dark:border-[#1a1a1a] overflow-hidden cursor-pointer group" onClick={copy}>
          <span className="text-[12px] font-mono text-[#bbb] dark:text-[#444] group-hover:text-[#888] truncate transition-colors select-all">
            {mcpUrl || "Loading..."}
          </span>
        </div>
        <button onClick={copy}
          className="h-10 px-5 text-[13px] font-semibold rounded-lg bg-[#111] dark:bg-white text-white dark:text-[#111] hover:bg-[#333] dark:hover:bg-[#ddd] transition-all active:scale-[0.97] flex-shrink-0">
          {copied ? "✓ Copied" : "Copy link"}
        </button>
      </div>

      {/* Two column layout */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── LEFT: Rules ── */}
        <div className="lg:w-[400px] flex-shrink-0">
          <div className="bg-white dark:bg-[#111] rounded-2xl border border-[#eee] dark:border-[#1a1a1a] overflow-hidden">

            {/* Header + commit button */}
            <div className="px-5 py-4 flex items-center justify-between border-b border-[#f0f0f0] dark:border-[#1a1a1a]">
              <h2 className="text-[16px] font-bold">Rules</h2>
              <button onClick={handleCommit} disabled={!isDirty || committing}
                className={`h-8 px-4 text-[12px] font-semibold rounded-lg transition-all active:scale-[0.97] flex items-center gap-2 ${
                  isDirty
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : "bg-[#f0f0f0] dark:bg-[#1a1a1a] text-[#ccc] dark:text-[#444] cursor-default"
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
                        className="text-[10px] text-[#ccc] dark:text-[#444] w-4 flex-shrink-0 transition-transform"
                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                        ▶
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className="text-[14px] font-medium">{cat.label}</span>
                        <span className="text-[12px] text-[#bbb] dark:text-[#555] ml-2">{cat.desc}</span>
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
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#bbb] dark:text-[#555] mb-3">Custom rules</p>
              {customRules.map((rule, i) => (
                <div key={i} className="flex items-start gap-2 mb-2 group">
                  <span className="text-[13px] text-[#666] dark:text-[#888] flex-1 leading-snug">{rule}</span>
                  <button onClick={() => removeCustomRule(i)}
                    className="text-[11px] text-[#ddd] dark:text-[#333] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5">✕</button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input value={newRule} onChange={e => setNewRule(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCustomRule()}
                  placeholder="e.g. Never delete production files"
                  className="flex-1 h-9 px-3 text-[13px] rounded-lg bg-[#f7f7f7] dark:bg-[#0a0a0a] border border-[#eee] dark:border-[#1a1a1a] placeholder:text-[#ccc] dark:placeholder:text-[#333] focus:outline-none focus:ring-1 focus:ring-emerald-400/30" />
                <button onClick={addCustomRule} disabled={!newRule.trim()}
                  className="h-9 px-3 text-[12px] font-medium rounded-lg bg-[#f0f0f0] dark:bg-[#1a1a1a] text-[#999] dark:text-[#555] hover:text-[#666] dark:hover:text-[#888] disabled:opacity-30 transition-colors">
                  Add
                </button>
              </div>
            </div>

            {/* Policy digest */}
            {lastCommitDigest && (
              <div className="border-t border-[#f0f0f0] dark:border-[#1a1a1a] px-5 py-3">
                <p className="text-[11px] text-[#ccc] dark:text-[#333]">
                  Policy: <a href={`https://occ.wtf/explorer?digest=${encodeURIComponent(lastCommitDigest)}`} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-blue-500/70 hover:text-blue-500 transition-colors">{lastCommitDigest.slice(0, 16)}...</a>
                </p>
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
                      <span className="text-[14px] font-mono font-medium flex-1">{p.tool}</span>
                      <span className="text-[11px] text-[#bbb] dark:text-[#555]">{p.clientName}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => act(p.id, () => approvePermission(p.id))} disabled={busy === p.id}
                        className="h-8 px-4 text-[12px] font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all active:scale-[0.97] flex items-center gap-1.5">
                        {busy === p.id && <Spinner size={10} color="white" />}
                        Allow
                      </button>
                      <button onClick={() => act(p.id, () => denyPermission(p.id))} disabled={busy === p.id}
                        className="h-8 px-4 text-[12px] font-medium rounded-lg text-[#999] dark:text-[#555] hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] disabled:opacity-40 transition-all">
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
          <div className="bg-white dark:bg-[#111] rounded-2xl border border-[#eee] dark:border-[#1a1a1a] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f0f0f0] dark:border-[#1a1a1a]">
              <h2 className="text-[16px] font-bold">Activity</h2>
            </div>

            {activity.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-10 h-10 rounded-full bg-[#f5f5f5] dark:bg-[#151515] flex items-center justify-center mx-auto mb-4">
                  <div className="w-2 h-2 rounded-full bg-[#ddd] dark:bg-[#333] animate-pulse" />
                </div>
                <p className="text-[14px] text-[#bbb] dark:text-[#444]">No activity yet</p>
                <p className="text-[12px] text-[#ddd] dark:text-[#2a2a2a] mt-1">Actions will appear here as your AI works</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f5f5f5] dark:divide-[#151515]">
                {activity.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#fafafa] dark:hover:bg-[#0e0e0e] transition-colors group">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      p.status === "approved" ? "bg-emerald-400" : "bg-red-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-[14px] font-mono">{p.tool}</span>
                      <span className="text-[12px] text-[#ccc] dark:text-[#444] ml-2">{p.clientName}</span>
                    </div>
                    <span className="text-[11px] text-[#ddd] dark:text-[#333] flex-shrink-0">{timeLabel(p.resolvedAt ?? p.requestedAt)}</span>
                    {p.proofDigest && (
                      <a href={`https://occ.wtf/explorer?digest=${encodeURIComponent(p.proofDigest)}`} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-blue-500/60 hover:text-blue-500 transition-colors flex-shrink-0 font-mono">
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
        <p className="text-[11px] text-[#ddd] dark:text-[#2a2a2a]">
          Every action is signed through a Trusted Execution Environment · <a href="https://occ.wtf" target="_blank" rel="noopener noreferrer" className="hover:text-[#999] dark:hover:text-[#555] transition-colors">occ.wtf</a>
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Components
   ═══════════════════════════════════════════════════════════════ */

function Toggle({ on, onChange, small }: { on: boolean; onChange: () => void; small?: boolean }) {
  const w = small ? "w-8" : "w-10";
  const h = small ? "h-[18px]" : "h-[22px]";
  const dot = small ? "w-3.5 h-3.5" : "w-[18px] h-[18px]";
  const translate = small ? "translate-x-[14px]" : "translate-x-[20px]";
  return (
    <button onClick={onChange}
      className={`${w} ${h} rounded-full transition-colors duration-150 flex items-center px-[2px] flex-shrink-0 ${
        on ? "bg-emerald-500" : "bg-[#e0e0e0] dark:bg-[#2a2a2a]"
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

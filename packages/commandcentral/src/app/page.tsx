"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAllPermissions, approvePermission, denyPermission, revokePermission, getConnectConfig, type Permission } from "@/lib/api";

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/auth/me").then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null)).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Page><Center><Spinner size={20} /></Center></Page>;
  if (!user) return <Page><Login /></Page>;
  return <Page user={user}><Dashboard /></Page>;
}

/* ═══════════════════════════════════════════════════════════════
   Page Shell
   ═══════════════════════════════════════════════════════════════ */

function Page({ user, children }: { user?: any; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-[#111]">
      {/* Top bar */}
      <nav className="h-14 px-6 flex items-center justify-between border-b border-[#f0f0f0]">
        <div className="flex items-center gap-6">
          <span className="text-[16px] font-black tracking-[-0.03em]">OCC</span>
          <div className="hidden sm:flex items-center gap-5">
            <a href="https://occ.wtf/explorer" className="text-[13px] text-[#999] hover:text-[#111] transition-colors">Explorer</a>
            <a href="https://occ.wtf/docs" className="text-[13px] text-[#999] hover:text-[#111] transition-colors">Docs</a>
          </div>
        </div>
        {user && (
          <a href="/auth/logout" className="flex items-center gap-2 text-[12px] text-[#bbb] hover:text-[#666] transition-colors">
            {user.avatar && <img src={user.avatar} className="w-6 h-6 rounded-full" alt="" />}
            <span className="hidden sm:inline">{user.name}</span>
          </a>
        )}
      </nav>
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
        <h1 className="text-[48px] font-black tracking-[-0.04em] leading-[1.05] mb-4">
          Control wtf<br />your AI can do.
        </h1>
        <p className="text-[15px] text-[#999] mb-10 leading-relaxed">
          One link. Every tool call your AI makes goes through OCC.
          You decide what&apos;s allowed. Everything gets a cryptographic proof.
        </p>
        <a href="/auth/login/github"
          className="inline-flex items-center gap-2.5 h-12 px-8 text-[14px] font-semibold rounded-full bg-[#111] text-white hover:bg-[#333] transition-colors">
          <GitHubIcon />
          Continue with GitHub
        </a>
      </div>
    </Center>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Dashboard — the whole product on one screen
   ═══════════════════════════════════════════════════════════════ */

function Dashboard() {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [mcpUrl, setMcpUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"pending" | "allowed" | "blocked">("pending");

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
  const blocked = useMemo(() => perms.filter(p => p.status === "denied" || p.status === "revoked"), [perms]);

  // Auto-switch to pending tab when new requests arrive
  useEffect(() => {
    if (pending.length > 0 && tab !== "pending") setTab("pending");
  }, [pending.length]);

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); await refresh(); }
    finally { setBusy(null); }
  }

  const copy = () => {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <Center><Spinner size={20} /></Center>;

  const hasAnything = perms.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 sm:py-12">

      {/* ── Connect section ── */}
      <div className="mb-10">
        <h1 className="text-[32px] sm:text-[40px] font-black tracking-[-0.04em] leading-[1.1] mb-2">
          {hasAnything ? "Your AI" : "Connect your AI"}
        </h1>
        <p className="text-[15px] text-[#999] mb-5">
          {hasAnything
            ? `${allowed.length} tool${allowed.length === 1 ? "" : "s"} allowed · ${pending.length} pending`
            : "Paste this link into Cursor, Claude Code, or any MCP-compatible AI tool."
          }
        </p>

        {/* URL bar */}
        <div className="flex gap-2">
          <div className="flex-1 h-11 flex items-center px-4 rounded-xl bg-[#f7f7f7] border border-[#eee] overflow-hidden cursor-pointer group" onClick={copy}>
            <span className="text-[12px] font-mono text-[#999] group-hover:text-[#666] truncate transition-colors select-all">
              {mcpUrl || "Loading..."}
            </span>
          </div>
          <button onClick={copy}
            className="h-11 px-5 text-[13px] font-semibold rounded-xl bg-[#111] text-white hover:bg-[#333] transition-all active:scale-[0.97] flex-shrink-0">
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* Quick instructions */}
        {!hasAnything && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Instruction step="1" title="Copy the link" desc="Click Copy above" />
            <Instruction step="2" title="Paste into your AI" desc="Cursor → Settings → MCP" />
            <Instruction step="3" title="Use your AI" desc="Requests appear here" />
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      {hasAnything && (
        <>
          <div className="flex gap-1 mb-5 border-b border-[#f0f0f0]">
            <Tab active={tab === "pending"} onClick={() => setTab("pending")} count={pending.length} pulse={pending.length > 0}>
              Inbox
            </Tab>
            <Tab active={tab === "allowed"} onClick={() => setTab("allowed")} count={allowed.length}>
              Allowed
            </Tab>
            <Tab active={tab === "blocked"} onClick={() => setTab("blocked")} count={blocked.length}>
              Blocked
            </Tab>
          </div>

          {/* ── Pending ── */}
          {tab === "pending" && (
            pending.length === 0 ? (
              <Empty icon="✓" text="All caught up" sub="New requests will appear here when your AI tries something new." />
            ) : (
              <div className="space-y-2 animate-fade-in">
                {pending.map(p => (
                  <PendingCard key={p.id} perm={p}
                    onAllow={() => act(p.id, () => approvePermission(p.id))}
                    onBlock={() => act(p.id, () => denyPermission(p.id))}
                    busy={busy === p.id}
                  />
                ))}
              </div>
            )
          )}

          {/* ── Allowed ── */}
          {tab === "allowed" && (
            allowed.length === 0 ? (
              <Empty icon="○" text="Nothing allowed yet" sub="Approve tools from your Inbox to see them here." />
            ) : (
              <div className="rounded-2xl border border-[#f0f0f0] divide-y divide-[#f5f5f5] overflow-hidden animate-fade-in">
                {allowed.map(p => (
                  <ToolRow key={p.id} perm={p}
                    action={
                      <button onClick={() => act(p.id, () => revokePermission(p.agentId, p.tool))}
                        className="text-[11px] text-[#ccc] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                        revoke
                      </button>
                    }
                  />
                ))}
              </div>
            )
          )}

          {/* ── Blocked ── */}
          {tab === "blocked" && (
            blocked.length === 0 ? (
              <Empty icon="—" text="Nothing blocked" sub="Denied or revoked tools appear here." />
            ) : (
              <div className="rounded-2xl border border-[#f0f0f0] divide-y divide-[#f5f5f5] overflow-hidden animate-fade-in">
                {blocked.map(p => (
                  <ToolRow key={p.id} perm={p} blocked
                    action={
                      p.explorerUrl ? (
                        <a href={p.explorerUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-[#ddd] hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100 font-mono">
                          proof
                        </a>
                      ) : null
                    }
                  />
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* ── Empty state when nothing has happened yet ── */}
      {!hasAnything && (
        <div className="text-center pt-16 pb-8">
          <div className="w-12 h-12 rounded-full bg-[#f7f7f7] flex items-center justify-center mx-auto mb-4">
            <div className="w-2 h-2 rounded-full bg-[#ddd] animate-pulse" />
          </div>
          <p className="text-[15px] text-[#bbb] mb-1">Waiting for your AI to connect...</p>
          <p className="text-[12px] text-[#ddd]">Paste the link above into your AI tool and start using it</p>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="mt-16 pt-6 border-t border-[#f5f5f5] text-center">
        <p className="text-[11px] text-[#ddd]">
          Every action is signed through a Trusted Execution Environment · <a href="https://occ.wtf" className="hover:text-[#999] transition-colors">occ.wtf</a>
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Components
   ═══════════════════════════════════════════════════════════════ */

function PendingCard({ perm, onAllow, onBlock, busy }: {
  perm: Permission; onAllow: () => void; onBlock: () => void; busy: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#f0f0f0] p-5 transition-all hover:border-[#e0e0e0] hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold text-[#111] font-mono tracking-[-0.01em]">{perm.tool}</p>
          <p className="text-[13px] text-[#aaa] mt-1">
            <span className="text-[#888] font-medium">{perm.clientName}</span> wants to use this tool
          </p>
          {(() => {
            const args = perm.requestArgs as Record<string, unknown> | null;
            if (!args || typeof args !== "object" || Object.keys(args).length === 0) return null;
            return (
              <pre className="mt-3 text-[11px] font-mono text-[#999] bg-[#fafafa] rounded-lg px-3 py-2 overflow-x-auto border border-[#f5f5f5]">
                {JSON.stringify(args, null, 2).slice(0, 200)}
              </pre>
            );
          })()}
        </div>
      </div>
      <div className="flex gap-2 mt-4 ml-[52px]">
        <button onClick={onAllow} disabled={busy}
          className="h-10 px-6 text-[13px] font-semibold rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all active:scale-[0.97] flex items-center gap-2">
          {busy && <Spinner size={14} color="white" />}
          Allow
        </button>
        <button onClick={onBlock} disabled={busy}
          className="h-10 px-6 text-[13px] font-medium rounded-xl text-[#999] hover:bg-[#f5f5f5] disabled:opacity-40 transition-all active:scale-[0.97]">
          Block
        </button>
      </div>
    </div>
  );
}

function ToolRow({ perm, action, blocked }: { perm: Permission; action?: React.ReactNode; blocked?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 group hover:bg-[#fafafa] transition-colors">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${blocked ? "bg-red-300" : "bg-emerald-400"}`} />
      <span className="text-[14px] font-mono text-[#444] flex-1 truncate">{perm.tool}</span>
      <span className="text-[11px] text-[#ddd] flex-shrink-0">{perm.clientName}</span>
      {action}
    </div>
  );
}

function Tab({ active, onClick, count, pulse, children }: {
  active: boolean; onClick: () => void; count: number; pulse?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`px-4 pb-3 text-[13px] font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
        active ? "border-[#111] text-[#111]" : "border-transparent text-[#bbb] hover:text-[#888]"
      }`}>
      {children}
      {count > 0 && (
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
          pulse ? "bg-amber-100 text-amber-700" : "bg-[#f0f0f0] text-[#999]"
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function Instruction({ step, title, desc }: { step: string; title: string; desc: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="w-6 h-6 rounded-full bg-[#f0f0f0] text-[11px] font-bold text-[#999] flex items-center justify-center flex-shrink-0">{step}</span>
      <div>
        <p className="text-[13px] font-medium text-[#555]">{title}</p>
        <p className="text-[12px] text-[#bbb]">{desc}</p>
      </div>
    </div>
  );
}

function Empty({ icon, text, sub }: { icon: string; text: string; sub: string }) {
  return (
    <div className="text-center py-16">
      <span className="text-[24px] text-[#ddd]">{icon}</span>
      <p className="text-[14px] text-[#aaa] mt-3 mb-1">{text}</p>
      <p className="text-[12px] text-[#ccc] max-w-[280px] mx-auto">{sub}</p>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 56px)" }}>{children}</div>;
}

function Spinner({ size = 16, color = "#999" }: { size?: number; color?: string }) {
  return (
    <div className="animate-spin rounded-full"
      style={{
        width: size, height: size,
        border: `2px solid ${color}33`,
        borderTopColor: color,
      }}
    />
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}

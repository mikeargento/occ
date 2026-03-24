"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getAllPermissions, approvePermission, denyPermission, revokePermission, getConnectConfig, type Permission } from "@/lib/api";

function timeLabel(ts: number | string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-[#111] dark:text-[#e5e5e5]">
      <nav className="h-14 px-6 flex items-center justify-between border-b border-[#f0f0f0] dark:border-[#1a1a1a]">
        <div className="flex items-center gap-6">
          <span className="text-[16px] font-black tracking-[-0.03em]">OCC</span>
          <div className="hidden sm:flex items-center gap-5">
            <a href="https://occ.wtf/explorer" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#999] dark:text-[#666] hover:text-[#111] dark:hover:text-[#e5e5e5] transition-colors">Explorer</a>
            <a href="https://occ.wtf/docs" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#999] dark:text-[#666] hover:text-[#111] dark:hover:text-[#e5e5e5] transition-colors">Docs</a>
          </div>
        </div>
        {user && (
          <a href="/auth/logout" className="flex items-center gap-2 text-[12px] text-[#bbb] dark:text-[#555] hover:text-[#666] dark:hover:text-[#999] transition-colors">
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
          Define what<br />your AI can do.
        </h1>
        <p className="text-[15px] text-[#999] dark:text-[#666] mb-10 leading-relaxed">
          Every rule is cryptographically proven before a single action can exist.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-[280px] mx-auto">
          <a href="/auth/login/github"
            className="inline-flex items-center justify-center gap-2.5 h-12 px-6 text-[14px] font-semibold rounded-full bg-[#111] dark:bg-white text-white dark:text-[#111] hover:bg-[#333] dark:hover:bg-[#ddd] transition-colors w-full">
            <GitHubIcon />
            Continue with GitHub
          </a>
          <a href="/auth/login/google"
            className="inline-flex items-center justify-center gap-2.5 h-12 px-6 text-[14px] font-semibold rounded-full border border-[#e0e0e0] dark:border-[#333] text-[#444] dark:text-[#ccc] hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] transition-colors w-full">
            <GoogleIcon />
            Continue with Google
          </a>
          <a href="/auth/login/apple"
            className="inline-flex items-center justify-center gap-2.5 h-12 px-6 text-[14px] font-semibold rounded-full border border-[#e0e0e0] dark:border-[#333] text-[#444] dark:text-[#ccc] hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] transition-colors w-full">
            <AppleIcon />
            Continue with Apple
          </a>
        </div>
      </div>
    </Center>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Dashboard
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

      {/* Connect */}
      <div className="mb-10">
        <h1 className="text-[32px] sm:text-[40px] font-black tracking-[-0.04em] leading-[1.1] mb-2">
          {hasAnything ? "Your AI" : "Connect your AI"}
        </h1>
        <p className="text-[15px] text-[#999] dark:text-[#666] mb-5">
          {hasAnything
            ? `${allowed.length} tool${allowed.length === 1 ? "" : "s"} allowed · ${pending.length} pending`
            : "Paste this link into Cursor, Claude Code, or any MCP-compatible AI tool."
          }
        </p>

        <div className="flex gap-2">
          <div className="flex-1 h-11 flex items-center px-4 rounded-xl bg-[#f7f7f7] dark:bg-[#141414] border border-[#eee] dark:border-[#222] overflow-hidden cursor-pointer group" onClick={copy}>
            <span className="text-[12px] font-mono text-[#999] dark:text-[#555] group-hover:text-[#666] dark:group-hover:text-[#888] truncate transition-colors select-all">
              {mcpUrl || "Loading..."}
            </span>
          </div>
          <button onClick={copy}
            className="h-11 px-5 text-[13px] font-semibold rounded-xl bg-[#111] dark:bg-white text-white dark:text-[#111] hover:bg-[#333] dark:hover:bg-[#ddd] transition-all active:scale-[0.97] flex-shrink-0">
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {!hasAnything && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Instruction step="1" title="Copy the link" desc="Click Copy above" />
            <Instruction step="2" title="Paste into your AI" desc="Cursor → Settings → MCP" />
            <Instruction step="3" title="Use your AI" desc="Requests appear here" />
          </div>
        )}
      </div>

      {/* Tabs */}
      {hasAnything && (
        <>
          <div className="flex gap-1 mb-5 border-b border-[#f0f0f0] dark:border-[#1a1a1a]">
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

          {tab === "allowed" && (
            allowed.length === 0 ? (
              <Empty icon="○" text="Nothing allowed yet" sub="Approve tools from your Inbox to see them here." />
            ) : (
              <div className="rounded-2xl border border-[#f0f0f0] dark:border-[#1a1a1a] divide-y divide-[#f5f5f5] dark:divide-[#151515] overflow-hidden animate-fade-in">
                {allowed.map(p => (
                  <ToolRow key={p.id} perm={p}
                    action={
                      <button onClick={() => act(p.id, () => revokePermission(p.agentId, p.tool))}
                        disabled={busy === p.id}
                        className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-red-200/50 dark:border-red-500/20 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex-shrink-0 disabled:opacity-40">
                        {busy === p.id ? "..." : "Revoke"}
                      </button>
                    }
                  />
                ))}
              </div>
            )
          )}

          {tab === "blocked" && (
            blocked.length === 0 ? (
              <Empty icon="—" text="Nothing blocked" sub="Denied or revoked tools appear here." />
            ) : (
              <div className="rounded-2xl border border-[#f0f0f0] dark:border-[#1a1a1a] divide-y divide-[#f5f5f5] dark:divide-[#151515] overflow-hidden animate-fade-in">
                {blocked.map(p => (
                  <ToolRow key={p.id} perm={p} blocked />
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* Empty state */}
      {!hasAnything && (
        <div className="text-center pt-16 pb-8">
          <div className="w-12 h-12 rounded-full bg-[#f7f7f7] dark:bg-[#141414] flex items-center justify-center mx-auto mb-4">
            <div className="w-2 h-2 rounded-full bg-[#ddd] dark:bg-[#333] animate-pulse" />
          </div>
          <p className="text-[15px] text-[#bbb] dark:text-[#555] mb-1">Waiting for your AI to connect...</p>
          <p className="text-[12px] text-[#ddd] dark:text-[#333]">Paste the link above into your AI tool and start using it</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-16 pt-6 border-t border-[#f5f5f5] dark:border-[#141414] text-center">
        <p className="text-[11px] text-[#ddd] dark:text-[#333]">
          Every action is signed through a Trusted Execution Environment · <a href="https://occ.wtf" target="_blank" rel="noopener noreferrer" className="hover:text-[#999] dark:hover:text-[#666] transition-colors">occ.wtf</a>
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
    <div className="bg-white dark:bg-[#111] rounded-2xl border border-[#f0f0f0] dark:border-[#1a1a1a] p-5 transition-all hover:border-[#e0e0e0] dark:hover:border-[#2a2a2a] hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold font-mono tracking-[-0.01em]">{perm.tool}</p>
          <p className="text-[13px] text-[#aaa] dark:text-[#555] mt-1">
            <span className="text-[#888] dark:text-[#777] font-medium">{perm.clientName}</span> wants to use this tool
          </p>
          {(() => {
            const args = perm.requestArgs as Record<string, unknown> | null;
            if (!args || typeof args !== "object" || Object.keys(args).length === 0) return null;
            return (
              <pre className="mt-3 text-[11px] font-mono text-[#999] dark:text-[#555] bg-[#fafafa] dark:bg-[#0a0a0a] rounded-lg px-3 py-2 overflow-x-auto border border-[#f5f5f5] dark:border-[#1a1a1a]">
                {JSON.stringify(args, null, 2).slice(0, 200)}
              </pre>
            );
          })()}
        </div>
      </div>
      <div className="flex gap-3 mt-5 ml-[52px]">
        <button onClick={onAllow} disabled={busy}
          className="h-11 px-8 text-[14px] font-bold rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all active:scale-[0.97] flex items-center gap-2 shadow-[0_2px_8px_rgba(52,211,153,0.3)]">
          {busy && <Spinner size={14} color="white" />}
          {busy ? "Signing..." : "Allow"}
        </button>
        <button onClick={onBlock} disabled={busy}
          className="h-11 px-8 text-[14px] font-medium rounded-xl border border-red-200/60 dark:border-red-500/20 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40 transition-all active:scale-[0.97]">
          Block
        </button>
      </div>
    </div>
  );
}

function ToolRow({ perm, action, blocked }: { perm: Permission; action?: React.ReactNode; blocked?: boolean }) {
  const digest = perm.proofDigest;
  const proofUrl = digest ? `https://occ.wtf/explorer/${digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}` : perm.explorerUrl || null;
  return (
    <div className="flex items-center gap-3 px-5 py-4 group hover:bg-[#fafafa] dark:hover:bg-[#111] transition-colors">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${blocked ? "bg-red-300 dark:bg-red-500/60" : "bg-emerald-400"}`} />
      <div className="flex-1 min-w-0">
        <span className="text-[14px] font-mono text-[#444] dark:text-[#999] truncate block">{perm.tool}</span>
        <span className="text-[11px] text-[#ccc] dark:text-[#444] mt-0.5 block">{perm.clientName} · {timeLabel(perm.resolvedAt ?? perm.requestedAt)}</span>
      </div>
      {proofUrl && (
        <a href={proofUrl} target="_blank" rel="noopener noreferrer"
          className="text-[11px] text-blue-500/70 hover:text-blue-500 transition-colors font-mono flex-shrink-0">
          proof ↗
        </a>
      )}
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
        active
          ? "border-[#111] dark:border-[#e5e5e5] text-[#111] dark:text-[#e5e5e5]"
          : "border-transparent text-[#bbb] dark:text-[#555] hover:text-[#888] dark:hover:text-[#999]"
      }`}>
      {children}
      {count > 0 && (
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
          pulse
            ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : "bg-[#f0f0f0] dark:bg-[#1a1a1a] text-[#999] dark:text-[#666]"
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
      <span className="w-6 h-6 rounded-full bg-[#f0f0f0] dark:bg-[#1a1a1a] text-[11px] font-bold text-[#999] dark:text-[#555] flex items-center justify-center flex-shrink-0">{step}</span>
      <div>
        <p className="text-[13px] font-medium text-[#555] dark:text-[#aaa]">{title}</p>
        <p className="text-[12px] text-[#bbb] dark:text-[#444]">{desc}</p>
      </div>
    </div>
  );
}

function Empty({ icon, text, sub }: { icon: string; text: string; sub: string }) {
  return (
    <div className="text-center py-16">
      <span className="text-[24px] text-[#ddd] dark:text-[#333]">{icon}</span>
      <p className="text-[14px] text-[#aaa] dark:text-[#555] mt-3 mb-1">{text}</p>
      <p className="text-[12px] text-[#ccc] dark:text-[#333] max-w-[280px] mx-auto">{sub}</p>
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
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

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}

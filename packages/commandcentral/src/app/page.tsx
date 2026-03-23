"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getPendingPermissions, getActivePermissions, approvePermission, denyPermission, revokePermission, getConnectConfig } from "@/lib/api";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

interface PendingRequest {
  id: number; agentId: string; tool: string; clientName: string; requestedAt: number;
}

interface ActivePerm {
  id: number; agentId: string; tool: string; status: string; resolvedAt: number | null;
  proofDigest: string | null; explorerUrl: string | null;
}

export default function App() {
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [active, setActive] = useState<ActivePerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<Set<number>>(new Set());
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([getPendingPermissions(), getActivePermissions()]);
      setPending(p.requests);
      setActive(a.permissions);
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
    setResolving(s => new Set(s).add(id));
    try { await approvePermission(id); await refresh(); }
    finally { setResolving(s => { const n = new Set(s); n.delete(id); return n; }); }
  }

  async function handleDeny(id: number) {
    setResolving(s => new Set(s).add(id));
    try { await denyPermission(id); await refresh(); }
    finally { setResolving(s => { const n = new Set(s); n.delete(id); return n; }); }
  }

  async function handleRevoke(agentId: string, tool: string) {
    await revokePermission(agentId, tool); await refresh();
  }

  function copyUrl() {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isEmpty = !loading && pending.length === 0 && active.length === 0;

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* Header — minimal */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border/50">
        <span className="text-[15px] font-black tracking-[-0.02em] text-text">OCC</span>
        <div className="flex items-center gap-3">
          {pending.length > 0 && (
            <span className="text-[11px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
          <button
            onClick={() => setShowSetup(!showSetup)}
            className="text-xs text-text-tertiary hover:text-text transition-colors"
          >
            {showSetup ? "Close" : "Setup"}
          </button>
        </div>
      </header>

      {/* Setup panel — slides down */}
      {showSetup && (
        <div className="px-5 py-4 border-b border-border/50 bg-bg-subtle/50 animate-slide-up">
          <p className="text-xs text-text-tertiary mb-2">Add this to your AI tool:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-bg-inset rounded-lg px-3 py-2 text-text-secondary truncate select-all">
              {mcpUrl || "Loading..."}
            </code>
            <button onClick={copyUrl}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-text text-bg hover:opacity-90 transition-all active:scale-[0.97] flex-shrink-0">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[10px] text-text-tertiary mt-2">
            Works with Claude Code, Cursor, Windsurf, or any MCP client.
          </p>
        </div>
      )}

      {/* Feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-4">

        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
          </div>
        )}

        {isEmpty && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 mb-5 rounded-full bg-bg-subtle flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <p className="text-base font-medium text-text mb-1">Waiting for your AI</p>
            <p className="text-sm text-text-tertiary max-w-[280px]">
              Connect an AI tool and start using it. When it needs a new ability, it'll ask you here.
            </p>
            {mcpUrl && (
              <button onClick={() => setShowSetup(true)}
                className="mt-5 px-5 py-2.5 text-sm font-semibold rounded-full bg-text text-bg hover:opacity-90 transition-all active:scale-[0.97]">
                Get started
              </button>
            )}
          </div>
        )}

        {/* Pending — like incoming messages */}
        {pending.map((req) => (
          <div key={req.id} className="mb-3 max-w-[400px]">
            <div className="rounded-2xl rounded-bl-md bg-bg-subtle border border-amber-500/20 px-4 py-3">
              <p className="text-sm text-text">
                <span className="font-semibold">{req.clientName}</span> wants to use
              </p>
              <p className="text-base font-mono font-bold text-text mt-0.5">{req.tool}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => handleApprove(req.id)} disabled={resolving.has(req.id)}
                  className="flex-1 py-2 text-sm font-semibold rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 active:scale-[0.97]">
                  Allow
                </button>
                <button onClick={() => handleDeny(req.id)} disabled={resolving.has(req.id)}
                  className="flex-1 py-2 text-sm font-semibold rounded-xl bg-bg border border-border text-text-secondary hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50 active:scale-[0.97]">
                  Deny
                </button>
              </div>
            </div>
            <p className="text-[10px] text-text-tertiary mt-1 ml-1">{timeAgo(req.requestedAt)}</p>
          </div>
        ))}

        {/* Active — like sent messages / resolved */}
        {active.length > 0 && (
          <div className="mt-2">
            {active.map((perm) => (
              <div key={`${perm.agentId}-${perm.tool}`} className="mb-2 flex justify-end">
                <div>
                  <div className="rounded-2xl rounded-br-md bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 max-w-[340px]">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-text">{perm.tool}</span>
                      <span className="text-[10px] text-emerald-500 font-semibold">ALLOWED</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-0.5 mr-1">
                    {perm.explorerUrl && (
                      <a href={perm.explorerUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-emerald-500/70 hover:text-emerald-500">proof</a>
                    )}
                    <button onClick={() => handleRevoke(perm.agentId, perm.tool)}
                      className="text-[10px] text-text-tertiary hover:text-red-400 transition-colors">revoke</button>
                    {perm.resolvedAt && (
                      <span className="text-[10px] text-text-tertiary">{timeAgo(perm.resolvedAt)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { getPendingPermissions, getActivePermissions, approvePermission, denyPermission, revokePermission } from "@/lib/api";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
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

export default function PermissionsPage() {
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [active, setActive] = useState<ActivePerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([getPendingPermissions(), getActivePermissions()]);
      setPending(p.requests);
      setActive(a.permissions);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "permission-requested" || data.type === "permission-resolved") refresh();
      } catch {}
    };
    const interval = setInterval(refresh, 5000);
    return () => { es.close(); clearInterval(interval); };
  }, [refresh]);

  async function handleApprove(id: number) {
    setResolving(s => new Set(s).add(id));
    try { await approvePermission(id); await refresh(); }
    catch {} finally { setResolving(s => { const n = new Set(s); n.delete(id); return n; }); }
  }

  async function handleDeny(id: number) {
    setResolving(s => new Set(s).add(id));
    try { await denyPermission(id); await refresh(); }
    catch {} finally { setResolving(s => { const n = new Set(s); n.delete(id); return n; }); }
  }

  async function handleRevoke(agentId: string, tool: string) {
    try { await revokePermission(agentId, tool); await refresh(); } catch {}
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] mb-1">Permissions</h1>
      <p className="text-sm text-text-secondary mb-8">
        Your AI asks for permission as it needs new tools. Allow or deny here.
      </p>

      {/* Pending Requests */}
      {pending.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-3">
            Awaiting your decision
          </h2>
          <div className="space-y-3">
            {pending.map((req) => (
              <div key={req.id} className="flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-amber-500/30 bg-amber-500/[0.04]">
                <div className="relative flex-shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping opacity-40" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-semibold text-text truncate">{req.tool}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">{req.clientName} &middot; {timeAgo(req.requestedAt)}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => handleApprove(req.id)} disabled={resolving.has(req.id)}
                    className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 active:scale-[0.97]">
                    Allow
                  </button>
                  <button onClick={() => handleDeny(req.id)} disabled={resolving.has(req.id)}
                    className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 active:scale-[0.97]">
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && pending.length === 0 && active.length === 0 && (
        <div className="text-center py-16">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-bg-subtle flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <p className="text-sm text-text-secondary font-medium">No permissions yet</p>
          <p className="text-xs text-text-tertiary mt-1 max-w-xs mx-auto">
            Connect an AI tool and start using it. Permission requests will appear here.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-3">
            Active permissions
          </h2>
          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {active.map((perm) => (
              <div key={`${perm.agentId}-${perm.tool}`} className="flex items-center gap-4 px-5 py-3 bg-bg-subtle/30">
                <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-text truncate">{perm.tool}</p>
                  {perm.resolvedAt && <p className="text-xs text-text-tertiary">Allowed {timeAgo(perm.resolvedAt)}</p>}
                </div>
                {perm.explorerUrl && (
                  <a href={perm.explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-emerald-500 hover:underline flex-shrink-0">proof</a>
                )}
                <button onClick={() => handleRevoke(perm.agentId, perm.tool)}
                  className="text-xs text-text-tertiary hover:text-red-400 transition-colors flex-shrink-0">Revoke</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="space-y-3"><div className="skeleton h-[72px] rounded-xl" /><div className="skeleton h-[72px] rounded-xl" /></div>}
    </div>
  );
}

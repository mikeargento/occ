"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CheckCircle, XCircle, Clock, Play } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { v2GetRequests, v2GetOverview } from "@/lib/api-v2";
import type { V2Request, V2Overview, RiskLane, RequestStatus } from "@/lib/types-v2";
import { getLaneConfig } from "@/lib/risk-lanes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusIcon({ status }: { status: RequestStatus }) {
  switch (status) {
    case "approved":
    case "auto_approved":
      return <CheckCircle size={14} className="text-[#22c55e] shrink-0" />;
    case "denied":
      return <XCircle size={14} className="text-[#ef4444] shrink-0" />;
    case "pending":
      return <Clock size={14} className="text-[#f59e0b] shrink-0" />;
    default:
      return <Play size={14} className="text-[#3B82F6] shrink-0" />;
  }
}

function RiskBadge({ lane }: { lane: RiskLane }) {
  const config = getLaneConfig(lane);
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium"
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
        border: `1px solid ${config.borderColor}`,
      }}
    >
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Activity Row
// ---------------------------------------------------------------------------

function ActivityRow({ request }: { request: V2Request }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 border-b border-[var(--border)] last:border-b-0">
      <StatusIcon status={request.status} />
      <span className="text-sm font-mono font-medium text-[var(--text-primary)] truncate min-w-0 flex-shrink-0 max-w-[200px]">
        {request.label || request.tool}
      </span>
      <p className="text-xs text-[var(--text-tertiary)] truncate flex-1 min-w-0">
        {request.summary || "—"}
      </p>
      <span className="text-xs text-[var(--text-tertiary)] shrink-0">
        {request.agentId.slice(0, 8)}
      </span>
      <span className="text-xs text-[var(--text-tertiary)] shrink-0">
        {request.originClient || request.originType}
      </span>
      <RiskBadge lane={request.riskLane} />
      <span className="text-xs text-[var(--text-tertiary)] shrink-0 w-14 text-right">
        {timeAgo(request.createdAt)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ActivityPage() {
  const [overview, setOverview] = useState<V2Overview | null>(null);
  const [requests, setRequests] = useState<V2Request[]>([]);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, reqs] = await Promise.all([
        v2GetOverview(),
        v2GetRequests({ limit: 100 }),
      ]);
      setOverview(ov);
      setRequests(reqs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  return (
    <Shell pendingCount={overview?.pending}>
      <PageHeader
        title="Activity"
        description="Live feed of all requests"
        actions={
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
            Polling every 5s
          </span>
        }
      />

      {error && (
        <div className="mb-4 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
          <Clock size={32} className="mb-3 opacity-40" />
          <p className="text-sm">No activity yet</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border)]">
          {requests.map((req) => (
            <ActivityRow key={req.id} request={req} />
          ))}
        </div>
      )}
    </Shell>
  );
}

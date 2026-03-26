"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Square, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { v2GetRun, v2GetOverview } from "@/lib/api-v2";
import type { V2RunDetail, V2Request, V2Overview, RequestStatus, RiskLane } from "@/lib/types-v2";
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function duration(start: string, end: string | null): string {
  if (!end) return "running";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  return `${minutes}m ${remainSec}s`;
}

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    active: { bg: "rgba(59,130,246,0.1)", text: "#3B82F6", border: "rgba(59,130,246,0.3)", icon: <Play size={10} /> },
    completed: { bg: "rgba(34,197,94,0.1)", text: "#22c55e", border: "rgba(34,197,94,0.3)", icon: <Square size={10} /> },
    failed: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", border: "rgba(239,68,68,0.3)", icon: <AlertTriangle size={10} /> },
  };
  const s = styles[status] ?? styles.completed;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {s.icon}
      {status}
    </span>
  );
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
      style={{ color: config.color, backgroundColor: config.bgColor, border: `1px solid ${config.borderColor}` }}
    >
      {config.label}
    </span>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
        {label}
      </span>
      <div className="text-sm text-[var(--text-primary)] mt-0.5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Request Row
// ---------------------------------------------------------------------------

function RequestRow({ request }: { request: V2Request }) {
  return (
    <Link
      href={`/approvals/${request.id}`}
      className="flex items-center gap-3 py-2.5 px-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[rgba(59,130,246,0.03)] transition-colors"
    >
      <StatusIcon status={request.status} />
      <span className="text-sm font-mono font-medium text-[var(--text-primary)] truncate flex-shrink-0 max-w-[200px]">
        {request.label || request.tool}
      </span>
      <p className="text-xs text-[var(--text-tertiary)] truncate flex-1 min-w-0">
        {request.summary || "—"}
      </p>
      <RiskBadge lane={request.riskLane} />
      <span className="text-xs text-[var(--text-tertiary)] shrink-0 w-14 text-right">
        {timeAgo(request.createdAt)}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RunDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [run, setRun] = useState<V2RunDetail | null>(null);
  const [overview, setOverview] = useState<V2Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, ov] = await Promise.all([v2GetRun(id), v2GetOverview()]);
      setRun(r);
      setOverview(ov);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Shell pendingCount={overview?.pending}>
      <div className="mb-4">
        <Link
          href="/runs"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft size={12} />
          Back to runs
        </Link>
      </div>

      <PageHeader
        title={run ? run.name || `Run #${run.id}` : "Run Detail"}
        description={run?.summary || undefined}
      />

      {error && (
        <div className="mb-4 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      {!run ? (
        <p className="text-sm text-[var(--text-tertiary)]">Loading...</p>
      ) : (
        <div className="space-y-6">
          {/* Header Info */}
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoRow label="Status">
                <RunStatusBadge status={run.status} />
              </InfoRow>
              <InfoRow label="Agent">
                <span className="font-mono text-xs">{run.agentId}</span>
              </InfoRow>
              <InfoRow label="Started">
                {formatDate(run.startedAt)}
              </InfoRow>
              <InfoRow label="Duration">
                {duration(run.startedAt, run.endedAt)}
              </InfoRow>
            </div>
          </div>

          {/* Requests */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Requests ({run.requests.length})
            </h2>
            {run.requests.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)]">No requests in this run.</p>
            ) : (
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)]">
                {run.requests.map((req) => (
                  <RequestRow key={req.id} request={req} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}

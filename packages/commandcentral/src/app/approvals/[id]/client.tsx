"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, X, Play } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { v2GetRequest, v2GetOverview } from "@/lib/api-v2";
import type {
  V2RequestDetail,
  V2Decision,
  V2Execution,
  V2Overview,
  RiskLane,
  RequestStatus,
} from "@/lib/types-v2";
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

function StatusBadge({ status }: { status: RequestStatus }) {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    pending: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b", border: "rgba(245,158,11,0.3)" },
    approved: { bg: "rgba(34,197,94,0.1)", text: "#22c55e", border: "rgba(34,197,94,0.3)" },
    auto_approved: { bg: "rgba(34,197,94,0.1)", text: "#22c55e", border: "rgba(34,197,94,0.3)" },
    denied: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", border: "rgba(239,68,68,0.3)" },
    expired: { bg: "rgba(102,102,102,0.1)", text: "#666666", border: "rgba(102,102,102,0.3)" },
  };
  const s = styles[status] ?? styles.expired;
  const label = status.replace("_", " ");
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 text-sm font-semibold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {label}
    </span>
  );
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

// ---------------------------------------------------------------------------
// Info Grid
// ---------------------------------------------------------------------------

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
// Decision Timeline
// ---------------------------------------------------------------------------

function DecisionTimeline({ decisions }: { decisions: V2Decision[] }) {
  if (decisions.length === 0) {
    return <p className="text-sm text-[var(--text-tertiary)]">No decisions yet.</p>;
  }
  return (
    <div className="space-y-3">
      {decisions.map((d) => (
        <div key={d.id} className="flex items-start gap-3">
          <div className="mt-0.5">
            {d.decision === "approved" ? (
              <Check size={14} className="text-[#22c55e]" />
            ) : (
              <X size={14} className="text-[#ef4444]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--text-primary)] capitalize">
                {d.decision}
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                by {d.decidedBy} ({d.mode})
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                {timeAgo(d.decidedAt)}
              </span>
            </div>
            {d.reason && (
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">{d.reason}</p>
            )}
            {d.proofDigest && (
              <p className="text-[11px] font-mono text-[var(--text-tertiary)] mt-0.5 truncate">
                {d.proofDigest}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Execution Section
// ---------------------------------------------------------------------------

function ExecutionSection({ executions }: { executions: V2Execution[] }) {
  if (executions.length === 0) {
    return <p className="text-sm text-[var(--text-tertiary)]">Not yet executed.</p>;
  }
  return (
    <div className="space-y-3">
      {executions.map((ex) => (
        <div key={ex.id} className="bg-[var(--bg)] border border-[var(--border)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Play size={12} className="text-[#3B82F6]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {ex.status}
            </span>
            {ex.durationMs != null && (
              <span className="text-xs text-[var(--text-tertiary)]">
                {ex.durationMs}ms
              </span>
            )}
            <span className="text-xs text-[var(--text-tertiary)]">
              {timeAgo(ex.executedAt)}
            </span>
          </div>
          {ex.error && (
            <p className="text-xs text-[#ef4444] mb-2">{ex.error}</p>
          )}
          {ex.execDigest && (
            <p className="text-[11px] font-mono text-[var(--text-tertiary)] truncate">
              Digest: {ex.execDigest}
            </p>
          )}
          {ex.output != null && (
            <details className="mt-2">
              <summary className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider cursor-pointer select-none">
                Output
              </summary>
              <pre className="mt-1 p-2 bg-[var(--bg-elevated)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(ex.output, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Causal Chain
// ---------------------------------------------------------------------------

function CausalChain({ request }: { request: V2RequestDetail }) {
  const hasDecision = request.decisions.length > 0;
  const hasExecution = request.executions.length > 0;
  const steps = [
    { label: "Request", active: true },
    { label: "Decision", active: hasDecision },
    { label: "Execution", active: hasExecution },
    { label: "Proof", active: hasExecution && !!request.executions[0]?.execDigest },
  ];

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1"
            style={{
              color: step.active ? "var(--text-primary)" : "var(--text-tertiary)",
              backgroundColor: step.active ? "var(--bg-elevated)" : "transparent",
              border: step.active ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <span className="text-[var(--text-tertiary)] text-xs">&rarr;</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RequestDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [request, setRequest] = useState<V2RequestDetail | null>(null);
  const [overview, setOverview] = useState<V2Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [req, ov] = await Promise.all([v2GetRequest(id), v2GetOverview()]);
      setRequest(req);
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
          href="/approvals"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft size={12} />
          Back to approvals
        </Link>
      </div>

      <PageHeader
        title={request ? `Request #${request.id}` : "Request Detail"}
        description={request?.summary || undefined}
      />

      {error && (
        <div className="mb-4 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      {!request ? (
        <p className="text-sm text-[var(--text-tertiary)]">Loading...</p>
      ) : (
        <div className="space-y-6">
          {/* Status + Causal Chain */}
          <div className="flex items-center gap-4">
            <StatusBadge status={request.status} />
            <CausalChain request={request} />
          </div>

          {/* Info Grid */}
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <InfoRow label="Tool">
                <span className="font-mono">{request.tool}</span>
              </InfoRow>
              <InfoRow label="Label">
                {request.label || "\u2014"}
              </InfoRow>
              <InfoRow label="Risk Lane">
                <RiskBadge lane={request.riskLane} />
              </InfoRow>
              <InfoRow label="Agent">
                <span className="font-mono text-xs">{request.agentId}</span>
              </InfoRow>
              <InfoRow label="Origin">
                {request.originClient || request.originType}
              </InfoRow>
              <InfoRow label="Created">
                {formatDate(request.createdAt)}
              </InfoRow>
            </div>
          </div>

          {/* Arguments */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Arguments
            </h2>
            {request.args ? (
              <details open>
                <summary className="text-xs text-[var(--text-tertiary)] cursor-pointer select-none mb-1">
                  Toggle JSON
                </summary>
                <pre className="p-3 bg-[var(--bg-elevated)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(request.args, null, 2)}
                </pre>
              </details>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">No arguments.</p>
            )}
          </section>

          {/* Decision History */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Decision History
            </h2>
            <DecisionTimeline decisions={request.decisions} />
          </section>

          {/* Execution */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Execution
            </h2>
            <ExecutionSection executions={request.executions} />
          </section>
        </div>
      )}
    </Shell>
  );
}

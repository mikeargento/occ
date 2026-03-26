"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Play, Square, AlertTriangle } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { v2GetRuns, v2GetOverview } from "@/lib/api-v2";
import type { V2Run, V2Overview } from "@/lib/types-v2";

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
    active: {
      bg: "rgba(59,130,246,0.1)",
      text: "#3B82F6",
      border: "rgba(59,130,246,0.3)",
      icon: <Play size={10} />,
    },
    completed: {
      bg: "rgba(34,197,94,0.1)",
      text: "#22c55e",
      border: "rgba(34,197,94,0.3)",
      icon: <Square size={10} />,
    },
    failed: {
      bg: "rgba(239,68,68,0.1)",
      text: "#ef4444",
      border: "rgba(239,68,68,0.3)",
      icon: <AlertTriangle size={10} />,
    },
  };
  const s = styles[status] ?? styles.completed;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {s.icon}
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Run Row
// ---------------------------------------------------------------------------

function RunRow({ run }: { run: V2Run }) {
  return (
    <Link
      href={`/runs/${run.id}`}
      className="flex items-center gap-3 py-3 px-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[rgba(59,130,246,0.03)] transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {run.name || "Unnamed run"}
          </span>
          <RunStatusBadge status={run.status} />
        </div>
        {run.summary && (
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
            {run.summary}
          </p>
        )}
      </div>
      <span className="text-xs text-[var(--text-tertiary)] shrink-0">
        {run.agentId.slice(0, 8)}
      </span>
      <span className="text-xs font-mono text-[var(--text-tertiary)] shrink-0 w-14 text-right">
        {run.requestCount} req
      </span>
      <span className="text-xs text-[var(--text-tertiary)] shrink-0 w-16 text-right">
        {duration(run.startedAt, run.endedAt)}
      </span>
      <span className="text-xs text-[var(--text-tertiary)] shrink-0 w-14 text-right">
        {timeAgo(run.startedAt)}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RunsPage() {
  const [overview, setOverview] = useState<V2Overview | null>(null);
  const [runs, setRuns] = useState<V2Run[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, r] = await Promise.all([v2GetOverview(), v2GetRuns({ limit: 100 })]);
      setOverview(ov);
      setRuns(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Shell pendingCount={overview?.pending}>
      <PageHeader title="Runs" description="All agent workflows and sessions" />

      {error && (
        <div className="mb-4 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
          <Play size={32} className="mb-3 opacity-40" />
          <p className="text-sm">No runs yet</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border)]">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </Shell>
  );
}

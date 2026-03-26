"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Clock,
  CheckCircle,
  XCircle,
  Play,
  FileCheck,
  Check,
  X,
} from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { v2GetOverview, v2GetPendingRequests, v2ApproveRequest, v2DenyRequest } from "@/lib/api-v2";
import type { V2Overview, V2Request, V2ActivityItem, RequestStatus, RiskLane } from "@/lib/types-v2";
import { getLaneConfig } from "@/lib/risk-lanes";

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}

function StatCard({ label, value, color, icon }: StatCardProps) {
  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border)] p-4 flex-1 min-w-[140px]">
      <div className="flex items-center justify-between mb-2">
        <span style={{ color }} className="opacity-80">
          {icon}
        </span>
      </div>
      <div className="text-2xl font-bold text-[var(--text-primary)]">{value}</div>
      <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Lane Badge
// ---------------------------------------------------------------------------

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
// Status Dot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: RequestStatus }) {
  const color = {
    pending: "#f59e0b",
    approved: "#22c55e",
    auto_approved: "#22c55e",
    denied: "#ef4444",
    expired: "#666666",
  }[status];
  return (
    <span
      className="inline-block w-2 h-2 shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

// ---------------------------------------------------------------------------
// Time Ago
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

// ---------------------------------------------------------------------------
// Pending Request Row
// ---------------------------------------------------------------------------

function PendingRow({
  request,
  onApprove,
  onDeny,
  acting,
}: {
  request: V2Request;
  onApprove: (id: number) => void;
  onDeny: (id: number) => void;
  acting: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium font-mono text-[var(--text-primary)] truncate">
            {request.tool}
          </span>
          <RiskBadge lane={request.riskLane} />
        </div>
        {request.summary && (
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
            {request.summary}
          </p>
        )}
      </div>
      <span className="text-xs text-[var(--text-tertiary)] shrink-0">
        {request.agentId.slice(0, 8)}
      </span>
      <span className="text-xs text-[var(--text-tertiary)] shrink-0 w-14 text-right">
        {timeAgo(request.createdAt)}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onApprove(request.id)}
          disabled={acting}
          className={cn(
            "flex items-center justify-center w-7 h-7 border border-[#22c55e] text-[#22c55e] transition-colors",
            "hover:bg-[rgba(34,197,94,0.1)] disabled:opacity-40"
          )}
          title="Approve"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => onDeny(request.id)}
          disabled={acting}
          className={cn(
            "flex items-center justify-center w-7 h-7 border border-[#ef4444] text-[#ef4444] transition-colors",
            "hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-40"
          )}
          title="Deny"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Row
// ---------------------------------------------------------------------------

function ActivityRow({ item }: { item: V2ActivityItem }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-b-0">
      <StatusDot status={item.status} />
      <span className="text-sm font-mono text-[var(--text-primary)] truncate flex-1">
        {item.tool}
      </span>
      <span className="text-xs text-[var(--text-tertiary)] shrink-0">
        {item.agentId.slice(0, 8)}
      </span>
      <span className="text-xs text-[var(--text-tertiary)] shrink-0 w-14 text-right">
        {timeAgo(item.createdAt)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Page
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const [overview, setOverview] = useState<V2Overview | null>(null);
  const [pending, setPending] = useState<V2Request[]>([]);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, pend] = await Promise.all([
        v2GetOverview(),
        v2GetPendingRequests(),
      ]);
      setOverview(ov);
      setPending(pend.slice(0, 5));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (id: number) => {
    setActing(true);
    try {
      await v2ApproveRequest(id, "manual");
      await load();
    } finally {
      setActing(false);
    }
  };

  const handleDeny = async (id: number) => {
    setActing(true);
    try {
      await v2DenyRequest(id, "manual");
      await load();
    } finally {
      setActing(false);
    }
  };

  return (
    <Shell pendingCount={overview?.pending}>
      <PageHeader title="Overview" description="Control plane for your AI agents" />

      {error && (
        <div className="mb-4 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      {/* Stat Cards */}
      <div className="flex gap-3 mb-8 flex-wrap">
        <StatCard
          label="Pending"
          value={overview?.pending ?? 0}
          color="#f59e0b"
          icon={<Clock size={18} />}
        />
        <StatCard
          label="Approved today"
          value={overview?.todayApproved ?? 0}
          color="#22c55e"
          icon={<CheckCircle size={18} />}
        />
        <StatCard
          label="Denied today"
          value={overview?.todayDenied ?? 0}
          color="#ef4444"
          icon={<XCircle size={18} />}
        />
        <StatCard
          label="Active runs"
          value={overview?.activeRuns ?? 0}
          color="#3B82F6"
          icon={<Play size={18} />}
        />
        <StatCard
          label="Total today"
          value={overview?.todayTotal ?? 0}
          color="#666666"
          icon={<FileCheck size={18} />}
        />
      </div>

      {/* Pending Approvals */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
          Pending Approvals
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] py-4">
            No pending approvals.
          </p>
        ) : (
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] p-3">
            {pending.map((req) => (
              <PendingRow
                key={req.id}
                request={req}
                onApprove={handleApprove}
                onDeny={handleDeny}
                acting={acting}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
          Recent Activity
        </h2>
        {!overview?.recentActivity?.length ? (
          <p className="text-sm text-[var(--text-tertiary)] py-4">
            No recent activity.
          </p>
        ) : (
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] p-3">
            {overview.recentActivity.slice(0, 10).map((item: V2ActivityItem) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}

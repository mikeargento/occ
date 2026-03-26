"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, X, CheckCircle, Filter } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import {
  v2GetPendingRequests,
  v2ApproveRequest,
  v2DenyRequest,
  v2BulkAction,
  v2GetOverview,
} from "@/lib/api-v2";
import type { V2Request, V2Overview, RiskLane } from "@/lib/types-v2";
import { getLaneConfig, RISK_LANES } from "@/lib/risk-lanes";

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
// Expanded Detail
// ---------------------------------------------------------------------------

function ExpandedDetail({ request }: { request: V2Request }) {
  return (
    <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)]">
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Agent
          </span>
          <p className="text-xs font-mono text-[var(--text-primary)] mt-0.5">
            {request.agentId}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Origin
          </span>
          <p className="text-xs text-[var(--text-primary)] mt-0.5">
            {request.originClient || request.originType}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Capability
          </span>
          <p className="text-xs text-[var(--text-primary)] mt-0.5">
            {request.capability || "—"}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Run ID
          </span>
          <p className="text-xs font-mono text-[var(--text-primary)] mt-0.5">
            {request.runId ?? "—"}
          </p>
        </div>
      </div>
      {request.args != null && (
        <details className="mt-2">
          <summary className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider cursor-pointer select-none">
            Arguments
          </summary>
          <pre className="mt-1 p-2 bg-[var(--bg-elevated)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(request.args, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Request Row
// ---------------------------------------------------------------------------

function RequestRow({
  request,
  selected,
  expanded,
  onSelect,
  onToggle,
  onApprove,
  onDeny,
  acting,
}: {
  request: V2Request;
  selected: boolean;
  expanded: boolean;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onApprove: (id: number) => void;
  onDeny: (id: number) => void;
  acting: boolean;
}) {
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <div
        className={cn(
          "flex items-center gap-3 py-2.5 px-3 cursor-pointer transition-colors",
          expanded && "bg-[rgba(59,130,246,0.04)]"
        )}
        onClick={() => onToggle(request.id)}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(request.id);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 shrink-0"
        />
        <RiskBadge lane={request.riskLane} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium font-mono text-[var(--text-primary)] truncate">
              {request.label || request.tool}
            </span>
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
        <span className="text-xs text-[var(--text-tertiary)] shrink-0">
          {request.originClient || request.originType}
        </span>
        <span className="text-xs text-[var(--text-tertiary)] shrink-0 w-14 text-right">
          {timeAgo(request.createdAt)}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onApprove(request.id);
            }}
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
            onClick={(e) => {
              e.stopPropagation();
              onDeny(request.id);
            }}
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
      {expanded && <ExpandedDetail request={request} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter Bar
// ---------------------------------------------------------------------------

const ALL_LANES = Object.keys(RISK_LANES) as RiskLane[];

function FilterBar({
  laneFilter,
  agentFilter,
  originFilter,
  onLaneChange,
  onAgentChange,
  onOriginChange,
}: {
  laneFilter: string;
  agentFilter: string;
  originFilter: string;
  onLaneChange: (v: string) => void;
  onAgentChange: (v: string) => void;
  onOriginChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Filter size={14} className="text-[var(--text-tertiary)]" />
      <select
        value={laneFilter}
        onChange={(e) => onLaneChange(e.target.value)}
        className="h-7 px-2 text-xs bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] focus:outline-none"
      >
        <option value="">All lanes</option>
        {ALL_LANES.map((l) => (
          <option key={l} value={l}>
            {getLaneConfig(l).label}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Agent ID..."
        value={agentFilter}
        onChange={(e) => onAgentChange(e.target.value)}
        className="h-7 px-2 text-xs bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none w-32"
      />
      <input
        type="text"
        placeholder="Origin..."
        value={originFilter}
        onChange={(e) => onOriginChange(e.target.value)}
        className="h-7 px-2 text-xs bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none w-32"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApprovalsPage() {
  const [overview, setOverview] = useState<V2Overview | null>(null);
  const [requests, setRequests] = useState<V2Request[]>([]);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<number | null>(null);

  // Filters
  const [laneFilter, setLaneFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [originFilter, setOriginFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const [ov, reqs] = await Promise.all([
        v2GetOverview(),
        v2GetPendingRequests(),
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
  }, [load]);

  // Apply filters client-side
  const filtered = requests.filter((r) => {
    if (laneFilter && r.riskLane !== laneFilter) return false;
    if (agentFilter && !r.agentId.toLowerCase().includes(agentFilter.toLowerCase())) return false;
    if (originFilter) {
      const origin = (r.originClient || r.originType).toLowerCase();
      if (!origin.includes(originFilter.toLowerCase())) return false;
    }
    return true;
  });

  const handleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggle = (id: number) => {
    setExpanded((prev) => (prev === id ? null : id));
  };

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

  const handleBulk = async (action: "approve" | "deny") => {
    if (selected.size === 0) return;
    setActing(true);
    try {
      await v2BulkAction(Array.from(selected), action, "manual");
      setSelected(new Set());
      await load();
    } finally {
      setActing(false);
    }
  };

  return (
    <Shell pendingCount={overview?.pending}>
      <PageHeader
        title="Approvals"
        description="Review and action pending requests"
        actions={
          selected.size > 0 ? (
            <>
              <span className="text-xs text-[var(--text-tertiary)]">
                {selected.size} selected
              </span>
              <button
                onClick={() => handleBulk("approve")}
                disabled={acting}
                className="border border-[#22c55e] text-[#22c55e] px-3 py-1.5 text-[13px] font-semibold hover:bg-[rgba(34,197,94,0.1)] disabled:opacity-40 transition-colors"
              >
                Approve all
              </button>
              <button
                onClick={() => handleBulk("deny")}
                disabled={acting}
                className="border border-[#ef4444] text-[#ef4444] px-3 py-1.5 text-[13px] font-semibold hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-40 transition-colors"
              >
                Deny all
              </button>
            </>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-4 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      <FilterBar
        laneFilter={laneFilter}
        agentFilter={agentFilter}
        originFilter={originFilter}
        onLaneChange={setLaneFilter}
        onAgentChange={setAgentFilter}
        onOriginChange={setOriginFilter}
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
          <CheckCircle size={32} className="mb-3 opacity-40" />
          <p className="text-sm">No pending approvals</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border)]">
          {filtered.map((req) => (
            <RequestRow
              key={req.id}
              request={req}
              selected={selected.has(req.id)}
              expanded={expanded === req.id}
              onSelect={handleSelect}
              onToggle={handleToggle}
              onApprove={handleApprove}
              onDeny={handleDeny}
              acting={acting}
            />
          ))}
        </div>
      )}
    </Shell>
  );
}

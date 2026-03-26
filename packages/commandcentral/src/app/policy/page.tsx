"use client";

import { useEffect, useState, useCallback } from "react";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { v2GetRiskLanes, v2SetRiskLane, v2GetOverview } from "@/lib/api-v2";
import type { V2RiskLane, V2Overview, LaneMode } from "@/lib/types-v2";
import { RISK_LANES } from "@/lib/risk-lanes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODES: { value: LaneMode; label: string }[] = [
  { value: "auto_approve", label: "Auto-approve" },
  { value: "ask", label: "Ask" },
  { value: "auto_deny", label: "Auto-deny" },
];

function severityColor(severity: number): string {
  if (severity <= 1) return "#22c55e";
  if (severity <= 2) return "#3B82F6";
  if (severity <= 3) return "#f59e0b";
  return "#ef4444";
}

// ---------------------------------------------------------------------------
// Lane Panel
// ---------------------------------------------------------------------------

function LanePanel({
  lane,
  acting,
  onSetMode,
}: {
  lane: V2RiskLane;
  acting: boolean;
  onSetMode: (lane: V2RiskLane, mode: LaneMode) => void;
}) {
  const config = RISK_LANES[lane.lane];
  const Icon = config?.icon;
  const barColor = severityColor(lane.severity);

  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border)] p-5">
      {/* Severity bar */}
      <div className="h-1 mb-4 w-full" style={{ backgroundColor: "var(--border)" }}>
        <div
          className="h-full transition-all"
          style={{
            width: `${(lane.severity / 5) * 100}%`,
            backgroundColor: barColor,
          }}
        />
      </div>

      <div className="flex items-start gap-3 mb-4">
        {Icon && (
          <div className="mt-0.5" style={{ color: config.color }}>
            <Icon size={18} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {lane.label}
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {lane.description}
          </p>
        </div>
        <span className="text-[10px] font-mono text-[var(--text-tertiary)] shrink-0">
          severity {lane.severity}/5
        </span>
      </div>

      {/* Mode buttons */}
      <div className="flex gap-1">
        {MODES.map((m) => {
          const active = lane.mode === m.value;
          return (
            <button
              key={m.value}
              onClick={() => onSetMode(lane, m.value)}
              disabled={acting}
              className={cn(
                "flex-1 px-3 py-1.5 text-[13px] font-semibold transition-colors border",
                active
                  ? "bg-[#3B82F6] text-white border-[#3B82F6]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)] disabled:opacity-40"
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PolicyPage() {
  const [overview, setOverview] = useState<V2Overview | null>(null);
  const [lanes, setLanes] = useState<V2RiskLane[]>([]);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, l] = await Promise.all([v2GetOverview(), v2GetRiskLanes()]);
      setOverview(ov);
      setLanes(l);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSetMode = async (lane: V2RiskLane, mode: LaneMode) => {
    if (lane.mode === mode) return;
    setActing(true);
    try {
      await v2SetRiskLane(lane.lane, mode);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setActing(false);
    }
  };

  return (
    <Shell pendingCount={overview?.pending}>
      <PageHeader
        title="Policy"
        description="Configure how each risk lane is handled"
      />

      {error && (
        <div className="mb-4 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {lanes.map((lane) => (
          <LanePanel key={lane.lane} lane={lane} acting={acting} onSetMode={handleSetMode} />
        ))}
      </div>
    </Shell>
  );
}

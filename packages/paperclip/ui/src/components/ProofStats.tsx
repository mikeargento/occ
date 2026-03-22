import { Shield, ShieldCheck, Users, Calendar } from "lucide-react";
import { MetricCard } from "./MetricCard";
import type { ProofStats as ProofStatsType } from "@/api/proofs";

interface Props {
  stats: ProofStatsType;
  onAgentClick?: (agentId: string) => void;
}

export function ProofStats({ stats, onAgentClick }: Props) {
  const teeRate =
    stats.enforcementBreakdown.tee + stats.enforcementBreakdown.stub > 0
      ? Math.round(
          (stats.enforcementBreakdown.tee /
            (stats.enforcementBreakdown.tee + stats.enforcementBreakdown.stub)) *
            100,
        )
      : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
        <MetricCard icon={Shield} value={stats.total} label="Total Proofs" />
        <MetricCard icon={Calendar} value={stats.today} label="Today" />
        <MetricCard icon={Users} value={stats.agentsCovered} label="Agents Covered" />
        <MetricCard
          icon={ShieldCheck}
          value={`${teeRate}%`}
          label="TEE Rate"
          description={
            <span>
              {stats.enforcementBreakdown.tee} TEE / {stats.enforcementBreakdown.stub} stub
            </span>
          }
        />
      </div>

      {stats.byAgent.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.byAgent.map((agent) => (
            <button
              key={agent.agentId}
              onClick={() => onAgentClick?.(agent.agentId)}
              className="text-left rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{agent.agentName}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {agent.totalProofs} proofs
                </span>
              </div>
              {agent.totalCostUsd > 0 && (
                <div className="text-xs text-muted-foreground">
                  ${agent.totalCostUsd.toFixed(4)} total cost
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

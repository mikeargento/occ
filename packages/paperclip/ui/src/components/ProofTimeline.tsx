import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck, Shield } from "lucide-react";
import type { ProofEntry } from "@/api/proofs";
import { ProofDetail } from "./ProofDetail";

interface Props {
  proofs: ProofEntry[];
}

function ProofTypeBadge({ type }: { type: ProofEntry["proofType"] }) {
  const styles = {
    "pre-exec": "bg-blue-500/10 text-blue-500 border-blue-500/20",
    "post-exec": "bg-green-500/10 text-green-500 border-green-500/20",
    event: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  const labels = {
    "pre-exec": "pre-exec",
    "post-exec": "post-exec",
    event: "event",
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

function EnforcementBadge({ enforcement }: { enforcement: string | null }) {
  if (!enforcement) return null;
  const isTee = enforcement.includes("tee");
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${
        isTee
          ? "bg-green-500/10 text-green-500 border-green-500/20"
          : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
      }`}
    >
      {isTee ? <ShieldCheck className="h-2.5 w-2.5" /> : <Shield className="h-2.5 w-2.5" />}
      {isTee ? "TEE" : "stub"}
    </span>
  );
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ProofRow({ entry }: { entry: ProofEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 hover:bg-accent/30 transition-colors flex items-center gap-3"
      >
        <span className="text-muted-foreground shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>

        <span className="font-mono text-xs text-muted-foreground w-8 shrink-0 tabular-nums">
          #{entry.counter ?? "?"}
        </span>

        <ProofTypeBadge type={entry.proofType} />

        <span className="text-sm truncate flex-1">
          {entry.message ?? entry.eventType ?? "—"}
        </span>

        <span className="text-xs text-muted-foreground shrink-0">{entry.agentName}</span>

        {entry.costUsd != null && entry.costUsd > 0 && (
          <span className="text-xs font-mono text-muted-foreground shrink-0 tabular-nums">
            ${entry.costUsd.toFixed(4)}
          </span>
        )}

        {entry.model && (
          <span className="text-[10px] text-muted-foreground/60 shrink-0">{entry.model}</span>
        )}

        <EnforcementBadge enforcement={entry.enforcement} />

        <span className="text-xs text-muted-foreground/60 shrink-0 w-16 text-right">
          {timeAgo(entry.timestamp)}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pl-12">
          <ProofDetail entry={entry} />
        </div>
      )}
    </div>
  );
}

export function ProofTimeline({ proofs }: Props) {
  // Group by runId
  const runGroups = new Map<string, ProofEntry[]>();
  for (const p of proofs) {
    const group = runGroups.get(p.runId) ?? [];
    group.push(p);
    runGroups.set(p.runId, group);
  }

  const [collapsedRuns, setCollapsedRuns] = useState<Set<string>>(new Set());

  const toggleRun = (runId: string) => {
    setCollapsedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {Array.from(runGroups.entries()).map(([runId, entries]) => {
        const isCollapsed = collapsedRuns.has(runId);
        const first = entries[0];
        const last = entries[entries.length - 1];
        const postExec = entries.find((e) => e.proofType === "post-exec");

        return (
          <div key={runId} className="border-b border-border last:border-0">
            {/* Run group header */}
            <button
              onClick={() => toggleRun(runId)}
              className="w-full text-left px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors flex items-center gap-3"
            >
              <span className="text-muted-foreground shrink-0">
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
              <span className="text-sm font-medium">{first.agentName}</span>
              <span className="text-xs text-muted-foreground font-mono">{runId.slice(0, 8)}</span>

              {postExec?.runStatus && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    postExec.runStatus === "succeeded"
                      ? "bg-green-500/10 text-green-500 border-green-500/20"
                      : "bg-red-500/10 text-red-500 border-red-500/20"
                  }`}
                >
                  {postExec.runStatus}
                </span>
              )}

              <span className="flex-1" />

              <span className="text-xs text-muted-foreground tabular-nums">{entries.length} proofs</span>

              {postExec?.costUsd != null && postExec.costUsd > 0 && (
                <span className="text-xs font-mono text-muted-foreground tabular-nums">
                  ${postExec.costUsd.toFixed(4)}
                </span>
              )}

              <EnforcementBadge enforcement={first.enforcement} />

              <span className="text-xs text-muted-foreground/60 w-16 text-right">
                {timeAgo(first.timestamp)}
              </span>
            </button>

            {/* Individual proof rows */}
            {!isCollapsed &&
              entries.map((entry) => <ProofRow key={entry.id} entry={entry} />)}
          </div>
        );
      })}
    </div>
  );
}

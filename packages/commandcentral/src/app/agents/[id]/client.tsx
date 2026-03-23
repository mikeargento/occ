"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  getAgent,
  getTools,
  enableTool,
  disableTool,
  pauseAgent,
  resumeAgent,
} from "@/lib/api";
import { useProxyEvents } from "@/lib/use-events";
import type {
  AgentInstance,
  ExecutionContextState,
  DiscoveredTool,
} from "@/lib/types";
import { Badge } from "@/components/shared/badge";
import { SwitchboardPanel } from "@/components/switchboard/switchboard-panel";
import { McpUrlBar } from "@/components/switchboard/mcp-url-bar";
import { ProofFeed } from "@/components/switchboard/proof-feed";
import { CustomRules } from "@/components/switchboard/custom-rules";
import { categorizeTools } from "@/lib/categories";
import { formatCents, formatNumber, formatRelativeTime } from "@/lib/format";

export default function SwitchboardDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const agentId = (params.id && params.id !== "__" ? params.id : pathname.split("/").pop() ?? params.id) as string;
  const { events, isConnected } = useProxyEvents();
  const [agent, setAgent] = useState<AgentInstance | null>(null);
  const [context, setContext] = useState<ExecutionContextState | null>(null);
  const [allTools, setAllTools] = useState<DiscoveredTool[]>([]);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"activity" | "rules">("activity");

  const agentEvents = events.filter(
    (e) => ("agentId" in e && e.agentId === agentId) || e.type === "policy-loaded"
  );

  const refresh = useCallback(() => {
    getAgent(agentId)
      .then((res) => {
        setAgent(res.agent);
        setContext(res.context);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => {
    refresh();
    getTools().then((res) => setAllTools(res.tools)).catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (agentEvents.length > 0) refresh();
  }, [agentEvents.length, refresh]);

  const allowedTools = new Set(
    agent?.policy?.globalConstraints?.allowedTools ?? []
  );
  const isPaused = agent?.status === "paused";
  const allToolNames = allTools.map((t) => t.name);

  async function handleToggleTool(toolName: string) {
    setToggling((prev) => new Set(prev).add(toolName));
    try {
      if (allowedTools.has(toolName)) {
        await disableTool(agentId, toolName);
      } else {
        await enableTool(agentId, toolName);
      }
      refresh();
    } catch {
      /* ignore */
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(toolName);
        return next;
      });
    }
  }

  async function handleToggleCategory(categoryId: string, enable: boolean) {
    const grouped = categorizeTools(allToolNames);
    const categoryTools = grouped[categoryId] ?? [];
    for (const tool of categoryTools) {
      setToggling((prev) => new Set(prev).add(tool));
      try {
        if (enable) {
          await enableTool(agentId, tool);
        } else {
          await disableTool(agentId, tool);
        }
      } catch {
        /* ignore */
      }
    }
    refresh();
    setToggling(new Set());
  }

  async function handleTogglePause() {
    if (!agent) return;
    try {
      if (isPaused) {
        await resumeAgent(agentId);
      } else {
        await pauseAgent(agentId);
      }
      refresh();
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <div className="skeleton h-8 w-48 mb-6" />
        <div className="skeleton h-[120px] rounded-xl mb-6" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="skeleton h-[100px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-text-tertiary mb-4">
        <Link href="/" className="hover:text-text-secondary transition-colors">
          Switchboards
        </Link>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span className="text-text-secondary">{agent?.name ?? agentId}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full flex-shrink-0 ${
              isPaused ? "bg-warning" : isConnected ? "bg-success animate-pulse-dot" : "bg-text-tertiary"
            }`}
          />
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            {agent?.name ?? agentId}
          </h1>
          <Badge variant={isPaused ? "warning" : isConnected ? "success" : "neutral"} dot>
            {isPaused ? "Paused" : isConnected ? "Live" : "Offline"}
          </Badge>
        </div>
        <button
          onClick={handleTogglePause}
          className={`px-4 py-[7px] text-sm font-medium rounded-lg border transition-all duration-100 active:scale-[0.98] ${
            isPaused
              ? "border-success/30 text-success bg-success/5 hover:bg-success/10"
              : "border-error/30 text-error bg-error/5 hover:bg-error/10"
          }`}
        >
          {isPaused ? "Resume" : "Pause"}
        </button>
      </div>

      {/* MCP URL */}
      <div className="mb-8">
        <McpUrlBar agentId={agentId} />
      </div>

      {/* Paused banner */}
      {isPaused && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-warning/5 border border-warning/20 flex items-center gap-2.5 animate-fade-in">
          <div className="w-[5px] h-[5px] rounded-full bg-warning flex-shrink-0" />
          <p className="text-sm text-warning/90">
            Switchboard paused — all tool access is suspended
          </p>
        </div>
      )}

      {/* Section: The Switchboard */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold text-text">Tool Access</h2>
          <span className="text-[11px] text-text-tertiary">
            {allowedTools.size} of {allToolNames.length} enabled
          </span>
        </div>
        <SwitchboardPanel
          allTools={allToolNames}
          enabledTools={allowedTools}
          onToggleCategory={handleToggleCategory}
          onToggleTool={handleToggleTool}
          togglingTools={toggling}
        />
      </div>

      {/* Section: Activity + Rules (Tabbed) */}
      <div>
        <div className="flex items-center gap-1 mb-4 p-1 rounded-lg bg-bg-elevated border border-border-subtle inline-flex">
          {[
            { id: "activity" as const, label: "Activity" },
            { id: "rules" as const, label: "Rules" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === tab.id
                  ? "bg-bg-subtle text-text font-medium"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-bg-elevated overflow-hidden">
          {activeTab === "activity" ? (
            <ProofFeed events={agentEvents} isConnected={isConnected} />
          ) : (
            <div className="p-5">
              <CustomRules agentId={agentId} />
            </div>
          )}
        </div>
      </div>

      {/* Stats sidebar (below on narrow, floating on wide) */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-bg-elevated p-5">
          <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-1">Total Calls</p>
          <p className="text-xl font-semibold tabular-nums">{formatNumber(context ? Object.values(context.toolCallCounts).reduce((a, b) => a + b, 0) : 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-elevated p-5">
          <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-1">Total Spend</p>
          <p className="text-xl font-semibold tabular-nums">{formatCents(context?.totalSpendCents ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-elevated p-5">
          <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-1">Created</p>
          <p className="text-xl font-semibold">{agent?.createdAt ? formatRelativeTime(agent.createdAt) : "—"}</p>
        </div>
      </div>
    </div>
  );
}

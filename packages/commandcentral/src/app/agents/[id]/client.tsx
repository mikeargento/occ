"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
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
  ProxyEvent,
} from "@/lib/types";
import { Card } from "@/components/shared/card";
import { Badge } from "@/components/shared/badge";
import { formatCents, formatNumber, formatRelativeTime } from "@/lib/format";

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params.id as string;
  const { events, isConnected } = useProxyEvents();
  const [agent, setAgent] = useState<AgentInstance | null>(null);
  const [context, setContext] = useState<ExecutionContextState | null>(null);
  const [allTools, setAllTools] = useState<DiscoveredTool[]>([]);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const agentEvents = events.filter(
    (e) =>
      ("agentId" in e && e.agentId === agentId) || e.type === "policy-loaded"
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
    getTools()
      .then((res) => setAllTools(res.tools))
      .catch(() => {});
  }, [refresh]);

  useEffect(() => {
    if (agentEvents.length > 0) refresh();
  }, [agentEvents.length, refresh]);

  const allowedTools = new Set(
    agent?.policy?.globalConstraints?.allowedTools ?? []
  );
  const isPaused = agent?.status === "paused";

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
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="skeleton h-8 w-48 mb-6" />
        <div className="skeleton h-[400px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      {/* Breadcrumb + Header */}
      <div className="mb-8">
        <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary mb-3">
          <Link
            href="/agents"
            className="hover:text-text-secondary transition-colors"
          >
            Agents
          </Link>
          <ChevronRight />
          <span className="text-text-secondary">{agent?.name ?? agentId}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                isPaused
                  ? "bg-warning"
                  : isConnected
                  ? "bg-success animate-pulse-dot"
                  : "bg-text-tertiary"
              }`}
            />
            <h1 className="text-lg font-semibold tracking-[-0.01em]">
              {agent?.name ?? agentId}
            </h1>
            <Badge
              variant={
                isPaused ? "warning" : isConnected ? "success" : "neutral"
              }
              dot
            >
              {isPaused ? "Paused" : isConnected ? "Live" : "Offline"}
            </Badge>
          </div>

          <button
            onClick={handleTogglePause}
            className={`px-4 py-[7px] text-[13px] font-medium rounded-lg border transition-all duration-100 active:scale-[0.98] ${
              isPaused
                ? "border-success/30 text-success bg-success/5 hover:bg-success/10"
                : "border-error/30 text-error bg-error/5 hover:bg-error/10"
            }`}
          >
            {isPaused ? "Resume Agent" : "Pause Agent"}
          </button>
        </div>
      </div>

      {/* Paused banner */}
      {isPaused && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-warning/5 border border-warning/20 flex items-center gap-2.5 animate-fade-in">
          <div className="w-[5px] h-[5px] rounded-full bg-warning flex-shrink-0" />
          <p className="text-[13px] text-warning/90">
            Agent paused — all tool access is suspended
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Tool Access */}
          <section>
            <SectionHeader
              title="Tool Access"
              detail={`${allowedTools.size} of ${allTools.length} enabled`}
            />
            <Card padding={false}>
              {allTools.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-[13px] text-text-tertiary">
                    No tools discovered from downstream servers
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border-subtle">
                  {allTools.map((tool) => {
                    const enabled = allowedTools.has(tool.name);
                    const isToggling = toggling.has(tool.name);
                    return (
                      <div
                        key={tool.name}
                        className={`flex items-center gap-4 px-5 py-3.5 transition-colors duration-75 ${
                          enabled
                            ? "hover:bg-success/[0.02]"
                            : "hover:bg-bg-subtle/40"
                        } ${isToggling ? "opacity-50" : ""}`}
                      >
                        <button
                          onClick={() => handleToggleTool(tool.name)}
                          disabled={isToggling}
                          className="flex-shrink-0"
                          aria-label={`${enabled ? "Disable" : "Enable"} ${tool.name}`}
                        >
                          <div
                            className={`w-[36px] h-[20px] rounded-full relative transition-colors duration-150 ${
                              enabled ? "bg-success" : "bg-border"
                            }`}
                          >
                            <div
                              className={`absolute top-[2px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
                                enabled
                                  ? "translate-x-[18px]"
                                  : "translate-x-[2px]"
                              }`}
                            />
                          </div>
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-[13px] font-mono transition-colors ${
                              enabled ? "text-text" : "text-text-tertiary"
                            }`}
                          >
                            {tool.name}
                          </p>
                          {tool.description && (
                            <p className="text-[12px] text-text-tertiary truncate mt-0.5">
                              {tool.description}
                            </p>
                          )}
                        </div>
                        <span
                          className={`text-[11px] font-medium flex-shrink-0 ${
                            enabled ? "text-success" : "text-text-tertiary"
                          }`}
                        >
                          {enabled ? "Allowed" : "Blocked"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {allTools.length > 0 && (
                <div className="px-5 py-3 border-t border-border bg-bg-inset/30 rounded-b-xl">
                  <p className="text-[11px] text-text-tertiary flex items-center gap-1.5">
                    <LockIcon />
                    Default-deny &mdash;{" "}
                    {allowedTools.size === 0
                      ? "all tools blocked"
                      : `${allTools.length - allowedTools.size} tool${allTools.length - allowedTools.size !== 1 ? "s" : ""} blocked`}
                  </p>
                </div>
              )}
            </Card>
          </section>

          {/* Activity Feed */}
          <section>
            <SectionHeader
              title="Activity Feed"
              detail={isConnected ? "Live" : "Disconnected"}
            />
            <Card padding={false}>
              <div className="max-h-[360px] overflow-y-auto">
                {agentEvents.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-[13px] text-text-tertiary">
                      Waiting for activity...
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border-subtle">
                    {agentEvents.map((event, i) => (
                      <EventRow key={i} event={event} />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card>
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-4">
              Usage
            </p>
            {context ? (
              <div className="space-y-4">
                <StatBlock
                  label="Total Spend"
                  value={formatCents(context.totalSpendCents)}
                />
                <StatBlock
                  label="Total Calls"
                  value={formatNumber(
                    Object.values(context.toolCallCounts).reduce(
                      (a, b) => a + b,
                      0
                    )
                  )}
                />
                {Object.entries(context.toolCallCounts).length > 0 && (
                  <div className="pt-3 border-t border-border-subtle">
                    <p className="text-[11px] text-text-tertiary mb-2.5">
                      By tool
                    </p>
                    <div className="space-y-2">
                      {Object.entries(context.toolCallCounts).map(
                        ([tool, count]) => (
                          <div
                            key={tool}
                            className="flex justify-between items-baseline"
                          >
                            <span className="text-[12px] text-text-secondary font-mono truncate mr-2">
                              {tool}
                            </span>
                            <span className="text-[12px] text-text tabular-nums flex-shrink-0">
                              {count}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="skeleton h-8 w-full" />
                <div className="skeleton h-8 w-full" />
              </div>
            )}
          </Card>

          <Card>
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-4">
              Constraints
            </p>
            {agent?.policy ? (
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-[12px] text-text-secondary">
                    Spend limit
                  </span>
                  <span className="text-[13px] text-text tabular-nums">
                    {agent.policy.globalConstraints.maxSpendCents !== undefined
                      ? formatCents(
                          agent.policy.globalConstraints.maxSpendCents
                        )
                      : "None"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[12px] text-text-secondary">
                    Rate limit
                  </span>
                  <span className="text-[13px] text-text tabular-nums">
                    {agent.policy.globalConstraints.rateLimit
                      ? `${agent.policy.globalConstraints.rateLimit.maxCalls}/hr`
                      : "None"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[12px] text-text-secondary">
                    Skills
                  </span>
                  <span className="text-[13px] text-text">
                    {Object.keys(agent.policy.skills).length}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-text-tertiary">No policy</p>
            )}
          </Card>

          <Card>
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-4">
              Agent
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-[11px] text-text-tertiary mb-0.5">ID</p>
                <p className="text-[12px] font-mono text-text-secondary break-all">
                  {agentId}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-text-tertiary mb-0.5">Status</p>
                <p className="text-[12px] text-text-secondary capitalize">
                  {agent?.status ?? "unknown"}
                </p>
              </div>
              {agent?.createdAt && (
                <div>
                  <p className="text-[11px] text-text-tertiary mb-0.5">
                    Created
                  </p>
                  <p className="text-[12px] text-text-secondary">
                    {formatRelativeTime(agent.createdAt)}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[13px] font-semibold text-text">{title}</h2>
      {detail && (
        <span className="text-[11px] text-text-tertiary">{detail}</span>
      )}
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-text-tertiary mb-1">{label}</p>
      <p className="text-xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}

function EventRow({ event }: { event: ProxyEvent }) {
  if (event.type === "tool-executed") {
    return (
      <div className="flex items-center gap-3 px-5 py-3 animate-slide-up">
        <span className="w-[6px] h-[6px] rounded-full bg-success flex-shrink-0" />
        <span className="text-[12px] font-mono text-text-secondary flex-1 truncate">
          {event.tool}
        </span>
        <Badge variant="success">Executed</Badge>
        <span className="text-[11px] text-text-tertiary tabular-nums flex-shrink-0 ml-1">
          {formatRelativeTime(event.timestamp)}
        </span>
      </div>
    );
  }

  if (event.type === "policy-violation") {
    return (
      <div className="flex items-center gap-3 px-5 py-3 animate-slide-up">
        <span className="w-[6px] h-[6px] rounded-full bg-error flex-shrink-0" />
        <span className="text-[12px] font-mono text-text-tertiary flex-shrink-0">
          {event.tool}
        </span>
        <span className="text-[11px] text-error/70 truncate flex-1">
          {event.reason}
        </span>
        <Badge variant="error">Denied</Badge>
        <span className="text-[11px] text-text-tertiary tabular-nums flex-shrink-0 ml-1">
          {formatRelativeTime(event.timestamp)}
        </span>
      </div>
    );
  }

  if (event.type === "policy-loaded") {
    return (
      <div className="flex items-center gap-3 px-5 py-3 animate-slide-up">
        <span className="w-[6px] h-[6px] rounded-full bg-info flex-shrink-0" />
        <span className="text-[12px] text-text-secondary flex-1">
          Policy loaded: {event.policyName}
        </span>
        <span className="text-[11px] text-text-tertiary tabular-nums flex-shrink-0">
          {formatRelativeTime(event.timestamp)}
        </span>
      </div>
    );
  }

  return null;
}

function ChevronRight() {
  return (
    <svg
      className="w-3 h-3 text-text-tertiary"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="w-3 h-3 inline"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="7" width="8" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  );
}

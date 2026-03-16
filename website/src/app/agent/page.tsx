"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getAgents,
  createAgent,
  deleteAgent,
  pauseAgent,
  resumeAgent,
} from "@/lib/agent/api";
import type { AgentSummary } from "@/lib/agent/types";
import { Card } from "@/components/agent/card";
import { Badge } from "@/components/agent/badge";
import { EmptyState } from "@/components/agent/empty-state";
import { formatNumber, formatCents } from "@/lib/agent/format";
import { useProxy } from "@/lib/agent/use-proxy";

export default function AgentsPage() {
  const { isConnected } = useProxy();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!isConnected) return;
    getAgents()
      .then((res) => setAgents(res.agents))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh, isConnected]);

  if (!isConnected) {
    return (
      <EmptyState
        icon="agents"
        title="Not connected"
        description={<>Start the proxy to manage your agents.<br />See Setup for instructions.</>}
      />
    );
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createAgent(newName.trim());
      setNewName("");
      setShowCreate(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(agentId: string) {
    try {
      await deleteAgent(agentId);
      setConfirmingDelete(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    }
  }

  async function handleTogglePause(agent: AgentSummary) {
    try {
      if (agent.status === "paused") {
        await resumeAgent(agent.id);
      } else {
        await pauseAgent(agent.id);
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  const activeCount = agents.filter((a) => a.status === "active").length;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Agents</h1>
          {!loading && agents.length > 0 && (
            <p className="text-sm text-text-secondary mt-1">
              {agents.length} deployed &middot; {activeCount} active
            </p>
          )}
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-text text-bg hover:opacity-90 transition-opacity"
        >
          New Agent
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 animate-slide-up">
          <Card>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Agent name (e.g. customer-service-bot)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-bg border border-border-subtle focus:border-text-tertiary outline-none transition-colors"
                autoFocus
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-text text-bg hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewName("");
                }}
                className="px-3 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-sm text-error">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-[72px] rounded-xl bg-bg-elevated border border-border animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && agents.length === 0 && (
        <EmptyState
          icon="agents"
          title="No agents deployed"
          description="Create an agent to define its tool access and constraints. All agents start with zero authority."
        />
      )}

      {/* Agent list */}
      {agents.length > 0 && (
        <Card padding={false}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-5 py-3">
                  Agent
                </th>
                <th className="text-left text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-4 py-3">
                  Status
                </th>
                <th className="text-right text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-4 py-3">
                  Tools
                </th>
                <th className="text-right text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-4 py-3">
                  Calls
                </th>
                <th className="text-right text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-4 py-3">
                  Spend
                </th>
                <th className="text-right text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-5 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const enabledCount =
                  agent.policy?.globalConstraints?.allowedTools?.length ?? 0;
                const isPaused = agent.status === "paused";

                return (
                  <tr
                    key={agent.id}
                    className="border-b border-border-subtle last:border-0 group hover:bg-bg-subtle/40 transition-colors duration-75"
                  >
                    <td className="px-5 py-3.5">
                      <Link href={`/agent/${agent.id}`} className="block">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              isPaused ? "bg-text-tertiary" : "bg-success"
                            }`}
                          />
                          <span className="text-sm font-medium text-text group-hover:text-white transition-colors">
                            {agent.name}
                          </span>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={isPaused ? "neutral" : "success"} dot>
                        {isPaused ? "Paused" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span
                        className={`text-sm tabular-nums ${
                          enabledCount === 0
                            ? "text-text-tertiary"
                            : "text-text-secondary"
                        }`}
                      >
                        {enabledCount}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-sm text-text-secondary tabular-nums">
                        {formatNumber(agent.totalCalls)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-sm text-text-secondary tabular-nums">
                        {formatCents(agent.totalSpendCents)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                        <button
                          onClick={() => handleTogglePause(agent)}
                          className="px-2 py-1 text-xs rounded-md text-text-secondary hover:text-text hover:bg-bg-subtle transition-colors"
                        >
                          {isPaused ? "Resume" : "Pause"}
                        </button>
                        {confirmingDelete === agent.id ? (
                          <>
                            <span className="text-xs text-text-secondary">Sure?</span>
                            <button
                              onClick={() => handleDelete(agent.id)}
                              className="px-2 py-1 text-xs rounded-md text-error hover:bg-error/10 transition-colors font-medium"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmingDelete(null)}
                              className="px-2 py-1 text-xs rounded-md text-text-tertiary hover:text-text hover:bg-bg-subtle transition-colors"
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmingDelete(agent.id)}
                            className="px-2 py-1 text-xs rounded-md text-text-tertiary hover:text-error hover:bg-error/5 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAgents, createAgent, deleteAgent } from "@/lib/api";
import type { AgentSummary } from "@/lib/types";
import { Badge } from "@/components/shared/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { TOOL_CATEGORIES, getCategoryStatuses } from "@/lib/categories";

export default function SwitchboardsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    getAgents()
      .then((res) => setAgents(res.agents))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await createAgent(newName.trim());
      setNewName("");
      setShowCreate(false);
      router.push(`/agents/${res.agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  async function handleDelete(agentId: string) {
    try {
      await deleteAgent(agentId);
      setConfirmingDelete(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Switchboards
          </h1>
          {!loading && agents.length > 0 && (
            <p className="text-sm text-text-secondary mt-1">
              {agents.length} switchboard{agents.length !== 1 ? "s" : ""} &middot;{" "}
              {agents.filter((a) => a.status === "active").length} active
            </p>
          )}
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-text text-bg hover:opacity-90 transition-opacity active:scale-[0.98]"
        >
          New Switchboard
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-border bg-bg-elevated p-5 animate-slide-up">
          <p className="text-sm font-medium mb-3">Create a switchboard</p>
          <p className="text-xs text-text-tertiary mb-4">
            Each switchboard controls one AI agent. Give it a name and you'll get a unique URL to paste into your AI tool.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="e.g. Research Assistant, Customer Bot, Code Agent"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="flex-1 px-3 py-2.5 text-sm rounded-lg bg-bg-inset border border-border focus:border-accent-dim outline-none transition-colors"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-5 py-2.5 text-sm font-medium rounded-lg bg-text text-bg hover:opacity-90 disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName(""); }}
              className="px-3 py-2.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-error/5 border border-error/20 text-sm text-error flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-error/60 hover:text-error text-xs ml-3">Dismiss</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-[80px] rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && agents.length === 0 && (
        <EmptyState
          icon="shield"
          title="Create your first switchboard"
          description="A switchboard controls what one AI agent can do. Each gets its own URL. Everything starts allowed — flip switches to restrict."
          action={
            <button
              onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 text-sm font-medium rounded-lg bg-text text-bg hover:opacity-90 transition-opacity"
            >
              New Switchboard
            </button>
          }
        />
      )}

      {/* Switchboard list */}
      {agents.length > 0 && (
        <div className="space-y-2">
          {agents.map((agent) => {
            const tools = agent.policy?.globalConstraints?.allowedTools ?? [];
            const enabledSet = new Set(tools);
            const statuses = getCategoryStatuses(tools, enabledSet);
            const isPaused = agent.status === "paused";

            return (
              <div
                key={agent.id}
                className="group rounded-xl border border-border bg-bg-elevated hover:bg-bg-subtle/30 transition-colors duration-75"
              >
                <Link
                  href={`/agents/${agent.id}`}
                  className="flex items-center px-5 py-4 gap-4"
                >
                  {/* Status dot */}
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isPaused ? "bg-text-tertiary" : "bg-success animate-pulse-dot"
                    }`}
                  />

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">
                      {agent.name}
                    </p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      {tools.length} tool{tools.length !== 1 ? "s" : ""} &middot; {agent.totalCalls} call{agent.totalCalls !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* Category dots */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    {TOOL_CATEGORIES.map((cat) => {
                      const status = statuses[cat.id];
                      return (
                        <div
                          key={cat.id}
                          title={cat.label}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            status === "on"
                              ? "bg-success"
                              : status === "partial"
                              ? "bg-warning"
                              : "bg-border"
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Badge */}
                  <Badge variant={isPaused ? "neutral" : "success"} dot>
                    {isPaused ? "Paused" : "Active"}
                  </Badge>

                  {/* Chevron */}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="text-text-tertiary group-hover:text-text-secondary transition-colors flex-shrink-0"
                  >
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </Link>

                {/* Delete action (on hover) */}
                <div className="px-5 pb-3 -mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {confirmingDelete === agent.id ? (
                    <span className="text-xs text-text-tertiary">
                      Delete this switchboard?{" "}
                      <button
                        onClick={(e) => { e.preventDefault(); handleDelete(agent.id); }}
                        className="text-error hover:text-error/80 font-medium ml-1"
                      >
                        Yes
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); setConfirmingDelete(null); }}
                        className="text-text-tertiary hover:text-text ml-2"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={(e) => { e.preventDefault(); setConfirmingDelete(agent.id); }}
                      className="text-[11px] text-text-tertiary hover:text-error transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

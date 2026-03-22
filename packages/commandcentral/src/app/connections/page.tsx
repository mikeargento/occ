"use client";

import { useEffect, useState, useCallback } from "react";
import { listConnections } from "@/lib/api";
import type { DownstreamServer } from "@/lib/types";
import { Card } from "@/components/shared/card";
import { Badge } from "@/components/shared/badge";
import { EmptyState } from "@/components/shared/empty-state";

export default function ConnectionsPage() {
  const [servers, setServers] = useState<DownstreamServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listConnections()
      .then((res) => setServers(res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);
  const realServers = servers.filter((s) => s.status === "connected");

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Connections</h1>
        {!loading && servers.length > 0 && (
          <p className="text-sm text-text-secondary mt-1">
            {realServers.length} downstream MCP server{realServers.length !== 1 ? "s" : ""} &middot; {totalTools} tool{totalTools !== 1 ? "s" : ""} discovered
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-sm text-error flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-error/60 hover:text-error ml-3 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-[100px] rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && servers.length === 0 && (
        <EmptyState
          icon="default"
          title="No downstream servers"
          description="Start the proxy with downstream MCP servers to see them here. Run: npx occ-mcp-proxy -- npx @modelcontextprotocol/server-filesystem ."
        />
      )}

      {/* Server list */}
      {servers.length > 0 && (
        <div className="space-y-4">
          {servers.map((server) => {
            const isExpanded = expandedServer === server.name;
            const isDemo = server.status === "demo";

            return (
              <Card key={server.name} className="flex flex-col">
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpandedServer(isExpanded ? null : server.name)}
                >
                  {/* Status dot */}
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isDemo ? "bg-amber-400" : "bg-success"
                    }`}
                  />

                  {/* Server info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text truncate">
                        {server.name}
                      </span>
                      <Badge variant={isDemo ? "warning" : "info"}>
                        {server.transport}
                      </Badge>
                      <span className="text-xs text-text-tertiary">
                        {server.toolCount} tool{server.toolCount !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Connection detail */}
                    {server.command && (
                      <p className="text-xs text-text-tertiary mt-1 font-mono truncate">
                        {server.command} {server.url ?? ""}
                      </p>
                    )}
                    {server.url && !server.command && (
                      <p className="text-xs text-text-tertiary mt-1 font-mono truncate">
                        {server.url}
                      </p>
                    )}
                  </div>

                  {/* Expand indicator */}
                  <span className="text-text-tertiary text-xs flex-shrink-0">
                    {isExpanded ? "\u25B2" : "\u25BC"}
                  </span>
                </div>

                {/* Expanded: tool list */}
                {isExpanded && server.tools.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border-subtle animate-slide-up">
                    <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-2">
                      Tools
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {server.tools.map((tool) => (
                        <span
                          key={tool}
                          className="px-2 py-0.5 text-xs font-mono rounded-md bg-bg-subtle border border-border text-text-secondary"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

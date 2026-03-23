"use client";

import { useEffect, useState, useCallback } from "react";
import { listConnections } from "@/lib/api";
import { EmptyState } from "@/components/shared/empty-state";

interface LiveConnection {
  name: string;
  status: "connected";
  connectedAt: string;
  lastSeen: string;
  toolCount: number;
  agentId: string | null;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function duration(startStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(startStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<LiveConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listConnections()
      .then((res) => setConnections(res as unknown as LiveConnection[]))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Live Connections</h1>
        <p className="text-sm text-text-secondary mt-1">
          AI clients connected to your switchboard right now
        </p>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-sm text-error">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-[72px] rounded-xl" />
          ))}
        </div>
      )}

      {!loading && !error && connections.length === 0 && (
        <EmptyState
          icon="default"
          title="No active connections"
          description="Connect an AI tool by adding your MCP URL in its settings. Supports Claude Desktop, Cursor, Windsurf, and more."
        />
      )}

      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((conn, i) => (
            <div
              key={`${conn.name}-${i}`}
              className="flex items-center gap-4 px-5 py-4 rounded-xl border border-border bg-bg-subtle/50"
            >
              {/* Pulse dot */}
              <div className="relative flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-40" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text">{conn.name}</span>
                  {conn.agentId && (
                    <span className="text-xs text-text-tertiary">→ {conn.agentId}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-text-tertiary">
                  <span>Connected {duration(conn.connectedAt)}</span>
                  <span>·</span>
                  <span>Last seen {timeAgo(conn.lastSeen)}</span>
                  <span>·</span>
                  <span>{conn.toolCount} call{conn.toolCount !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="mt-8 px-5 py-4 rounded-xl border border-border-subtle bg-bg-subtle/30 text-sm text-text-tertiary">
        <p className="font-medium text-text-secondary mb-1">How connections work</p>
        <p>When an AI tool (Cursor, Claude Desktop, etc.) connects to your MCP URL, it shows up here in real time. Connections are removed automatically when the client disconnects or goes idle for 2 minutes.</p>
      </div>
    </div>
  );
}

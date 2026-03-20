"use client";

import { useEffect, useState, useCallback } from "react";
import {
  listConnections,
  connectService,
  disconnectService,
  testConnection,
} from "@/lib/api";
import type { Connection } from "@/lib/types";
import { Card } from "@/components/shared/card";
import { Badge } from "@/components/shared/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatRelativeTime } from "@/lib/format";

const TYPE_COLORS: Record<Connection["type"], { variant: "info" | "warning" | "neutral" }> = {
  orchestrator: { variant: "info" },
  observability: { variant: "warning" },
  platform: { variant: "neutral" },
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connectForm, setConnectForm] = useState<{ apiKey: string; config: Record<string, string> }>({
    apiKey: "",
    config: {},
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; error?: string } | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listConnections()
      .then((res) => setConnections(res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleConnect(id: string) {
    if (!connectForm.apiKey.trim()) return;
    setSaving(true);
    try {
      await connectService(id, connectForm.apiKey.trim(), connectForm.config);
      setExpandedId(null);
      setConnectForm({ apiKey: "", config: {} });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect(id: string) {
    try {
      await disconnectService(id);
      setConfirmingDisconnect(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    }
  }

  async function handleTest(id: string) {
    setTesting(id);
    setTestResult(null);
    try {
      const result = await testConnection(id);
      setTestResult({ id, ...result });
    } catch (err) {
      setTestResult({ id, ok: false, error: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(null);
    }
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setConnectForm({ apiKey: "", config: {} });
    } else {
      setExpandedId(id);
      setConnectForm({ apiKey: "", config: {} });
    }
  }

  const connectedCount = connections.filter((c) => c.status === "connected").length;

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Connections</h1>
        {!loading && connections.length > 0 && (
          <p className="text-sm text-text-secondary mt-1">
            Connect orchestrators and platforms &middot; {connectedCount} of {connections.length} connected
          </p>
        )}
        {!loading && connections.length === 0 && (
          <p className="text-sm text-text-secondary mt-1">
            Connect orchestrators and platforms
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-[140px] rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && connections.length === 0 && (
        <EmptyState
          icon="default"
          title="No connections available"
          description="The proxy has no registered connection endpoints. Start the proxy with downstream MCP servers configured."
        />
      )}

      {/* Connection grid */}
      {connections.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((conn) => {
            const isExpanded = expandedId === conn.id;
            const isConnected = conn.status === "connected";
            const hasError = conn.status === "error";
            const showTestResult = testResult?.id === conn.id;

            return (
              <Card key={conn.id} className="flex flex-col">
                {/* Card header */}
                <div className="flex items-start gap-3">
                  {/* Logo placeholder */}
                  <div className="w-10 h-10 rounded-lg bg-bg-subtle border border-border flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-text-secondary">
                      {conn.name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text truncate">
                        {conn.name}
                      </span>
                      <Badge variant={TYPE_COLORS[conn.type].variant}>
                        {conn.type}
                      </Badge>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div
                        className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
                          isConnected
                            ? "bg-success"
                            : hasError
                            ? "bg-error"
                            : "bg-text-tertiary"
                        }`}
                      />
                      <span className="text-[11px] text-text-tertiary">
                        {isConnected
                          ? "Connected"
                          : hasError
                          ? "Error"
                          : "Disconnected"}
                      </span>
                      {conn.lastChecked && (
                        <span className="text-[11px] text-text-tertiary">
                          &middot; checked {formatRelativeTime(conn.lastChecked)}
                        </span>
                      )}
                    </div>

                    {/* Error message */}
                    {conn.error && (
                      <p className="mt-2 text-xs text-error/80 leading-relaxed">
                        {conn.error}
                      </p>
                    )}

                    {/* Test result */}
                    {showTestResult && (
                      <div
                        className={`mt-2 px-2.5 py-1.5 rounded-md text-xs ${
                          testResult.ok
                            ? "bg-success/10 text-success border border-success/20"
                            : "bg-error/10 text-error border border-error/20"
                        }`}
                      >
                        {testResult.ok ? "Connection test passed" : testResult.error || "Test failed"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border-subtle">
                  {isConnected ? (
                    <>
                      <button
                        onClick={() => handleTest(conn.id)}
                        disabled={testing === conn.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-bg-subtle border border-border text-text-secondary hover:text-text hover:border-border transition-colors disabled:opacity-40"
                      >
                        {testing === conn.id ? "Testing..." : "Test"}
                      </button>
                      {confirmingDisconnect === conn.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-text-secondary">Disconnect?</span>
                          <button
                            onClick={() => handleDisconnect(conn.id)}
                            className="px-2 py-1 text-xs rounded-md text-error hover:bg-error/10 transition-colors font-medium"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmingDisconnect(null)}
                            className="px-2 py-1 text-xs rounded-md text-text-tertiary hover:text-text hover:bg-bg-subtle transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingDisconnect(conn.id)}
                          className="px-3 py-1.5 text-xs font-medium rounded-md text-text-tertiary hover:text-error hover:bg-error/5 transition-colors"
                        >
                          Disconnect
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => toggleExpand(conn.id)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-text text-bg hover:opacity-90 transition-opacity"
                    >
                      {isExpanded ? "Cancel" : "Connect"}
                    </button>
                  )}
                </div>

                {/* Inline connect form */}
                {isExpanded && !isConnected && (
                  <div className="mt-3 pt-3 border-t border-border-subtle space-y-3 animate-slide-up">
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={connectForm.apiKey}
                        onChange={(e) => setConnectForm((f) => ({ ...f, apiKey: e.target.value }))}
                        placeholder="Enter API key..."
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-bg-inset border border-border focus:border-accent-dim outline-none transition-colors"
                        autoFocus
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConnect(conn.id)}
                        disabled={saving || !connectForm.apiKey.trim()}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-text text-bg hover:bg-accent disabled:opacity-40 transition-all duration-100"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setExpandedId(null);
                          setConnectForm({ apiKey: "", config: {} });
                        }}
                        className="px-3 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
                      >
                        Cancel
                      </button>
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

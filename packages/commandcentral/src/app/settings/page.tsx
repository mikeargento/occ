"use client";

import { useEffect, useState } from "react";
import { useProxy } from "@/lib/use-proxy";
import { Card } from "@/components/shared/card";

export default function SettingsPage() {
  const { isConnected } = useProxy();
  const [mcpConfig, setMcpConfig] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const baseUrl =
      typeof window !== "undefined"
        ? localStorage.getItem("occ-proxy-url") || ""
        : "";
    fetch(`${baseUrl}/api/mcp-config`)
      .then((r) => r.json())
      .then((data) => {
        if (data.mcpServers) {
          setMcpConfig(JSON.stringify(data, null, 2));
        }
      })
      .catch(() => {});
  }, []);

  function handleCopy() {
    if (mcpConfig) {
      navigator.clipboard.writeText(mcpConfig);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleSaveFile() {
    if (!mcpConfig) return;
    const blob = new Blob([mcpConfig], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "claude_desktop_config.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Connection and configuration
        </p>
      </div>

      <div className="space-y-4">
        {/* Connection status */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-2">
                Connection
              </p>
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? "bg-success" : "bg-error"
                  }`}
                />
                <span className="text-sm font-medium">
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* MCP Config */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
              Connect Your AI
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSaveFile}
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-text hover:bg-bg-subtle transition-colors flex items-center gap-1.5"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Save File
              </button>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-text hover:bg-bg-subtle transition-colors flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
          <p className="text-sm text-text-secondary mb-3 leading-relaxed">
            Connect Claude Desktop, Cursor, Windsurf, or any MCP-compatible AI to your OCC Agent dashboard.
            Your AI subscription powers the compute. OCC Agent is the control plane.
          </p>
          {mcpConfig ? (
            <div className="rounded-lg bg-bg-inset border border-border-subtle p-4">
              <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
                {mcpConfig}
              </pre>
            </div>
          ) : (
            <div className="rounded-lg bg-bg-inset border border-border-subtle p-4 text-center">
              <p className="text-sm text-text-tertiary">Loading MCP config...</p>
            </div>
          )}
        </Card>

        {/* How to connect */}
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-3">
            How to Connect
          </p>
          <ol className="space-y-2 text-sm text-text-secondary">
            <li className="flex gap-2">
              <span className="text-text-tertiary font-medium">1.</span>
              Click <strong>Save File</strong> to download <code className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-[11px]">claude_desktop_config.json</code>
            </li>
            <li className="flex gap-2">
              <span className="text-text-tertiary font-medium">2.</span>
              <strong>Claude Desktop:</strong> Move the file to{" "}
              <code className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-[11px]">~/Library/Application Support/Claude/</code> (Mac) or{" "}
              <code className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-[11px]">%APPDATA%\Claude\</code> (Windows)
            </li>
            <li className="flex gap-2">
              <span className="text-text-tertiary font-medium">3.</span>
              <strong>Cursor / Windsurf:</strong> Add as an MCP server in settings
            </li>
            <li className="flex gap-2">
              <span className="text-text-tertiary font-medium">4.</span>
              Restart your AI — it can now create issues, manage agents, and view your dashboard
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

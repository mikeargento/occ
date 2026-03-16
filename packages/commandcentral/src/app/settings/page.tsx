"use client";

import { useState } from "react";
import { useProxy } from "@/lib/use-proxy";
import { Card } from "@/components/shared/card";

export default function SettingsPage() {
  const { isConnected, proxyId, baseUrl, setBaseUrl } = useProxy();
  const [inputUrl, setInputUrl] = useState(baseUrl);

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Proxy connection and configuration
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
              {proxyId && (
                <p className="text-xs text-text-tertiary mt-1 font-mono">
                  {proxyId}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* URL input */}
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Management API
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1 bg-bg-inset border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-accent-dim outline-none transition-colors"
              placeholder="http://localhost:9100"
            />
            <button
              onClick={() => setBaseUrl(inputUrl)}
              className="px-4 py-2 bg-bg-subtle border border-border rounded-lg text-sm text-text hover:bg-bg-subtle/80 transition-colors active:scale-[0.98]"
            >
              Save
            </button>
          </div>
        </Card>

        {/* Quick start */}
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Quick Start
          </p>
          <div className="space-y-3 text-xs">
            <div>
              <p className="text-text-secondary mb-1.5">1. Start the proxy</p>
              <code className="block bg-bg-inset border border-border-subtle rounded-lg px-3 py-2 font-mono text-xs text-text-secondary">
                npx occ-mcp-proxy --management-only
              </code>
            </div>
            <div>
              <p className="text-text-secondary mb-1.5">
                2. Or with a config file
              </p>
              <code className="block bg-bg-inset border border-border-subtle rounded-lg px-3 py-2 font-mono text-xs text-text-secondary">
                npx occ-mcp-proxy --config proxy.json
              </code>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

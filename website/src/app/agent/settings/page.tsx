"use client";

import { useState } from "react";
import { useProxy } from "@/lib/agent/use-proxy";
import { Card } from "@/components/agent/card";

export default function AgentSettingsPage() {
  const { isConnected, proxyId, baseUrl, setBaseUrl } = useProxy();
  const [inputUrl, setInputUrl] = useState(baseUrl);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Proxy connection and configuration
        </p>
      </div>

      <div className="max-w-xl space-y-4">
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
            Proxy URL
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1 bg-bg border border-border-subtle rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-text-tertiary outline-none transition-colors font-mono"
              placeholder="http://localhost:9100"
            />
            <button
              onClick={() => setBaseUrl(inputUrl)}
              className="px-4 py-2 bg-bg-subtle border border-border rounded-lg text-sm text-text hover:bg-bg-subtle/80 transition-colors"
            >
              Save
            </button>
          </div>
          <p className="text-[11px] text-text-tertiary mt-2">
            URL of your running OCC Agent proxy. Saved in browser localStorage.
          </p>
        </Card>

        {/* Quick start */}
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Quick Start
          </p>
          <div className="space-y-3 text-xs">
            <div>
              <p className="text-text-secondary mb-1.5">1. Install and start the proxy</p>
              <code className="block bg-bg border border-border-subtle rounded-lg px-3 py-2 font-mono text-xs text-text-secondary">
                npx occ-agent --management-only
              </code>
            </div>
            <div>
              <p className="text-text-secondary mb-1.5">
                2. Or with downstream MCP servers
              </p>
              <code className="block bg-bg border border-border-subtle rounded-lg px-3 py-2 font-mono text-xs text-text-secondary">
                npx occ-agent --config proxy.json
              </code>
            </div>
            <div>
              <p className="text-text-secondary mb-1.5">
                3. Enter the proxy URL above and click Save
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

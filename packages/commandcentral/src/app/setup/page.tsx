"use client";

import { useState } from "react";
import { useProxy } from "@/lib/use-proxy";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-auto pl-3 text-text-tertiary hover:text-text transition-colors flex-shrink-0"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="rounded-xl bg-bg-elevated border border-border-subtle overflow-hidden">
      <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
          {label}
        </span>
        <CopyButton text={code} />
      </div>
      <div className="px-5 py-4 font-mono text-xs text-text-secondary leading-relaxed">
        <pre>{code}</pre>
      </div>
    </div>
  );
}

const CLAUDE_CONFIG = `Add this URL as an MCP server in your AI tool's settings:

Your MCP URL will appear here after signing in.

For Claude Desktop, add to claude_desktop_config.json:
{
  "mcpServers": {
    "occ-agent": {
      "url": "https://occ-production-b94f.up.railway.app/mcp/YOUR_TOKEN"
    }
  }
}`;

const PROOF_EXAMPLE = `{
  "version": "occ/proof/1",
  "tool": "send_email",
  "agent": "customer-service-bot",
  "decision": "allowed",
  "policy": "occ/policy/1",
  "inputHash": "sha256:7f83b1...",
  "outputHash": "sha256:ef2d12...",
  "timestamp": "2026-03-15T10:30:00Z",
  "signature": "ed25519:a3f8c2..."
}`;

export default function SetupPage() {
  const { isConnected } = useProxy();
  const [activeTab, setActiveTab] = useState<"claude" | "mcp" | "api">("claude");

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] mb-3">
          Setup
        </h1>
        <p className="text-text-secondary leading-relaxed">
          Connect your AI agents to OCC for identity, access control, and cryptographic proof of every action.
        </p>
      </div>

      {/* Connection status */}
      <div className="mb-10">
        <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${
          isConnected
            ? "bg-success/5 border-success/20"
            : "bg-bg-elevated border-border-subtle"
        }`}>
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            isConnected ? "bg-success" : "bg-text-tertiary animate-pulse"
          }`} />
          <div>
            <p className={`text-sm font-medium ${isConnected ? "text-success" : "text-text"}`}>
              {isConnected ? "Connected to OCC" : "Connecting..."}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">
              {isConnected
                ? "Your AI tools can connect via MCP"
                : "Checking connection to control plane"}
            </p>
          </div>
        </div>
      </div>

      {/* Connect your agents */}
      <div className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-text-tertiary mb-5">
          Connect your agents
        </h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 p-1 rounded-lg bg-bg-elevated border border-border-subtle">
          {[
            { id: "claude" as const, label: "Claude Desktop" },
            { id: "mcp" as const, label: "Any MCP Client" },
            { id: "api" as const, label: "REST API" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
                activeTab === tab.id
                  ? "bg-bg-subtle text-text font-medium"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "claude" && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary leading-relaxed">
              Add this to your Claude Desktop MCP config. Claude will route tool calls through the proxy automatically.
            </p>
            <CodeBlock label="claude_desktop_config.json" code={CLAUDE_CONFIG} />
            <p className="text-xs text-text-tertiary leading-relaxed">
              macOS: <code className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-[11px]">~/Library/Application Support/Claude/claude_desktop_config.json</code>
            </p>
          </div>
        )}

        {activeTab === "mcp" && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary leading-relaxed">
              OCC Agent is a standard MCP server. Any MCP-compatible client (Paperclip, Cursor, Windsurf, custom agents) can connect using stdio or HTTP.
            </p>
            <CodeBlock
              label="stdio"
              code={`npx occ-mcp-proxy --mcp`}
            />
            <p className="text-sm text-text-secondary leading-relaxed">
              Point your MCP client at the proxy command. The proxy discovers tools from your downstream servers, enforces policies, and signs every call.
            </p>
            <CodeBlock
              label="proxy.json (optional config)"
              code={`{
  "downstreamServers": [
    {
      "name": "my-tools",
      "transport": "stdio",
      "command": "npx",
      "args": ["my-mcp-server"]
    }
  ]
}`}
            />
            <p className="text-xs text-text-tertiary leading-relaxed">
              Pass with <code className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded text-[11px]">npx occ-mcp-proxy --config proxy.json --mcp</code>
            </p>
          </div>
        )}

        {activeTab === "api" && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary leading-relaxed">
              Use the management API to create agents, toggle tools, and read proof logs programmatically.
            </p>
            <CodeBlock
              label="Create an agent"
              code={`curl -X POST http://localhost:9100/api/agents \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-agent"}'`}
            />
            <CodeBlock
              label="Enable a tool"
              code={`curl -X PUT http://localhost:9100/api/agents/{id}/tools/send-email`}
            />
            <CodeBlock
              label="Read the proof log"
              code={`curl http://localhost:9100/api/audit`}
            />
          </div>
        )}
      </div>

      {/* What you get */}
      <div className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-text-tertiary mb-5">
          What you get
        </h2>
        <div className="space-y-3">
          <div className="flex gap-4 p-4 rounded-xl bg-bg-elevated border border-border-subtle">
            <div className="mt-0.5 flex-shrink-0 text-text-tertiary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-text mb-1">Default-deny access control</p>
              <p className="text-sm text-text-secondary">
                Every agent starts with zero authority. Tools are enabled per-agent. Nothing flows unless you allow it.
              </p>
            </div>
          </div>
          <div className="flex gap-4 p-4 rounded-xl bg-bg-elevated border border-border-subtle">
            <div className="mt-0.5 flex-shrink-0 text-text-tertiary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12l2 2 4-4" />
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-text mb-1">Cryptographic receipts</p>
              <p className="text-sm text-text-secondary">
                Every tool call produces an Ed25519-signed receipt. Portable, offline-verifiable, tamper-proof.
              </p>
            </div>
          </div>
          <div className="flex gap-4 p-4 rounded-xl bg-bg-elevated border border-border-subtle">
            <div className="mt-0.5 flex-shrink-0 text-text-tertiary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-text mb-1">Agent identity</p>
              <p className="text-sm text-text-secondary">
                Each agent gets a unique ID and policy. Pause, resume, or revoke access at any time. Full audit trail.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Example receipt */}
      <div className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-text-tertiary mb-5">
          Example receipt
        </h2>
        <CodeBlock label="proof.json" code={PROOF_EXAMPLE} />
        <p className="text-sm text-text-secondary leading-relaxed mt-4">
          Self-contained and portable. Verify with the public key. No server, no database, no trust required.
        </p>
      </div>

      {/* Footer */}
      <div className="pt-6 border-t border-border-subtle">
        <p className="text-xs text-text-tertiary">
          Open source &middot;{" "}
          <a
            href="https://github.com/mikeargento/occ"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-secondary hover:text-text transition-colors"
          >
            github.com/mikeargento/occ
          </a>
        </p>
      </div>
    </div>
  );
}

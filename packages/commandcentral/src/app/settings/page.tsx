"use client";

import { useEffect, useState } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-text hover:bg-bg-subtle transition-colors active:scale-[0.97]"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function SettingsPage() {
  const [mcpUrl, setMcpUrl] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl =
      typeof window !== "undefined"
        ? localStorage.getItem("occ-proxy-url") || ""
        : "";
    fetch(`${baseUrl}/api/mcp-config`)
      .then((r) => r.json())
      .then((data) => {
        if (data.mcpServers?.["occ-agent"]?.url) {
          setMcpUrl(data.mcpServers["occ-agent"].url);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] mb-8">
        Settings
      </h1>

      <div className="space-y-6">
        {/* MCP URL */}
        <section className="rounded-xl border border-border bg-bg-elevated p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Your MCP URL</h2>
            {mcpUrl && <CopyButton text={mcpUrl} />}
          </div>
          {mcpUrl ? (
            <div className="rounded-lg bg-bg-inset border border-border-subtle px-4 py-3">
              <p className="text-xs font-mono text-text-secondary break-all">
                {mcpUrl}
              </p>
            </div>
          ) : (
            <div className="skeleton h-10 rounded-lg" />
          )}
          <p className="text-[11px] text-text-tertiary mt-3">
            Paste into Claude Desktop, Cursor, or any MCP-compatible AI.
          </p>
        </section>

        {/* How to connect */}
        <section className="rounded-xl border border-border bg-bg-elevated p-5">
          <h2 className="text-sm font-medium mb-4">Connect your AI</h2>
          <ol className="space-y-3 text-sm text-text-secondary">
            <li className="flex gap-3">
              <span className="text-text-tertiary font-mono text-xs w-4 flex-shrink-0 pt-0.5">1</span>
              <span>Copy the URL above</span>
            </li>
            <li className="flex gap-3">
              <span className="text-text-tertiary font-mono text-xs w-4 flex-shrink-0 pt-0.5">2</span>
              <span>Open your AI tool&apos;s MCP settings</span>
            </li>
            <li className="flex gap-3">
              <span className="text-text-tertiary font-mono text-xs w-4 flex-shrink-0 pt-0.5">3</span>
              <span>Paste as a new MCP server</span>
            </li>
            <li className="flex gap-3">
              <span className="text-text-tertiary font-mono text-xs w-4 flex-shrink-0 pt-0.5">4</span>
              <span>Restart — your AI is now connected</span>
            </li>
          </ol>
        </section>

        {/* Account */}
        <section className="rounded-xl border border-border bg-bg-elevated p-5">
          <h2 className="text-sm font-medium mb-2">Account</h2>
          <p className="text-xs text-text-tertiary">
            Sign in with Google, Apple, or GitHub coming soon.
          </p>
        </section>
      </div>
    </div>
  );
}

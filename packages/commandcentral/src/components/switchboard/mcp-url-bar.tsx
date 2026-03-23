"use client";

import { useState } from "react";

interface McpUrlBarProps {
  agentId: string;
}

export function McpUrlBar({ agentId }: McpUrlBarProps) {
  const [copied, setCopied] = useState(false);
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://occ-production-b94f.up.railway.app";

  // For now, use the anon token. When auth is added, this will be user-specific.
  const mcpUrl = `${baseUrl}/mcp/anon-token`;

  function handleCopy() {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
        <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
          Your MCP URL
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-lg bg-bg-inset border border-border-subtle px-3 py-2 overflow-hidden">
          <p className="text-xs font-mono text-text-secondary truncate">
            {mcpUrl}
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 px-3 py-2 rounded-lg bg-bg-subtle border border-border text-xs font-medium text-text-secondary hover:text-text hover:bg-bg-subtle/80 transition-colors active:scale-[0.97]"
        >
          {copied ? (
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Copied
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy
            </span>
          )}
        </button>
      </div>
      <p className="text-[11px] text-emerald-500 mt-2 leading-relaxed">
        Paste into Claude Desktop, Cursor, or any MCP-compatible AI tool.
      </p>
    </div>
  );
}

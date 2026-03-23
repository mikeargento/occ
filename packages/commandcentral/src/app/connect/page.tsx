"use client";

import { useEffect, useState } from "react";
import { getConnectConfig } from "@/lib/api";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="px-4 py-2 text-sm font-semibold rounded-lg bg-text text-bg hover:opacity-90 transition-all active:scale-[0.97]"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function DownloadButton({ content, filename }: { content: string; filename: string }) {
  return (
    <button
      onClick={() => {
        const blob = new Blob([content], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
      }}
      className="px-4 py-2 text-sm font-semibold rounded-lg border border-border text-text hover:bg-bg-subtle transition-all active:scale-[0.97]"
    >
      Save File
    </button>
  );
}

export default function ConnectPage() {
  const [config, setConfig] = useState<{
    mcpUrl: string; claudeCode: string; claudeDesktop: string; cursor: string; generic: string;
  } | null>(null);

  useEffect(() => {
    getConnectConfig().then(setConfig).catch(() => {});
  }, []);

  if (!config) return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="skeleton h-8 w-48 rounded mb-4" />
      <div className="space-y-4"><div className="skeleton h-40 rounded-xl" /><div className="skeleton h-40 rounded-xl" /></div>
    </div>
  );

  const tools = [
    {
      name: "Claude Code",
      desc: "Run this in your terminal",
      content: config.claudeCode,
      type: "command" as const,
    },
    {
      name: "Cursor",
      desc: "Add to ~/.cursor/mcp.json",
      content: config.cursor,
      type: "json" as const,
      filename: "mcp.json",
    },
    {
      name: "Claude Desktop",
      desc: "Add to claude_desktop_config.json",
      content: config.claudeDesktop,
      type: "json" as const,
      filename: "claude_desktop_config.json",
    },
    {
      name: "Any MCP Client",
      desc: "Use this URL as a Streamable HTTP MCP server",
      content: config.mcpUrl,
      type: "url" as const,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] mb-1">Connect Your AI</h1>
      <p className="text-sm text-text-secondary mb-8">
        Pick your tool, copy one thing, done. OCC controls what it can do.
      </p>

      <div className="space-y-4">
        {tools.map((tool) => (
          <div key={tool.name} className="rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-text">{tool.name}</h3>
                <p className="text-xs text-text-tertiary">{tool.desc}</p>
              </div>
              <div className="flex gap-2">
                {tool.type === "json" && tool.filename && (
                  <DownloadButton content={tool.content} filename={tool.filename} />
                )}
                <CopyButton text={tool.content} />
              </div>
            </div>
            <pre className="text-xs font-mono bg-bg-inset rounded-lg px-4 py-3 overflow-x-auto text-text-secondary select-all">
              {tool.content}
            </pre>
          </div>
        ))}
      </div>

      <div className="mt-8 px-5 py-4 rounded-xl border border-border-subtle bg-bg-subtle/30 text-sm text-text-tertiary">
        <p>After connecting, try using any tool. OCC will block it and ask for your permission on the Permissions page. Every approval is a signed cryptographic proof.</p>
      </div>
    </div>
  );
}

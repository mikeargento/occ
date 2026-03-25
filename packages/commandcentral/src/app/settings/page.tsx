"use client";

import { useEffect, useState } from "react";
import { getAgents } from "@/lib/api";

type Agent = { id: string; name: string; mcpUrl: string | null };

export default function SettingsPage() {
  const [user, setUser] = useState<{ name: string; email: string; avatar: string } | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connectTabs, setConnectTabs] = useState<Record<string, "url" | "terminal" | "json">>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {});

    getAgents()
      .then((d) => setAgents((d.agents ?? []) as unknown as Agent[]))
      .catch(() => {});
  }, []);

  function copyMcp(agentId: string, mcpUrl: string) {
    const tab = connectTabs[agentId] ?? "url";
    const text = tab === "url" ? mcpUrl
      : tab === "terminal" ? `claude mcp add occ --transport http ${mcpUrl}`
      : JSON.stringify({ mcpServers: { occ: { url: mcpUrl } } }, null, 2);
    navigator.clipboard.writeText(text);
    setCopiedId(agentId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Settings</h1>
        <a href="/" className="text-[13px] text-[#999] dark:text-[#666] hover:text-[#111] dark:hover:text-[#e5e5e5] transition-colors">
          Back to dashboard
        </a>
      </div>

      {/* Account */}
      <div className="rounded-xl border border-[#ddd] dark:border-[#1a1a1a] bg-white dark:bg-[#111] p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4">Account</h2>
        {user ? (
          <div className="flex items-center gap-4">
            {user.avatar && (
              <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-[#999] dark:text-[#666]">{user.email}</p>
            </div>
            <a href="/auth/logout" className="text-xs text-[#999] dark:text-[#666] hover:text-red-500 dark:hover:text-red-400 transition-colors">
              Sign out
            </a>
          </div>
        ) : (
          <p className="text-sm text-[#999] dark:text-[#666]">Not signed in</p>
        )}
      </div>

      {/* MCP Links */}
      <div className="rounded-xl border border-[#ddd] dark:border-[#1a1a1a] bg-white dark:bg-[#111] p-5">
        <h2 className="text-sm font-semibold mb-1">MCP Links</h2>
        <p className="text-xs text-[#999] dark:text-[#666] mb-4">Connect your AI to each agent by pasting these into your MCP settings.</p>

        {agents.length === 0 ? (
          <p className="text-sm text-[#999] dark:text-[#666]">No agents yet</p>
        ) : (
          <div className="space-y-4">
            {agents.filter(a => a.mcpUrl).map(a => {
              const tab = connectTabs[a.id] ?? "url";
              return (
                <div key={a.id} className="rounded-lg border border-[#eee] dark:border-[#1a1a1a] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-semibold">{a.name}</span>
                    <div className="flex gap-1">
                      {(["url", "terminal", "json"] as const).map(t => (
                        <button key={t} onClick={() => setConnectTabs(prev => ({ ...prev, [a.id]: t }))}
                          className={`px-2.5 py-0.5 text-[11px] font-medium rounded-md transition-colors ${
                            tab === t
                              ? "bg-[#f0f0f0] dark:bg-[#1a1a1a] text-[#111] dark:text-[#e5e5e5]"
                              : "text-[#888] hover:text-[#666]"
                          }`}>
                          {t === "url" ? "URL" : t === "terminal" ? "Terminal" : "JSON"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-8 flex items-center px-3 rounded-lg bg-[#f7f7f7] dark:bg-[#0a0a0a] border border-[#ddd] dark:border-[#151515] overflow-hidden">
                      <code className="text-[11px] font-mono text-[#999] dark:text-[#888] truncate">
                        {tab === "url" && a.mcpUrl}
                        {tab === "terminal" && `claude mcp add occ --transport http ${a.mcpUrl}`}
                        {tab === "json" && `{ "mcpServers": { "occ": { "url": "${a.mcpUrl}" } } }`}
                      </code>
                    </div>
                    <button onClick={() => copyMcp(a.id, a.mcpUrl!)}
                      className="h-8 px-4 text-[11px] font-semibold rounded-lg bg-[#111] dark:bg-white text-white dark:text-[#111] hover:bg-[#333] dark:hover:bg-[#ddd] transition-all active:scale-[0.97] flex-shrink-0">
                      {copiedId === a.id ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

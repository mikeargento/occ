"use client";

import { useEffect, useState } from "react";
import { getAgents } from "@/lib/api";

type Agent = { id: string; name: string; mcpUrl: string | null; proxyUrl: string | null };

export default function SettingsPage() {
  const [user, setUser] = useState<{ name: string; email: string; avatar: string } | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connectTabs, setConnectTabs] = useState<Record<string, "url" | "terminal" | "json">>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // API Key state
  const [apiKeyStatus, setApiKeyStatus] = useState<{ hasKey: boolean; maskedKey: string | null }>({ hasKey: false, maskedKey: null });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyMsg, setApiKeyMsg] = useState("");

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {});

    getAgents()
      .then((d) => setAgents((d.agents ?? []) as unknown as Agent[]))
      .catch(() => {});

    fetch("/api/settings/api-key")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setApiKeyStatus(d); })
      .catch(() => {});
  }, []);

  async function saveApiKey() {
    if (!apiKeyInput.trim()) return;
    setApiKeyLoading(true);
    setApiKeyMsg("");
    try {
      const r = await fetch("/api/settings/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: apiKeyInput.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        setApiKeyStatus({ hasKey: true, maskedKey: d.maskedKey });
        setApiKeyInput("");
        setApiKeyMsg("Saved");
        setTimeout(() => setApiKeyMsg(""), 2000);
      } else {
        setApiKeyMsg(d.error || "Failed to save");
      }
    } catch {
      setApiKeyMsg("Network error");
    }
    setApiKeyLoading(false);
  }

  async function deleteApiKey() {
    setApiKeyLoading(true);
    try {
      await fetch("/api/settings/api-key", { method: "DELETE" });
      setApiKeyStatus({ hasKey: false, maskedKey: null });
      setApiKeyMsg("Removed");
      setTimeout(() => setApiKeyMsg(""), 2000);
    } catch {}
    setApiKeyLoading(false);
  }

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
        <a href="/" className="text-[13px] text-[#666] hover:text-[#000] transition-colors">
          Back to dashboard
        </a>
      </div>

      {/* Account */}
      <div className="border border-[#d9d9d9] bg-[#efefef] p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4">Account</h2>
        {user ? (
          <div className="flex items-center gap-4">
            {user.avatar && (
              <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-[#666]">{user.email}</p>
            </div>
            <a href="/auth/logout" className="text-xs text-[#666] hover:text-red-500 transition-colors">
              Sign out
            </a>
          </div>
        ) : (
          <p className="text-sm text-[#666]">Not signed in</p>
        )}
      </div>

      {/* Anthropic API Key */}
      <div className="border border-[#d9d9d9] bg-[#efefef] p-5 mb-6">
        <h2 className="text-sm font-semibold mb-1">Anthropic API Key</h2>
        <p className="text-xs text-[#666] mb-4">Required for the LLM API proxy. Your key is stored securely and never exposed to agents.</p>

        {apiKeyStatus.hasKey ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-8 flex items-center px-3 bg-white border border-[#d9d9d9]">
              <code className="text-[12px] font-mono text-[#666]">{apiKeyStatus.maskedKey}</code>
            </div>
            <button onClick={deleteApiKey} disabled={apiKeyLoading}
              className="h-8 px-4 text-[11px] font-semibold border border-[#d9d9d9] text-[#666] hover:text-red-500 hover:border-red-300 transition-colors">
              Remove
            </button>
            {apiKeyMsg && <span className="text-[11px] text-[#3B82F6]">{apiKeyMsg}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              placeholder="sk-ant-..."
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveApiKey()}
              className="flex-1 h-8 px-3 text-[12px] font-mono bg-white border border-[#d9d9d9] placeholder:text-[#bbb] focus:outline-none focus:border-[#3B82F6]"
            />
            <button onClick={saveApiKey} disabled={apiKeyLoading || !apiKeyInput.trim()}
              className="h-8 px-4 text-[11px] font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors disabled:opacity-50">
              Save
            </button>
            {apiKeyMsg && <span className="text-[11px] text-red-500">{apiKeyMsg}</span>}
          </div>
        )}
      </div>

      {/* MCP Links */}
      <div className="border border-[#d9d9d9] bg-[#efefef] p-5">
        <h2 className="text-sm font-semibold mb-1">Agent Connections</h2>
        <p className="text-xs text-[#666] mb-4">Each agent has two connection methods: MCP (tool-level control) and API Proxy (transparent interception).</p>

        {agents.length === 0 ? (
          <p className="text-sm text-[#666]">No agents yet</p>
        ) : (
          <div className="space-y-4">
            {agents.map(a => {
              const tab = connectTabs[a.id] ?? "url";
              return (
                <div key={a.id} className="border border-[#d9d9d9] bg-white p-4">
                  <span className="text-[13px] font-semibold">{a.name}</span>

                  {/* MCP Link */}
                  {a.mcpUrl && (
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1">MCP</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-7 flex items-center px-2 bg-[#efefef] border border-[#d9d9d9] overflow-hidden">
                          <code className="text-[10px] font-mono text-[#666] truncate">{a.mcpUrl}</code>
                        </div>
                        <button onClick={() => { navigator.clipboard.writeText(a.mcpUrl!); setCopiedId(`mcp-${a.id}`); setTimeout(() => setCopiedId(null), 2000); }}
                          className="h-7 px-3 text-[10px] font-semibold bg-[#000] text-white hover:bg-[#333] transition-all flex-shrink-0">
                          {copiedId === `mcp-${a.id}` ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* API Proxy Link */}
                  {a.proxyUrl && (
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1">API Proxy</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-7 flex items-center px-2 bg-[#efefef] border border-[#d9d9d9] overflow-hidden">
                          <code className="text-[10px] font-mono text-[#666] truncate">{a.proxyUrl}</code>
                        </div>
                        <button onClick={() => { navigator.clipboard.writeText(a.proxyUrl!); setCopiedId(`proxy-${a.id}`); setTimeout(() => setCopiedId(null), 2000); }}
                          className="h-7 px-3 text-[10px] font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-all flex-shrink-0">
                          {copiedId === `proxy-${a.id}` ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <p className="text-[10px] text-[#999] mt-1">Set as base_url in your Anthropic SDK: <code className="font-mono">Anthropic(base_url="{a.proxyUrl}")</code></p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { v2GetOverview } from "@/lib/api-v2";
import type { V2Overview } from "@/lib/types-v2";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [overview, setOverview] = useState<V2Overview | null>(null);
  const [user, setUser] = useState<{ name: string; email: string; avatar: string } | null>(null);

  // API Key state
  const [apiKeyStatus, setApiKeyStatus] = useState<{ hasKey: boolean; maskedKey: string | null }>({
    hasKey: false,
    maskedKey: null,
  });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyMsg, setApiKeyMsg] = useState("");

  // Agent connections
  type Agent = { id: string; name: string; mcpUrl: string | null; proxyUrl: string | null };
  const [agents, setAgents] = useState<Agent[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    v2GetOverview()
      .then((ov) => setOverview(ov))
      .catch(() => {});

    fetch("/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {});

    fetch("/api/settings/api-key")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setApiKeyStatus(d);
      })
      .catch(() => {});

    fetch("/api/v2/agents")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d)) setAgents(d);
        else if (d?.agents) setAgents(d.agents);
      })
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
    } catch {
      // ignore
    }
    setApiKeyLoading(false);
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <Shell pendingCount={overview?.pending}>
      <PageHeader title="Settings" description="Account, API keys, and connections" />

      {/* Account */}
      <div className="border border-[var(--border)] bg-[var(--bg-elevated)] p-5 mb-6">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Account</h2>
        {user ? (
          <div className="flex items-center gap-4">
            {user.avatar && (
              <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">{user.name}</p>
              <p className="text-xs text-[var(--text-tertiary)]">{user.email}</p>
            </div>
            <a
              href="/auth/logout"
              className="text-xs text-[var(--text-tertiary)] hover:text-[#ef4444] transition-colors"
            >
              Sign out
            </a>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">Not signed in</p>
        )}
      </div>

      {/* Anthropic API Key */}
      <div className="border border-[var(--border)] bg-[var(--bg-elevated)] p-5 mb-6">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
          Anthropic API Key
        </h2>
        <p className="text-xs text-[var(--text-tertiary)] mb-4">
          Required for the LLM API proxy. Your key is stored securely and never exposed to agents.
        </p>

        {apiKeyStatus.hasKey ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-8 flex items-center px-3 bg-[var(--bg)] border border-[var(--border)]">
              <code className="text-[12px] font-mono text-[var(--text-tertiary)]">
                {apiKeyStatus.maskedKey}
              </code>
            </div>
            <button
              onClick={deleteApiKey}
              disabled={apiKeyLoading}
              className="h-8 px-4 text-[11px] font-semibold border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[#ef4444] hover:border-[rgba(239,68,68,0.3)] transition-colors"
            >
              Remove
            </button>
            {apiKeyMsg && (
              <span className="text-[11px] text-[#3B82F6]">{apiKeyMsg}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              placeholder="sk-ant-..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveApiKey()}
              className="flex-1 h-8 px-3 text-[12px] font-mono bg-[var(--bg)] border border-[var(--border)] placeholder:text-[var(--text-tertiary)] text-[var(--text-primary)] focus:outline-none focus:border-[#3B82F6]"
            />
            <button
              onClick={saveApiKey}
              disabled={apiKeyLoading || !apiKeyInput.trim()}
              className="h-8 px-4 text-[11px] font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors disabled:opacity-50"
            >
              Save
            </button>
            {apiKeyMsg && (
              <span className="text-[11px] text-[#ef4444]">{apiKeyMsg}</span>
            )}
          </div>
        )}
      </div>

      {/* Agent Connections */}
      <div className="border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
          Agent Connections
        </h2>
        <p className="text-xs text-[var(--text-tertiary)] mb-4">
          Two connection methods: MCP (free with Max plan) and API Proxy (pay-per-call).
        </p>

        {agents.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">No agents yet</p>
        ) : (
          <div className="space-y-4">
            {agents.map((a) => (
              <div key={a.id} className="border border-[var(--border)] bg-[var(--bg)] p-4">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {a.name}
                </span>
                {a.mcpUrl && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                      MCP — free with Max plan
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-7 flex items-center px-2 bg-[var(--bg-elevated)] border border-[var(--border)] overflow-hidden">
                        <code className="text-[10px] font-mono text-[var(--text-tertiary)] truncate">
                          {a.mcpUrl}
                        </code>
                      </div>
                      <button
                        onClick={() => copyText(a.mcpUrl!, `mcp-${a.id}`)}
                        className="h-7 px-3 text-[10px] font-semibold bg-[var(--text-primary)] text-[var(--bg)] hover:opacity-80 transition-all flex-shrink-0"
                      >
                        {copiedId === `mcp-${a.id}` ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
                {a.proxyUrl && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                      API Proxy — pay-per-call
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-7 flex items-center px-2 bg-[var(--bg-elevated)] border border-[var(--border)] overflow-hidden">
                        <code className="text-[10px] font-mono text-[var(--text-tertiary)] truncate">
                          {a.proxyUrl}
                        </code>
                      </div>
                      <button
                        onClick={() => copyText(a.proxyUrl!, `proxy-${a.id}`)}
                        className="h-7 px-3 text-[10px] font-semibold bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-all flex-shrink-0"
                      >
                        {copiedId === `proxy-${a.id}` ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [user, setUser] = useState<{ name: string; email: string; avatar: string } | null>(null);

  // API Key state
  const [apiKeyStatus, setApiKeyStatus] = useState<{ hasKey: boolean; maskedKey: string | null }>({
    hasKey: false,
    maskedKey: null,
  });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyMsg, setApiKeyMsg] = useState("");
  const [hookToken, setHookToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {});

    fetch("/api/settings/api-key")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setApiKeyStatus(d); })
      .catch(() => {});

    fetch("/api/settings/token")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.token) setHookToken(d.token); })
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

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 h-12 bg-white border-b border-[#d9d9d9] flex items-center gap-3 px-4">
        <Link href="/" className="text-[#999] hover:text-black transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </Link>
        <span className="text-sm font-semibold text-black">Settings</span>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        {/* Account */}
        {user && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-3">Account</h2>
            <div className="flex items-center gap-3">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#d9d9d9] flex items-center justify-center text-xs font-semibold text-[#666]">
                  {user.name?.[0]?.toUpperCase() ?? "U"}
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-black">{user.name}</p>
                <p className="text-xs text-[#999]">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Hook Token */}
        {hookToken && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-1">OCC Token</h2>
            <p className="text-xs text-[#999] mb-3">Use this to connect Claude Code to OCC.</p>

            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-8 flex items-center px-3 bg-[#efefef] border border-[#d9d9d9] overflow-hidden">
                <code className="text-xs font-mono text-[#666] truncate">{hookToken}</code>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(hookToken);
                  setTokenCopied(true);
                  setTimeout(() => setTokenCopied(false), 2000);
                }}
                className="h-8 px-4 text-xs font-semibold bg-black text-white hover:opacity-80 transition-opacity flex-shrink-0"
              >
                {tokenCopied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="bg-[#efefef] border border-[#d9d9d9] p-3">
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-2">Quick setup</p>
              <code className="text-xs font-mono text-black block mb-1">curl -fsSL https://agent.occ.wtf/install | bash</code>
              <code className="text-xs font-mono text-[#666] block">export OCC_TOKEN={hookToken}</code>
            </div>
          </div>
        )}

        {/* API Key */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-1">Anthropic API Key</h2>
          <p className="text-xs text-[#999] mb-3">Required for the LLM API proxy. Stored securely.</p>

          {apiKeyStatus.hasKey ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-8 flex items-center px-3 bg-[#efefef] border border-[#d9d9d9]">
                <code className="text-xs font-mono text-[#666]">{apiKeyStatus.maskedKey}</code>
              </div>
              <button
                onClick={deleteApiKey}
                disabled={apiKeyLoading}
                className="h-8 px-4 text-xs font-semibold border border-[#d9d9d9] text-[#666] hover:text-[#ef4444] hover:border-[#ef4444] transition-colors"
              >
                Remove
              </button>
              {apiKeyMsg && <span className="text-xs text-[#22c55e]">{apiKeyMsg}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="password"
                placeholder="sk-ant-..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveApiKey()}
                className="flex-1 h-8 px-3 text-xs font-mono bg-white border border-[#d9d9d9] placeholder:text-[#999] text-black focus:outline-none focus:border-black"
              />
              <button
                onClick={saveApiKey}
                disabled={apiKeyLoading || !apiKeyInput.trim()}
                className="h-8 px-4 text-xs font-semibold bg-black text-white hover:opacity-80 disabled:opacity-40 transition-opacity"
              >
                Save
              </button>
              {apiKeyMsg && <span className="text-xs text-[#ef4444]">{apiKeyMsg}</span>}
            </div>
          )}
        </div>

        {/* Sign out */}
        <div className="border-t border-[#e5e5e5] pt-6">
          <a
            href="/auth/logout"
            className="text-sm text-[#999] hover:text-[#ef4444] transition-colors"
          >
            Sign out
          </a>
        </div>
      </main>
    </div>
  );
}

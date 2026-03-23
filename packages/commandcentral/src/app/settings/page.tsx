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

function AccountSection() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string; provider: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-bg-elevated p-5">
        <h2 className="text-sm font-medium mb-3">Account</h2>
        <div className="skeleton h-10 rounded-lg" />
      </section>
    );
  }

  if (user) {
    return (
      <section className="rounded-xl border border-border bg-bg-elevated p-5">
        <h2 className="text-sm font-medium mb-3">Account</h2>
        <div className="flex items-center gap-3">
          {user.avatar && (
            <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
          )}
          <div>
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-text-tertiary">{user.email}</p>
          </div>
          <a
            href="/auth/logout"
            className="ml-auto text-xs text-text-tertiary hover:text-text transition-colors"
          >
            Sign out
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-bg-elevated p-5">
      <h2 className="text-sm font-medium mb-3">Account</h2>
      <p className="text-xs text-text-tertiary mb-4">
        Sign in to get your own MCP URL and save your switchboard configuration.
      </p>
      <a
        href="/auth/login/github"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#24292f] text-white text-sm font-medium hover:bg-[#32383f] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        Sign in with GitHub
      </a>
    </section>
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
        <AccountSection />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [user, setUser] = useState<{ name: string; email: string; avatar: string } | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<{ hasKey: boolean; maskedKey: string | null }>({ hasKey: false, maskedKey: null });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyMsg, setApiKeyMsg] = useState("");
  const [hookToken, setHookToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [cmdCopied, setCmdCopied] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    fetch("/auth/me").then(r => r.ok ? r.json() : null).then(d => setUser(d?.user ?? null)).catch(() => {});
    fetch("/api/settings/api-key").then(r => r.ok ? r.json() : null).then(d => { if (d) setApiKeyStatus(d); }).catch(() => {});
    fetch("/api/settings/token").then(r => r.ok ? r.json() : null).then(d => { if (d?.token) setHookToken(d.token); }).catch(() => {});
  }, []);

  function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setIsDark(next === "dark");
  }

  async function saveApiKey() {
    if (!apiKeyInput.trim()) return;
    setApiKeyLoading(true); setApiKeyMsg("");
    try {
      const r = await fetch("/api/settings/api-key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: apiKeyInput.trim() }) });
      const d = await r.json();
      if (r.ok) { setApiKeyStatus({ hasKey: true, maskedKey: d.maskedKey }); setApiKeyInput(""); setApiKeyMsg("Saved"); setTimeout(() => setApiKeyMsg(""), 2000); }
      else setApiKeyMsg(d.error || "Failed");
    } catch { setApiKeyMsg("Network error"); }
    setApiKeyLoading(false);
  }

  async function deleteApiKey() {
    setApiKeyLoading(true);
    try { await fetch("/api/settings/api-key", { method: "DELETE" }); setApiKeyStatus({ hasKey: false, maskedKey: null }); setApiKeyMsg("Removed"); setTimeout(() => setApiKeyMsg(""), 2000); } catch {}
    setApiKeyLoading(false);
  }

  function copyText(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  }

  return (
    <div className="settings-layout">
      {/* Top bar — same as chat */}
      <div className="topbar">
        <div className="topbar-left">
          <a href="/" className="topbar-link" title="Back to chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </a>
          <span className="topbar-title">Settings</span>
        </div>
        <div className="topbar-right">
          <button className="topbar-btn" onClick={toggleTheme} title="Toggle dark mode">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          </button>
          <a href="https://occ.wtf/explorer" className="topbar-link" target="_blank" title="Proof Explorer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </a>
        </div>
      </div>

      <div className="settings-container">

        {/* Account */}
        {user && (
          <div className="settings-section">
            <div className="settings-label">Account</div>
            <div className="settings-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {user.avatar ? (
                  <img src={user.avatar} alt="" style={{ width: 48, height: 48, borderRadius: "50%" }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 600 }}>
                    {user.name?.[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{user.name}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{user.email}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Appearance */}
        <div className="settings-section">
          <div className="settings-label">Appearance</div>
          <div className="settings-card">
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Dark mode</div>
                <div className="settings-row-desc">Switch between light and dark themes</div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={isDark} onChange={toggleTheme} />
                <div className="toggle-track" />
                <div className="toggle-thumb" />
              </label>
            </div>
          </div>
        </div>

        {/* Connection */}
        {hookToken && (
          <div className="settings-section">
            <div className="settings-label">Connection</div>
            <div className="settings-card">
              <div style={{ marginBottom: 12 }}>
                <div className="settings-row-label">Your Token</div>
                <div className="settings-row-desc">Use this to connect Claude Code to AiMessage</div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 40, display: "flex", alignItems: "center", padding: "0 12px", background: "var(--input-bg)", borderRadius: 8, overflow: "hidden" }}>
                  <code style={{ fontSize: 12, fontFamily: "'SF Mono', monospace", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hookToken}</code>
                </div>
                <button onClick={() => copyText(hookToken, setTokenCopied)} className="settings-btn settings-btn-primary">
                  {tokenCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="settings-code">
                <div style={{ color: "var(--text-tertiary)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Quick setup</div>
                <div>curl -fsSL https://agent.occ.wtf/install | bash</div>
                <div style={{ color: "var(--text-secondary)" }}>export OCC_TOKEN={hookToken}</div>
              </div>
              <button onClick={() => copyText(`curl -fsSL https://agent.occ.wtf/install | bash\nexport OCC_TOKEN=${hookToken}`, setCmdCopied)} className="settings-btn settings-btn-primary" style={{ marginTop: 8, width: "100%" }}>
                {cmdCopied ? "Copied!" : "Copy setup commands"}
              </button>
            </div>
          </div>
        )}

        {/* API Key */}
        <div className="settings-section">
          <div className="settings-label">API Key</div>
          <div className="settings-card">
            <div style={{ marginBottom: 12 }}>
              <div className="settings-row-label">Anthropic API Key</div>
              <div className="settings-row-desc">Powers the AiMessage chat assistant (uses Haiku — very cheap)</div>
            </div>
            {apiKeyStatus.hasKey ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1, height: 40, display: "flex", alignItems: "center", padding: "0 12px", background: "var(--input-bg)", borderRadius: 8 }}>
                  <code style={{ fontSize: 13, fontFamily: "'SF Mono', monospace", color: "var(--text-secondary)" }}>{apiKeyStatus.maskedKey}</code>
                </div>
                <button onClick={deleteApiKey} disabled={apiKeyLoading} className="settings-btn settings-btn-danger">Remove</button>
                {apiKeyMsg && <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 500 }}>{apiKeyMsg}</span>}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="password" placeholder="sk-ant-..." value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} onKeyDown={e => e.key === "Enter" && saveApiKey()} className="settings-input" />
                <button onClick={saveApiKey} disabled={apiKeyLoading || !apiKeyInput.trim()} className="settings-btn settings-btn-primary">Save</button>
                {apiKeyMsg && <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 500 }}>{apiKeyMsg}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Links */}
        <div className="settings-section">
          <div className="settings-label">Resources</div>
          <div className="settings-card">
            <a href="https://occ.wtf/explorer" className="settings-row" target="_blank" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="settings-row-label">Proof Explorer</div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <a href="https://occ.wtf/docs" className="settings-row" target="_blank" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="settings-row-label">Documentation</div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <a href="https://github.com/mikeargento/occ" className="settings-row" target="_blank" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="settings-row-label">GitHub</div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
        </div>

        {/* Sign out */}
        <div className="settings-section">
          <a href="/auth/logout" className="settings-btn settings-btn-danger" style={{ display: "block", textAlign: "center", textDecoration: "none", lineHeight: "36px", width: "100%" }}>
            Sign out
          </a>
        </div>
      </div>
    </div>
  );
}

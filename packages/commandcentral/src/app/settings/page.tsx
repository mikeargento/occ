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

  useEffect(() => {
    fetch("/auth/me").then(r => r.ok ? r.json() : null).then(d => setUser(d?.user ?? null)).catch(() => {});
    fetch("/api/settings/api-key").then(r => r.ok ? r.json() : null).then(d => { if (d) setApiKeyStatus(d); }).catch(() => {});
    fetch("/api/settings/token").then(r => r.ok ? r.json() : null).then(d => { if (d?.token) setHookToken(d.token); }).catch(() => {});
  }, []);

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

  return (
    <div style={{ minHeight: "100%", background: "#fff", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, height: 52, borderBottom: "1px solid #e5e5ea", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", padding: "0 16px", gap: 12 }}>
        <a href="/" style={{ color: "#8e8e93", display: "flex", alignItems: "center", textDecoration: "none" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
        </a>
        <span style={{ fontSize: 17, fontWeight: 600, color: "#000" }}>Settings</span>
      </div>

      <div style={{ maxWidth: 400, margin: "0 auto", padding: "32px 16px" }}>

        {/* Account */}
        {user && (
          <div style={{ marginBottom: 32 }}>
            <div style={S.label}>Account</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {user.avatar ? (
                <img src={user.avatar} alt="" style={{ width: 44, height: 44, borderRadius: "50%" }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#e9e9eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, color: "#636366" }}>
                  {user.name?.[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: "#000" }}>{user.name}</div>
                <div style={{ fontSize: 13, color: "#8e8e93" }}>{user.email}</div>
              </div>
            </div>
          </div>
        )}

        {/* Token */}
        {hookToken && (
          <div style={{ marginBottom: 32 }}>
            <div style={S.label}>Your Token</div>
            <p style={{ fontSize: 13, color: "#8e8e93", margin: "0 0 12px" }}>Connect Claude Code to AiMessage.</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, height: 40, display: "flex", alignItems: "center", padding: "0 12px", background: "#f2f2f7", borderRadius: 10, overflow: "hidden" }}>
                <code style={{ fontSize: 12, fontFamily: "SF Mono, monospace", color: "#636366", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hookToken}</code>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(hookToken); setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2000); }}
                style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: "#000", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                {tokenCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <div style={{ background: "#f2f2f7", borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#8e8e93", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Quick setup</div>
              <code style={{ fontSize: 12, fontFamily: "SF Mono, monospace", color: "#000", display: "block", lineHeight: 1.8 }}>
                curl -fsSL https://agent.occ.wtf/install | bash
              </code>
              <code style={{ fontSize: 12, fontFamily: "SF Mono, monospace", color: "#636366", display: "block" }}>
                export OCC_TOKEN={hookToken}
              </code>
            </div>
          </div>
        )}

        {/* API Key */}
        <div style={{ marginBottom: 32 }}>
          <div style={S.label}>Anthropic API Key</div>
          <p style={{ fontSize: 13, color: "#8e8e93", margin: "0 0 12px" }}>Optional. For the LLM API proxy.</p>
          {apiKeyStatus.hasKey ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1, height: 40, display: "flex", alignItems: "center", padding: "0 12px", background: "#f2f2f7", borderRadius: 10 }}>
                <code style={{ fontSize: 12, fontFamily: "SF Mono, monospace", color: "#636366" }}>{apiKeyStatus.maskedKey}</code>
              </div>
              <button onClick={deleteApiKey} disabled={apiKeyLoading}
                style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: "#ff3b30", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", opacity: apiKeyLoading ? 0.4 : 1 }}>
                Remove
              </button>
              {apiKeyMsg && <span style={{ fontSize: 12, color: "#34c759" }}>{apiKeyMsg}</span>}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="password" placeholder="sk-ant-..." value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} onKeyDown={e => e.key === "Enter" && saveApiKey()}
                style={{ flex: 1, height: 40, padding: "0 12px", fontSize: 13, fontFamily: "SF Mono, monospace", background: "#fff", border: "1px solid #e5e5ea", borderRadius: 10, color: "#000", outline: "none" }} />
              <button onClick={saveApiKey} disabled={apiKeyLoading || !apiKeyInput.trim()}
                style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: "#000", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", opacity: apiKeyLoading || !apiKeyInput.trim() ? 0.4 : 1 }}>
                Save
              </button>
              {apiKeyMsg && <span style={{ fontSize: 12, color: "#ff3b30" }}>{apiKeyMsg}</span>}
            </div>
          )}
        </div>

        {/* Sign out */}
        <div style={{ borderTop: "1px solid #e5e5ea", paddingTop: 24 }}>
          <a href="/auth/logout" style={{ fontSize: 15, color: "#ff3b30", textDecoration: "none" }}>Sign out</a>
        </div>
      </div>
    </div>
  );
}

const S = {
  label: { fontSize: 11, fontWeight: 600, color: "#8e8e93", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 12 },
};

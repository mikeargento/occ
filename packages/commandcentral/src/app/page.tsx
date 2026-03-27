"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getMe, getFeed, type FeedItem } from "@/lib/api";

interface ChatMsg {
  id: string;
  role: "assistant" | "user";
  text: string;
  ts: number;
}

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [view, setView] = useState<"chat" | "explorer">("chat");

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const seenRef = useRef<Set<number>>(new Set());

  function toggleTheme() {
    const html = document.documentElement;
    const dark = html.getAttribute("data-theme") === "dark";
    html.setAttribute("data-theme", dark ? "light" : "dark");
    localStorage.setItem("theme", dark ? "light" : "dark");
    setIsDark(!dark);
  }

  useEffect(() => {
    getMe().then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const checkPending = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getFeed();
      const pending = (data.requests ?? []).filter((r: FeedItem) => r.status === "pending");
      for (const req of pending) {
        if (!seenRef.current.has(req.id)) {
          seenRef.current.add(req.id);
          setMessages(prev => [...prev, {
            id: `req-${req.id}`, role: "assistant",
            text: describeRequest(req), ts: Date.now(),
          }]);
        }
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user) return;
    checkPending();
    pollingRef.current = setInterval(checkPending, 3000);
    return () => clearInterval(pollingRef.current);
  }, [user, checkPending]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (user && messages.length === 0) {
      setMessages([{
        id: "greeting", role: "assistant",
        text: `Hey ${user.name?.split(" ")[0] || "there"}! I'm your AiMessage assistant.\n\nWhen your AI needs permission to do something, I'll let you know here. You can say "yes" to approve, "no" to deny, or ask me anything about what's happening.`,
        ts: Date.now(),
      }]);
    }
  }, [user]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || sending) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    if (!override) setInput("");
    setSending(true);
    if (inputRef.current) { inputRef.current.style.height = "auto"; }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].slice(-30).map(m => ({ role: m.role, content: m.text })),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`, role: "assistant",
        text: data.error || data.response || "Something went wrong.",
        ts: Date.now(),
      }]);
      if (data.action) { seenRef.current.clear(); checkPending(); }
    } catch {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: "assistant", text: "Failed to connect. Try again.", ts: Date.now() }]);
    }
    setSending(false);
    inputRef.current?.focus();
  }

  function sendProofToChat(proof: any) {
    setView("chat");
    const payload = JSON.stringify(proof, null, 2);
    send(`Analyze this proof:\n\`\`\`json\n${payload}\n\`\`\``);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  }

  // ── Loading ──
  if (loading) return (
    <div className="page-center">
      <div className="loader" />
    </div>
  );

  // ── Login ──
  if (!user) return (
    <div className="page-center">
      <div className="login-card">
        <h1 className="login-title">AiMessage</h1>
        <p className="login-sub">Your AI asks before it acts.</p>
        <div className="login-buttons">
          <a href="/auth/login/github" className="auth-btn auth-github">
            <GithubIcon /> Continue with GitHub
          </a>
          <a href="/auth/login/google" className="auth-btn auth-google">
            <GoogleIcon /> Continue with Google
          </a>
          <a href="/auth/login/apple" className="auth-btn auth-apple">
            <AppleIcon /> Continue with Apple
          </a>
        </div>
      </div>
    </div>
  );

  // ── Chat ──
  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <span className="sidebar-logo">AiMessage</span>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          <button className={`sidebar-item ${view === "chat" ? "sidebar-item-active" : ""}`} onClick={() => { setView("chat"); setSidebarOpen(false); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="3"/><circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none"/><path d="M12 2v4"/><circle cx="12" cy="2" r="1" fill="currentColor" stroke="none"/></svg>
            Chat
          </button>
          <button className={`sidebar-item ${view === "explorer" ? "sidebar-item-active" : ""}`} onClick={() => { setView("explorer"); setSidebarOpen(false); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Proof Explorer
          </button>
          <a href="https://occ.wtf/docs" className="sidebar-item" target="_blank">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Documentation
          </a>
          <a href="https://github.com/mikeargento/occ" className="sidebar-item" target="_blank">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            GitHub
          </a>
          <a href="/settings" className="sidebar-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Settings
          </a>
          <button className="sidebar-item" onClick={toggleTheme}>
            {isDark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
            {isDark ? "Light mode" : "Dark mode"}
          </button>
        </nav>

        <div className="sidebar-footer">
          {user && (
            <div className="sidebar-user">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="sidebar-user-avatar" />
              ) : (
                <div className="sidebar-user-avatar-placeholder">{user.name?.[0]}</div>
              )}
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user.name}</div>
                <div className="sidebar-user-email">{user.email}</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <main className="chat-main">
        {/* Mobile header */}
        <div className="mobile-header">
          <button className="topbar-btn" onClick={() => setSidebarOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span className="topbar-title">AiMessage</span>
          <div style={{ width: 36 }} />
        </div>

        {view === "chat" ? (<>
        {/* Messages */}
      <div className="messages-scroll">
        <div className="messages-container">
          {messages.map(msg => (
            <div key={msg.id} className={`message ${msg.role === "user" ? "message-user" : "message-assistant"}`}>
              {msg.role === "assistant" && (
                <div className="message-avatar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="3"/><circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none"/><path d="M12 2v4"/><circle cx="12" cy="2" r="1" fill="currentColor" stroke="none"/></svg>
                </div>
              )}
              <div className="message-content">
                {msg.role === "assistant" && <div className="message-name">AiMessage</div>}
                <div className="message-text">{msg.text}</div>
              </div>
            </div>
          ))}

          {sending && (
            <div className="message message-assistant">
              <div className="message-avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="3"/><circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none"/><path d="M12 2v4"/><circle cx="12" cy="2" r="1" fill="currentColor" stroke="none"/></svg>
              </div>
              <div className="message-content">
                <div className="message-name">AiMessage</div>
                <div className="typing-indicator">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* Input */}
      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={autoResize}
            onKeyDown={handleKey}
            placeholder="Message AiMessage..."
            rows={1}
            className="input-field"
          />
          <button onClick={() => send()} disabled={!input.trim() || sending} className="send-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div className="input-footer">
          <span className="footer-link">Press Enter to send · Shift+Enter for new line</span>
        </div>
      </div>
      </>) : (
        <ExplorerView onSendToChat={sendProofToChat} />
      )}
      </main>
    </div>
  );
}

/* ── Helpers ── */

function describeRequest(item: FeedItem): string {
  const a = (item.args && typeof item.args === "object" ? item.args : {}) as Record<string, unknown>;
  switch (item.tool) {
    case "Write": return `Your AI wants to write a file called **${basename(a.file_path || a.path)}**.\n\nSay "yes" to allow, "once" for one time, or "no" to deny.`;
    case "Edit": return `Your AI wants to edit **${basename(a.file_path || a.path)}**. Allow?`;
    case "Bash": { const cmd = String(a.command || "").split("\n")[0].slice(0, 120); return `Your AI wants to run:\n\n\`${cmd}\`\n\nAllow?`; }
    default: { const name = item.tool.startsWith("mcp__") ? (item.tool.split("__").pop() || item.tool) : item.tool; return `Your AI wants to use **${name.replace(/[_-]/g, " ")}**. Allow?`; }
  }
}
function basename(v: unknown): string { const s = String(v || "unknown"); return s.split("/").pop() || s; }

/* ── Explorer View ── */
function ExplorerView({ onSendToChat }: { onSendToChat: (proof: any) => void }) {
  const [proofs, setProofs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/audit?limit=100").then(r => r.json()).then(d => setProofs(d.entries ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function toggle(i: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><div className="loader" /></div>;

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 768, margin: "0 auto", padding: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Proof Explorer</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>Your cryptographic proof chain</p>

        {proofs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-tertiary)" }}>No proofs yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {proofs.map((p, i) => (
              <div key={p.id || i} style={{ background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden" }}>
                <button onClick={() => toggle(i)} style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px", background: "none", border: "none", cursor: "pointer",
                  color: "var(--text)", fontFamily: "inherit", fontSize: 14, textAlign: "left",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: p.decision?.allowed ? "var(--green)" : "var(--red)",
                    }} />
                    <span style={{ fontWeight: 500 }}>{p.tool || "Unknown"}</span>
                    <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
                      {p.decision?.allowed ? "Allowed" : "Denied"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      {p.timestamp ? new Date(p.timestamp).toLocaleString() : ""}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{ transform: expanded.has(i) ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                </button>
                {expanded.has(i) && (
                  <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border-light)", fontSize: 13, lineHeight: 1.8 }}>
                    {p.proofDigestB64 && (
                      <div style={{ marginTop: 12 }}>
                        <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Digest</span>
                        <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-all", marginTop: 4 }}>{p.proofDigestB64}</div>
                      </div>
                    )}
                    {p.agentId && (
                      <div style={{ marginTop: 8 }}>
                        <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Agent</span>
                        <span style={{ marginLeft: 8, color: "var(--text-secondary)" }}>{p.agentId}</span>
                      </div>
                    )}
                    {p.decision?.reason && (
                      <div style={{ marginTop: 8 }}>
                        <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Reason</span>
                        <span style={{ marginLeft: 8, color: "var(--text-secondary)" }}>{p.decision.reason}</span>
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onSendToChat(p); }}
                      style={{
                        marginTop: 16, padding: "8px 16px", background: "var(--green, #34d399)", color: "#000",
                        border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13,
                        fontFamily: "inherit",
                      }}
                    >
                      Send to AI
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Icons ── */
function GithubIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>; }
function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>; }
function AppleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>; }

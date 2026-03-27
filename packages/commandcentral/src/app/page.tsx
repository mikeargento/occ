"use client";

import { useState, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { getMe, getFeed, type FeedItem } from "@/lib/api";

interface ChatMsg {
  id: string;
  role: "assistant" | "user" | "system";
  text: string;
  ts: number;
  pending?: { id: number; tool: string; args: unknown };
}

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const seenRequestsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    getMe().then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Poll for pending requests
  const checkPending = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getFeed();
      const items = data.requests ?? [];
      const pending = items.filter((r: FeedItem) => r.status === "pending");
      for (const req of pending) {
        if (!seenRequestsRef.current.has(req.id)) {
          seenRequestsRef.current.add(req.id);
          const msg = describeRequest(req);
          setMessages(prev => [...prev, {
            id: `req-${req.id}`,
            role: "assistant",
            text: msg,
            ts: Date.now(),
            pending: { id: req.id, tool: req.tool, args: req.args },
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Greeting
  useEffect(() => {
    if (user && messages.length === 0) {
      const name = user.name?.split(" ")[0] || "there";
      setMessages([{
        id: "greeting",
        role: "assistant",
        text: `Hey ${name}! 👋\n\nI'm your AiMessage assistant. When your AI needs permission, I'll ask you right here. You can also ask me anything — "what's pending?", "show recent activity", or just "yes" to approve.`,
        ts: Date.now(),
      }]);
    }
  }, [user]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSending(true);

    // Auto-resize textarea back to single line
    if (inputRef.current) inputRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].slice(-30).map(m => ({ role: m.role === "system" ? "assistant" : m.role, content: m.text })),
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, {
          id: `e-${Date.now()}`, role: "assistant",
          text: data.error, ts: Date.now(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`, role: "assistant",
          text: data.response, ts: Date.now(),
        }]);

        if (data.action) {
          seenRequestsRef.current.clear();
          checkPending();
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`, role: "assistant",
        text: "Something went wrong. Try again.", ts: Date.now(),
      }]);
    }
    setSending(false);
    inputRef.current?.focus();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }

  // ── Loading ──
  if (loading) return (
    <div style={styles.fullCenter}>
      <div style={styles.loadingContainer}>
        <div style={styles.logoMark}>A</div>
        <div style={styles.shimmer} />
      </div>
    </div>
  );

  // ── Login ──
  if (!user) return (
    <div style={styles.fullCenter}>
      <div style={styles.loginCard}>
        <div style={styles.loginLogo}>AiMessage</div>
        <p style={styles.loginSub}>Your AI asks before it acts.</p>
        <div style={styles.loginDivider}>
          <span style={styles.loginDividerLine} />
          <span style={styles.loginDividerText}>Sign in</span>
          <span style={styles.loginDividerLine} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="/auth/login/github" style={authBtn("github")}>
            <GithubIcon /> Continue with GitHub
          </a>
          <a href="/auth/login/google" style={authBtn("google")}>
            <GoogleIcon /> Continue with Google
          </a>
          <a href="/auth/login/apple" style={authBtn("apple")}>
            <AppleIcon /> Continue with Apple
          </a>
        </div>
        <p style={styles.loginFooter}>
          Built on <a href="https://occ.wtf" style={{ color: "var(--accent)" }}>OCC</a>
        </p>
      </div>
    </div>
  );

  // ── Chat ──
  return (
    <div style={styles.layout}>
      {/* Sidebar */}
      <aside style={{
        ...styles.sidebar,
        ...(sidebarOpen ? { transform: "translateX(0)" } : {}),
      }}>
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarLogo}>AiMessage</div>
        </div>
        <nav style={styles.sidebarNav}>
          <button style={styles.sidebarItem} onClick={() => setSidebarOpen(false)}>
            <ChatIcon size={18} /> Chat
          </button>
          <a href="/settings" style={styles.sidebarItem}>
            <SettingsIcon size={18} /> Settings
          </a>
          <a href="https://occ.wtf/explorer" style={styles.sidebarItem} target="_blank">
            <ExplorerIcon size={18} /> Proof Explorer
          </a>
          <a href="https://occ.wtf/docs" style={styles.sidebarItem} target="_blank">
            <DocsIcon size={18} /> Documentation
          </a>
        </nav>
        <div style={styles.sidebarFooter}>
          <div style={styles.userRow}>
            {user.avatar ? (
              <img src={user.avatar} alt="" style={styles.userAvatar} />
            ) : (
              <div style={styles.userAvatarPlaceholder}>{user.name?.[0] || "?"}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.userName}>{user.name}</div>
              <div style={styles.userEmail}>{user.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && <div style={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      {/* Main chat area */}
      <main style={styles.main}>
        {/* Header */}
        <header style={styles.header}>
          <button onClick={() => setSidebarOpen(true)} style={styles.menuBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div style={styles.headerTitle}>
            <div style={styles.statusDot} />
            AiMessage
          </div>
          <a href="/settings" style={styles.headerAction}>
            <SettingsIcon size={18} />
          </a>
        </header>

        {/* Messages */}
        <div style={styles.messagesContainer}>
          <div style={styles.messagesInner}>
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const showAvatar = !isUser && (i === 0 || messages[i - 1]?.role === "user");
              const isConsecutive = i > 0 && messages[i - 1]?.role === msg.role;

              return (
                <div key={msg.id} className="msg-enter" style={{
                  display: "flex",
                  flexDirection: isUser ? "row-reverse" : "row",
                  alignItems: "flex-end",
                  gap: 8,
                  marginTop: isConsecutive ? 2 : 16,
                  paddingLeft: isUser ? 48 : 0,
                  paddingRight: isUser ? 0 : 48,
                }}>
                  {/* Avatar */}
                  {!isUser && (
                    <div style={{
                      ...styles.msgAvatar,
                      opacity: showAvatar ? 1 : 0,
                    }}>
                      <ChatIcon size={14} />
                    </div>
                  )}

                  {/* Bubble */}
                  <div style={{
                    ...styles.bubble,
                    ...(isUser ? styles.bubbleUser : styles.bubbleAssistant),
                    borderRadius: isUser
                      ? `var(--radius-lg) var(--radius-lg) 4px var(--radius-lg)`
                      : `var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px`,
                  }}>
                    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
                      {msg.text}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: isUser ? "rgba(255,255,255,0.6)" : "var(--text-tertiary)",
                      marginTop: 4,
                      textAlign: "right",
                    }}>
                      {formatTime(msg.ts)}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {sending && (
              <div className="msg-enter" style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 16 }}>
                <div style={styles.msgAvatar}><ChatIcon size={14} /></div>
                <div style={{ ...styles.bubble, ...styles.bubbleAssistant, borderRadius: "var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px" }}>
                  <div style={{ display: "flex", gap: 5, padding: "4px 2px" }}>
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
              </div>
            )}

            <div ref={endRef} style={{ height: 1 }} />
          </div>
        </div>

        {/* Input area */}
        <div style={styles.inputArea}>
          <div style={styles.inputContainer}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={autoResize}
              onKeyDown={handleKey}
              placeholder="Type a message..."
              rows={1}
              style={styles.input}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              style={{
                ...styles.sendBtn,
                background: input.trim() ? "var(--accent)" : "var(--border)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
          <div style={styles.inputHint}>
            Press Enter to send · Shift+Enter for new line
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Helpers ── */

function describeRequest(item: FeedItem): string {
  const a = (item.args && typeof item.args === "object" ? item.args : {}) as Record<string, unknown>;
  const tool = item.tool;

  switch (tool) {
    case "Write": {
      const file = String(a.file_path || a.path || "a file").split("/").pop();
      return `🔔 Your AI wants to **write a file** called "${file}".\n\nSay "yes" to always allow, "once" for just this time, or "no" to deny.`;
    }
    case "Edit": {
      const file = String(a.file_path || a.path || "a file").split("/").pop();
      return `🔔 Your AI wants to **edit** "${file}".\n\nAllow?`;
    }
    case "Bash": {
      const cmd = String(a.command || "").split("\n")[0].slice(0, 120);
      return `🔔 Your AI wants to **run a command**:\n\n\`${cmd}\`\n\nAllow?`;
    }
    default: {
      const name = tool.startsWith("mcp__") ? (tool.split("__").pop() || tool) : tool;
      return `🔔 Your AI wants to use **${name.replace(/[_-]/g, " ")}**.\n\nAllow?`;
    }
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* ── Icons ── */

function ChatIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function SettingsIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}
function ExplorerIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function DocsIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
}
function GithubIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>;
}
function GoogleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
}
function AppleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>;
}

/* ── Styles ── */

const styles: Record<string, CSSProperties> = {
  fullCenter: {
    height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--bg)",
  },
  loadingContainer: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
  },
  logoMark: {
    width: 48, height: 48, borderRadius: "var(--radius)",
    background: "var(--text)", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 24, fontWeight: 700,
  },
  shimmer: {
    width: 120, height: 4, borderRadius: 2,
    background: "linear-gradient(90deg, var(--border) 25%, var(--text-tertiary) 50%, var(--border) 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.5s infinite",
  },

  // Login
  loginCard: {
    width: "100%", maxWidth: 380, padding: 40,
    background: "var(--surface)", borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)", textAlign: "center" as const,
  },
  loginLogo: {
    fontSize: 32, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.03em",
  },
  loginSub: {
    fontSize: 15, color: "var(--text-secondary)", margin: "4px 0 24px", lineHeight: 1.5,
  },
  loginDivider: {
    display: "flex", alignItems: "center", gap: 12, margin: "0 0 20px",
  },
  loginDividerLine: {
    flex: 1, height: 1, background: "var(--border)",
  },
  loginDividerText: {
    fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500, textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  loginFooter: {
    marginTop: 24, fontSize: 13, color: "var(--text-tertiary)",
  },

  // Layout
  layout: {
    display: "flex", height: "100%", background: "var(--bg)",
  },

  // Sidebar
  sidebar: {
    width: 260, flexShrink: 0,
    background: "var(--surface)", borderRight: "1px solid var(--border)",
    display: "flex", flexDirection: "column" as const,
    position: "fixed" as const, top: 0, left: 0, bottom: 0, zIndex: 50,
    transform: "translateX(-100%)",
    transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  sidebarHeader: {
    padding: "20px 16px 12px", borderBottom: "1px solid var(--border-light)",
  },
  sidebarLogo: {
    fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em",
  },
  sidebarNav: {
    flex: 1, padding: "8px",
  },
  sidebarItem: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: "var(--radius-sm)",
    fontSize: 14, fontWeight: 500, color: "var(--text-secondary)",
    background: "transparent", border: "none", width: "100%",
    textAlign: "left" as const, textDecoration: "none",
    transition: "all var(--transition)", cursor: "pointer",
  },
  sidebarFooter: {
    padding: 16, borderTop: "1px solid var(--border-light)",
  },
  userRow: {
    display: "flex", alignItems: "center", gap: 10,
  },
  userAvatar: {
    width: 32, height: 32, borderRadius: "50%",
  },
  userAvatarPlaceholder: {
    width: 32, height: 32, borderRadius: "50%",
    background: "var(--accent-light)", color: "var(--accent)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, fontWeight: 600,
  },
  userName: {
    fontSize: 13, fontWeight: 600, color: "var(--text)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
  },
  userEmail: {
    fontSize: 11, color: "var(--text-tertiary)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
  },
  overlay: {
    position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.3)",
    zIndex: 40, transition: "opacity 0.25s",
  },

  // Main
  main: {
    flex: 1, display: "flex", flexDirection: "column" as const,
    minWidth: 0, height: "100%",
  },

  // Header
  header: {
    flexShrink: 0, height: 56,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 16px", gap: 12,
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
  },
  menuBtn: {
    width: 36, height: 36, borderRadius: "var(--radius-sm)",
    border: "none", background: "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--text-secondary)",
    transition: "all var(--transition)",
  },
  headerTitle: {
    fontSize: 16, fontWeight: 600, color: "var(--text)",
    display: "flex", alignItems: "center", gap: 8,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: "50%", background: "var(--green)",
  },
  headerAction: {
    width: 36, height: 36, borderRadius: "var(--radius-sm)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--text-secondary)", textDecoration: "none",
    transition: "all var(--transition)",
  },

  // Messages
  messagesContainer: {
    flex: 1, overflowY: "auto" as const,
    WebkitOverflowScrolling: "touch" as const,
  },
  messagesInner: {
    maxWidth: 720, margin: "0 auto",
    padding: "24px 16px",
  },
  msgAvatar: {
    width: 28, height: 28, borderRadius: "50%",
    background: "var(--accent)", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  bubble: {
    padding: "10px 14px",
    fontSize: 15,
    boxShadow: "var(--shadow-sm)",
  },
  bubbleUser: {
    background: "var(--accent)", color: "#fff",
  },
  bubbleAssistant: {
    background: "var(--surface)", color: "var(--text)",
    border: "1px solid var(--border-light)",
  },

  // Input
  inputArea: {
    flexShrink: 0, padding: "12px 16px",
    paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
  },
  inputContainer: {
    maxWidth: 720, margin: "0 auto",
    display: "flex", alignItems: "flex-end", gap: 8,
    background: "var(--bg)", borderRadius: 24,
    border: "1px solid var(--border)",
    padding: "6px 6px 6px 16px",
    transition: "border-color var(--transition), box-shadow var(--transition)",
  },
  input: {
    flex: 1, border: "none", background: "transparent",
    fontSize: 15, outline: "none", resize: "none" as const,
    lineHeight: 1.5, maxHeight: 120, minHeight: 24,
    color: "var(--text)",
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: "50%",
    border: "none", display: "flex",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "all var(--transition)",
  },
  inputHint: {
    maxWidth: 720, margin: "6px auto 0",
    fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" as const,
  },
};

function authBtn(provider: string): CSSProperties {
  const base: CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    height: 48, borderRadius: "var(--radius)",
    fontSize: 15, fontWeight: 500, textDecoration: "none",
    transition: "all var(--transition)",
  };
  switch (provider) {
    case "github": return { ...base, background: "#24292e", color: "#fff" };
    case "google": return { ...base, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" };
    case "apple": return { ...base, background: "#000", color: "#fff" };
    default: return base;
  }
}

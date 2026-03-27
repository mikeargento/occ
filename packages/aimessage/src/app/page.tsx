"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "https://agent.occ.wtf";

/* ── Types ── */

interface Message {
  id: number;
  type: "request" | "response";
  tool: string;
  summary: string;
  args: unknown;
  status: "pending" | "approved" | "denied" | "expired";
  timestamp: string;
}

/* ── Helpers ── */

function toolDisplay(raw: string): string {
  return raw.replace(/[_-]/g, " ");
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function argsToHuman(tool: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;

  // Common patterns
  if (a.file_path || a.path) return `${a.file_path ?? a.path}`;
  if (a.command) return `$ ${String(a.command).slice(0, 80)}`;
  if (a.content && a.file_path) return `Write to ${a.file_path}`;
  if (a.url) return `${a.url}`;
  if (a.query) return `"${String(a.query).slice(0, 60)}"`;

  // Fallback: show first 2 key-value pairs
  const entries = Object.entries(a).slice(0, 2);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(", ");
}

/* ── Page ── */

export default function AiMessage() {
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auth check
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Poll for messages
  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API}/api/v2/requests?limit=50`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const msgs: Message[] = (data.requests ?? []).map((r: any) => ({
          id: r.id,
          type: "request",
          tool: r.tool,
          summary: r.summary || r.label || toolDisplay(r.tool),
          args: r.args,
          status: r.status,
          timestamp: r.createdAt,
        }));
        setMessages(msgs.reverse());
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [user, refresh]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Actions
  async function handleAllow(id: number) {
    setActing(id);
    try {
      await fetch(`${API}/api/v2/requests/${id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "always" }),
      });
      await refresh();
    } catch {}
    setActing(null);
  }

  async function handleDeny(id: number) {
    setActing(id);
    try {
      await fetch(`${API}/api/v2/requests/${id}/deny`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "once" }),
      });
      await refresh();
    } catch {}
    setActing(null);
  }

  // Loading
  if (loading) return (
    <div style={styles.loadingScreen}>
      <span style={styles.loadingText}>AiMessage</span>
    </div>
  );

  // Not signed in
  if (!user) return (
    <div style={styles.loginScreen}>
      <div style={styles.loginCard}>
        <h1 style={styles.loginTitle}>AiMessage</h1>
        <p style={styles.loginSub}>Your AI asks before it acts.</p>
        <div style={styles.loginButtons}>
          <a href={`${API}/auth/login/github`} style={styles.loginBtn}>Continue with GitHub</a>
          <a href={`${API}/auth/login/google`} style={styles.loginBtnLight}>Continue with Google</a>
          <a href={`${API}/auth/login/apple`} style={styles.loginBtn}>Continue with Apple</a>
        </div>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.headerTitle}>AiMessage</span>
          <a href={`${API}/settings`} style={styles.headerSettings}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </a>
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messageArea}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>No messages yet</p>
            <p style={styles.emptySub}>When your AI needs permission, it'll ask here.</p>
            <code style={styles.emptyCode}>curl -fsSL https://agent.occ.wtf/install | bash</code>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={styles.messageGroup}>
            {/* AI bubble */}
            <div style={styles.aiBubbleRow}>
              <div style={styles.aiBubble}>
                <p style={styles.bubbleTool}>{msg.summary}</p>
                {(() => {
                  const detail = argsToHuman(msg.tool, msg.args);
                  return detail ? <p style={styles.bubbleDetail}>{detail}</p> : null;
                })()}
                <span style={styles.bubbleTime}>{timeLabel(msg.timestamp)}</span>
              </div>
            </div>

            {/* Action buttons or response */}
            {msg.status === "pending" ? (
              <div style={styles.actionRow}>
                <button
                  onClick={() => handleAllow(msg.id)}
                  disabled={acting === msg.id}
                  style={styles.allowBtn}
                >
                  Allow
                </button>
                <button
                  onClick={() => handleDeny(msg.id)}
                  disabled={acting === msg.id}
                  style={styles.denyBtn}
                >
                  Deny
                </button>
              </div>
            ) : (
              <div style={styles.responseBubbleRow}>
                <div style={{
                  ...styles.responseBubble,
                  backgroundColor: msg.status === "approved" ? "var(--allow)" : msg.status === "denied" ? "var(--deny)" : "var(--bubble-user)",
                }}>
                  <span style={styles.responseText}>
                    {msg.status === "approved" ? "Allowed" : msg.status === "denied" ? "Denied" : msg.status === "expired" ? "Expired" : msg.status}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Bottom bar */}
      <div style={styles.bottomBar}>
        <span style={styles.bottomText}>Your AI asks. You decide.</span>
      </div>
    </div>
  );
}

/* ── Styles ── */

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    maxWidth: "480px",
    margin: "0 auto",
    background: "var(--bg)",
  },

  // Header
  header: {
    flexShrink: 0,
    borderBottom: "1px solid var(--border)",
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "52px",
    padding: "0 16px",
  },
  headerTitle: {
    fontSize: "17px",
    fontWeight: 600,
    color: "var(--text)",
  },
  headerSettings: {
    color: "var(--text-light)",
    display: "flex",
    alignItems: "center",
  },

  // Messages
  messageArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    WebkitOverflowScrolling: "touch",
  },

  messageGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  // AI bubble (left, gray)
  aiBubbleRow: {
    display: "flex",
    justifyContent: "flex-start",
  },
  aiBubble: {
    maxWidth: "80%",
    backgroundColor: "var(--bubble-ai)",
    borderRadius: "18px",
    borderBottomLeftRadius: "4px",
    padding: "10px 14px",
  },
  bubbleTool: {
    fontSize: "15px",
    fontWeight: 500,
    color: "var(--text)",
    lineHeight: 1.35,
    margin: 0,
  },
  bubbleDetail: {
    fontSize: "13px",
    color: "#636366",
    marginTop: "4px",
    lineHeight: 1.4,
    margin: "4px 0 0",
    wordBreak: "break-word" as const,
  },
  bubbleTime: {
    fontSize: "11px",
    color: "var(--text-light)",
    marginTop: "4px",
    display: "block",
  },

  // Response bubble (right, colored)
  responseBubbleRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  responseBubble: {
    borderRadius: "18px",
    borderBottomRightRadius: "4px",
    padding: "8px 16px",
  },
  responseText: {
    fontSize: "15px",
    fontWeight: 500,
    color: "#ffffff",
  },

  // Action buttons
  actionRow: {
    display: "flex",
    gap: "8px",
    paddingLeft: "4px",
  },
  allowBtn: {
    height: "36px",
    padding: "0 20px",
    borderRadius: "18px",
    border: "none",
    background: "var(--allow)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  denyBtn: {
    height: "36px",
    padding: "0 20px",
    borderRadius: "18px",
    border: "none",
    background: "var(--deny)",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  // Bottom bar
  bottomBar: {
    flexShrink: 0,
    borderTop: "1px solid var(--border)",
    padding: "12px 16px",
    textAlign: "center",
  },
  bottomText: {
    fontSize: "12px",
    color: "var(--text-light)",
  },

  // Empty state
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "40px 20px",
  },
  emptyTitle: {
    fontSize: "17px",
    fontWeight: 600,
    color: "var(--text)",
    margin: "0 0 6px",
  },
  emptySub: {
    fontSize: "14px",
    color: "var(--text-light)",
    margin: "0 0 20px",
  },
  emptyCode: {
    fontSize: "12px",
    fontFamily: "SF Mono, monospace",
    color: "var(--text-light)",
    background: "#f2f2f7",
    padding: "8px 14px",
    borderRadius: "8px",
  },

  // Login
  loginScreen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  loginCard: {
    width: "100%",
    maxWidth: "320px",
    textAlign: "center",
  },
  loginTitle: {
    fontSize: "32px",
    fontWeight: 700,
    color: "var(--text)",
    margin: "0 0 8px",
    letterSpacing: "-0.02em",
  },
  loginSub: {
    fontSize: "15px",
    color: "var(--text-light)",
    margin: "0 0 32px",
  },
  loginButtons: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  loginBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "48px",
    borderRadius: "12px",
    border: "none",
    background: "var(--text)",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 500,
    textDecoration: "none",
    cursor: "pointer",
  },
  loginBtnLight: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "48px",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: "15px",
    fontWeight: 500,
    textDecoration: "none",
    cursor: "pointer",
  },

  // Loading
  loadingScreen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: "20px",
    fontWeight: 600,
    color: "var(--text-light)",
  },
};

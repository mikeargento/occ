"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getMe, getFeed, approve, deny, type FeedItem } from "@/lib/api";

/* ── Helpers ── */

function toolDisplay(raw: string): string {
  return raw.replace(/[_-]/g, " ");
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function argsToHuman(tool: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  if (a.file_path || a.path) return `${a.file_path ?? a.path}`;
  if (a.command) return `$ ${String(a.command).slice(0, 80)}`;
  if (a.url) return `${a.url}`;
  if (a.query) return `"${String(a.query).slice(0, 60)}"`;
  const entries = Object.entries(a).slice(0, 2);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(", ");
}

/* ── Page ── */

export default function AiMessage() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [messages, setMessages] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMe().then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getFeed();
      setMessages((data.requests ?? []).slice().reverse());
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [user, refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleAllow(id: number) {
    setActing(id);
    try {
      await approve(id, "always");
      setDismissed(prev => new Set(prev).add(id));
      setTimeout(refresh, 300);
    } finally { setActing(null); }
  }

  async function handleOnce(id: number) {
    setActing(id);
    try {
      await approve(id, "once");
      setDismissed(prev => new Set(prev).add(id));
      setTimeout(refresh, 300);
    } finally { setActing(null); }
  }

  async function handleDeny(id: number) {
    setActing(id);
    try {
      await deny(id, "once");
      setDismissed(prev => new Set(prev).add(id));
      setTimeout(refresh, 300);
    } finally { setActing(null); }
  }

  if (loading) return (
    <div style={S.loadingScreen}>
      <span style={S.loadingText}>AiMessage</span>
    </div>
  );

  if (!user) return (
    <div style={S.loginScreen}>
      <div style={S.loginCard}>
        <h1 style={S.loginTitle}>AiMessage</h1>
        <p style={S.loginSub}>Your AI asks before it acts.</p>
        <div style={S.loginButtons}>
          <a href="/auth/login/github" style={S.loginBtn}>Continue with GitHub</a>
          <a href="/auth/login/google" style={S.loginBtnLight}>Continue with Google</a>
          <a href="/auth/login/apple" style={S.loginBtn}>Continue with Apple</a>
        </div>
      </div>
    </div>
  );

  const visible = messages.filter(m => !dismissed.has(m.id));

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerInner}>
          <span style={S.headerTitle}>AiMessage</span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <a href="/settings" style={{ color: "#8e8e93", display: "flex", alignItems: "center", textDecoration: "none", fontSize: "13px" }}>
              Settings
            </a>
            {user.avatar ? (
              <img src={user.avatar} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
            ) : (
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e9e9eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#636366" }}>
                {user.name?.[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={S.messageArea}>
        {visible.length === 0 && (
          <div style={S.emptyState}>
            <p style={S.emptyTitle}>No messages yet</p>
            <p style={S.emptySub}>When your AI needs permission, it'll appear here.</p>
            <code style={S.emptyCode}>curl -fsSL https://agent.occ.wtf/install | bash</code>
          </div>
        )}

        {visible.map(msg => {
          const isPending = msg.status === "pending";
          const detail = argsToHuman(msg.tool, msg.args);

          return (
            <div key={msg.id} style={S.messageGroup}>
              {/* AI bubble (left) */}
              <div style={S.aiBubbleRow}>
                <div style={S.aiBubble}>
                  <p style={S.bubbleTool}>{msg.summary || toolDisplay(msg.tool)}</p>
                  {detail && <p style={S.bubbleDetail}>{detail}</p>}
                  <span style={S.bubbleTime}>{timeLabel(msg.createdAt)}</span>
                </div>
              </div>

              {/* Actions or response */}
              {isPending ? (
                <div style={S.actionRow}>
                  <button onClick={() => handleAllow(msg.id)} disabled={acting === msg.id} style={S.allowBtn}>Allow</button>
                  <button onClick={() => handleOnce(msg.id)} disabled={acting === msg.id} style={S.onceBtn}>Once</button>
                  <button onClick={() => handleDeny(msg.id)} disabled={acting === msg.id} style={S.denyBtn}>Deny</button>
                </div>
              ) : (
                <div style={S.responseBubbleRow}>
                  <div style={{
                    ...S.responseBubble,
                    backgroundColor: msg.status === "approved" || msg.status === "auto_approved" ? "#34c759" : msg.status === "denied" ? "#ff3b30" : "#8e8e93",
                  }}>
                    <span style={S.responseText}>
                      {msg.status === "approved" ? "Allowed" : msg.status === "auto_approved" ? "Auto-allowed" : msg.status === "denied" ? "Denied" : msg.status}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Bottom */}
      <div style={S.bottomBar}>
        <span style={S.bottomText}>Your AI asks. You decide.</span>
      </div>
    </div>
  );
}

/* ── Styles ── */

const S: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", height: "100vh", maxWidth: "600px", margin: "0 auto", background: "#fff" },

  header: { flexShrink: 0, borderBottom: "1px solid #e5e5ea", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" },
  headerInner: { display: "flex", alignItems: "center", justifyContent: "space-between", height: "56px", padding: "0 16px" },
  headerTitle: { fontSize: "20px", fontWeight: 700, color: "#000", letterSpacing: "-0.01em" },

  messageArea: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px", WebkitOverflowScrolling: "touch" },
  messageGroup: { display: "flex", flexDirection: "column", gap: "6px" },

  aiBubbleRow: { display: "flex", justifyContent: "flex-start" },
  aiBubble: { maxWidth: "85%", backgroundColor: "#e9e9eb", borderRadius: "18px", borderBottomLeftRadius: "4px", padding: "10px 14px" },
  bubbleTool: { fontSize: "15px", fontWeight: 500, color: "#000", lineHeight: "1.35", margin: 0 },
  bubbleDetail: { fontSize: "13px", color: "#636366", margin: "4px 0 0", lineHeight: "1.4", wordBreak: "break-word" as const },
  bubbleTime: { fontSize: "11px", color: "#8e8e93", marginTop: "4px", display: "block" },

  responseBubbleRow: { display: "flex", justifyContent: "flex-end" },
  responseBubble: { borderRadius: "18px", borderBottomRightRadius: "4px", padding: "8px 16px" },
  responseText: { fontSize: "15px", fontWeight: 500, color: "#fff" },

  actionRow: { display: "flex", gap: "8px", paddingLeft: "4px" },
  allowBtn: { height: "36px", padding: "0 20px", borderRadius: "18px", border: "none", background: "#34c759", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  onceBtn: { height: "36px", padding: "0 16px", borderRadius: "18px", border: "1px solid #c6c6c8", background: "#fff", color: "#000", fontSize: "14px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  denyBtn: { height: "36px", padding: "0 20px", borderRadius: "18px", border: "none", background: "#ff3b30", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },

  bottomBar: { flexShrink: 0, borderTop: "1px solid #e5e5ea", padding: "12px 16px", textAlign: "center" },
  bottomText: { fontSize: "12px", color: "#8e8e93" },

  emptyState: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 20px" },
  emptyTitle: { fontSize: "17px", fontWeight: 600, color: "#000", margin: "0 0 6px" },
  emptySub: { fontSize: "14px", color: "#8e8e93", margin: "0 0 20px" },
  emptyCode: { fontSize: "12px", fontFamily: "SF Mono, monospace", color: "#8e8e93", background: "#f2f2f7", padding: "8px 14px", borderRadius: "8px" },

  loginScreen: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  loginCard: { width: "100%", maxWidth: "320px", textAlign: "center" },
  loginTitle: { fontSize: "32px", fontWeight: 700, color: "#000", margin: "0 0 8px", letterSpacing: "-0.02em" },
  loginSub: { fontSize: "15px", color: "#8e8e93", margin: "0 0 32px" },
  loginButtons: { display: "flex", flexDirection: "column", gap: "10px" },
  loginBtn: { display: "flex", alignItems: "center", justifyContent: "center", height: "48px", borderRadius: "12px", border: "none", background: "#000", color: "#fff", fontSize: "15px", fontWeight: 500, textDecoration: "none", cursor: "pointer" },
  loginBtnLight: { display: "flex", alignItems: "center", justifyContent: "center", height: "48px", borderRadius: "12px", border: "1px solid #c6c6c8", background: "#fff", color: "#000", fontSize: "15px", fontWeight: 500, textDecoration: "none", cursor: "pointer" },

  loadingScreen: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: "20px", fontWeight: 600, color: "#8e8e93" },
};

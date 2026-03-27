"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getMe, getFeed, approve, deny, type FeedItem } from "@/lib/api";

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function toolLabel(raw: string): string {
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function argsSummary(tool: string, args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  if (a.file_path || a.path) return String(a.file_path ?? a.path);
  if (a.command) return "$ " + String(a.command).slice(0, 100);
  if (a.url) return String(a.url);
  if (a.query) return '"' + String(a.query).slice(0, 80) + '"';
  if (a.content && typeof a.content === "string") return a.content.slice(0, 80) + (a.content.length > 80 ? "…" : "");
  return null;
}

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [messages, setMessages] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);

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
    const iv = setInterval(refresh, 2000);
    return () => clearInterval(iv);
  }, [user, refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function act(id: number, type: "allow" | "once" | "deny") {
    setActing(id);
    try {
      if (type === "deny") await deny(id, "once");
      else await approve(id, type === "once" ? "once" : "always");
      setDismissed(prev => new Set(prev).add(id));
      setTimeout(refresh, 300);
    } finally { setActing(null); }
  }

  /* ── Loading ── */
  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
      <div style={{ width: 20, height: 20, border: "2px solid #e5e5ea", borderTopColor: "#8e8e93", borderRadius: "50%", animation: "spin .6s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── Login ── */
  if (!user) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 300, textAlign: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#007aff", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#000", margin: "0 0 4px", letterSpacing: "-0.02em" }}>AiMessage</h1>
        <p style={{ fontSize: 15, color: "#8e8e93", margin: "0 0 32px" }}>Your AI asks before it acts.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="/auth/login/github" style={loginBtn("#000")}>Continue with GitHub</a>
          <a href="/auth/login/google" style={loginBtn("#fff", true)}>Continue with Google</a>
          <a href="/auth/login/apple" style={loginBtn("#000")}>Continue with Apple</a>
        </div>
      </div>
    </div>
  );

  const visible = messages.filter(m => !dismissed.has(m.id));

  /* ── Chat ── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#fff" }}>
      {/* Nav bar */}
      <div style={{ flexShrink: 0, background: "#f6f6f6", borderBottom: "0.5px solid #c6c6c8" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, padding: "0 16px", maxWidth: 600, margin: "0 auto" }}>
          <a href="/settings" style={{ color: "#007aff", textDecoration: "none", fontSize: 17 }}>
            <svg width="10" height="17" viewBox="0 0 10 17" fill="none"><path d="M9 1L2 8.5L9 16" stroke="#007aff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#000" }}>AI</div>
          </div>
          <div style={{ width: 10 }} />
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", background: "#fff", WebkitOverflowScrolling: "touch" as const }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2, minHeight: "100%" }}>

          {visible.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 15, color: "#8e8e93", marginBottom: 8 }}>No messages yet</div>
              <div style={{ fontSize: 13, color: "#aeaeb2" }}>When your AI needs permission,<br/>it'll message you here.</div>
            </div>
          )}

          {visible.map((msg, i) => {
            const isPending = msg.status === "pending";
            const isAllowed = msg.status === "approved" || msg.status === "auto_approved";
            const isDenied = msg.status === "denied";
            const detail = argsSummary(msg.tool, msg.args);
            const showTime = i === 0 || (new Date(msg.createdAt).getTime() - new Date(visible[i - 1].createdAt).getTime() > 300_000);

            return (
              <div key={msg.id}>
                {/* Timestamp separator */}
                {showTime && (
                  <div style={{ textAlign: "center", padding: "8px 0 4px", fontSize: 11, color: "#8e8e93", fontWeight: 400 }}>
                    {timeLabel(msg.createdAt)}
                  </div>
                )}

                {/* AI message — gray bubble, left */}
                <div style={{ display: "flex", justifyContent: "flex-start", padding: "1px 0" }}>
                  <div style={{
                    maxWidth: "75%",
                    padding: "8px 12px",
                    background: "#e9e9eb",
                    borderRadius: "18px",
                    borderBottomLeftRadius: 4,
                    fontSize: 16,
                    lineHeight: 1.35,
                    color: "#000",
                    wordBreak: "break-word",
                  }}>
                    <span style={{ fontWeight: 400 }}>{msg.summary || toolLabel(msg.tool)}</span>
                    {detail && (
                      <div style={{ fontSize: 14, color: "#636366", marginTop: 2 }}>{detail}</div>
                    )}
                  </div>
                </div>

                {/* Response — blue/red bubble, right */}
                {!isPending && (
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "1px 0" }}>
                    <div style={{
                      padding: "8px 12px",
                      background: isAllowed ? "#007aff" : isDenied ? "#ff3b30" : "#8e8e93",
                      borderRadius: "18px",
                      borderBottomRightRadius: 4,
                      fontSize: 16,
                      color: "#fff",
                    }}>
                      {isAllowed ? "Allowed" : isDenied ? "Denied" : msg.status}
                    </div>
                  </div>
                )}

                {/* Pending — action buttons */}
                {isPending && (
                  <div style={{ display: "flex", gap: 8, padding: "6px 0 2px" }}>
                    <button onClick={() => act(msg.id, "allow")} disabled={acting === msg.id}
                      style={pillBtn("#34c759", acting === msg.id)}>Allow</button>
                    <button onClick={() => act(msg.id, "once")} disabled={acting === msg.id}
                      style={pillBtn("#007aff", acting === msg.id)}>Once</button>
                    <button onClick={() => act(msg.id, "deny")} disabled={acting === msg.id}
                      style={pillBtn("#ff3b30", acting === msg.id)}>Deny</button>
                  </div>
                )}
              </div>
            );
          })}

          <div ref={endRef} />
        </div>
      </div>

      {/* Input bar (decorative) */}
      <div style={{ flexShrink: 0, background: "#f6f6f6", borderTop: "0.5px solid #c6c6c8", padding: "8px 12px", paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            flex: 1, height: 36, borderRadius: 18, border: "1px solid #c6c6c8", background: "#fff",
            display: "flex", alignItems: "center", padding: "0 12px",
            fontSize: 16, color: "#c7c7cc",
          }}>
            AiMessage
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function loginBtn(bg: string, outline?: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "center",
    height: 50, borderRadius: 12,
    border: outline ? "1px solid #c6c6c8" : "none",
    background: bg, color: outline ? "#000" : "#fff",
    fontSize: 17, fontWeight: 400,
    textDecoration: "none", cursor: "pointer",
    fontFamily: "inherit",
  };
}

function pillBtn(bg: string, disabled: boolean): React.CSSProperties {
  return {
    height: 32, padding: "0 16px", borderRadius: 16,
    border: "none", background: bg, color: "#fff",
    fontSize: 14, fontWeight: 500, cursor: "pointer",
    fontFamily: "inherit", opacity: disabled ? 0.4 : 1,
  };
}

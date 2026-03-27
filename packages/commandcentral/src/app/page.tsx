"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getMe, getFeed, approve, deny, type FeedItem } from "@/lib/api";

/* ── Helpers ── */

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function toolLabel(raw: string): string {
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function argsSummary(tool: string, args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  if (a.file_path || a.path) return String(a.file_path ?? a.path).split("/").pop() || null;
  if (a.command) return "$ " + String(a.command).split("\n")[0].slice(0, 60);
  if (a.url) return String(a.url);
  if (a.query) return '"' + String(a.query).slice(0, 60) + '"';
  return null;
}

/* ── App ── */

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<Set<number>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  // Auth
  useEffect(() => {
    getMe().then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Fetch + SSE for real-time
  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getFeed();
      setItems((data.requests ?? []).slice().reverse());
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();

    // SSE for instant updates
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/v2/activity");
      es.onmessage = () => refresh(); // Any event = refresh
      es.onerror = () => {
        es?.close();
        // Fallback to polling if SSE fails
        const iv = setInterval(refresh, 3000);
        return () => clearInterval(iv);
      };
    } catch {
      // No SSE support — poll
      const iv = setInterval(refresh, 3000);
      return () => clearInterval(iv);
    }

    return () => es?.close();
  }, [user, refresh]);

  // Auto-scroll only on NEW messages
  useEffect(() => {
    if (items.length > prevCount.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCount.current = items.length;
  }, [items]);

  // Optimistic action
  async function act(id: number, type: "allow" | "once" | "deny") {
    // Optimistic — instantly update UI
    setActing(prev => new Set(prev).add(id));
    setItems(prev => prev.map(m =>
      m.id === id ? { ...m, status: type === "deny" ? "denied" as const : "approved" as const } : m
    ));

    try {
      if (type === "deny") await deny(id, "once");
      else await approve(id, type === "once" ? "once" : "always");
    } catch {
      // Revert on error
      refresh();
    }
    setActing(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  /* ── Loading ── */
  if (loading) return (
    <div style={center}>
      <div style={spinner} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── Login ── */
  if (!user) return (
    <div style={center}>
      <div style={{ width: "100%", maxWidth: 280, textAlign: "center" }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: "#000", letterSpacing: "-0.03em", marginBottom: 4 }}>
          AiMessage
        </div>
        <p style={{ fontSize: 15, color: "#86868b", margin: "0 0 32px" }}>Your AI asks before it acts.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="/auth/login/github" style={loginBtn("#000")}>Continue with GitHub</a>
          <a href="/auth/login/google" style={loginBtn("#fff", true)}>Continue with Google</a>
          <a href="/auth/login/apple" style={loginBtn("#000")}>Continue with Apple</a>
        </div>
      </div>
    </div>
  );

  /* ── Chat ── */
  const pending = items.filter(m => m.status === "pending");
  const history = items.filter(m => m.status !== "pending");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#fff" }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        borderBottom: "0.5px solid #d1d1d6",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, padding: "0 16px", maxWidth: 600, margin: "0 auto" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#000", letterSpacing: "-0.02em" }}>AiMessage</div>
          <a href="/settings" style={{ color: "#007aff", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>Settings</a>
        </div>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4, minHeight: "100%" }}>

          {items.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 15, color: "#86868b" }}>No messages yet</div>
              <div style={{ fontSize: 13, color: "#aeaeb2", marginTop: 4 }}>When your AI needs permission, it shows up here.</div>
            </div>
          )}

          {items.map((msg, i) => {
            const isPending = msg.status === "pending";
            const isAllowed = msg.status === "approved" || msg.status === "auto_approved";
            const detail = argsSummary(msg.tool, msg.args);
            const showTime = i === 0 || (new Date(msg.createdAt).getTime() - new Date(items[i - 1].createdAt).getTime() > 300_000);

            return (
              <div key={msg.id} style={{ animation: "fadeIn .15s ease" }}>
                {showTime && (
                  <div style={{ textAlign: "center", padding: "12px 0 6px", fontSize: 12, color: "#86868b", fontWeight: 500 }}>
                    {timeLabel(msg.createdAt)}
                  </div>
                )}

                {/* Request bubble — left */}
                <div style={{ display: "flex", justifyContent: "flex-start", padding: "2px 0" }}>
                  <div style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    background: "#f0f0f0",
                    borderRadius: 20,
                    borderBottomLeftRadius: 6,
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 500, color: "#000", lineHeight: 1.3 }}>
                      {msg.summary || toolLabel(msg.tool)}
                    </div>
                    {detail && (
                      <div style={{ fontSize: 13, color: "#636366", marginTop: 3, wordBreak: "break-all" }}>{detail}</div>
                    )}
                  </div>
                </div>

                {/* Decision bubble — right */}
                {!isPending && (
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "2px 0" }}>
                    <div style={{
                      padding: "10px 14px",
                      background: isAllowed ? "#007aff" : "#ff3b30",
                      borderRadius: 20,
                      borderBottomRightRadius: 6,
                      fontSize: 16,
                      fontWeight: 500,
                      color: "#fff",
                    }}>
                      {isAllowed ? "Allowed" : "Denied"}
                    </div>
                  </div>
                )}

                {/* Pending — action buttons */}
                {isPending && (
                  <div style={{ display: "flex", gap: 8, padding: "8px 0 4px" }}>
                    <button onClick={() => act(msg.id, "allow")} disabled={acting.has(msg.id)} style={actionBtn("#34c759")}>
                      Always
                    </button>
                    <button onClick={() => act(msg.id, "once")} disabled={acting.has(msg.id)} style={actionBtn("#007aff")}>
                      Once
                    </button>
                    <button onClick={() => act(msg.id, "deny")} disabled={acting.has(msg.id)} style={actionBtn("#ff3b30")}>
                      Deny
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <div ref={endRef} />
        </div>
      </div>

      {/* Bottom — branding */}
      <div style={{
        flexShrink: 0,
        borderTop: "0.5px solid #d1d1d6",
        padding: "10px 16px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
        textAlign: "center",
      }}>
        <span style={{ fontSize: 12, color: "#aeaeb2" }}>Built on OCC</span>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        * { box-sizing: border-box; margin: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
        button:active { transform: scale(0.96); }
      `}</style>
    </div>
  );
}

/* ── Style objects ── */

const center: React.CSSProperties = {
  height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", padding: 20,
};

const spinner: React.CSSProperties = {
  width: 20, height: 20, border: "2px solid #e5e5ea", borderTopColor: "#86868b",
  borderRadius: "50%", animation: "spin .6s linear infinite",
};

function loginBtn(bg: string, outline?: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "center",
    height: 48, borderRadius: 12,
    border: outline ? "1px solid #d1d1d6" : "none",
    background: bg, color: outline ? "#000" : "#fff",
    fontSize: 16, fontWeight: 500, textDecoration: "none",
  };
}

function actionBtn(bg: string): React.CSSProperties {
  return {
    height: 36, padding: "0 20px", borderRadius: 18,
    border: "none", background: bg, color: "#fff",
    fontSize: 15, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", transition: "transform .1s",
  };
}

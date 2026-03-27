"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getMe, getFeed, approve, deny, type FeedItem } from "@/lib/api";

/* ── Conversational message builder ── */

function buildMessage(tool: string, args: unknown): string {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;

  switch (tool) {
    case "Write": {
      const file = basename(a.file_path || a.path);
      return `I'd like to write a file called ${file}`;
    }
    case "Edit": {
      const file = basename(a.file_path || a.path);
      return `I'd like to edit ${file}`;
    }
    case "Bash": {
      const cmd = String(a.command || "").split("\n")[0].slice(0, 80);
      return `Can I run this command?\n${cmd}`;
    }
    case "WebFetch":
      return `I'd like to fetch ${a.url || "a URL"}`;
    case "NotebookEdit":
      return `I'd like to edit a notebook cell`;
    default: {
      if (tool.startsWith("mcp__")) {
        const name = tool.split("__").pop() || tool;
        return `I'd like to use ${name.replace(/[_-]/g, " ")}`;
      }
      return `I'd like to use ${tool.replace(/[_-]/g, " ").toLowerCase()}`;
    }
  }
}

function basename(v: unknown): string {
  const s = String(v || "unknown");
  return s.split("/").pop() || s;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* ── Group repeated denied/approved items ── */

interface DisplayItem {
  id: number;
  ids: number[];
  tool: string;
  args: unknown;
  status: string;
  createdAt: string;
  count: number;
  summary: string;
}

function groupItems(items: FeedItem[]): DisplayItem[] {
  const result: DisplayItem[] = [];

  for (const item of items) {
    const last = result[result.length - 1];
    // Group consecutive same-tool same-status (non-pending) items
    if (last && last.tool === item.tool && last.status === item.status && item.status !== "pending") {
      last.count++;
      last.ids.push(item.id);
      last.createdAt = item.createdAt; // use latest time
    } else {
      result.push({
        id: item.id,
        ids: [item.id],
        tool: item.tool,
        args: item.args,
        status: item.status,
        createdAt: item.createdAt,
        count: 1,
        summary: item.summary || "",
      });
    }
  }
  return result;
}

/* ── App ── */

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  useEffect(() => {
    getMe().then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

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
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/v2/activity");
      es.onmessage = () => refresh();
      es.onerror = () => { es?.close(); };
    } catch {}
    // Fallback polling
    const iv = setInterval(refresh, 4000);
    return () => { es?.close(); clearInterval(iv); };
  }, [user, refresh]);

  useEffect(() => {
    if (items.length > prevCount.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCount.current = items.length;
  }, [items]);

  async function act(id: number, type: "allow" | "once" | "deny") {
    setActing(prev => new Set(prev).add(id));
    setItems(prev => prev.map(m =>
      m.id === id ? { ...m, status: type === "deny" ? "denied" as const : "approved" as const } : m
    ));
    try {
      if (type === "deny") await deny(id, "once");
      else await approve(id, type === "once" ? "once" : "always");
    } catch { refresh(); }
    setActing(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  if (loading) return (
    <div style={S.center}>
      <div style={S.spinner} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!user) return (
    <div style={S.center}>
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

  const grouped = groupItems(items);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        borderBottom: "0.5px solid #d1d1d6",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
        <div className="chat-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#007aff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#000", lineHeight: 1.2 }}>Your AI</div>
              <div style={{ fontSize: 11, color: "#86868b" }}>
                {items.filter(m => m.status === "pending").length > 0
                  ? `${items.filter(m => m.status === "pending").length} waiting`
                  : "no pending requests"}
              </div>
            </div>
          </div>
          <a href="/settings" style={{ color: "#007aff", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>Settings</a>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 16, minHeight: "100%" }}>

          {grouped.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#000", marginBottom: 4 }}>No messages yet</div>
              <div style={{ fontSize: 14, color: "#86868b", lineHeight: 1.4, maxWidth: 240 }}>
                When your AI needs permission to do something, it'll ask you here.
              </div>
            </div>
          )}

          {grouped.map((msg, i) => {
            const isPending = msg.status === "pending";
            const isAllowed = msg.status === "approved" || msg.status === "auto_approved";
            const showTime = i === 0 || (new Date(msg.createdAt).getTime() - new Date(grouped[i - 1].createdAt).getTime() > 300_000);
            const message = buildMessage(msg.tool, msg.args);

            return (
              <div key={msg.id} style={{ animation: "fadeIn .2s ease" }}>
                {showTime && (
                  <div style={{ textAlign: "center", fontSize: 12, color: "#86868b", fontWeight: 500, marginBottom: 4 }}>
                    {timeLabel(msg.createdAt)}
                  </div>
                )}

                {/* AI message bubble — tap to expand */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", cursor: "pointer" }} onClick={() => toggleExpand(msg.id)}>
                  {/* Avatar */}
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#007aff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  {/* Bubble */}
                  <div style={{
                    maxWidth: "78%",
                    padding: "10px 14px",
                    background: "#f0f0f0",
                    borderRadius: 18,
                    borderBottomLeftRadius: 4,
                    transition: "background .15s",
                  }}>
                    <div style={{ fontSize: 15, color: "#000", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                      {message}
                    </div>
                    {/* Expanded detail */}
                    {expanded.has(msg.id) && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #d1d1d6" }}>
                        <div style={{ fontSize: 11, color: "#86868b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Details</div>
                        <div style={detailRow}>
                          <span style={detailLabel}>Tool</span>
                          <code style={detailCode}>{msg.tool}</code>
                        </div>
                        <div style={detailRow}>
                          <span style={detailLabel}>Status</span>
                          <span style={{ fontSize: 12, color: isPending ? "#ff9500" : isAllowed ? "#34c759" : "#ff3b30", fontWeight: 600 }}>
                            {msg.status}
                          </span>
                        </div>
                        <div style={detailRow}>
                          <span style={detailLabel}>Time</span>
                          <span style={{ fontSize: 12, color: "#636366" }}>{new Date(msg.createdAt).toLocaleString()}</span>
                        </div>
                        {hasArgs(msg.args) && (
                          <div style={{ marginTop: 6 }}>
                            <span style={detailLabel}>Arguments</span>
                            <pre style={{ fontSize: 11, color: "#636366", background: "#e8e8ed", borderRadius: 8, padding: 8, marginTop: 4, overflow: "auto", maxHeight: 120, whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "'SF Mono', monospace" }}>
                              {formatArgs(msg.args)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Your response or action buttons */}
                {isPending ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                    <button onClick={() => act(msg.id, "allow")} disabled={acting.has(msg.id)} style={actionBtn("#34c759")}>
                      Always allow
                    </button>
                    <button onClick={() => act(msg.id, "once")} disabled={acting.has(msg.id)} style={actionBtn("#007aff")}>
                      Once
                    </button>
                    <button onClick={() => act(msg.id, "deny")} disabled={acting.has(msg.id)} style={actionBtn("#ff3b30")}>
                      Deny
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                    <div style={{
                      padding: "8px 16px",
                      background: isAllowed ? "#007aff" : "#ff3b30",
                      borderRadius: 18,
                      borderBottomRightRadius: 4,
                      fontSize: 15,
                      fontWeight: 500,
                      color: "#fff",
                    }}>
                      {isAllowed ? "Allowed" : "Denied"}{msg.count > 1 ? ` (${msg.count}×)` : ""}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div ref={endRef} />
        </div>
      </div>

      {/* Bottom */}
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
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        * { box-sizing: border-box; margin: 0; }
        body { -webkit-font-smoothing: antialiased; }
        button:active { transform: scale(0.95) !important; }
        @media (min-width: 501px) { .chat-header { margin-top: 34px; } }
      `}</style>
    </div>
  );
}

/* ── Styles ── */

const S = {
  center: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", padding: 20 } as React.CSSProperties,
  spinner: { width: 20, height: 20, border: "2px solid #e5e5ea", borderTopColor: "#86868b", borderRadius: "50%", animation: "spin .6s linear infinite" } as React.CSSProperties,
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

function hasArgs(a: unknown): boolean {
  return !!a && typeof a === "object" && Object.keys(a as Record<string,unknown>).length > 0;
}
function formatArgs(a: unknown): string {
  try { return JSON.stringify(a, null, 2); } catch { return "{}"; }
}

const detailRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" };
const detailLabel: React.CSSProperties = { fontSize: 12, color: "#86868b", fontWeight: 500 };
const detailCode: React.CSSProperties = { fontSize: 12, fontFamily: "'SF Mono', monospace", color: "#636366", background: "#e8e8ed", padding: "2px 6px", borderRadius: 4 };

function actionBtn(bg: string): React.CSSProperties {
  return {
    height: 36, padding: "0 16px", borderRadius: 18,
    border: "none", background: bg, color: "#fff",
    fontSize: 14, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", transition: "transform .1s",
  };
}

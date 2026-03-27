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
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const lastPendingRef = useRef(0);

  useEffect(() => {
    getMe().then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Poll for new pending requests and inject as assistant messages
  const checkPending = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getFeed();
      const items = data.requests ?? [];
      const pending = items.filter((r: FeedItem) => r.status === "pending");
      if (pending.length > lastPendingRef.current) {
        // New pending request(s) — generate a notification message
        const newest = pending[pending.length - 1];
        const msg = describeRequest(newest);
        setMessages(prev => [...prev, { id: `req-${newest.id}`, role: "assistant", text: msg, ts: Date.now() }]);
      }
      lastPendingRef.current = pending.length;
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user) return;
    checkPending();
    pollingRef.current = setInterval(checkPending, 3000);
    return () => clearInterval(pollingRef.current);
  }, [user, checkPending]);

  // Scroll to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send greeting on login
  useEffect(() => {
    if (user && messages.length === 0) {
      setMessages([{
        id: "greeting",
        role: "assistant",
        text: `Hey ${user.name.split(" ")[0]}! I'm your AiMessage assistant. I'll let you know when your AI needs permission to do something.\n\nYou can ask me things like "what's pending?" or just say "yes" to approve requests.`,
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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.text })),
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: "assistant", text: data.error, ts: Date.now() }]);
      } else {
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", text: data.response, ts: Date.now() }]);

        // If an action was taken, refresh pending count
        if (data.action) {
          lastPendingRef.current = 0; // Reset to re-check
          checkPending();
        }
      }
    } catch {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: "assistant", text: "Something went wrong. Try again.", ts: Date.now() }]);
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

  // ── Loading ──
  if (loading) return (
    <div style={S.center}>
      <div style={S.spinner} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Login ──
  if (!user) return (
    <div style={S.center}>
      <div style={{ width: "100%", maxWidth: 300, textAlign: "center" }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: "#000", letterSpacing: "-0.03em", marginBottom: 4 }}>
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

  // ── Chat ──
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif" }}>

      {/* Header */}
      <div style={{
        flexShrink: 0,
        borderBottom: "0.5px solid #d1d1d6",
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#007aff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#000" }}>AiMessage</div>
          </div>
          <a href="/settings" style={{ color: "#007aff", textDecoration: "none", fontSize: 15, fontWeight: 500 }}>Settings</a>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12, minHeight: "100%" }}>
          {messages.map(msg => (
            <div key={msg.id} style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              animation: "fadeIn .2s ease",
            }}>
              <div style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: 18,
                ...(msg.role === "user" ? {
                  background: "#007aff",
                  color: "#fff",
                  borderBottomRightRadius: 4,
                } : {
                  background: "#f0f0f0",
                  color: "#000",
                  borderBottomLeftRadius: 4,
                }),
                fontSize: 15,
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {msg.text}
              </div>
            </div>
          ))}

          {sending && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "10px 14px", background: "#f0f0f0", borderRadius: 18, borderBottomLeftRadius: 4 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <div style={{ ...dot, animationDelay: "0ms" }} />
                  <div style={{ ...dot, animationDelay: "150ms" }} />
                  <div style={{ ...dot, animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{
        flexShrink: 0,
        borderTop: "0.5px solid #d1d1d6",
        padding: "8px 12px",
        paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
        background: "#fff",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#f0f0f0",
          borderRadius: 22,
          padding: "4px 4px 4px 16px",
        }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Message..."
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              fontSize: 16,
              outline: "none",
              fontFamily: "inherit",
              color: "#000",
              height: 36,
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "none",
              background: input.trim() ? "#007aff" : "#c7c7cc",
              cursor: input.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background .15s",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0) } 40% { transform: scale(1) } }
        * { box-sizing: border-box; margin: 0; }
        body { -webkit-font-smoothing: antialiased; }
        input::placeholder { color: #8e8e93; }
      `}</style>
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
      return `Your AI wants to write a file called "${file}". Should I allow it?`;
    }
    case "Edit": {
      const file = String(a.file_path || a.path || "a file").split("/").pop();
      return `Your AI wants to edit "${file}". Allow?`;
    }
    case "Bash": {
      const cmd = String(a.command || "").split("\n")[0].slice(0, 100);
      return `Your AI wants to run a command:\n\n${cmd}\n\nAllow?`;
    }
    default: {
      const name = tool.startsWith("mcp__") ? (tool.split("__").pop() || tool) : tool;
      return `Your AI wants to use "${name.replace(/[_-]/g, " ")}". Allow?`;
    }
  }
}

/* ── Styles ── */

const S = {
  center: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", padding: 20 } as React.CSSProperties,
  spinner: { width: 20, height: 20, border: "2px solid #e5e5ea", borderTopColor: "#86868b", borderRadius: "50%", animation: "spin .6s linear infinite" } as React.CSSProperties,
};

const dot: React.CSSProperties = {
  width: 8, height: 8, borderRadius: "50%", background: "#86868b",
  animation: "bounce 1.4s infinite ease-in-out both",
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

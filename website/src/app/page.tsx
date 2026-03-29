"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import Markdown from "react-markdown";

const SUGGESTIONS = [
  "What is OCC?",
  "How does the proof chain work?",
  "What happens when I say yes?",
  "Is my data private?",
  "How do I get started?",
];

const mdComponents = {
  p: (p: any) => <span style={{ display: "block", marginBottom: 8 }} {...p} />,
  strong: (p: any) => <strong style={{ color: "#fff" }} {...p} />,
  code: ({ children, ...rest }: any) => (
    <code style={{ fontSize: "0.85em", fontFamily: "var(--font-mono)", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }} {...rest}>{children}</code>
  ),
  a: (p: any) => <a style={{ color: "var(--c-accent)" }} target="_blank" rel="noopener" {...p} />,
  ul: (p: any) => <span style={{ display: "block", paddingLeft: 16, marginBottom: 8 }} {...p} />,
  li: (p: any) => <span style={{ display: "block", marginBottom: 4 }} {...p} />,
};

export default function Home() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    const msg = text || input.trim();
    if (!msg || sending) return;
    setInput("");

    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setSending(true);

    try {
      const res = await fetch("https://agent.occ.wtf/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.reply || "No response." }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Something went wrong. Try again." }]);
    }
    setSending(false);
  }

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 24px 64px" }}>
      {/* Hero */}
      <div style={{ marginBottom: 48 }}>
        <h1 style={{
          fontSize: "clamp(36px, 6vw, 56px)", fontWeight: 700,
          letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16,
        }}>
          Define what your AI does.
        </h1>
        <p style={{
          fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.2, color: "var(--c-text-secondary)",
          fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 32,
        }}>
          Artificial Intelligence. Human Authority.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="https://agent.occ.wtf" style={{
            display: "inline-flex", alignItems: "center", height: 44, padding: "0 24px",
            borderRadius: 8, fontSize: 15, fontWeight: 600,
            background: "var(--c-text)", color: "var(--bg)",
            textDecoration: "none",
          }}>
            Get started
          </a>
          <Link href="/docs" style={{
            display: "inline-flex", alignItems: "center", height: 44, padding: "0 24px",
            borderRadius: 8, fontSize: 15, fontWeight: 500,
            border: "1px solid var(--c-border)", color: "var(--c-text)",
            textDecoration: "none",
          }}>
            Documentation
          </Link>
        </div>
      </div>

      {/* Chat area */}
      <div style={{
        borderRadius: 16,
        border: "1px solid var(--c-border-subtle)",
        background: "var(--bg-elevated)",
        overflow: "hidden",
        minHeight: 400,
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Messages area */}
        <div style={{
          flex: 1,
          padding: "32px 32px 16px",
          overflowY: "auto",
          maxHeight: 500,
        }}>
          {messages.length === 0 ? (
            <div>
              <p style={{
                fontSize: 20, fontWeight: 600, marginBottom: 24,
                color: "var(--c-text)",
              }}>
                Ask anything about OCC
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SUGGESTIONS.map(q => (
                  <button key={q} onClick={() => send(q)} style={{
                    padding: "10px 18px",
                    borderRadius: 20,
                    border: "1px solid var(--c-border)",
                    background: "transparent",
                    color: "var(--c-text-secondary)",
                    fontSize: 14,
                    fontWeight: 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--c-text-secondary)"; e.currentTarget.style.color = "var(--c-text)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--c-border)"; e.currentTarget.style.color = "var(--c-text-secondary)"; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              {messages.map((m, i) => (
                <div key={i} style={{
                  marginBottom: 20,
                }}>
                  {m.role === "user" ? (
                    <p style={{
                      fontSize: 16, fontWeight: 600,
                      color: "var(--c-text)",
                      marginBottom: 4,
                    }}>
                      {m.content}
                    </p>
                  ) : (
                    <div style={{
                      fontSize: 16, lineHeight: 1.7,
                      color: "var(--c-text-secondary)",
                    }}>
                      <Markdown components={mdComponents}>{m.content}</Markdown>
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div style={{ color: "var(--c-text-tertiary)", fontSize: 14 }}>
                  Thinking...
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{
          padding: "16px 32px 24px",
          borderTop: "1px solid var(--c-border-subtle)",
          display: "flex", gap: 12, alignItems: "center",
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about OCC..."
            style={{
              flex: 1, height: 44, padding: "0 16px",
              borderRadius: 8, border: "1px solid var(--c-border)",
              background: "var(--bg)",
              color: "var(--c-text)",
              fontSize: 15, fontFamily: "inherit",
              outline: "none",
            }}
          />
          <button onClick={() => send()} disabled={sending || !input.trim()} style={{
            height: 44, padding: "0 20px",
            borderRadius: 8, border: "none",
            background: input.trim() ? "var(--c-text)" : "var(--c-border)",
            color: input.trim() ? "var(--bg)" : "var(--c-text-tertiary)",
            fontSize: 14, fontWeight: 600, fontFamily: "inherit",
            cursor: input.trim() ? "pointer" : "default",
            transition: "all 0.2s",
          }}>
            Ask
          </button>
        </div>
      </div>

      <div style={{ height: 64 }} />
    </div>
  );
}

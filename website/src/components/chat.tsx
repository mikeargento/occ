"use client";
import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatProps {
  proofContext?: Record<string, unknown>;
  preloadedQuestions?: string[];
}

const DEFAULT_QUESTIONS = [
  "What does OCC prove?",
  "How is this different from a timestamp?",
  "What is a hardware enclave?",
  "What are Ethereum anchors?",
  "Is my file uploaded?",
  "What's inside the proof JSON?",
  "What is a causal slot?",
  "How do I verify a proof?",
  "Can the same file be proven twice?",
  "What is OCC NOT?",
];

export function Chat({ proofContext, preloadedQuestions }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const questions = preloadedQuestions || DEFAULT_QUESTIONS;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: Message = { role: "user", content: text };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages,
            proofContext,
          }),
        });

        if (!res.ok) throw new Error("Chat failed");

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader");

        const decoder = new TextDecoder();
        let assistantText = "";
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  assistantText += parsed.text;
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                      role: "assistant",
                      content: assistantText,
                    };
                    return updated;
                  });
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Something went wrong. Try again." },
        ]);
      } finally {
        setStreaming(false);
      }
    },
    [messages, proofContext]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    sendMessage(input.trim());
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#34d399",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(52,211,153,0.3)",
          zIndex: 1000,
          transition: "transform 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#000"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="occ-chat-panel"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 380,
        maxWidth: "calc(100vw - 48px)",
        height: 520,
        maxHeight: "calc(100vh - 100px)",
        background: "#111",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 1000,
        boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>
          Ask about OCC
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            padding: "0 4px",
          }}
        >
          &times;
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {questions.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={streaming}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 20,
                  padding: "8px 14px",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(52,211,153,0.1)";
                  e.currentTarget.style.borderColor = "rgba(52,211,153,0.3)";
                  e.currentTarget.style.color = "#34d399";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.7)";
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
            }}
          >
            <div
              style={{
                background:
                  msg.role === "user"
                    ? "#34d399"
                    : "rgba(255,255,255,0.06)",
                color: msg.role === "user" ? "#000" : "rgba(255,255,255,0.85)",
                borderRadius:
                  msg.role === "user"
                    ? "16px 16px 4px 16px"
                    : "16px 16px 16px 4px",
                padding: "10px 14px",
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.content}
              {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 14,
                    background: "#34d399",
                    marginLeft: 2,
                    animation: "blink 1s infinite",
                    verticalAlign: "text-bottom",
                  }}
                />
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: "12px 16px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          gap: 8,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about OCC..."
          disabled={streaming}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            padding: "10px 14px",
            color: "#fff",
            fontSize: 16,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          style={{
            background: input.trim() && !streaming ? "#34d399" : "rgba(255,255,255,0.06)",
            border: "none",
            borderRadius: 10,
            padding: "10px 14px",
            color: input.trim() && !streaming ? "#000" : "rgba(255,255,255,0.3)",
            fontSize: 14,
            fontWeight: 600,
            cursor: input.trim() && !streaming ? "pointer" : "default",
          }}
        >
          Send
        </button>
      </form>

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @media (max-width: 500px) {
          .occ-chat-panel {
            inset: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: 100% !important;
            max-height: 100% !important;
            border-radius: 0 !important;
            border: none !important;
          }
        }
      `}</style>
    </div>
  );
}

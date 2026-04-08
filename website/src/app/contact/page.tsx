"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;

    setStatus("sending");
    setErrorMsg("");

    try {
      const resp = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, website }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong.");
        return;
      }
      setStatus("sent");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    background: "#ffffff",
    border: "1px solid #d0d5dd",
    borderRadius: 10,
    fontSize: 15,
    color: "#111827",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
    marginBottom: 6,
  };

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "64px 24px 96px",
      }}
    >
      <h1
        style={{
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: "-0.03em",
          marginBottom: 12,
          color: "#111827",
        }}
      >
        Contact
      </h1>
      <p
        style={{
          fontSize: 15,
          lineHeight: 1.65,
          color: "#6b7280",
          marginBottom: 40,
        }}
      >
        Questions, press inquiries, collaboration ideas, bug reports — send
        them here. Messages go directly to an inbox. No accounts, no tracking.
      </p>

      {status === "sent" ? (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #d0d5dd",
            borderRadius: 12,
            padding: "32px 28px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "#111827",
              marginBottom: 8,
            }}
          >
            Message sent.
          </div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            Thanks for reaching out. You&apos;ll hear back at the email you
            provided.
          </div>
          <button
            type="button"
            onClick={() => setStatus("idle")}
            style={{
              marginTop: 24,
              background: "transparent",
              border: "1px solid #d0d5dd",
              borderRadius: 10,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              color: "#374151",
              cursor: "pointer",
            }}
          >
            Send another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {/* Honeypot — invisible to humans, filled by bots */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-10000px",
              width: 1,
              height: 1,
              overflow: "hidden",
            }}
          >
            <label>
              Website
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label htmlFor="contact-name" style={labelStyle}>
                Name
              </label>
              <input
                id="contact-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#0065A4")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#d0d5dd")}
              />
            </div>

            <div>
              <label htmlFor="contact-email" style={labelStyle}>
                Email
              </label>
              <input
                id="contact-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#0065A4")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#d0d5dd")}
              />
            </div>

            <div>
              <label htmlFor="contact-subject" style={labelStyle}>
                Subject <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="contact-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#0065A4")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#d0d5dd")}
              />
            </div>

            <div>
              <label htmlFor="contact-message" style={labelStyle}>
                Message
              </label>
              <textarea
                id="contact-message"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                minLength={10}
                maxLength={5000}
                rows={7}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: 140,
                  lineHeight: 1.55,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#0065A4")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#d0d5dd")}
              />
              <div
                style={{
                  fontSize: 12,
                  color: "#9ca3af",
                  marginTop: 6,
                  textAlign: "right",
                }}
              >
                {message.length}/5000
              </div>
            </div>

            {status === "error" && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "#991b1b",
                }}
              >
                {errorMsg}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 8,
              }}
            >
              <button
                type="submit"
                disabled={status === "sending"}
                style={{
                  background: status === "sending" ? "#9ca3af" : "#0065A4",
                  border:
                    status === "sending"
                      ? "1px solid #9ca3af"
                      : "1px solid #0065A4",
                  borderRadius: 10,
                  padding: "10px 20px",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: status === "sending" ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (status !== "sending")
                    e.currentTarget.style.background = "#004d7a";
                }}
                onMouseLeave={(e) => {
                  if (status !== "sending")
                    e.currentTarget.style.background = "#0065A4";
                }}
              >
                {status === "sending" ? "Sending…" : "Send message"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

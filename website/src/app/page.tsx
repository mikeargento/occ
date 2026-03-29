"use client";

import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [copied, setCopied] = useState(false);
  const cmd = "curl -fsSL https://agent.occ.wtf/install | bash";

  return (
    <div>
      {/* ── Hero ── */}
      <section style={{
        minHeight: "85vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center",
        padding: "0 24px",
      }}>
        <p style={{
          fontSize: 17, fontWeight: 500,
          color: "var(--c-accent)",
          letterSpacing: "0.02em",
          marginBottom: 20,
        }}>
          Origin Controlled Computing
        </p>
        <h1 style={{
          fontSize: "clamp(40px, 8vw, 80px)",
          fontWeight: 700,
          letterSpacing: "-0.04em",
          lineHeight: 1.05,
          marginBottom: 20,
          maxWidth: 900,
        }}>
          Define what your AI does.
        </h1>
        <p style={{
          fontSize: "clamp(20px, 3vw, 28px)",
          lineHeight: 1.3,
          color: "var(--c-text-secondary)",
          fontWeight: 500,
          letterSpacing: "-0.01em",
          marginBottom: 40,
          maxWidth: 600,
        }}>
          Artificial Intelligence. Human Authority.
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <a href="https://agent.occ.wtf" style={{
            display: "inline-flex", alignItems: "center",
            height: 52, padding: "0 32px",
            borderRadius: 980, fontSize: 17, fontWeight: 500,
            background: "var(--c-text)", color: "var(--bg)",
            textDecoration: "none",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}>
            Get started
          </a>
          <Link href="/docs" style={{
            display: "inline-flex", alignItems: "center",
            height: 52, padding: "0 32px",
            borderRadius: 980, fontSize: 17, fontWeight: 500,
            color: "var(--c-accent)",
            textDecoration: "none",
            transition: "all 0.3s",
          }}>
            Learn more →
          </Link>
        </div>
      </section>

      {/* ── Three pillars ── */}
      <section style={{
        maxWidth: 980, margin: "0 auto",
        padding: "80px 24px 120px",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 1,
          background: "var(--c-border-subtle)",
          borderRadius: 20,
          overflow: "hidden",
        }}>
          {[
            {
              title: "No action without you",
              desc: "AI can think freely. But nothing executes unless you authorize it. No approval, no execution path.",
            },
            {
              title: "Approval becomes execution",
              desc: "Your authorization creates the cryptographic proof that makes the action possible. The proof is the command.",
            },
            {
              title: "Every action follows the last",
              desc: "Each proof links to the previous one. No gaps, no rewrites, no forks. A causal chain of human decisions.",
            },
          ].map((p) => (
            <div key={p.title} style={{
              padding: "48px 32px",
              background: "var(--bg)",
            }}>
              <h3 style={{
                fontSize: 20, fontWeight: 600,
                letterSpacing: "-0.02em",
                marginBottom: 12,
              }}>
                {p.title}
              </h3>
              <p style={{
                fontSize: 15, lineHeight: 1.65,
                color: "var(--c-text-secondary)",
              }}>
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Install ── */}
      <section style={{
        textAlign: "center",
        padding: "0 24px 120px",
      }}>
        <h2 style={{
          fontSize: "clamp(28px, 5vw, 48px)",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          marginBottom: 16,
        }}>
          One command.
        </h2>
        <p style={{
          fontSize: 17, color: "var(--c-text-secondary)",
          marginBottom: 40, maxWidth: 460, margin: "0 auto 40px",
        }}>
          AI can think freely. Actions require your authority.
        </p>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 12,
          padding: "16px 24px",
          borderRadius: 12,
          background: "var(--bg-elevated)",
          border: "1px solid var(--c-border-subtle)",
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          maxWidth: "100%",
          overflow: "hidden",
        }}>
          <code style={{ color: "var(--c-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ color: "var(--c-text-tertiary)", userSelect: "none" }}>$ </span>
            {cmd}
          </code>
          <button onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{
            flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: 8,
            border: "none", background: "transparent",
            color: copied ? "#22c55e" : "var(--c-text-tertiary)",
            cursor: "pointer", transition: "color 0.2s",
          }}>
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

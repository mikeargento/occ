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
        minHeight: "80vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center",
        padding: "0 24px",
      }}>
        <h1 style={{
          fontSize: "clamp(44px, 9vw, 96px)",
          fontWeight: 700,
          letterSpacing: "-0.05em",
          lineHeight: 1.0,
          marginBottom: 24,
          maxWidth: 800,
        }}>
          Your AI asks first.
        </h1>
        <p style={{
          fontSize: "clamp(18px, 2.5vw, 24px)",
          lineHeight: 1.4,
          color: "var(--c-text-secondary)",
          fontWeight: 400,
          maxWidth: 520,
          marginBottom: 48,
        }}>
          Nothing executes without your proof.<br />
          Nothing proves without your say.
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
          }}>
            Read the docs →
          </Link>
        </div>
      </section>

      {/* ── How it works — three beats ── */}
      <section style={{
        maxWidth: 980, margin: "0 auto",
        padding: "0 24px 120px",
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
              num: "01",
              title: "AI proposes",
              desc: "Your AI thinks, plans, and suggests actions. It has intelligence. It does not have authority.",
            },
            {
              num: "02",
              title: "You authorize",
              desc: "You say yes. That creates a cryptographic proof — the only object that makes the action executable.",
            },
            {
              num: "03",
              title: "Proof becomes command",
              desc: "No proof, no action. Every proof links to the last. An unbreakable chain of your decisions.",
            },
          ].map((p) => (
            <div key={p.num} className="pillar-cell">
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: "var(--c-text-tertiary)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
              }}>
                {p.num}
              </span>
              <h3 className="pillar-cell-title" style={{ marginTop: 12 }}>
                {p.title}
              </h3>
              <p className="pillar-cell-desc">
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The line ── */}
      <section style={{
        textAlign: "center",
        padding: "0 24px 120px",
      }}>
        <p style={{
          fontSize: "clamp(24px, 4vw, 40px)",
          fontWeight: 600,
          letterSpacing: "-0.03em",
          lineHeight: 1.2,
          maxWidth: 600,
          margin: "0 auto",
          color: "var(--c-text)",
        }}>
          Artificial Intelligence.<br />
          <span style={{ color: "var(--c-accent)" }}>Human Authority.</span>
        </p>
      </section>

      {/* ── Install ── */}
      <section style={{
        textAlign: "center",
        padding: "0 24px 120px",
      }}>
        <p style={{
          fontSize: 15, color: "var(--c-text-tertiary)",
          marginBottom: 20, letterSpacing: "0.02em",
          textTransform: "uppercase", fontWeight: 500,
        }}>
          Quick start
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
            color: copied ? "#30d158" : "var(--c-text-tertiary)",
            cursor: "pointer", transition: "color 0.2s",
          }}>
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            )}
          </button>
        </div>
        <p style={{ fontSize: 14, color: "var(--c-text-tertiary)", marginTop: 16 }}>
          Works with Claude Code. More runtimes coming.
        </p>
      </section>
    </div>
  );
}

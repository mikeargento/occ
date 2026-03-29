"use client";

import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [copied, setCopied] = useState(false);
  const cmd = "curl -fsSL https://agent.occ.wtf/install | bash";

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px" }}>

      {/* ── Hero ── */}
      <section style={{ paddingTop: "20vh", paddingBottom: 80 }}>
        <h1 style={{
          fontSize: "clamp(48px, 10vw, 120px)",
          fontWeight: 800,
          letterSpacing: "-0.06em",
          lineHeight: 0.95,
          marginBottom: 32,
        }}>
          Your AI<br />asks first.
        </h1>
        <p style={{
          fontSize: 18,
          lineHeight: 1.6,
          color: "var(--c-text-secondary)",
          maxWidth: 400,
          marginBottom: 40,
        }}>
          Every action needs a cryptographic ticket. You're the only one who can create it.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="https://agent.occ.wtf" style={{
            display: "inline-flex", alignItems: "center",
            height: 44, padding: "0 20px",
            borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: "#fff", color: "#000",
            textDecoration: "none",
          }}>
            Sign in
          </a>
          <Link href="/docs" style={{
            fontSize: 14, fontWeight: 500,
            color: "var(--c-text-secondary)",
            textDecoration: "none",
          }}>
            Docs
          </Link>
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ paddingBottom: 100, borderTop: "1px solid var(--c-border-subtle)", paddingTop: 60 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 48 }}>
          <div>
            <p style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--c-text-tertiary)", marginBottom: 12 }}>01</p>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>AI proposes</h3>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
              Intelligence without authority. Your AI can think, plan, and suggest — but it cannot act.
            </p>
          </div>
          <div>
            <p style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--c-text-tertiary)", marginBottom: 12 }}>02</p>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>You say yes</h3>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
              Your yes creates a signed proof inside a hardware enclave. That proof is the only thing that makes the action executable.
            </p>
          </div>
          <div>
            <p style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--c-text-tertiary)", marginBottom: 12 }}>03</p>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Every ticket is fresh</h3>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
              No standing permissions. Every action gets its own proof. Each one links to the last. An unbreakable chain of your decisions.
            </p>
          </div>
        </div>
      </section>

      {/* ── Install ── */}
      <section style={{
        paddingBottom: 100,
        borderTop: "1px solid var(--c-border-subtle)",
        paddingTop: 60,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 32 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 8 }}>
              One command.
            </h2>
            <p style={{ fontSize: 15, color: "var(--c-text-secondary)", maxWidth: 320 }}>
              Works with Claude Code today.<br />More runtimes coming.
            </p>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "14px 20px",
            borderRadius: 10,
            background: "var(--bg-elevated)",
            border: "1px solid var(--c-border-subtle)",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
          }}>
            <code style={{ color: "var(--c-text-secondary)", whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--c-text-tertiary)", userSelect: "none" }}>$ </span>
              {cmd}
            </code>
            <button onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{
              flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 6,
              border: "none", background: "transparent",
              color: copied ? "#30d158" : "var(--c-text-tertiary)",
              cursor: "pointer", transition: "color 0.2s",
            }}>
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ── Tagline ── */}
      <section style={{ paddingBottom: 120, textAlign: "center" }}>
        <p style={{
          fontSize: "clamp(20px, 3.5vw, 32px)",
          fontWeight: 600,
          letterSpacing: "-0.03em",
          color: "var(--c-text-tertiary)",
        }}>
          Artificial Intelligence. <span style={{ color: "var(--c-text)" }}>Human Authority.</span>
        </p>
      </section>
    </div>
  );
}

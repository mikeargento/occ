"use client";

import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [copied, setCopied] = useState(false);
  const installCmd = "curl -fsSL https://agent.occ.wtf/install | bash";
  function copy() {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "80px 24px 64px" }}>
      {/* Hero */}
      <div style={{ marginBottom: 80 }}>
        <h1 style={{
          fontSize: "clamp(36px, 6vw, 56px)", fontWeight: 700,
          letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16,
        }}>
          Define what your AI does.
        </h1>
        <p style={{
          fontSize: 18, lineHeight: 1.6, color: "var(--c-text-secondary)",
          maxWidth: 560, marginBottom: 32,
        }}>
          Artificial Intelligence. Human Authority.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="https://agent.occ.wtf" style={{
            display: "inline-flex", alignItems: "center", height: 44, padding: "0 24px",
            borderRadius: 8, fontSize: 15, fontWeight: 600,
            background: "var(--c-text)", color: "var(--bg)",
            textDecoration: "none", transition: "opacity 0.15s",
          }}>
            Get started
          </a>
          <Link href="/docs" style={{
            display: "inline-flex", alignItems: "center", height: 44, padding: "0 24px",
            borderRadius: 8, fontSize: 15, fontWeight: 500,
            border: "1px solid var(--c-border)", color: "var(--c-text)",
            textDecoration: "none", transition: "all 0.15s",
          }}>
            Documentation
          </Link>
        </div>
      </div>

      {/* Three columns */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 24, marginBottom: 80,
      }}>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>No action without you</h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
            AI can think freely. But nothing executes unless you authorize it. No approval, no execution path.
          </p>
        </div>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Approval becomes execution</h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
            Your authorization creates the cryptographic object that makes the action possible. The proof is the command.
          </p>
        </div>
        <div style={{ padding: "24px 0" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Every action must follow the last</h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--c-text-secondary)" }}>
            Each proof links to the previous one. No gaps, no rewrites, no forks. A causal chain of human decisions.
          </p>
        </div>
      </div>

      {/* Quick setup */}
      <div style={{
        background: "var(--bg-elevated)", borderRadius: 12,
        border: "1px solid var(--c-border-subtle)", padding: 32, marginBottom: 48,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>Quick setup</h2>
        </div>
        <div style={{ position: "relative" }}>
          <pre onClick={copy} style={{
            fontSize: 14, fontFamily: "var(--font-mono)",
            color: "var(--c-text-secondary)", lineHeight: 2,
            overflow: "auto", cursor: "pointer",
          }}>{installCmd}</pre>
          <button onClick={copy} style={{
            position: "absolute", top: 0, right: 0,
            width: 32, height: 32, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none",
            color: copied ? "var(--c-accent)" : "var(--c-text-tertiary)",
            cursor: "pointer", transition: "all 0.15s",
          }} title="Copy to clipboard">
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            )}
          </button>
        </div>
        <p style={{ fontSize: 14, color: "var(--c-text-tertiary)", marginTop: 12 }}>
          Installs OCC for Claude Code. AI can think freely. Actions require your authority.
        </p>
      </div>
    </div>
  );
}

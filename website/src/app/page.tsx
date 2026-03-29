"use client";

import Link from "next/link";

function KittScanner() {
  return (
    <div style={{
      width: "100%", maxWidth: 480, height: 2,
      position: "relative",
      marginBottom: 40,
    }}>
      {/* Core light */}
      <div style={{
        position: "absolute",
        top: -3, left: 0,
        width: "12%", height: 8,
        borderRadius: 4,
        background: "#ff0000",
        boxShadow: "0 0 8px 2px #ff0000, 0 0 24px 6px rgba(255,0,0,0.5), 0 0 60px 12px rgba(255,0,0,0.2)",
        animation: "kitt 1.8s ease-in-out infinite",
      }} />
    </div>
  );
}

export default function Home() {
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 24px 64px" }}>
      {/* Hero */}
      <div style={{ marginBottom: 80 }}>
        <KittScanner />
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
          <a href="https://agent.occ.wtf"
            style={{
            display: "inline-flex", alignItems: "center", height: 44, padding: "0 24px",
            borderRadius: 8, fontSize: 15, fontWeight: 600,
            background: "var(--c-text)", color: "var(--bg)",
            textDecoration: "none", transition: "all 0.2s",
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

      {/* Three cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 16, marginBottom: 80,
      }}>
        {[
          {
            title: "No action without you",
            desc: "AI can think freely. But nothing executes unless you authorize it. No approval, no execution path.",
          },
          {
            title: "Approval becomes execution",
            desc: "Your authorization creates the cryptographic object that makes the action possible. The proof is the command.",
          },
          {
            title: "Every action must follow the last",
            desc: "Each proof links to the previous one. No gaps, no rewrites, no forks. A causal chain of human decisions.",
          },
        ].map((card, i) => (
          <div key={i} className="feature-card">
            <div className="feature-card-index">{String(i + 1).padStart(2, "0")}</div>
            <h3 className="feature-card-title">{card.title}</h3>
            <p className="feature-card-desc">{card.desc}</p>
          </div>
        ))}
      </div>

      <div style={{ height: 48 }} />
    </div>
  );
}

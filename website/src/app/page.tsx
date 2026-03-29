"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* ── Animated counter ── */
function AnimCounter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        let start = 0;
        const duration = 1400;
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / duration, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          start = Math.round(ease * end);
          setVal(start);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        observer.disconnect();
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

/* ── Typing effect for hero ── */
function TypedText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [shown, setShown] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  useEffect(() => {
    if (!started || shown >= text.length) return;
    const t = setTimeout(() => setShown(s => s + 1), 35 + Math.random() * 25);
    return () => clearTimeout(t);
  }, [started, shown, text]);
  return (
    <span>
      {text.slice(0, shown)}
      {shown < text.length && <span className="typing-cursor">|</span>}
    </span>
  );
}

/* ── Glow card ── */
function GlowCard({ children, accent }: { children: React.ReactNode; accent: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const handleMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} className="glow-card" onMouseMove={handleMove}
      style={{ "--glow-color": accent } as React.CSSProperties}>
      {children}
    </div>
  );
}

export default function Home() {
  const [copied, setCopied] = useState(false);
  const cmd = "curl -fsSL https://agent.occ.wtf/install | bash";

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px" }}>
      {/* ── Hero ── */}
      <div style={{ paddingTop: 100, paddingBottom: 80, position: "relative" }}>
        {/* Ambient glow */}
        <div className="hero-glow" />

        <h1 style={{
          fontSize: "clamp(32px, 6vw, 64px)", fontWeight: 700,
          letterSpacing: "-0.04em", lineHeight: 1.05, marginBottom: 20,
          whiteSpace: "nowrap",
        }}>
          <TypedText text="Define what your AI does." />
        </h1>
        <p className="hero-tagline">
          Artificial Intelligence. Human Authority.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 36 }}>
          <a href="https://agent.occ.wtf" className="btn-primary">
            Get started
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 6 }}>
              <path d="M1 7h12M8 2l5 5-5 5" />
            </svg>
          </a>
          <Link href="/docs" className="btn-outline">
            Documentation
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stats-row">
        <div className="stat">
          <div className="stat-value"><AnimCounter end={2598} suffix="+" /></div>
          <div className="stat-label">Proofs signed</div>
        </div>
        <div className="stat-divider" />
        <div className="stat">
          <div className="stat-value">TEE</div>
          <div className="stat-label">Hardware enclave</div>
        </div>
        <div className="stat-divider" />
        <div className="stat">
          <div className="stat-value">Ed25519</div>
          <div className="stat-label">Cryptographic signing</div>
        </div>
        <div className="stat-divider" />
        <div className="stat">
          <div className="stat-value">0ms</div>
          <div className="stat-label">AI bypass possible</div>
        </div>
      </div>

      {/* ── Three pillars ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 80 }}>
        <GlowCard accent="rgba(34, 197, 94, 0.15)">
          <div className="pillar-icon" style={{ color: "#22c55e" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h3 className="pillar-title">No action without you</h3>
          <p className="pillar-desc">
            AI can think freely. But nothing executes unless you authorize it. No approval, no execution path.
          </p>
        </GlowCard>
        <GlowCard accent="rgba(59, 130, 246, 0.15)">
          <div className="pillar-icon" style={{ color: "#3b82f6" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h3 className="pillar-title">Approval becomes execution</h3>
          <p className="pillar-desc">
            Your authorization creates the cryptographic object that makes the action possible. The proof is the command.
          </p>
        </GlowCard>
        <GlowCard accent="rgba(168, 85, 247, 0.15)">
          <div className="pillar-icon" style={{ color: "#a855f7" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <h3 className="pillar-title">Every action follows the last</h3>
          <p className="pillar-desc">
            Each proof links to the previous one. No gaps, no rewrites, no forks. A causal chain of human decisions.
          </p>
        </GlowCard>
      </div>

      {/* ── Terminal install ── */}
      <div className="terminal-card">
        <div className="terminal-dots">
          <span /><span /><span />
        </div>
        <div className="terminal-body">
          <span style={{ color: "var(--c-text-tertiary)", userSelect: "none" }}>$ </span>
          <span style={{ color: "#22c55e" }}>{cmd}</span>
        </div>
        <button className="terminal-copy" onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          )}
        </button>
      </div>
      <p style={{ textAlign: "center", fontSize: 14, color: "var(--c-text-tertiary)", marginBottom: 80 }}>
        AI can think freely. Actions require your authority.
      </p>

      {/* ── Sign in ── */}
      <div className="cta-card">
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 8 }}>
          Ready to take control?
        </h2>
        <p style={{ fontSize: 16, color: "var(--c-text-secondary)", marginBottom: 28, maxWidth: 400 }}>
          Set up OCC in under a minute. One install command. Full authority over every AI action.
        </p>
        <a href="https://agent.occ.wtf" className="btn-primary" style={{ height: 48, padding: "0 32px", fontSize: 16 }}>
          Sign in →
        </a>
      </div>

      <div style={{ height: 64 }} />
    </div>
  );
}

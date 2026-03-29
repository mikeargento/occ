"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

/* ── Noise texture canvas ── */
function Noise() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    c.width = 200; c.height = 200;
    const img = ctx.createImageData(200, 200);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i+1] = img.data[i+2] = v;
      img.data[i+3] = 8;
    }
    ctx.putImageData(img, 0, 0);
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, opacity: 0.4 }} />;
}

/* ── Scramble text effect ── */
function Scramble({ text, delay = 0 }: { text: string; delay?: number }) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&";
  const [display, setDisplay] = useState(text.replace(/[^ \n]/g, " "));
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      let frame = 0;
      const maxFrames = text.length * 3;
      const interval = setInterval(() => {
        frame++;
        const progress = frame / maxFrames;
        const resolved = Math.floor(progress * text.length);
        let result = "";
        for (let i = 0; i < text.length; i++) {
          if (text[i] === " " || text[i] === "\n") result += text[i];
          else if (i < resolved) result += text[i];
          else result += chars[Math.floor(Math.random() * chars.length)];
        }
        setDisplay(result);
        if (frame >= maxFrames) {
          clearInterval(interval);
          setDisplay(text);
          setDone(true);
        }
      }, 30);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(t);
  }, [text, delay]);

  return <span style={{ fontFamily: done ? "inherit" : "var(--font-mono)" }}>{display}</span>;
}

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const cmd = "curl -fsSL https://agent.occ.wtf/install | bash";

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <Noise />

      {/* ── Hero ── */}
      <section style={{
        minHeight: "100vh",
        display: "flex", flexDirection: "column",
        justifyContent: "center",
        padding: "0 max(24px, 8vw)",
        position: "relative", zIndex: 1,
      }}>
        <div style={{
          transform: `translateY(${scrollY * -0.15}px)`,
          transition: "transform 0.1s linear",
        }}>
          <h1 style={{
            fontSize: "clamp(56px, 12vw, 160px)",
            fontWeight: 900,
            letterSpacing: "-0.07em",
            lineHeight: 0.88,
            marginBottom: 40,
            color: "#fff",
          }}>
            <Scramble text="Your AI" delay={200} /><br />
            <Scramble text="asks first." delay={600} />
          </h1>
          <div style={{
            width: 64, height: 3,
            background: "var(--c-accent)",
            marginBottom: 32,
          }} />
          <p style={{
            fontSize: "clamp(16px, 2vw, 20px)",
            lineHeight: 1.7,
            color: "rgba(255,255,255,0.5)",
            maxWidth: 440,
            marginBottom: 48,
          }}>
            Every action needs a cryptographic ticket.<br />
            You're the only one who can create it.
          </p>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <a href="https://agent.occ.wtf" style={{
              display: "inline-flex", alignItems: "center",
              height: 48, padding: "0 28px",
              borderRadius: 6, fontSize: 14, fontWeight: 600,
              letterSpacing: "0.04em", textTransform: "uppercase",
              background: "#fff", color: "#000",
              textDecoration: "none",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(255,255,255,0.15)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
            >
              Enter
            </a>
            <Link href="/docs" style={{
              fontSize: 14, fontWeight: 500,
              color: "rgba(255,255,255,0.4)",
              textDecoration: "none",
              letterSpacing: "0.02em",
              transition: "color 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
            >
              Documentation
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: "absolute", bottom: 40, left: "50%",
          transform: "translateX(-50%)",
          opacity: scrollY > 50 ? 0 : 0.3,
          transition: "opacity 0.3s",
        }}>
          <div style={{
            width: 1, height: 48,
            background: "linear-gradient(to bottom, rgba(255,255,255,0.4), transparent)",
          }} />
        </div>
      </section>

      {/* ── The system ── */}
      <section style={{
        padding: "120px max(24px, 8vw)",
        position: "relative", zIndex: 1,
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 0,
        }}>
          {[
            { n: "01", t: "AI proposes", d: "Intelligence without authority." },
            { n: "02", t: "You say yes", d: "Your yes forges the proof." },
            { n: "03", t: "Proof = ticket", d: "No ticket, no action. Ever." },
          ].map((item, i) => (
            <div key={item.n} style={{
              padding: "48px 32px",
              borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
            }}>
              <span style={{
                fontSize: 11, fontFamily: "var(--font-mono)",
                color: "rgba(255,255,255,0.2)",
                letterSpacing: "0.1em",
              }}>{item.n}</span>
              <h3 style={{
                fontSize: 24, fontWeight: 700,
                letterSpacing: "-0.03em",
                marginTop: 16, marginBottom: 12,
              }}>{item.t}</h3>
              <p style={{
                fontSize: 15, lineHeight: 1.6,
                color: "rgba(255,255,255,0.4)",
              }}>{item.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The line ── */}
      <section style={{
        padding: "80px max(24px, 8vw) 160px",
        position: "relative", zIndex: 1,
      }}>
        <p style={{
          fontSize: "clamp(32px, 6vw, 72px)",
          fontWeight: 800,
          letterSpacing: "-0.05em",
          lineHeight: 1.0,
          color: "rgba(255,255,255,0.08)",
        }}>
          Artificial Intelligence.<br />
          <span style={{ color: "#fff" }}>Human Authority.</span>
        </p>
      </section>

      {/* ── Install ── */}
      <section style={{
        padding: "0 max(24px, 8vw) 120px",
        position: "relative", zIndex: 1,
      }}>
        <div style={{
          padding: "32px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
            <div>
              <p style={{
                fontSize: 11, fontFamily: "var(--font-mono)",
                color: "rgba(255,255,255,0.2)",
                letterSpacing: "0.1em", textTransform: "uppercase",
                marginBottom: 8,
              }}>Install</p>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
                Claude Code. More runtimes soon.
              </p>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}>
              <code style={{ color: "rgba(255,255,255,0.5)" }}>
                <span style={{ userSelect: "none", color: "rgba(255,255,255,0.2)" }}>$ </span>
                {cmd}
              </code>
              <button onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28, borderRadius: 4,
                border: "none", background: "transparent",
                color: copied ? "#30d158" : "rgba(255,255,255,0.25)",
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
        </div>
      </section>
    </div>
  );
}

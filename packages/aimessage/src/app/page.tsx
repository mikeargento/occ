"use client";

import { useState } from "react";

export default function Home() {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText("npm install -g aimessage-app && aimessage setup");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
      background: "#fff",
      padding: 24,
      gap: 48,
    }}>
      {/* Title */}
      <h1 style={{
        fontSize: "clamp(40px, 10vw, 80px)",
        fontWeight: 700,
        color: "#000",
        letterSpacing: "-0.03em",
        margin: 0,
        textAlign: "center",
      }}>
        AiMessage
      </h1>

      {/* Install */}
      <button onClick={copy} style={{
        background: "#007aff",
        color: "#fff",
        border: "none",
        padding: "16px 32px",
        fontSize: 18,
        fontFamily: "'SF Mono', 'Menlo', monospace",
        cursor: "pointer",
        borderRadius: 0,
        letterSpacing: "-0.01em",
        transition: "opacity 150ms",
        width: "100%",
        maxWidth: 480,
        textAlign: "center",
      }}>
        {copied ? "Copied" : "npm install -g aimessage-app"}
      </button>

      {/* Docs */}
      <a href="/documentation" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        color: "#fff",
        border: "none",
        padding: "16px 32px",
        fontSize: 18,
        fontFamily: "inherit",
        cursor: "pointer",
        borderRadius: 0,
        textDecoration: "none",
        width: "100%",
        maxWidth: 480,
        textAlign: "center",
      }}>
        Documentation
      </a>
    </div>
  );
}

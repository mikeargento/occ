"use client";

import { useState, useEffect } from "react";

export function Nav() {
  return (
    <div style={{ textAlign: "center", paddingTop: 32, paddingBottom: 8 }}>
      <span style={{ fontSize: 28, fontWeight: 900, fontStyle: "normal", fontFamily: '"good-times", sans-serif', letterSpacing: "-0.02em", color: "var(--c-text)" }}>
        OCC.WTF
      </span>
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("occ-theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("occ-theme", next);
  };

  return (
    <button
      onClick={toggle}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        color: "var(--c-text-tertiary)",
        pointerEvents: "auto",
      }}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

export function Footer() {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
      textAlign: "center", padding: "12px 0",
      display: "flex", justifyContent: "center", alignItems: "center", gap: 24,
      background: "linear-gradient(transparent, var(--bg) 40%)",
      pointerEvents: "none",
    }}>
      <a href="/docs" target="_blank" rel="noopener" style={{ fontSize: 13, color: "var(--c-text-tertiary)", textDecoration: "none", pointerEvents: "auto" }}>Docs</a>
      <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 13, color: "var(--c-text-tertiary)", textDecoration: "none", pointerEvents: "auto" }}>GitHub</a>
      <ThemeToggle />
    </div>
  );
}

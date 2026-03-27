"use client";
import { useEffect } from "react";

export default function Redirect() {
  useEffect(() => {
    window.location.href = "https://agent.occ.wtf";
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, sans-serif" }}>
      <span style={{ color: "#8e8e93", fontSize: "15px" }}>Redirecting…</span>
    </div>
  );
}

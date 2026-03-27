import type { ReactNode } from "react";

function Nav() {
  return (
    <nav style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      height: 56,
      borderBottom: "1px solid #e5e5ea",
      background: "#fff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
    }}>
      <a href="/" style={{ fontSize: 18, fontWeight: 700, color: "#000", textDecoration: "none", letterSpacing: "-0.02em" }}>
        AiMessage
      </a>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <a href="https://occ.wtf/explorer" style={{ fontSize: 14, fontWeight: 600, color: "#000", textDecoration: "none" }}>Explorer</a>
        <a href="https://occ.wtf/docs" style={{ fontSize: 14, fontWeight: 600, color: "#000", textDecoration: "none" }}>Docs</a>
        <a href="https://github.com/mikeargento/occ" style={{ fontSize: 14, fontWeight: 600, color: "#000", textDecoration: "none" }}>GitHub</a>
      </div>
    </nav>
  );
}

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      {children}
    </>
  );
}

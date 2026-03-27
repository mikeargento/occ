import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AiMessage",
  description: "Your AI asks before it acts.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AiMessage",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

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
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <a href="/documentation" style={{ fontSize: 14, fontWeight: 500, color: "#000", textDecoration: "none" }}>Documentation</a>
        <a href="https://occ.wtf" style={{ fontSize: 14, fontWeight: 500, color: "#000", textDecoration: "none" }}>OCC</a>
      </div>
    </nav>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body style={{ margin: 0 }}>
        <Nav />
        {children}
      </body>
    </html>
  );
}

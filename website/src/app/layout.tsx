import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ThemeProvider } from "@/components/theme-provider";


const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["900"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OCC - Control wtf your AI agents can do",
    template: "%s | OCC",
  },
  description:
    "Origin Controlled Computing. AI actions are only executable if authorized by a previously committed, cryptographically bound policy.",
  keywords: [
    "OCC",
    "Origin Controlled Computing",
    "AI agent control",
    "AI safety",
    "cryptographic policy",
    "AI governance",
    "agent permissions",
    "MCP proxy",
    "tool access control",
    "AI guardrails",
    "default deny",
  ],
  openGraph: {
    title: "OCC - Control wtf your AI agents can do",
    description: "Origin Controlled Computing. Control wtf your AI agents can do. Prove what they did.",
    type: "website",
    siteName: "OCC",
  },
  twitter: {
    card: "summary_large_image",
    title: "OCC - Control wtf your AI agents can do",
    description: "Origin Controlled Computing. Control wtf your AI agents can do. Prove what they did.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/svq0oqy.css" />
      </head>
      <body className="font-serif antialiased">
        <ThemeProvider>
          <Nav />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}

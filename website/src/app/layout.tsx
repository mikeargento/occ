import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
import "./globals.css";
import "katex/dist/katex.min.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OCC",
    template: "%s | OCC",
  },
  description:
    "Live cryptographic proof chain. Create, verify, and explore OCC proofs.",
  keywords: [
    "OCC", "Origin Controlled Computing", "AI agent control", "AI safety",
    "cryptographic policy", "AI governance", "default deny", "proof explorer",
  ],
  openGraph: {
    title: "OCC",
    description: "Live cryptographic proof chain. Create, verify, and explore OCC proofs.",
    type: "website",
    siteName: "OCC",
  },
  twitter: {
    card: "summary_large_image",
    title: "OCC",
    description: "Live cryptographic proof chain. Create, verify, and explore OCC proofs.",
  },
  robots: { index: true, follow: true },
};

import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/footer";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/svq0oqy.css" />
      </head>
      <body style={{ fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }}>
        <SiteNav />
        <main style={{ paddingBottom: 48 }}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

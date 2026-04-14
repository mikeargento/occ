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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} style={{ scrollbarGutter: "stable" }}>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/svq0oqy.css" />
      </head>
      <body style={{ fontFamily: "acumin-pro, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif", margin: 0 }}>
        <SiteNav />
        <main>{children}</main>
      </body>
    </html>
  );
}

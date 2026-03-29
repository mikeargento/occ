import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OCC — Define what your AI does",
    template: "%s | OCC",
  },
  description:
    "Artificial Intelligence. Human Authority.",
  keywords: [
    "OCC", "Origin Controlled Computing", "AI agent control", "AI safety",
    "cryptographic policy", "AI governance", "default deny",
  ],
  openGraph: {
    title: "OCC — Define what your AI does",
    description: "Origin Controlled Computing. Define what your AI does. Prove what they did.",
    type: "website",
    siteName: "OCC",
  },
  twitter: {
    card: "summary_large_image",
    title: "OCC — Define what your AI does",
    description: "Origin Controlled Computing. Define what your AI does.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/svq0oqy.css" />
      </head>
      <body style={{ fontFamily: "acumin-pro, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }}>
        <Nav />
        <main style={{ minHeight: "100vh" }}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

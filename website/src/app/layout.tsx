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

const SITE_URL = "https://occ.wtf";
const SITE_DESCRIPTION =
  "Origin Controlled Computing. Drop a file and get a portable cryptographic proof of its origin and causal position. Verify offline, anchored to Ethereum.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "OCC — Origin Controlled Computing",
    template: "%s | OCC",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "OCC",
    "Origin Controlled Computing",
    "cryptographic proof",
    "file provenance",
    "TEE",
    "AWS Nitro Enclave",
    "causal order",
    "Ethereum anchor",
    "C2PA alternative",
    "photo provenance",
  ],
  openGraph: {
    title: "OCC — Origin Controlled Computing",
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: "OCC",
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "OCC — Origin Controlled Computing",
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

import { SiteNav } from "@/components/site-nav";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
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

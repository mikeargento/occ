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
    default: "OCC - Prove anything digital",
    template: "%s | OCC",
  },
  description:
    "Generate portable cryptographic proof for any file or computation. Drop an artifact, receive proof it existed in its current form at a specific moment. No blockchain required.",
  keywords: [
    "OCC",
    "cryptographic proof",
    "OCC",
    "Origin Controlled Computing",
    "artifact verification",
    "content provenance",
    "proof of existence",
    "TEE",
    "Nitro Enclave",
    "digital proof",
    "commit proof",
  ],
  openGraph: {
    title: "OCC - Prove anything digital",
    description: "Generate portable cryptographic proof for any file or computation. No blockchain required.",
    type: "website",
    siteName: "OCC",
  },
  twitter: {
    card: "summary_large_image",
    title: "OCC - Prove anything digital",
    description: "Generate portable cryptographic proof for any file or computation. No blockchain required.",
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
      <head />
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

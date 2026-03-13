import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ProofStudio - Cryptographic Proof for Any Digital Artifact",
    template: "%s | ProofStudio",
  },
  description:
    "Generate portable cryptographic proof for any file or computation. Drop an artifact, receive proof it existed in its current form at a specific moment. No blockchain required.",
  keywords: [
    "ProofStudio",
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
    title: "ProofStudio - Cryptographic Proof for Any Digital Artifact",
    description: "Generate portable cryptographic proof for any file or computation. No blockchain required.",
    type: "website",
    siteName: "ProofStudio",
  },
  twitter: {
    card: "summary_large_image",
    title: "ProofStudio - Cryptographic Proof for Any Digital Artifact",
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
    <html lang="en" className={jetbrainsMono.variable}>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/dzx2jda.css" />
      </head>
      <body className="font-serif antialiased">
        <Nav />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ThemeProvider } from "@/components/theme-provider";

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
    <html lang="en" className={`dark ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/dzx2jda.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("occ-theme");if(t==="light"){document.documentElement.classList.remove("dark");document.documentElement.classList.add("light")}}catch(e){}`,
          }}
        />
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

import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: {
    default: "OCC — Origin Controlled Computing",
    template: "%s | OCC Protocol",
  },
  description:
    "Portable cryptographic proof caused by system structure. Proof should be a property of creation, not verification.",
  keywords: [
    "OCC",
    "Origin Controlled Computing",
    "OCC Protocol",
    "cryptographic proof",
    "proof of finalization",
    "measured execution",
    "artifact verification",
    "content provenance",
    "TEE",
    "Nitro Enclave",
    "Ed25519",
    "commit proof",
  ],
  openGraph: {
    title: "OCC — Origin Controlled Computing",
    description: "Portable cryptographic proof caused by system structure.",
    type: "website",
    siteName: "OCC Protocol",
  },
  twitter: {
    card: "summary_large_image",
    title: "OCC — Origin Controlled Computing",
    description: "Portable cryptographic proof caused by system structure.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("occ-theme");if(t==="light"){document.documentElement.classList.remove("dark");document.documentElement.classList.add("light")}}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <Nav />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}

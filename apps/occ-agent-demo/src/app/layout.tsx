import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OCC Agent — Verifiable Tool Execution",
  description: "Run tools. Get cryptographic receipts. Verify everything.",
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
        {children}
      </body>
    </html>
  );
}

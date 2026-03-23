import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ProxyProvider } from "@/lib/use-proxy";
import { ThemeProvider } from "@/components/theme-provider";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OCC",
  description: "Control wtf your AI agents can do.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${jetbrainsMono.variable}`}>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/svq0oqy.css" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='black'/></svg>" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <ThemeProvider>
          <ProxyProvider>
            {children}
          </ProxyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

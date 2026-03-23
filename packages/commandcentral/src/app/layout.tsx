import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { ProxyProvider } from "@/lib/use-proxy";
import { ThemeProvider } from "@/components/theme-provider";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OCC — Control wtf your AI agents can do",
  description: "Control wtf your AI agents can do. Cryptographic control plane for autonomous AI agents.",
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
      </head>
      <body>
        <ThemeProvider>
          <ProxyProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden md:ml-[240px] pt-[52px] md:pt-0">
                {children}
              </main>
            </div>
          </ProxyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

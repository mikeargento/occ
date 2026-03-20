import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { ProxyProvider } from "@/lib/use-proxy";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OCC Agent",
  description: "Control plane for autonomous AI agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ThemeProvider>
          <ProxyProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
                {children}
              </main>
            </div>
          </ProxyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

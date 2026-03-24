import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OCC — Define what your AI agents can do",
  description: "Every rule is cryptographically proven before a single action can exist.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/svq0oqy.css" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='black'/></svg>" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="bg-white text-[#111] dark:bg-[#0a0a0a] dark:text-[#e5e5e5]">
        {children}
      </body>
    </html>
  );
}

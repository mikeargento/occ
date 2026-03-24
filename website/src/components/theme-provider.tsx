"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "dark", toggle: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("occ-theme") as Theme | null;
      if (stored === "light" || stored === "dark") return stored;
      // Check cross-domain cookie
      const cookie = document.cookie.match(/occ-theme=(dark|light)/);
      if (cookie) return cookie[1] as Theme;
    }
    return "dark";
  });
  const [mounted] = useState(() => typeof window !== "undefined");

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    localStorage.setItem("occ-theme", theme);
    // Cross-domain sync via cookie on .occ.wtf
    document.cookie = `occ-theme=${theme}; path=/; domain=.occ.wtf; max-age=31536000; SameSite=Lax`;
  }, [theme, mounted]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

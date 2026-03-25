"use client";

/**
 * Theme provider — fixed muted-light theme, no toggle.
 * Kept as a wrapper so existing imports don't break.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

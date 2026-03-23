"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [user, setUser] = useState<{ name: string; email: string; avatar: string } | null>(null);

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] mb-8">Settings</h1>

      <div className="rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-text mb-4">Account</h2>
        {user ? (
          <div className="flex items-center gap-4">
            {user.avatar && (
              <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-text">{user.name}</p>
              <p className="text-xs text-text-tertiary">{user.email}</p>
            </div>
            <a href="/auth/logout" className="text-xs text-text-tertiary hover:text-text transition-colors">
              Sign out
            </a>
          </div>
        ) : (
          <a
            href="/auth/login/github"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-text text-bg hover:opacity-90 transition-opacity"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in with GitHub
          </a>
        )}
      </div>
    </div>
  );
}

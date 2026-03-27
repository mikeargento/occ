"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getMe, getFeed, approve, deny, type FeedItem } from "@/lib/api";

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggleTheme() {
    const html = document.documentElement;
    const dark = html.getAttribute("data-theme") === "dark";
    html.setAttribute("data-theme", dark ? "light" : "dark");
    localStorage.setItem("theme", dark ? "light" : "dark");
    setIsDark(!dark);
  }

  useEffect(() => {
    getMe().then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const refreshFeed = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getFeed();
      setFeed(data.requests ?? []);
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshFeed();
    pollingRef.current = setInterval(refreshFeed, 3000);
    return () => clearInterval(pollingRef.current);
  }, [user, refreshFeed]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [feed]);

  async function handleApprove(id: number) {
    await approve(id);
    refreshFeed();
  }

  async function handleDeny(id: number) {
    await deny(id);
    refreshFeed();
  }

  if (loading) return <div className="page-center"><div className="loader" /></div>;

  if (!user) return (
    <div className="page-center">
      <div className="login-card">
        <h1 className="login-title">OCC</h1>
        <p className="login-sub">Control what your AI can do.</p>
        <div className="login-buttons">
          <a href="/auth/login/github" className="auth-btn auth-github"><GithubIcon /> Continue with GitHub</a>
          <a href="/auth/login/google" className="auth-btn auth-google"><GoogleIcon /> Continue with Google</a>
          <a href="/auth/login/apple" className="auth-btn auth-apple"><AppleIcon /> Continue with Apple</a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <span className="sidebar-logo">OCC</span>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <nav className="sidebar-nav">
          <a href="https://occ.wtf/docs" className="sidebar-item" target="_blank">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Documentation
          </a>
          <a href="https://github.com/mikeargento/occ" className="sidebar-item" target="_blank">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            GitHub
          </a>
          <a href="/settings" className="sidebar-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Settings
          </a>
          <button className="sidebar-item" onClick={toggleTheme}>
            {isDark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
            {isDark ? "Light mode" : "Dark mode"}
          </button>
        </nav>
        <div className="sidebar-footer">
          {user && (
            <div className="sidebar-user">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="sidebar-user-avatar" />
              ) : (
                <div className="sidebar-user-avatar-placeholder">{user.name?.[0]}</div>
              )}
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user.name}</div>
                <div className="sidebar-user-email">{user.email}</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <main className="chat-main">
        <div className="mobile-header">
          <button className="topbar-btn" onClick={() => setSidebarOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span className="topbar-title">OCC</span>
          <div style={{ width: 36 }} />
        </div>

        {/* iMessage thread */}
        <div className="imessage-scroll">
          <div className="imessage-thread">
            {feed.length === 0 && (
              <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-tertiary)", fontSize: 14 }}>
                No messages yet
              </div>
            )}

            {feed.map((item, i) => {
              const prev = feed[i - 1];
              const showTime = !prev || (new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime() > 300000);
              const isPending = item.status === "pending";
              const isResolved = item.status === "approved" || item.status === "auto_approved" || item.status === "denied";
              const toolName = item.tool.startsWith("mcp__") ? (item.tool.split("__").pop() || item.tool).replace(/[_-]/g, " ") : item.tool;
              const args = (item.args && typeof item.args === "object" ? item.args : {}) as Record<string, unknown>;

              return (
                <div key={item.id}>
                  {showTime && (
                    <div className="time-separator">
                      {new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}

                  {/* OCC's message — gray bubble, left side */}
                  <div className="bubble-row bubble-row-received">
                    <div>
                      <div className="bubble bubble-received">
                        <div className="bubble-tool">{toolName}</div>
                        {(item.summary || item.label) && (
                          <div className="bubble-summary">{item.summary || item.label}</div>
                        )}
                        {Object.keys(args).length > 0 && (
                          <div className="bubble-args">{JSON.stringify(args, null, 2)}</div>
                        )}
                        {isPending && (
                          <div className="quick-reply">
                            <button className="quick-reply-approve" onClick={() => handleApprove(item.id)}>Allow</button>
                            <button className="quick-reply-deny" onClick={() => handleDeny(item.id)}>Deny</button>
                          </div>
                        )}
                        {isResolved && (
                          <div className={`bubble-status bubble-status-${item.status === "auto_approved" ? "approved" : item.status}`}>
                            {item.status === "auto_approved" ? "Auto-allowed" : item.status === "approved" ? "Allowed" : "Denied"}
                          </div>
                        )}
                        {item.status === "expired" && (
                          <div className="bubble-status bubble-status-expired">Expired</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* User's response — blue bubble, right side (only if resolved by user) */}
                  {(item.status === "approved" || item.status === "denied") && (
                    <div className="bubble-row bubble-row-sent">
                      <div className="bubble bubble-sent">
                        {item.status === "approved" ? "Yes" : "No"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div ref={endRef} />
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Icons ── */
function GithubIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>; }
function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>; }
function AppleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>; }

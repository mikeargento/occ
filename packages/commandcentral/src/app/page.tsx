"use client";

import { useState, useCallback, useEffect } from "react";
import { getMe, getFeed, getProofs, approve, deny, type FeedItem, type ProofEntry } from "@/lib/api";

/* ── Helpers ── */

function timeAgo(ts: string | number): string {
  const ms = Date.now() - (typeof ts === "number" ? ts : new Date(ts).getTime());
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function toolName(raw: string): string {
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/* ── Icons ── */

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M3 1.5L7 5L3 8.5" />
    </svg>
  );
}

/* ── Page ── */

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then(d => setUser(d.user)).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 16, height: 16, border: "2px solid var(--c-border)", borderTop: "2px solid var(--c-text)", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <>
      {/* Sticky Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50, height: "56px",
        display: "flex", alignItems: "center",
        borderBottom: "1px solid var(--c-border-subtle)",
        backgroundColor: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      }}>
        <div style={{
          maxWidth: "64rem", margin: "0 auto", width: "100%", padding: "0 1.5rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--c-text)" }}>
            OCC
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {user ? (
              <>
                <a href="/settings" style={{ fontSize: "13px", color: "var(--c-text-tertiary)", textDecoration: "none" }}>Settings</a>
                {user.avatar ? (
                  <img src={user.avatar} alt="" style={{ width: 24, height: 24, borderRadius: "50%" }} />
                ) : (
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--c-text-tertiary)" }}>
                    {user.name?.[0]?.toUpperCase()}
                  </div>
                )}
              </>
            ) : (
              <a href="/auth/login/github" style={{ fontSize: "13px", color: "var(--c-text-tertiary)", textDecoration: "none" }}>Sign in</a>
            )}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: "64rem", margin: "0 auto", padding: "0 1.5rem" }}>
        {/* Hero */}
        <section style={{ paddingTop: "80px", paddingBottom: user ? "48px" : "64px" }}>
          <h1 style={{
            fontSize: "clamp(2rem, 5vw, 2.75rem)", fontWeight: 800,
            letterSpacing: "-0.04em", lineHeight: 1.1, color: "var(--c-text)",
            margin: 0, marginBottom: "12px",
          }}>
            {user ? `Hello, ${user.name?.split(" ")[0] ?? "there"}.` : "Define what your AI does."}
          </h1>
          {!user && (
            <p style={{ fontSize: "15px", color: "var(--c-text-tertiary)", margin: 0, lineHeight: 1.6 }}>
              Cryptographic proof that every AI action was authorized by policy.
            </p>
          )}
        </section>

        {/* Pending approvals */}
        {user && <PendingSection />}

        {/* Proofs */}
        {user ? <UserProofs /> : <PublicMessage />}
      </div>
    </>
  );
}

/* ── Pending Section ── */

function PendingSection() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [acting, setActing] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const data = await getFeed();
      setItems((data.requests ?? []).filter((i: FeedItem) => i.status === "pending"));
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleApprove(id: number, mode: "once" | "always") {
    setActing(id);
    try {
      await approve(id, mode);
      setDismissed(prev => new Set(prev).add(id));
      setTimeout(() => refresh(), 400);
    } finally { setActing(null); }
  }

  async function handleDeny(id: number) {
    setActing(id);
    try {
      await deny(id, "once");
      setDismissed(prev => new Set(prev).add(id));
      setTimeout(() => refresh(), 400);
    } finally { setActing(null); }
  }

  const pending = items.filter(i => !dismissed.has(i.id));
  if (pending.length === 0) return null;

  return (
    <section style={{ paddingBottom: "48px" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px",
      }}>
        <span style={{ fontSize: "11px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--c-text-tertiary)" }}>
          Waiting for you
        </span>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "#f59e0b", display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", animation: "pulse 2s infinite" }} />
          {pending.length}
        </span>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      </div>

      <div style={{ border: "1px solid var(--c-border-subtle)" }}>
        {pending.map((item, i) => (
          <div key={item.id} style={{
            padding: "16px",
            borderBottom: i < pending.length - 1 ? "1px solid var(--c-border-subtle)" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)", margin: 0 }}>
                  {item.summary || toolName(item.tool)}
                </p>
                <code style={{ fontSize: "12px", fontFamily: "var(--font-mono, monospace)", color: "var(--c-text-tertiary)", display: "block", marginTop: "4px" }}>
                  {item.tool}
                </code>
              </div>
              <span style={{ fontSize: "11px", color: "var(--c-text-tertiary)", flexShrink: 0 }}>{timeAgo(item.createdAt)}</span>
            </div>

            {typeof item.args === "object" && item.args !== null && Object.keys(item.args as Record<string, unknown>).length > 0 && (
              <div style={{ marginTop: "12px", background: "var(--bg-elevated)", border: "1px solid var(--c-border-subtle)", padding: "12px" }}>
                {Object.entries(item.args as Record<string, unknown>).slice(0, 4).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: "8px", fontSize: "12px", lineHeight: 1.6 }}>
                    <span style={{ color: "var(--c-text-tertiary)", flexShrink: 0 }}>{k}:</span>
                    <span style={{ color: "var(--c-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {typeof v === "string" ? v : JSON.stringify(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "16px" }}>
              <button onClick={() => handleApprove(item.id, "always")} disabled={acting === item.id}
                style={{ height: 36, padding: "0 16px", fontSize: "12px", fontWeight: 500, background: "var(--c-text)", color: "var(--bg)", border: "none", cursor: "pointer", opacity: acting === item.id ? 0.4 : 1 }}>
                Allow
              </button>
              <button onClick={() => handleApprove(item.id, "once")} disabled={acting === item.id}
                style={{ height: 36, padding: "0 14px", fontSize: "12px", fontWeight: 500, background: "var(--bg-subtle)", color: "var(--c-text-secondary)", border: "none", cursor: "pointer", opacity: acting === item.id ? 0.4 : 1 }}>
                Once
              </button>
              <div style={{ flex: 1 }} />
              <button onClick={() => handleDeny(item.id)} disabled={acting === item.id}
                style={{ height: 36, padding: "0 14px", fontSize: "12px", fontWeight: 500, background: "none", color: "#ef4444", border: "none", cursor: "pointer", opacity: acting === item.id ? 0.4 : 1 }}>
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── User Proofs ── */

function UserProofs() {
  const [proofs, setProofs] = useState<ProofEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getProofs().then(d => setProofs(d.entries ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <section style={{ paddingBottom: "80px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--c-text-tertiary)" }}>
          Your Proofs
        </span>
        {proofs.length > 0 && (
          <span style={{ fontSize: "11px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--c-text-tertiary)" }}>
            {proofs.length} total
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ border: "1px solid var(--c-border-subtle)", padding: "32px 20px", color: "var(--c-text-tertiary)", fontSize: "13px" }}>
          Loading…
        </div>
      ) : proofs.length === 0 ? (
        <div style={{ border: "1px solid var(--c-border-subtle)", background: "var(--bg-elevated)", padding: "48px 24px", textAlign: "center" }}>
          <div style={{ color: "var(--c-text-secondary)", fontSize: "14px" }}>No proofs yet.</div>
          <div style={{ color: "var(--c-text-tertiary)", fontSize: "13px", marginTop: "6px" }}>
            Install OCC and start using Claude Code to see proofs here.
          </div>
          <code style={{ display: "block", marginTop: "16px", fontSize: "12px", fontFamily: "var(--font-mono, monospace)", color: "var(--c-text-tertiary)" }}>
            curl -fsSL https://agent.occ.wtf/install | bash
          </code>
        </div>
      ) : (
        <div style={{ border: "1px solid var(--c-border-subtle)" }}>
          {proofs.map((p, i) => {
            const key = p.id;
            const isOpen = expanded === key;
            const allowed = p.decision.allowed;
            const isLast = i === proofs.length - 1;

            return (
              <div key={key} style={{ borderBottom: isLast ? "none" : "1px solid var(--c-border-subtle)" }}>
                <ProofRowBtn onClick={() => setExpanded(isOpen ? null : key)} expanded={isOpen}>
                  <code style={{ fontSize: "12px", fontFamily: "var(--font-mono, monospace)", color: "var(--c-text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.proofDigestB64 || `#${p.id}`}
                  </code>
                  <span style={{ fontSize: "11px", fontWeight: 500, flexShrink: 0, marginLeft: "12px", color: allowed ? "#2563eb" : "#ef4444" }}>
                    {allowed ? "Allowed" : "Denied"}
                  </span>
                  <span className="hidden-mobile" style={{ fontSize: "11px", color: "var(--c-text-tertiary)", flexShrink: 0, marginLeft: "12px" }}>
                    {toolName(p.tool)}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--c-text-tertiary)", flexShrink: 0, marginLeft: "12px", width: "56px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {timeAgo(p.timestamp)}
                  </span>
                </ProofRowBtn>

                {isOpen && (
                  <div style={{ padding: "16px", background: "var(--bg-elevated)", borderTop: "1px solid var(--c-border-subtle)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {/* Digest */}
                      {p.proofDigestB64 && (
                        <div style={{ border: "1px solid var(--c-border-subtle)", background: "var(--bg)", overflow: "hidden" }}>
                          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--c-border-subtle)" }}>
                            <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--c-text-tertiary)" }}>SHA-256 Digest</span>
                          </div>
                          <div style={{ padding: "10px 14px" }}>
                            <code style={{ fontSize: "11px", fontFamily: "var(--font-mono, monospace)", color: "var(--c-text)", wordBreak: "break-all" }}>{p.proofDigestB64}</code>
                          </div>
                        </div>
                      )}

                      {/* Fields */}
                      <div style={{ border: "1px solid var(--c-border-subtle)", background: "var(--bg)", overflow: "hidden" }}>
                        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--c-border-subtle)" }}>
                          <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--c-text-tertiary)" }}>Details</span>
                        </div>
                        <div style={{ padding: "4px 14px" }}>
                          <DetailRow label="Tool" value={p.tool} mono />
                          <DetailRow label="Decision" value={allowed ? "Allowed" : "Denied"} color={allowed ? "#2563eb" : "#ef4444"} />
                          <DetailRow label="Time" value={new Date(p.timestamp).toLocaleString()} />
                          {p.agentId && <DetailRow label="Agent" value={p.agentId} />}
                          {p.decision.reason && <DetailRow label="Reason" value={p.decision.reason} />}
                        </div>
                      </div>

                      {/* Link to global explorer */}
                      {p.proofDigestB64 && (
                        <a href={`https://occ.wtf/explorer/${encodeURIComponent(p.proofDigestB64)}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                          View in Explorer
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── Public Message (not logged in) ── */

function PublicMessage() {
  return (
    <section style={{ paddingBottom: "80px" }}>
      <div style={{ border: "1px solid var(--c-border-subtle)", background: "var(--bg-elevated)", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ color: "var(--c-text-secondary)", fontSize: "14px" }}>Sign in to see your proofs.</div>
        <div style={{ color: "var(--c-text-tertiary)", fontSize: "13px", marginTop: "6px" }}>
          Every action your AI takes through OCC produces a cryptographic proof.
        </div>
      </div>
    </section>
  );
}

/* ── Shared components ── */

function ProofRowBtn({ onClick, expanded, children }: { onClick: () => void; expanded: boolean; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", height: "48px", padding: "0 16px",
        background: hovered ? "var(--bg-elevated)" : "transparent",
        border: "none", cursor: "pointer", textAlign: "left", gap: "10px",
        transition: "background 150ms ease",
      }}
    >
      <span style={{ color: "var(--c-text-tertiary)", display: "flex", alignItems: "center", flexShrink: 0, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 200ms ease" }}>
        <ChevronRight />
      </span>
      {children}
    </button>
  );
}

function DetailRow({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", padding: "7px 0", borderBottom: "1px solid var(--c-border-subtle)" }}>
      <span style={{ fontSize: "11px", color: "var(--c-text-tertiary)", flexShrink: 0, paddingTop: "1px" }}>{label}</span>
      <span style={{
        fontSize: mono ? "11px" : "12px",
        fontFamily: mono ? "var(--font-mono, monospace)" : "inherit",
        color: color ?? "var(--c-text)",
        wordBreak: "break-all", textAlign: "right",
        fontWeight: color ? 500 : 400,
      }}>{value}</span>
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import { getMe, getFeed, getProofs, approve, deny, revokeAuth, type FeedItem, type V2Proof } from "@/lib/api";

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [proofs, setProofs] = useState<V2Proof[]>([]);
  const [proofTotal, setProofTotal] = useState(0);
  const [proofSearch, setProofSearch] = useState("");
  const [proofSearchInput, setProofSearchInput] = useState("");
  const [showFullChain, setShowFullChain] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [view, setView] = useState<"main" | "settings">("main");
  const [chatOpen, setChatOpen] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const observerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  useEffect(() => { getMe().then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false)); }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [feedData, proofData] = await Promise.all([getFeed(), getProofs(PAGE_SIZE, 0, proofSearch)]);
      setFeed(feedData.requests ?? []);
      // Only update proofs if data changed (prevents resetting expanded state)
      const newProofs = proofData.proofs ?? [];
      setProofs(prev => {
        if (prev.length !== newProofs.length) return newProofs;
        const changed = newProofs.some((p, i) => p.id !== prev[i]?.id);
        return changed ? newProofs : prev;
      });
      setProofTotal(proofData.total ?? 0);
      setHasMore((proofData.proofs?.length ?? 0) < (proofData.total ?? 0));
    } catch {}
  }, [user, proofSearch, showFullChain]);

  const loadMore = useCallback(async () => {
    if (!user || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await getProofs(PAGE_SIZE, proofs.length, proofSearch);
      setProofs(prev => [...prev, ...(data.proofs ?? [])]);
      setHasMore(proofs.length + (data.proofs?.length ?? 0) < (data.total ?? 0));
    } catch {}
    setLoadingMore(false);
  }, [user, proofs.length, loadingMore, hasMore, proofSearch, showFullChain]);

  // Infinite scroll observer
  useEffect(() => {
    if (!observerRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { threshold: 0.1 });
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => {
    if (!user) return;
    refresh();
    pollingRef.current = setInterval(refresh, 5000);
    return () => clearInterval(pollingRef.current);
  }, [user, refresh]);

  async function handleApprove(id: number, mode: "once" | "always" = "once") {
    try { await approve(id, mode); } catch {}
    refresh();
  }
  async function handleDeny(id: number) { await deny(id); refresh(); }

  if (loading) return <div className="page-center"><div className="loader" /></div>;

  if (!user) return (
    <div>
      <div className="topnav-wrap"><nav className="topnav">
        <a href="https://occ.wtf" className="topnav-logo">OCC</a>
        <div className="topnav-links">
          <a href="https://occ.wtf/docs" className="topnav-link"><span>Docs</span></a>
          <a href="https://github.com/mikeargento/occ" className="topnav-link" target="_blank" rel="noopener"><span>GitHub</span></a>
        </div>
      </nav></div>
      <div className="page-center" style={{ minHeight: "calc(100vh - 52px)" }}>
        <div className="login-card">
          <h1 className="login-title">OCC</h1>
          <p className="login-sub">Define what your AI does.</p>
          <div className="login-buttons">
            <a href="/auth/login/github" className="auth-btn"><GithubIcon /> Continue with GitHub</a>
            <a href="/auth/login/google" className="auth-btn"><GoogleIcon /> Continue with Google</a>
            <a href="/auth/login/apple" className="auth-btn"><AppleIcon /> Continue with Apple</a>
          </div>
        </div>
      </div>
    </div>
  );

  const pending = feed.filter(r => r.status === "pending");

  return (
    <div>
      {/* ── Top Nav ── */}
      <div className="topnav-wrap"><nav className="topnav">
        <a href="https://occ.wtf" className="topnav-logo">OCC</a>
        <div className="topnav-links">
          <a href="/" className="topnav-link">
            <span>Dashboard</span>
          </a>
          <a href="https://occ.wtf/docs" className="topnav-link">
            <span>Docs</span>
          </a>
          <a href="https://github.com/mikeargento/occ" className="topnav-link" target="_blank" rel="noopener">
            <span>GitHub</span>
          </a>
          <div className="topnav-sep" />
          <button className="topnav-link" onClick={() => setChatOpen(!chatOpen)} style={{ color: chatOpen ? "var(--accent)" : undefined }} title="Ask OCC">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button className="topnav-link" onClick={() => setView(view === "settings" ? "main" : "settings")} style={{ color: view === "settings" ? "var(--text)" : undefined }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </nav></div>

      {/* ── Content ── */}
      {view === "main" ? (
        <div className="main-content">
          <h1 className="page-title" style={{ marginBottom: 32 }}>Welcome, {user.name?.split(" ")[0] || "there"}</h1>

          {/* Pending proposals */}
          {pending.length > 0 && (
            <>
              <div className="section-header" style={{ marginTop: 0 }}>
                <span className="section-label">Awaiting Your Authority</span>
                <span className="section-count">{pending.length} waiting</span>
              </div>
              {pending.map(item => (
                <Proposal key={item.id} item={item} onApprove={handleApprove} onDeny={handleDeny} />
              ))}
            </>
          )}

          {/* Proof chain */}
          <div className="section-header" style={pending.length === 0 ? { marginTop: 0 } : undefined}>
            <span className="section-label">Explorer</span>
            {proofTotal > 0 && <span className="section-count">{proofTotal.toLocaleString()} proofs</span>}
          </div>

          {/* Search */}
          <div className="explorer-search">
            <input
              className="explorer-search-input"
              type="text"
              placeholder="Search by tool, agent, digest..."
              value={proofSearchInput}
              onChange={e => setProofSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setProofSearch(proofSearchInput); } }}
            />
            {proofSearch && (
              <button className="explorer-search-clear" onClick={() => { setProofSearch(""); setProofSearchInput(""); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          {proofs.length === 0 ? (
            <div className="section-empty">
              <div>{proofSearch ? "No proofs match your search." : "No proofs yet."}</div>
              <div className="section-empty-sub">{proofSearch ? "Try a different search term." : "When you authorize an action, the proof appears here."}</div>
            </div>
          ) : (
            <div className="explorer-list">
              {proofs.map(p => <ExplorerRow key={p.id} proof={p} onRefresh={refresh} />)}
            </div>
          )}

          {/* Infinite scroll trigger */}
          {hasMore && <div ref={observerRef} style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {loadingMore && <div className="loader" style={{ width: 18, height: 18 }} />}
          </div>}
        </div>
      ) : (
        <SettingsView user={user} />
      )}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </div>
  );
}

/* ── Proposal ── */
/* ── Markdown renderer for chat ── */
const mdComponents = {
  h1: (p: any) => <div className="chat-h1" {...p} />,
  h2: (p: any) => <div className="chat-h2" {...p} />,
  h3: (p: any) => <div className="chat-h3" {...p} />,
  p: (p: any) => <div style={{ marginBottom: 8 }} {...p} />,
  ul: (p: any) => <div style={{ paddingLeft: 16, marginBottom: 8 }} {...p} />,
  ol: (p: any) => <div style={{ paddingLeft: 16, marginBottom: 8 }} {...p} />,
  li: (p: any) => <div className="chat-li" {...p} />,
  code: ({ className, children, ...rest }: any) => {
    const isBlock = className?.includes("language-");
    return isBlock
      ? <pre className="chat-code"><code {...rest}>{children}</code></pre>
      : <code className="chat-inline-code" {...rest}>{children}</code>;
  },
  pre: ({ children }: any) => <>{children}</>,
  a: (p: any) => <a className="chat-link" target="_blank" rel="noopener" {...p} />,
  blockquote: (p: any) => <div className="chat-blockquote" {...p} />,
  table: (p: any) => <div style={{ overflowX: "auto", marginBottom: 8 }}><table className="chat-table" {...p} /></div>,
  th: (p: any) => <th className="chat-th" {...p} />,
  td: (p: any) => <td className="chat-td" {...p} />,
  hr: () => <div style={{ borderTop: "1px solid var(--border-light)", margin: "12px 0" }} />,
};

/* ── Chat Panel ── */
function ChatPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function send(preset?: string) {
    const text = preset || input.trim();
    if (!text || sending) return;
    const userMsg = { role: "user" as const, content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (data.response) {
        setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to reach the server." }]);
    }
    setSending(false);
  }

  return (
    <div className="chat-overlay" onClick={onClose}>
      <div className="chat-panel" onClick={e => e.stopPropagation()}>
        <div className="chat-header">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Ask OCC</span>
          <button className="explorer-close-btn" onClick={onClose} style={{ width: 26, height: 26 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="chat-messages">
          {messages.length === 0 && (
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 8, textAlign: "center" }}>Suggestions</div>
              {[
                "What was my last proof?",
                "What tools have I authorized?",
                "Is my data private?",
                "Do I need my own TEE?",
                "How does OCC work?",
              ].map(q => (
                <button key={q} className="chat-suggestion" onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role === "user" ? "chat-msg-user" : "chat-msg-assistant"}`}>
              {m.role === "user" ? m.content : <Markdown components={mdComponents}>{m.content}</Markdown>}
            </div>
          ))}
          {sending && <div className="chat-msg chat-msg-assistant" style={{ opacity: 0.5 }}>Thinking...</div>}
          <div ref={endRef} />
        </div>
        <div className="chat-input-area">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask anything about OCC..."
            rows={1}
          />
          <button className="chat-send" onClick={() => send()} disabled={sending || !input.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Proposal ── */
function Proposal({ item, onApprove, onDeny }: { item: FeedItem; onApprove: (id: number, mode: "once" | "always") => void; onDeny: (id: number) => void }) {
  const [acting, setActing] = useState<string | null>(null);
  const toolName = item.tool.startsWith("mcp__") ? (item.tool.split("__").pop() || item.tool).replace(/[_-]/g, " ") : item.tool;
  const args = (item.args && typeof item.args === "object" ? item.args : {}) as Record<string, unknown>;
  const target = extractTarget(args);

  // Parse risk from summary (format: "summary — warning1, warning2")
  const summaryParts = (item.summary || "").split(" — ");
  const riskSummary = summaryParts[0];
  const warnings = summaryParts[1]?.split(", ").filter(Boolean) ?? [];
  const riskLane = item.riskLane || "unknown";
  const severityColor = riskLane === "read_only" ? "var(--green)" : riskLane === "file_modification" ? "var(--accent)" : riskLane === "credential_access" || riskLane === "financial" || riskLane === "deployment" ? "var(--red)" : "var(--text-tertiary)";

  async function act(action: string, fn: () => void) {
    setActing(action);
    fn();
  }

  return (
    <div className="proposal" style={acting ? { opacity: 0.6, pointerEvents: "none" } : undefined}>
      <div className="proposal-header">
        <span className="proposal-id">#{item.id}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="proposal-risk-badge" style={{ color: severityColor, borderColor: severityColor }}>{riskLane.replace(/_/g, " ")}</span>
          <span className="proposal-time">{new Date(item.createdAt).toLocaleString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: 4 }}>Proposed Action</div>
      <div className="proposal-action">
        <span className="proposal-icon">{riskIcon(riskLane)}</span>
        {toolName}
      </div>
      {target && <div className="proposal-target">{target}</div>}
      {riskSummary && <div className="proposal-reason">{riskSummary}</div>}
      {warnings.length > 0 && (
        <div className="proposal-warnings">
          {warnings.map((w, i) => <span key={i} className="proposal-warning">⚠ {w}</span>)}
        </div>
      )}
      {Object.keys(args).length > 0 && <pre className="proposal-args">{JSON.stringify(args, null, 2)}</pre>}
      {acting ? (
        <div className="proposal-progress">
          <div className="proposal-progress-bar" />
          <span className="proposal-progress-text">{acting === "deny" ? "Denying..." : "Authorizing..."}</span>
        </div>
      ) : (
        <div className="proposal-buttons">
          <button className="proposal-btn proposal-btn-deny" onClick={() => act("deny", () => onDeny(item.id))}>Deny</button>
          <button className="proposal-btn proposal-btn-approve" onClick={() => act("approve", () => onApprove(item.id, "once"))}>Authorize</button>
          <button className="proposal-btn proposal-btn-always" onClick={() => act("always", () => onApprove(item.id, "always"))}>Always Authorize</button>
        </div>
      )}
    </div>
  );
}

function riskIcon(lane: string): string {
  switch (lane) {
    case "read_only": return "👁";
    case "file_modification": return "📁";
    case "external_comms": return "📧";
    case "deployment": return "🚀";
    case "financial": return "💳";
    case "credential_access": return "🔑";
    default: return "⚡";
  }
}

function extractTarget(args: Record<string, unknown>): string | null {
  for (const key of ["file_path", "path", "url", "to", "command", "recipient", "target"]) {
    if (args[key] && typeof args[key] === "string") return String(args[key]);
  }
  return null;
}

/* ── Explorer Row ── */
function ExplorerRow({ proof: p, onRefresh }: { proof: V2Proof; onRefresh?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const toggle = () => setExpanded(e => !e);

  async function handleRevoke() {
    if (!confirm(`Revoke standing authorization for "${p.tool}"?`)) return;
    setRevoking(true);
    try {
      await revokeAuth(String(p.tool), String(p.agentId));
      onRefresh?.();
    } catch {}
    setRevoking(false);
  }
  const receipt = p.receipt as Record<string, unknown> | undefined;
  const commit = receipt?.commit as Record<string, unknown> | undefined;
  const env = receipt?.environment as Record<string, unknown> | undefined;
  const signer = receipt?.signer as Record<string, unknown> | undefined;
  const timestamps = receipt?.timestamps as Record<string, unknown> | undefined;
  const enforcement = (env?.enforcement as string) || "stub";
  const commitTime = (commit?.time as number) || null;
  const hasTsa = !!timestamps;
  const policy = receipt?.policy as Record<string, unknown> | undefined;
  const principal = receipt?.principal as Record<string, unknown> | undefined;

  return (
    <div className="explorer-row-wrap">
      <div className="explorer-row" onClick={toggle}>
        <button className="explorer-chevron" onClick={(e) => { e.stopPropagation(); toggle(); }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}>
            <path d="M3 1.5L7 5L3 8.5" />
          </svg>
        </button>
        <span className={`explorer-dot ${p.allowed ? "explorer-dot-allowed" : "explorer-dot-denied"}`} />
        <div className="explorer-row-info">
          <span className="explorer-row-tool">{p.tool}</span>
          <span className="explorer-row-agent">{p.agentId}</span>
        </div>
        <span className={`explorer-badge ${enforcement === "measured-tee" ? "explorer-badge-tee" : enforcement === "hw-key" ? "explorer-badge-hw" : "explorer-badge-sw"}`}>
          {enforcement === "measured-tee" ? "Hardware Enclave" : enforcement === "hw-key" ? "Hardware Key" : "Software"}
        </span>
        <div className="explorer-row-icons">
          {hasTsa && (
            <span className="explorer-icon-tsa" title="RFC 3161 timestamped">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            </span>
          )}
          <span className="explorer-row-time">{commitTime ? relativeTime(commitTime) : "—"}</span>
        </div>
      </div>

      {expanded && (
        <div className="explorer-expanded">
          {/* Close button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div className="explorer-summary">
              <span className={p.allowed ? "explorer-summary-allowed" : "explorer-summary-denied"}>
                {p.allowed ? "Allowed" : "Denied"}
              </span>
              {" "}<strong>{String(p.tool)}</strong>{" by "}<strong>{String(p.agentId)}</strong>
              {commitTime ? ` at ${new Date(commitTime).toLocaleString()}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {p.allowed && (
                <button onClick={(e) => { e.stopPropagation(); handleRevoke(); }} disabled={revoking} style={{
                  fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 6,
                  border: "1px solid var(--red, #ef4444)", background: "transparent",
                  color: "var(--red, #ef4444)", cursor: revoking ? "wait" : "pointer",
                  opacity: revoking ? 0.5 : 1, transition: "all 0.2s",
                  fontFamily: "inherit",
                }}>
                  {revoking ? "Revoking..." : "Revoke"}
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); setExpanded(false); }} className="explorer-close-btn" title="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <div className="explorer-sections">

            {/* Arguments (only if present) */}
            {(p.args && typeof p.args === "object" && Object.keys(p.args as Record<string, unknown>).length > 0) ? (
              <div className="explorer-section">
                <div className="explorer-section-title">Arguments</div>
                <pre className="explorer-detail-args">{JSON.stringify(p.args, null, 2)}</pre>
              </div>
            ) : null}

            {/* Artifact */}
            {p.proofDigest && (
              <div className="explorer-section">
                <div className="explorer-section-title">Artifact</div>
                <div className="explorer-section-body">
                  <ProofField label="Digest (SHA-256)" value={p.proofDigest} mono />
                  {receipt?.version ? <ProofField label="Version" value={String(receipt.version)} /> : null}
                </div>
              </div>
            )}

            {/* Commit */}
            {commit && (
              <div className="explorer-section">
                <div className="explorer-section-title">Commit</div>
                <div className="explorer-section-body">
                  {commitTime != null && <ProofField label="Time" value={new Date(commitTime).toLocaleString()} />}
                  {commit.counter != null && <ProofField label="Counter" value={`#${String(commit.counter)}`} />}
                  {commit.chainId ? <ProofField label="Chain ID" value={String(commit.chainId)} mono /> : null}
                  {commit.epochId ? <ProofField label="Epoch ID" value={String(commit.epochId)} mono /> : null}
                  {commit.prevB64 ? <ProofField label="Previous Hash" value={String(commit.prevB64)} mono /> : null}
                  {commit.nonceB64 ? <ProofField label="Nonce" value={String(commit.nonceB64)} mono /> : null}
                </div>
              </div>
            )}

            {/* Signer */}
            {signer && (
              <div className="explorer-section">
                <div className="explorer-section-title">Signer</div>
                <div className="explorer-section-body">
                  {(signer as any).publicKeyB64 && <ProofField label="Public Key" value={String((signer as any).publicKeyB64)} mono />}
                  {(signer as any).signatureB64 && <ProofField label="Signature" value={String((signer as any).signatureB64)} mono />}
                </div>
              </div>
            )}

            {/* Environment */}
            {env && (
              <div className="explorer-section">
                <div className="explorer-section-title">Environment</div>
                <div className="explorer-section-body">
                  <ProofField label="Enforcement" value={enforcement === "measured-tee" ? "Hardware Enclave (AWS Nitro)" : enforcement === "hw-key" ? "Hardware Key" : "Software"} color={enforcement === "measured-tee" ? "#3b82f6" : undefined} />
                  {(env as any).measurement && <ProofField label="Measurement" value={String((env as any).measurement)} mono />}
                </div>
              </div>
            )}

            {/* Principal */}
            {principal && (
              <div className="explorer-section">
                <div className="explorer-section-title">Principal</div>
                <div className="explorer-section-body">
                  <ProofField label="Provider" value={String((principal as any).provider || "unknown")} />
                  <ProofField label="ID" value={String((principal as any).id || "—")} mono />
                </div>
              </div>
            )}

            {/* Policy */}
            {policy && (
              <div className="explorer-section">
                <div className="explorer-section-title">Policy</div>
                <div className="explorer-section-body">
                  {(policy as any).name && <ProofField label="Name" value={String((policy as any).name)} />}
                  {(policy as any).digestB64 && <ProofField label="Digest" value={String((policy as any).digestB64)} mono />}
                </div>
              </div>
            )}

            {/* Timestamps */}
            {timestamps && (
              <div className="explorer-section">
                <div className="explorer-section-title">Timestamps</div>
                <div className="explorer-section-body">
                  {(timestamps as any)?.artifact?.authority && <ProofField label="Authority" value={String((timestamps as any).artifact.authority)} />}
                  {(timestamps as any)?.artifact?.time && <ProofField label="Time" value={String((timestamps as any).artifact.time)} />}
                </div>
              </div>
            )}
          </div>

          {/* Full JSON */}
          {receipt && <CopyableJson data={receipt} />}

          {!receipt && p.reason && (
            <div className="explorer-detail-field">
              <div className="explorer-detail-label">Reason</div>
              <span style={{ color: "var(--red)" }}>{p.reason}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Copyable JSON ── */
function CopyableJson({ data }: { data: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);
  function handleClick() {
    navigator.clipboard.writeText(json).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <div style={{ position: "relative", marginTop: 12 }}>
      <pre className="explorer-json" onClick={handleClick}>{json}</pre>
      <span className={`copy-badge ${copied ? "copy-badge-show" : ""}`}>{copied ? "Copied!" : "Click to copy"}</span>
    </div>
  );
}

/* ── Settings View ── */
function SettingsView({ user }: { user: { id: string; name: string; email: string; avatar: string } }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/token").then(r => r.ok ? r.json() : null).then(d => { if (d?.token) setToken(d.token); }).catch(() => {});
  }, []);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="settings-container">
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Account and configuration</p>

      {/* Account */}
      <div className="settings-section">
        <div className="settings-label">Account</div>
        <div className="settings-card">
          <div className="settings-row">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {user.avatar ? <img src={user.avatar} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} /> : null}
              <div>
                <div className="settings-row-label">{user.name || "—"}</div>
                <div className="settings-row-desc">{user.email || "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Setup */}
      {token && (
        <div className="settings-section">
          <div className="settings-label">Setup</div>
          <div className="settings-card">
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="settings-row-label">OCC Token</div>
                <button onClick={() => copy(token, "token")} className="settings-btn settings-btn-primary" style={{ height: 32, fontSize: 13 }}>
                  {copied === "token" ? "Copied!" : "Copy"}
                </button>
              </div>
              <code style={{ fontSize: 12, fontFamily: "'SF Mono', monospace", color: "var(--text-secondary)", wordBreak: "break-all", lineHeight: 1.5 }}>{token}</code>
            </div>
            <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div className="settings-row-label">Quick setup</div>
              <div className="settings-code">
                curl -fsSL https://agent.occ.wtf/install | bash{"\n"}
                export OCC_TOKEN={token}
              </div>
              <button onClick={() => copy(`curl -fsSL https://agent.occ.wtf/install | bash\nexport OCC_TOKEN=${token}`, "cmd")} className="settings-btn settings-btn-primary" style={{ width: "100%", marginTop: 4 }}>
                {copied === "cmd" ? "Copied!" : "Copy setup commands"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign out */}
      <div className="settings-section">
        <a href="/auth/logout" className="settings-btn settings-btn-danger" style={{ display: "block", textAlign: "center", textDecoration: "none", lineHeight: "44px", width: "100%", borderRadius: 10 }}>
          Sign out
        </a>
      </div>
    </div>
  );
}

/* ── Proof Field ── */
function ProofField({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isLong = value.length > 64;
  const displayValue = isLong && !expanded ? value.slice(0, 48) + "..." : value;
  return (
    <div className="proof-field">
      <span className="proof-field-label">{label}</span>
      <span
        className={`proof-field-value ${mono ? "proof-field-mono" : ""} ${isLong ? "proof-field-expandable" : ""}`}
        style={color ? { color } : undefined}
        onClick={isLong ? () => setExpanded(!expanded) : undefined}
      >
        {displayValue}
      </span>
      {(isLong || value.length > 30) && (
        <button className="proof-field-copy" onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} title="Copy full value">
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          )}
        </button>
      )}
    </div>
  );
}

/* ── Helpers ── */
function truncate(s: string, len = 32): string { return s && s.length > len ? s.slice(0, len) + "..." : s || "—"; }

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* ── Icons ── */
function GithubIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>; }
function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>; }
function AppleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>; }

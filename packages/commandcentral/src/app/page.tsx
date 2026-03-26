"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  v2GetRequests,
  v2ApproveRequest,
  v2DenyRequest,
  v2GetRequest,
  v2SeedDemo,
} from "@/lib/api-v2";
import type { V2Request, V2RequestDetail } from "@/lib/types-v2";

// ── Helpers ──

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusColor(s: string): string {
  if (s === "pending") return "#f59e0b";
  if (s === "approved" || s === "auto_approved") return "#22c55e";
  if (s === "denied") return "#ef4444";
  return "#999";
}

function statusLabel(s: string): string {
  if (s === "approved" || s === "auto_approved") return "Allowed";
  if (s === "denied") return "Denied";
  if (s === "expired") return "Expired";
  return "";
}

// ── Login ──

function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-5xl font-black tracking-tight text-black mb-2">OCC</h1>
        <p className="text-lg text-[#666] mb-5">Control what your AI agents do.</p>
        <div className="flex flex-col gap-3">
          <a
            href="/auth/login/github"
            className="flex items-center justify-center gap-2 h-12 bg-black text-white text-sm font-semibold hover:opacity-90 transition-opacity w-full"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Continue with GitHub
          </a>
          <a
            href="/auth/login/google"
            className="flex items-center justify-center gap-2 h-12 bg-white border border-[#d9d9d9] text-black text-sm font-semibold hover:bg-[#f5f5f5] transition-colors w-full"
          >
            Continue with Google
          </a>
          <a
            href="/auth/login/apple"
            className="flex items-center justify-center gap-2 h-12 bg-black text-white text-sm font-semibold hover:opacity-90 transition-opacity w-full"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43zm3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422.212-2.189 1.675-2.789 1.698-2.854.023-.065-.597-.79-1.254-1.157a3.692 3.692 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56.244.729.625 1.924 1.273 2.796.576.984 1.34 1.667 1.659 1.899.319.232 1.219.386 1.843.067.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758.347-.79.505-1.217.473-1.282z" />
            </svg>
            Continue with Apple
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Feed Item ──

function FeedItem({
  req,
  expanded,
  detail,
  onToggle,
  onApprove,
  onDeny,
  acting,
}: {
  req: V2Request;
  expanded: boolean;
  detail: V2RequestDetail | null;
  onToggle: () => void;
  onApprove: (id: number) => void;
  onDeny: (id: number) => void;
  acting: boolean;
}) {
  const isPending = req.status === "pending";
  const color = statusColor(req.status);

  return (
    <div className="border-b border-[#e5e5e5]">
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[#fafafa] transition-colors"
        onClick={onToggle}
      >
        <div
          className="w-[2px] self-stretch shrink-0 mt-1"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold font-mono text-black truncate">
              {req.tool}
            </span>
            <span className="text-xs text-[#666] truncate">
              {(req.agentId ?? "").slice(0, 12)}
            </span>
            <span className="text-xs text-[#999] ml-auto shrink-0">
              {timeAgo(req.createdAt)}
            </span>
          </div>
          {req.summary && (
            <p className="text-sm text-[#666] mt-0.5 truncate">{req.summary}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            {isPending ? (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={(e) => { e.stopPropagation(); onApprove(req.id); }}
                  disabled={acting}
                  className="h-7 px-3 text-xs font-semibold border border-[#22c55e] text-[#22c55e] hover:bg-[rgba(34,197,94,0.08)] disabled:opacity-40 transition-colors"
                >
                  Allow
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeny(req.id); }}
                  disabled={acting}
                  className="h-7 px-3 text-xs font-semibold border border-[#ef4444] text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)] disabled:opacity-40 transition-colors"
                >
                  Deny
                </button>
              </div>
            ) : (
              <span className="text-xs ml-auto" style={{ color }}>
                {statusLabel(req.status)}
              </span>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="bg-[#efefef] px-4 py-3 mx-4 mb-3">
          {detail ? (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1">
                  Arguments
                </p>
                <pre className="text-xs font-mono text-[#333] whitespace-pre-wrap break-all">
                  {JSON.stringify(detail.args, null, 2)}
                </pre>
              </div>
              {detail.decisions?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1">
                    Decision
                  </p>
                  {detail.decisions.map((d) => (
                    <div key={d.id} className="text-xs text-[#333]">
                      <span className="font-semibold">{d.decision}</span>
                      {d.reason && <span> &mdash; {d.reason}</span>}
                      <span className="text-[#999] ml-2">{d.mode}</span>
                    </div>
                  ))}
                </div>
              )}
              {detail.decisions?.some((d) => d.proofDigest) && (
                <div>
                  <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1">
                    Proof Digest
                  </p>
                  <code className="text-[11px] font-mono text-[#333] break-all">
                    {detail.decisions.find((d) => d.proofDigest)?.proofDigest}
                  </code>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-[#999]">Loading...</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

export default function FeedPage() {
  const [user, setUser] = useState<{ name: string; avatar: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<V2Request[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, V2RequestDetail>>({});
  const [acting, setActing] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      const data = await v2GetRequests({ limit: 50 });
      setRequests(data);
    } catch {
      // silent
    }
  }, []);

  // Auth check
  useEffect(() => {
    fetch("/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Initial load + polling
  useEffect(() => {
    if (!user) return;
    loadRequests();
    const iv = setInterval(loadRequests, 5000);
    return () => clearInterval(iv);
  }, [user, loadRequests]);

  // Load detail on expand
  useEffect(() => {
    if (expandedId === null) return;
    if (details[expandedId]) return;
    v2GetRequest(expandedId)
      .then((d) => setDetails((prev) => ({ ...prev, [expandedId]: d })))
      .catch(() => {});
  }, [expandedId, details]);

  const handleApprove = async (id: number) => {
    setActing(true);
    try {
      await v2ApproveRequest(id, "once");
      await loadRequests();
    } finally {
      setActing(false);
    }
  };

  const handleDeny = async (id: number) => {
    setActing(true);
    try {
      await v2DenyRequest(id, "once");
      await loadRequests();
    } finally {
      setActing(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await v2SeedDemo();
      await loadRequests();
    } finally {
      setSeeding(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-5 h-5 border-2 border-[#d9d9d9] border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  // Not authed
  if (!user) return <Login />;

  // Authed — feed
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 h-12 bg-white border-b border-[#d9d9d9] flex items-center justify-between px-4">
        <span className="text-lg font-black tracking-tight text-black">OCC</span>
        <div className="flex items-center gap-3">
          <Link href="/settings" className="text-[#999] hover:text-black transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {user.avatar ? (
            <img src={user.avatar} alt="" className="w-7 h-7 rounded-full" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[#d9d9d9] flex items-center justify-center text-xs font-semibold text-[#666]">
              {user.name?.[0]?.toUpperCase() ?? "U"}
            </div>
          )}
        </div>
      </header>

      {/* Feed */}
      <main className="max-w-2xl mx-auto">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center px-4">
            <p className="text-sm font-semibold text-black mb-1">No activity yet</p>
            <p className="text-sm text-[#666] mb-6">Connect an agent to get started</p>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="h-9 px-5 text-sm font-semibold border border-[#d9d9d9] text-black hover:bg-[#f5f5f5] disabled:opacity-50 transition-colors"
            >
              {seeding ? "Seeding..." : "Seed demo data"}
            </button>
          </div>
        ) : (
          requests.map((req) => (
            <FeedItem
              key={req.id}
              req={req}
              expanded={expandedId === req.id}
              detail={details[req.id] ?? null}
              onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
              onApprove={handleApprove}
              onDeny={handleDeny}
              acting={acting}
            />
          ))
        )}
      </main>
    </div>
  );
}

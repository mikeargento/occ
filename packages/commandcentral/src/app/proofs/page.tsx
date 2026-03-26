"use client";

import { useEffect, useState, useCallback } from "react";
import { FileCheck, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { v2GetProofs, v2GetOverview } from "@/lib/api-v2";
import type { V2Proof, V2Overview } from "@/lib/types-v2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function DecisionBadge({ allowed }: { allowed: boolean }) {
  if (allowed) {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium"
        style={{
          color: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.1)",
          border: "1px solid rgba(34,197,94,0.3)",
        }}
      >
        Allowed
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium"
      style={{
        color: "#ef4444",
        backgroundColor: "rgba(239,68,68,0.1)",
        border: "1px solid rgba(239,68,68,0.3)",
      }}
    >
      Denied
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expanded Proof Detail
// ---------------------------------------------------------------------------

function ProofDetail({ proof }: { proof: V2Proof }) {
  return (
    <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)]">
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Full Digest
          </span>
          <p className="text-[11px] font-mono text-[var(--text-primary)] mt-0.5 break-all">
            {proof.proofDigest || "—"}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Reason
          </span>
          <p className="text-xs text-[var(--text-primary)] mt-0.5">
            {proof.reason || "—"}
          </p>
        </div>
      </div>

      {proof.args != null && (
        <details className="mb-2">
          <summary className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider cursor-pointer select-none">
            Arguments
          </summary>
          <pre className="mt-1 p-2 bg-[var(--bg-elevated)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(proof.args, null, 2)}
          </pre>
        </details>
      )}

      {proof.receipt != null && (
        <details className="mb-2">
          <summary className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider cursor-pointer select-none">
            Receipt
          </summary>
          <pre className="mt-1 p-2 bg-[var(--bg-elevated)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(proof.receipt, null, 2)}
          </pre>
        </details>
      )}

      {proof.output != null && (
        <details>
          <summary className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider cursor-pointer select-none">
            Output
          </summary>
          <pre className="mt-1 p-2 bg-[var(--bg-elevated)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(proof.output, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proof Row
// ---------------------------------------------------------------------------

function ProofRow({
  proof,
  expanded,
  onToggle,
}: {
  proof: V2Proof;
  expanded: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <div
        className="flex items-center gap-3 py-2.5 px-3 cursor-pointer hover:bg-[rgba(59,130,246,0.03)] transition-colors"
        onClick={() => onToggle(proof.id)}
      >
        <span className="text-xs font-mono text-[var(--text-tertiary)] shrink-0 w-10">
          #{proof.id}
        </span>
        <span className="text-sm font-mono font-medium text-[var(--text-primary)] truncate flex-shrink-0 max-w-[180px]">
          {proof.tool}
        </span>
        <span className="text-xs text-[var(--text-tertiary)] shrink-0">
          {proof.agentId.slice(0, 8)}
        </span>
        <DecisionBadge allowed={proof.allowed} />
        <span className="text-[11px] font-mono text-[var(--text-tertiary)] truncate flex-1 min-w-0">
          {proof.proofDigest ? proof.proofDigest.slice(0, 24) + "..." : "—"}
        </span>
        <span className="text-xs text-[var(--text-tertiary)] shrink-0 w-14 text-right">
          {timeAgo(proof.createdAt)}
        </span>
      </div>
      {expanded && <ProofDetail proof={proof} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export default function ProofsPage() {
  const [overview, setOverview] = useState<V2Overview | null>(null);
  const [proofs, setProofs] = useState<V2Proof[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      const [ov, p] = await Promise.all([
        v2GetOverview(),
        v2GetProofs({
          tool: search || undefined,
          limit: PAGE_SIZE,
          offset,
        }),
      ]);
      setOverview(ov);
      setProofs(p);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [search, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (v: string) => {
    setSearch(v);
    setOffset(0);
  };

  return (
    <Shell pendingCount={overview?.pending}>
      <PageHeader title="Proofs" description="Cryptographic proof records" />

      {error && (
        <div className="mb-4 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 mb-4">
        <Search size={14} className="text-[var(--text-tertiary)]" />
        <input
          type="text"
          placeholder="Search by tool name or digest..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="flex-1 h-7 px-2 text-xs bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none max-w-sm"
        />
      </div>

      {/* Table header */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider border-b border-[var(--border)]">
        <span className="w-10">ID</span>
        <span className="max-w-[180px] flex-shrink-0">Tool</span>
        <span className="shrink-0">Agent</span>
        <span className="shrink-0">Decision</span>
        <span className="flex-1">Digest</span>
        <span className="w-14 text-right">Time</span>
      </div>

      {proofs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
          <FileCheck size={32} className="mb-3 opacity-40" />
          <p className="text-sm">No proofs found</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border)]">
          {proofs.map((proof) => (
            <ProofRow
              key={proof.id}
              proof={proof}
              expanded={expanded === proof.id}
              onToggle={(id) => setExpanded((prev) => (prev === id ? null : id))}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <button
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0}
          className="inline-flex items-center gap-1 border border-[var(--border)] px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--bg-elevated)] disabled:opacity-40 text-[var(--text-secondary)]"
        >
          <ChevronLeft size={14} />
          Previous
        </button>
        <span className="text-xs text-[var(--text-tertiary)]">
          Showing {offset + 1}–{offset + proofs.length}
        </span>
        <button
          onClick={() => setOffset(offset + PAGE_SIZE)}
          disabled={proofs.length < PAGE_SIZE}
          className="inline-flex items-center gap-1 border border-[var(--border)] px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--bg-elevated)] disabled:opacity-40 text-[var(--text-secondary)]"
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </Shell>
  );
}

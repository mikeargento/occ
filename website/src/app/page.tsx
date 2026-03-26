"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { OCCProof } from "@/lib/occ";
import {
  toUrlSafeB64,
  truncateHash,
  relativeTime,
  enforcementLabel,
  enforcementColor,
} from "@/lib/explorer";

/* ── Types ── */

interface ProofSummary {
  id: number;
  digestB64: string;
  counter: string | null;
  commitTime: number | null;
  enforcement: string;
  signerPub: string;
  hasAgency: boolean;
  hasTsa: boolean;
  attrName: string | null;
  indexedAt: string;
}

/* ── Page ── */

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProofSummary[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [recent, setRecent] = useState<ProofSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 20;
  const totalPages = Math.ceil(total / perPage);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/proofs?limit=${perPage}&page=${page}`)
      .then((r) => r.json())
      .then((data) => {
        setRecent(data.proofs ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const res = await fetch(`/api/proofs/search?q=${encodeURIComponent(searchQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.proofs ?? []);
      }
    } catch {}
    setSearching(false);
  }, [searchQuery]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      {/* Hero */}
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
        Define what your AI does.
      </h1>

      {/* Search */}
      <div className="mt-12">
        <h2 className="text-sm font-medium text-text-tertiary uppercase tracking-wider mb-4">
          Search
        </h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by digest, attribution, signer key, or counter..."
            className="flex-1 h-12 border border-border-subtle bg-bg-elevated px-4 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-text/30 transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={searching || searchQuery.trim().length < 2}
            className="h-12 px-6 bg-text text-bg text-sm font-medium hover:bg-text/90 transition-colors disabled:opacity-40"
          >
            {searching ? "..." : "Search"}
          </button>
        </div>

        {searchResults !== null && (
          <div className="mt-4">
            {searchResults.length === 0 ? (
              <div className="text-sm text-text-tertiary">No results found.</div>
            ) : (
              <ProofTable proofs={searchResults} label={`${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`} />
            )}
          </div>
        )}
      </div>

      {/* Recent Proofs */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-text-tertiary uppercase tracking-wider">
            Recent Proofs
          </h2>
          {total > 0 && (
            <span className="text-xs text-text-tertiary">{total.toLocaleString()} total</span>
          )}
        </div>

        {loading ? (
          <div className="text-sm text-text-tertiary animate-pulse">Loading...</div>
        ) : recent.length === 0 ? (
          <div className="border border-border-subtle bg-bg-elevated p-8 text-center">
            <div className="text-text-secondary">No proofs yet.</div>
            <div className="text-sm text-text-tertiary mt-1">
              Install OCC and start using Claude Code to see proofs here.
            </div>
          </div>
        ) : (
          <>
            <ProofTable proofs={recent} />
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-medium border border-border-subtle bg-bg-elevated text-text-secondary hover:text-text hover:border-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-xs text-text-tertiary px-3">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-medium border border-border-subtle bg-bg-elevated text-text-secondary hover:text-text hover:border-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Proof Table ── */

function ProofTable({ proofs, label }: { proofs: ProofSummary[]; label?: string }) {
  return (
    <div className="border border-border-subtle bg-bg-elevated overflow-hidden">
      {label && (
        <div className="px-5 py-3 border-b border-border-subtle">
          <span className="text-xs text-text-tertiary">{label}</span>
        </div>
      )}
      <div className="divide-y divide-border-subtle">
        {proofs.map((p) => (
          <ProofRow key={p.id} proof={p} />
        ))}
      </div>
    </div>
  );
}

function ProofRow({ proof: p }: { proof: ProofSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<OCCProof | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail) {
      setLoading(true);
      try {
        const res = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(p.digestB64))}`);
        if (res.ok) {
          const data = await res.json();
          const first = data.proofs?.[0]?.proof ?? data.proof;
          if (first) setDetail(first);
        }
      } catch {}
      setLoading(false);
    }
  }, [expanded, detail, p.digestB64]);

  return (
    <div>
      <button
        onClick={toggle}
        className="w-full flex items-center px-4 sm:px-5 py-3.5 hover:bg-bg-subtle/40 transition-colors text-left"
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`shrink-0 mr-2 sm:mr-3 text-text-tertiary transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        >
          <path d="M3 1.5L7 5L3 8.5" />
        </svg>
        <code className="text-xs sm:text-sm font-mono text-text truncate min-w-0 flex-1">
          {p.digestB64}
        </code>
        <span className={`text-[10px] sm:text-xs font-medium shrink-0 ml-3 ${enforcementColor(p.enforcement)}`}>
          <span className="hidden sm:inline">{enforcementLabel(p.enforcement)}</span>
          <span className="sm:hidden">{p.enforcement === "measured-tee" ? "TEE" : p.enforcement === "hw-key" ? "HW" : "SW"}</span>
        </span>
        {p.hasAgency && (
          <span className="text-blue-600 shrink-0 ml-2" title="Device-authorized">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
        )}
        <span className="text-[10px] sm:text-xs text-text-tertiary shrink-0 ml-3 w-14 sm:w-16 text-right">
          {p.commitTime ? relativeTime(p.commitTime) : "—"}
        </span>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4 pt-1 bg-bg-subtle/20">
          {loading ? (
            <div className="text-xs text-text-tertiary animate-pulse py-2">Loading proof...</div>
          ) : detail ? (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">SHA-256 Digest</div>
                <code className="text-xs font-mono text-text break-all">{detail.artifact.digestB64}</code>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                <div>
                  <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Signer</div>
                  <code className="font-mono text-text">{truncateHash(detail.signer.publicKeyB64, 12)}</code>
                </div>
                <div>
                  <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Enforcement</div>
                  <span className={`font-medium ${enforcementColor(detail.environment.enforcement)}`}>
                    {enforcementLabel(detail.environment.enforcement)}
                  </span>
                </div>
                {detail.commit.time && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Committed</div>
                    <span className="text-text">{new Date(detail.commit.time).toLocaleString()}</span>
                  </div>
                )}
                {detail.attribution?.name && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Attribution</div>
                    <span className="text-text">{detail.attribution.name}</span>
                  </div>
                )}
                {!!(detail as unknown as Record<string, unknown>).agency && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Device</div>
                    <span className="text-blue-600 font-medium">Passkey verified</span>
                  </div>
                )}
                {detail.timestamps?.artifact?.authority && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Timestamp</div>
                    <span className="text-purple-600 font-medium">{detail.timestamps.artifact.authority}</span>
                  </div>
                )}
              </div>
              <Link
                href={`/explorer/${encodeURIComponent(toUrlSafeB64(p.digestB64))}`}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-500 transition-colors mt-1"
              >
                View full proof
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          ) : (
            <div className="text-xs text-text-tertiary py-2">Could not load proof details.</div>
          )}
        </div>
      )}
    </div>
  );
}

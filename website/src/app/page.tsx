"use client";

import { useState, useCallback, useEffect } from "react";
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
        <div className="px-4 sm:px-5 pb-5 pt-2 bg-bg-subtle/20">
          {loading ? (
            <div className="text-xs text-text-tertiary animate-pulse py-2">Loading proof...</div>
          ) : detail ? (
            <FullProofDetail proof={detail} />
          ) : (
            <div className="text-xs text-text-tertiary py-2">Could not load proof details.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Full Proof Detail — renders ALL fields inline (no page nav)
   Same rendering as /explorer/[digest] detail page
   ═══════════════════════════════════════════════════════════ */

const sectionNames: Record<string, string> = {
  version: "Version", artifact: "Artifact", commit: "Commit",
  signer: "Signer", environment: "Environment",
  timestamps: "Timestamps (RFC 3161)", agency: "Agency (Device Authorization)",
  slotAllocation: "Slot Allocation (Causal Ordering)",
  attribution: "Attribution", metadata: "Metadata (Advisory)", claims: "Claims",
};

const fieldLabels: Record<string, string> = {
  hashAlg: "Hash Algorithm", digestB64: "Digest (Base64)", nonceB64: "Nonce (Base64)",
  prevB64: "Previous Hash (Base64)", slotCounter: "Slot Counter", slotHashB64: "Slot Hash (Base64)",
  epochId: "Epoch ID", publicKeyB64: "Public Key (Base64)", signatureB64: "Signature (Base64)",
  reportB64: "Attestation Report (Base64)", tokenB64: "TSA Token (Base64)",
  digestAlg: "Digest Algorithm", actorKeyId: "Actor Key ID", artifactHash: "Artifact Hash",
  commitTime: "Commit Time", batchSize: "Batch Size", batchIndex: "Batch Index",
};

function humanLabel(key: string): string { return fieldLabels[key] || key; }

function isEpochMs(key: string, value: unknown): boolean {
  if (typeof value !== "number") return false;
  if (!["time", "timestamp", "commitTime"].includes(key)) return false;
  return value > 1_000_000_000_000 && value < 2_000_000_000_000;
}

function FullProofDetail({ proof }: { proof: OCCProof }) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const proofAny = proof as unknown as Record<string, unknown>;
  const orderedKeys = ["version", "artifact", "commit", "signer", "environment", "timestamps", "agency", "slotAllocation", "attribution", "metadata", "claims"];
  const allKeys = [...orderedKeys, ...Object.keys(proofAny).filter(k => !orderedKeys.includes(k))].filter(k => proofAny[k] !== undefined);

  return (
    <div className="space-y-3 mt-2">
      {/* Raw JSON toggle */}
      <button onClick={() => setJsonOpen(!jsonOpen)}
        className="flex items-center gap-2 text-xs text-text-tertiary hover:text-text transition-colors">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`transition-transform duration-150 ${jsonOpen ? "rotate-90" : ""}`}>
          <path d="M3 1.5L7 5L3 8.5" />
        </svg>
        Raw Proof JSON
        <span className="text-text-tertiary">({(JSON.stringify(proof).length / 1024).toFixed(1)} KB)</span>
      </button>
      {jsonOpen && (
        <pre className="text-[11px] font-mono text-text-secondary bg-bg-elevated border border-border-subtle p-4 overflow-auto max-h-64">
{JSON.stringify(proof, null, 2)}</pre>
      )}

      {/* Section cards */}
      {allKeys.map(key => {
        const value = proofAny[key];
        const title = sectionNames[key] || key;
        if (value === undefined || value === null) return null;

        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          return (
            <div key={key} className="border border-border-subtle bg-bg-elevated overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border-subtle">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{title}</span>
              </div>
              <div className="px-4 py-2.5">
                <ValueRow label={key} value={value} rawKey={key} />
              </div>
            </div>
          );
        }

        if (typeof value === "object") {
          return (
            <div key={key} className="border border-border-subtle bg-bg-elevated overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border-subtle">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{title}</span>
              </div>
              <div className="px-4 py-2.5">
                <ObjectRenderer data={value} />
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

/* ── Recursive Object Renderer ── */

function ObjectRenderer({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) return null;

  if (Array.isArray(data)) {
    if (data.length <= 5 && data.every(v => typeof v === "string" || typeof v === "number")) {
      return <div className="space-y-1">{data.map((item, i) => <ValueRow key={i} label={`[${i}]`} value={item} />)}</div>;
    }
    return <CollapsibleArray items={data} />;
  }

  if (typeof data === "object") {
    return (
      <div className={depth > 0 ? "pl-4 border-l border-border-subtle ml-1" : ""}>
        {Object.entries(data as Record<string, unknown>).map(([key, value]) => {
          if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            return (
              <div key={key} className="py-2">
                <div className="text-xs text-text-tertiary font-medium mb-1">{humanLabel(key)}</div>
                <ObjectRenderer data={value} depth={depth + 1} />
              </div>
            );
          }
          if (Array.isArray(value)) {
            return (
              <div key={key} className="py-2">
                <div className="text-xs text-text-tertiary font-medium mb-1">{humanLabel(key)} ({value.length} items)</div>
                <ObjectRenderer data={value} depth={depth + 1} />
              </div>
            );
          }
          return <ValueRow key={key} label={humanLabel(key)} value={value} rawKey={key} />;
        })}
      </div>
    );
  }

  return <span className="text-xs font-mono text-text break-all">{String(data)}</span>;
}

/* ── Collapsible Array ── */

function CollapsibleArray({ items }: { items: unknown[] }) {
  const [exp, setExp] = useState(false);
  const preview = items.slice(0, 3);
  return (
    <div className="space-y-1">
      {(exp ? items : preview).map((item, i) => (
        <div key={i} className="flex items-start gap-3 py-1">
          <span className="text-xs text-text-tertiary shrink-0 w-8 text-right">[{i}]</span>
          <span className="text-xs font-mono text-text break-all">{typeof item === "object" ? JSON.stringify(item) : String(item)}</span>
        </div>
      ))}
      {items.length > 3 && (
        <button onClick={() => setExp(!exp)} className="text-[11px] text-blue-600 hover:text-blue-500 transition-colors mt-1">
          {exp ? "Show less" : `Show all ${items.length} items`}
        </button>
      )}
    </div>
  );
}

/* ── Value Row ── */

function ValueRow({ label, value, rawKey }: { label: string; value: unknown; rawKey?: string }) {
  const [copied, setCopied] = useState(false);
  const [blobExp, setBlobExp] = useState(false);
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  const isLong = str.length > 20;
  const isBlob = str.length > 200;
  const isMono = isLong || typeof value === "number";
  const showTs = rawKey ? isEpochMs(rawKey, value) : false;
  const display = isBlob && !blobExp ? str.slice(0, 80) + "..." : str;

  return (
    <div className="flex items-start justify-between gap-4 py-2 group">
      <span className="text-xs text-text-tertiary shrink-0 pt-0.5">{label}</span>
      <div className="flex items-start gap-2 min-w-0">
        <div className="text-right">
          <span className={`text-xs break-all ${isMono ? "font-mono text-text" : "text-text-secondary"}`}>{display}</span>
          {isBlob && (
            <button onClick={() => setBlobExp(!blobExp)} className="block text-[11px] text-blue-600 hover:text-blue-500 mt-1 ml-auto">
              {blobExp ? "Collapse" : `Expand (${str.length.toLocaleString()} chars)`}
            </button>
          )}
          {showTs && <div className="text-[10px] text-text-tertiary mt-0.5">{new Date(value as number).toLocaleString()}</div>}
        </div>
        {isLong && (
          <button onClick={() => { navigator.clipboard.writeText(str); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="text-text-tertiary hover:text-text transition-colors opacity-0 group-hover:opacity-100 shrink-0 pt-0.5" title="Copy">
            {copied ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { FileDrop } from "@/components/file-drop";
import { hashFile } from "@/lib/occ";
import type { OCCProof } from "@/lib/occ";
import {
  toUrlSafeB64,
  truncateHash,
  relativeTime,
  enforcementLabel,
  enforcementColor,
} from "@/lib/explorer";

import type { Metadata } from "next";

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

interface LookupResult {
  proof: OCCProof;
  indexedAt: string;
}

/* ── Page ── */

export default function ExplorerPage() {
  /* ── File hasher state ── */
  const [file, setFile] = useState<File | null>(null);
  const [hashing, setHashing] = useState(false);
  const [digestB64, setDigestB64] = useState<string | null>(null);
  const [lookupResults, setLookupResults] = useState<LookupResult[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  /* ── Search state ── */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProofSummary[] | null>(null);
  const [searching, setSearching] = useState(false);

  /* ── Recent proofs ── */
  const [recent, setRecent] = useState<ProofSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  /* ── Load recent proofs ── */
  useEffect(() => {
    fetch("/api/proofs?limit=20")
      .then((r) => r.json())
      .then((data) => {
        setRecent(data.proofs ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* ── File drop → hash → lookup ── */
  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setHashing(true);
    setDigestB64(null);
    setLookupResults(null);
    setLookupError(null);

    try {
      const digest = await hashFile(f);
      setDigestB64(digest);

      const res = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(digest))}`);
      if (res.ok) {
        const data = await res.json();
        setLookupResults(data.proofs ?? []);
      } else if (res.status === 404) {
        setLookupResults([]);
      } else {
        setLookupError("Lookup failed");
      }
    } catch {
      setLookupError("Failed to hash file");
    } finally {
      setHashing(false);
    }
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setDigestB64(null);
    setLookupResults(null);
    setLookupError(null);
  }, []);

  /* ── Search ── */
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
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      {/* Header */}
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
        Proof Explorer
      </h1>
      <p className="mt-3 text-text-secondary text-lg">
        Every proof committed through ProofStudio lives here. Drop a file to find its proof.
      </p>

      {/* ── File Hasher ── */}
      <div className="mt-10">
        <h2 className="text-sm font-medium text-text-tertiary uppercase tracking-wider mb-4">
          Verify a file
        </h2>
        <FileDrop
          onFile={handleFile}
          file={file}
          onClear={clearFile}
          hint="Drop any file to compute its SHA-256 hash and find matching proofs"
        />

        {/* Hash result */}
        {hashing && (
          <div className="mt-4 text-sm text-text-tertiary animate-pulse">
            Computing SHA-256...
          </div>
        )}

        {digestB64 && !hashing && (
          <div className="mt-4 rounded-xl border border-border-subtle bg-bg-elevated p-5">
            <div className="text-xs text-text-tertiary mb-1">SHA-256 Digest</div>
            <code className="text-sm font-mono text-text break-all">{digestB64}</code>

            {lookupError && (
              <div className="mt-3 text-sm text-error">{lookupError}</div>
            )}

            {lookupResults !== null && lookupResults.length === 0 && (
              <div className="mt-4 py-3 px-4 rounded-lg bg-bg-subtle/50 text-sm text-text-secondary">
                No proofs found for this file. It hasn&apos;t been committed through ProofStudio yet.
              </div>
            )}

            {lookupResults !== null && lookupResults.length > 0 && (() => {
              const r = lookupResults[0];
              const proof = r.proof;
              return (
                <div className="mt-5 space-y-4 animate-in fade-in duration-500">
                  {/* Verified banner */}
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/15">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-emerald-400">Verified</div>
                        <div className="text-xs text-text-tertiary">
                          This file has a cryptographic proof on record
                        </div>
                      </div>
                    </div>

                    {/* Proof summary */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {proof.commit.counter && (
                        <div>
                          <div className="text-text-tertiary mb-0.5">Proof</div>
                          <div className="font-mono text-text">#{proof.commit.counter}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-text-tertiary mb-0.5">Enforcement</div>
                        <div className={`font-medium ${enforcementColor(proof.environment.enforcement)}`}>
                          {enforcementLabel(proof.environment.enforcement)}
                        </div>
                      </div>
                      {proof.commit.time && (
                        <div>
                          <div className="text-text-tertiary mb-0.5">Committed</div>
                          <div className="text-text">{new Date(proof.commit.time).toLocaleDateString()}</div>
                        </div>
                      )}
                      {proof.agency && (
                        <div>
                          <div className="text-text-tertiary mb-0.5">Device</div>
                          <div className="text-blue-400 font-medium">Passkey verified</div>
                        </div>
                      )}
                      {proof.timestamps && (
                        <div>
                          <div className="text-text-tertiary mb-0.5">Timestamp</div>
                          <div className="text-purple-400 font-medium">RFC 3161</div>
                        </div>
                      )}
                    </div>

                    <Link
                      href={`/explorer/${encodeURIComponent(toUrlSafeB64(proof.artifact.digestB64))}`}
                      className="mt-5 flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-emerald-500/15 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                    >
                      View full proof
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>

                  {lookupResults.length > 1 && (
                    <div className="text-xs text-text-tertiary text-center">
                      +{lookupResults.length - 1} more proof{lookupResults.length > 2 ? "s" : ""} for this file
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Search ── */}
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
            className="flex-1 h-12 rounded-xl border border-border-subtle bg-bg-elevated px-4 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-text/30 transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={searching || searchQuery.trim().length < 2}
            className="h-12 px-6 rounded-xl bg-text text-bg text-sm font-medium hover:bg-text/90 transition-colors disabled:opacity-40"
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

      {/* ── Recent Proofs ── */}
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
          <div className="rounded-xl border border-border-subtle bg-bg-elevated p-8 text-center">
            <div className="text-text-secondary">No proofs indexed yet.</div>
            <div className="text-sm text-text-tertiary mt-1">
              Commit a file through{" "}
              <Link href="/studio" className="text-text hover:underline">
                Studio
              </Link>{" "}
              to see it here.
            </div>
          </div>
        ) : (
          <ProofTable proofs={recent} />
        )}
      </div>
    </div>
  );
}

/* ── Proof Table ── */

function ProofTable({ proofs, label }: { proofs: ProofSummary[]; label?: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
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

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
          // API returns { proofs: [{ proof, indexedAt }] }
          const first = data.proofs?.[0]?.proof ?? data.proof;
          if (first) setDetail(first);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
  }, [expanded, detail, p.digestB64]);

  return (
    <div>
      <div className="flex items-center px-4 sm:px-5 py-3.5 hover:bg-bg-subtle/40 transition-colors">
        <button
          onClick={toggle}
          className="shrink-0 mr-2 sm:mr-3 text-text-tertiary hover:text-text transition-colors p-0.5"
          title={expanded ? "Collapse" : "Expand"}
        >
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
            className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M3 1.5L7 5L3 8.5" />
          </svg>
        </button>
        <Link
          href={`/explorer/${encodeURIComponent(toUrlSafeB64(p.digestB64))}`}
          className="flex items-center justify-between flex-1 min-w-0"
        >
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <code className="text-xs sm:text-sm font-mono text-text shrink-0">
              {truncateHash(p.digestB64, 10)}
            </code>
            <span className={`text-[10px] sm:text-xs font-medium shrink-0 ${enforcementColor(p.enforcement)}`}>
              <span className="hidden sm:inline">{enforcementLabel(p.enforcement)}</span>
              <span className="sm:hidden">{p.enforcement === "measured-tee" ? "TEE" : p.enforcement === "hw-key" ? "HW" : "SW"}</span>
            </span>
            {p.counter && (
              <span className="text-[10px] sm:text-xs font-mono text-text-tertiary shrink-0">
                #{p.counter}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2 sm:ml-4">
            {p.hasAgency && (
              <span className="text-blue-400" title="Device-authorized">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
            )}
            {p.hasTsa && (
              <span className="text-purple-400" title="RFC 3161 timestamped">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </span>
            )}
            <span className="text-[10px] sm:text-xs text-text-tertiary w-14 sm:w-16 text-right">
              {p.commitTime ? relativeTime(p.commitTime) : "—"}
            </span>
          </div>
        </Link>
      </div>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4 pt-1 bg-bg-subtle/20">
          {loading ? (
            <div className="text-xs text-text-tertiary animate-pulse py-2">Loading proof...</div>
          ) : detail ? (
            <div className="space-y-3">
              {/* Digest */}
              <div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">SHA-256 Digest</div>
                <code className="text-xs font-mono text-text break-all">{detail.artifact.digestB64}</code>
              </div>

              {/* Key fields grid */}
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
                {(detail as Record<string, unknown>).agency && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Device</div>
                    <span className="text-blue-400 font-medium">Passkey verified</span>
                  </div>
                )}
                {detail.timestamps?.artifact?.authority && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Timestamp</div>
                    <span className="text-purple-400 font-medium">{detail.timestamps.artifact.authority}</span>
                  </div>
                )}
              </div>

              {/* View full proof link */}
              <Link
                href={`/explorer/${encodeURIComponent(toUrlSafeB64(p.digestB64))}`}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors mt-1"
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

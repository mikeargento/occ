"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
// Exact copy of explorer/page.tsx — homepage IS the explorer
import Link from "next/link";
import { FileDrop } from "@/components/file-drop";
import { hashFile, isOCCProof, verifyProofSignature } from "@/lib/occ";
import type { OCCProof, ProofVerifyResult } from "@/lib/occ";
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

export default function HomeWrapper() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-text-tertiary">Loading...</div>}>
      <Home />
    </Suspense>
  );
}

function Home() {
  /* ── File hasher state ── */
  const [file, setFile] = useState<File | null>(null);
  const [hashing, setHashing] = useState(false);
  const [digestB64, setDigestB64] = useState<string | null>(null);
  const [lookupResults, setLookupResults] = useState<LookupResult[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  /* ── Proof verification state (when a proof JSON is dropped) ── */
  const [droppedProof, setDroppedProof] = useState<OCCProof | null>(null);
  const [verifyResult, setVerifyResult] = useState<ProofVerifyResult | null>(null);

  /* ── Search state ── */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProofSummary[] | null>(null);
  const [searching, setSearching] = useState(false);

  /* ── Recent proofs ── */
  const [recent, setRecent] = useState<ProofSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 20;
  const totalPages = Math.ceil(total / perPage);

  /* ── Load recent proofs ── */
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

  /* ── Handle ?digest= query parameter ── */
  const searchParams = useSearchParams();
  useEffect(() => {
    const digestParam = searchParams?.get("digest");
    if (digestParam) {
      const safeDigest = toUrlSafeB64(digestParam);
      fetch(`/api/proofs/${encodeURIComponent(safeDigest)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.proof) {
            setDroppedProof(data.proof);
            setDigestB64(digestParam);
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  /* ── File drop → detect proof or hash → lookup ── */
  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setHashing(true);
    setDigestB64(null);
    setLookupResults(null);
    setLookupError(null);
    setDroppedProof(null);
    setVerifyResult(null);

    try {
      // Try to read as text and detect if it's a proof JSON
      if (f.name.endsWith(".json") || f.type === "application/json" || f.size < 500_000) {
        try {
          const text = await f.text();
          const proof = isOCCProof(text);
          if (proof) {
            setDroppedProof(proof);
            setDigestB64(proof.artifact.digestB64);

            // Verify signature
            const result = await verifyProofSignature(proof);
            setVerifyResult(result);

            // Also look up in explorer index
            const res = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(proof.artifact.digestB64))}`);
            if (res.ok) {
              const data = await res.json();
              setLookupResults(data.proofs ?? []);
            } else if (res.status === 404) {
              setLookupResults([]);
            }

            setHashing(false);
            return;
          }
        } catch {
          // Not valid text/JSON — fall through to hash
        }
      }

      // Regular file — hash and look up
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
    setDroppedProof(null);
    setVerifyResult(null);
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
    <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      {/* Header */}
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
        Proof Explorer
      </h1>
      <p className="mt-3 text-text-secondary text-lg">
        Every proof committed through OCC lives here. Drop a file to find its proof.
      </p>

      {/* ── Drop Zone ── */}
      <div className="mt-10">
        <h2 className="text-sm font-medium text-text-tertiary uppercase tracking-wider mb-4">
          Verify
        </h2>
        <FileDrop
          onFile={handleFile}
          file={file}
          onClear={clearFile}
          hint="Drop a file to find its proof, or drop a proof JSON to verify it"
        />

        {/* Hash result */}
        {hashing && (
          <div className="mt-4 text-sm text-text-tertiary animate-pulse">
            {droppedProof ? "Verifying proof..." : "Computing SHA-256..."}
          </div>
        )}

        {/* ── Proof verification results ── */}
        {droppedProof && verifyResult && !hashing && (
          <div className="mt-4 space-y-4 animate-in fade-in duration-500">
            {/* Status banner */}
            <div className={`border p-5 ${
              verifyResult.valid
                ? "border-blue-600/30 bg-blue-500/10"
                : "border-red-600/30 bg-red-500/10"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-10 h-10 ${
                  verifyResult.valid ? "bg-blue-500/20" : "bg-red-500/20"
                }`}>
                  {verifyResult.valid ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-600">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-600">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className={`text-lg font-semibold ${
                    verifyResult.valid ? "text-blue-600" : "text-red-600"
                  }`}>
                    {verifyResult.valid ? "Signature Valid" : "Signature Invalid"}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {verifyResult.valid
                      ? "This proof is cryptographically authentic"
                      : verifyResult.reason}
                  </div>
                </div>
              </div>
            </div>

            {/* Verification checks */}
            <div className="border border-border-subtle bg-bg-elevated overflow-hidden">
              <div className="px-5 py-3 border-b border-border-subtle">
                <span className="text-xs text-text-tertiary font-medium">Verification checks</span>
              </div>
              <div className="divide-y divide-border-subtle">
                {verifyResult.checks.map((check, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3">
                    <div className="shrink-0 mt-0.5">
                      {check.status === "pass" ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-600">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : check.status === "fail" ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-600">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-tertiary">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 8v4M12 16h.01" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-text">{check.label}</div>
                      {check.detail && (
                        <div className="text-xs text-text-tertiary mt-0.5">{check.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Proof identity */}
            <div className="border border-border-subtle bg-bg-elevated p-5 space-y-3">
              <div>
                <div className="text-xs text-text-tertiary mb-1">Artifact digest</div>
                <code className="text-sm font-mono text-text break-all">{droppedProof.artifact.digestB64}</code>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-text-tertiary mb-1">Signer</div>
                  <code className="text-xs font-mono text-text break-all">{droppedProof.signer.publicKeyB64}</code>
                </div>
                {droppedProof.commit.time && (
                  <div>
                    <div className="text-xs text-text-tertiary mb-1">Committed</div>
                    <span className="text-sm text-text">{new Date(droppedProof.commit.time).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Explorer index lookup */}
            {lookupResults !== null && lookupResults.length > 0 && (
              <div className="border border-border-subtle bg-bg-elevated p-5">
                <div className="text-xs text-text-tertiary mb-3">
                  Also indexed in Explorer ({lookupResults.length} record{lookupResults.length !== 1 ? "s" : ""})
                </div>
                <Link
                  href={`/explorer/${encodeURIComponent(toUrlSafeB64(droppedProof.artifact.digestB64))}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
                >
                  View in Explorer
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            )}
            {lookupResults !== null && lookupResults.length === 0 && (
              <div className="text-xs text-text-tertiary">
                This proof is not in the Explorer index. It was verified locally from the file you dropped.
              </div>
            )}
          </div>
        )}

        {/* ── Regular file hash results (non-proof) ── */}
        {digestB64 && !hashing && !droppedProof && (
          <div className="mt-4 border border-border-subtle bg-bg-elevated p-5">
            <div className="text-xs text-text-tertiary mb-1">SHA-256 Digest</div>
            <code className="text-sm font-mono text-text break-all">{digestB64}</code>

            {lookupError && (
              <div className="mt-3 text-sm text-error">{lookupError}</div>
            )}

            {lookupResults !== null && lookupResults.length === 0 && (
              <div className="mt-4 py-3 px-4 bg-bg-subtle/50 text-sm text-text-secondary">
                No proofs found for this file. It hasn&apos;t been committed through OCC yet.
              </div>
            )}

            {lookupResults !== null && lookupResults.length > 0 && (
              <div className="mt-5 space-y-4 animate-in fade-in duration-500">
                {/* Verified banner */}
                <div className="border border-blue-600/30 bg-blue-500/10 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-blue-500/20">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-600">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-blue-600">Proven</div>
                      <div className="text-xs text-text-tertiary">
                        {lookupResults.length} proof{lookupResults.length !== 1 ? "s" : ""} on record for this file
                      </div>
                    </div>
                  </div>
                </div>

                {/* List all proofs */}
                <div className="border border-border-subtle bg-bg-elevated overflow-hidden divide-y divide-border-subtle">
                  {lookupResults.map((r, i) => {
                    const p = r.proof;
                    return (
                      <Link
                        key={i}
                        href={`/explorer/${encodeURIComponent(toUrlSafeB64(p.artifact.digestB64))}`}
                        className="group flex items-center justify-between px-5 py-4 hover:bg-bg-subtle/60 transition-all duration-150 cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {p.commit.counter && (
                            <span className="text-xs font-mono text-text-tertiary shrink-0">#{p.commit.counter}</span>
                          )}
                          <span className={`text-xs font-medium shrink-0 ${enforcementColor(p.environment.enforcement)}`}>
                            {enforcementLabel(p.environment.enforcement)}
                          </span>
                          {p.agency && (
                            <span className="text-blue-600 shrink-0" title="Device-authorized">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              </svg>
                            </span>
                          )}
                          {p.timestamps && (
                            <span className="text-purple-600 shrink-0" title="RFC 3161 timestamped">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 6v6l4 2" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {p.commit.time && (
                            <span className="text-xs text-text-tertiary">
                              {new Date(p.commit.time).toLocaleDateString()}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:text-blue-500 transition-colors">
                            View proof
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:translate-x-0.5 transition-transform duration-150">
                              <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
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
          <div className="border border-border-subtle bg-bg-elevated p-8 text-center">
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
            <code className="text-xs sm:text-sm font-mono text-text truncate min-w-0">
              {p.digestB64}
            </code>
            <span className={`text-[10px] sm:text-xs font-medium shrink-0 ${enforcementColor(p.enforcement)}`}>
              <span className="hidden sm:inline">{enforcementLabel(p.enforcement)}</span>
              <span className="sm:hidden">{p.enforcement === "measured-tee" ? "TEE" : p.enforcement === "hw-key" ? "HW" : "SW"}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2 sm:ml-4">
            {p.hasAgency && (
              <span className="text-blue-600" title="Device-authorized">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
            )}
            {p.hasTsa && (
              <span className="text-purple-600" title="RFC 3161 timestamped">
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

              {/* View full proof link */}
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

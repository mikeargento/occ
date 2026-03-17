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

            {lookupResults !== null && lookupResults.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-text-tertiary">
                  {lookupResults.length} proof{lookupResults.length !== 1 ? "s" : ""} found
                </div>
                {lookupResults.map((r, i) => (
                  <Link
                    key={i}
                    href={`/explorer/${encodeURIComponent(toUrlSafeB64(r.proof.artifact.digestB64))}`}
                    className="block rounded-lg border border-border-subtle bg-bg-subtle/30 p-4 hover:bg-bg-subtle/60 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${enforcementColor(r.proof.environment.enforcement)}`}>
                          {enforcementLabel(r.proof.environment.enforcement)}
                        </span>
                        {r.proof.commit.counter && (
                          <span className="text-xs font-mono text-text-tertiary">
                            #{r.proof.commit.counter}
                          </span>
                        )}
                      </div>
                      {r.proof.commit.time && (
                        <span className="text-xs text-text-tertiary">
                          {relativeTime(r.proof.commit.time)}
                        </span>
                      )}
                    </div>
                    {r.proof.attribution?.name && (
                      <div className="mt-1 text-xs text-text-secondary">
                        {r.proof.attribution.name}
                      </div>
                    )}
                  </Link>
                ))}
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
          <Link
            key={p.id}
            href={`/explorer/${encodeURIComponent(toUrlSafeB64(p.digestB64))}`}
            className="flex items-center justify-between px-5 py-4 hover:bg-bg-subtle/40 transition-colors"
          >
            <div className="flex items-center gap-4 min-w-0">
              <code className="text-sm font-mono text-text shrink-0">
                {truncateHash(p.digestB64)}
              </code>
              <span className={`text-xs font-medium shrink-0 ${enforcementColor(p.enforcement)}`}>
                {enforcementLabel(p.enforcement)}
              </span>
              {p.counter && (
                <span className="text-xs font-mono text-text-tertiary shrink-0">
                  #{p.counter}
                </span>
              )}
              {p.attrName && (
                <span className="text-xs text-text-secondary truncate hidden sm:block">
                  {p.attrName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              {p.hasAgency && (
                <span className="text-xs text-blue-400" title="Device-authorized">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </span>
              )}
              {p.hasTsa && (
                <span className="text-xs text-purple-400" title="RFC 3161 timestamped">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </span>
              )}
              <span className="text-xs text-text-tertiary w-16 text-right">
                {p.commitTime ? relativeTime(p.commitTime) : "—"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

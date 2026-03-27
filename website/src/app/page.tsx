"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

/* ── Icons ── */

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M3 1.5L7 5L3 8.5" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="9" y="9" width="13" height="13" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
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

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
  };

  const displayProofs = searchResults !== null ? searchResults : recent;
  const isSearchMode = searchResults !== null;

  return (
    <>
      {/* Sticky Header */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: "56px",
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--c-border-subtle)",
        backgroundColor: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}>
        <div style={{
          maxWidth: "64rem",
          margin: "0 auto",
          width: "100%",
          padding: "0 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.02em",
            color: "var(--c-text)",
            fontFamily: "var(--font-inter, -apple-system, BlinkMacSystemFont, sans-serif)",
          }}>
            OCC
          </span>
          <a href="https://agent.occ.wtf" style={{
            fontSize: "13px",
            color: "var(--c-text-tertiary)",
            textDecoration: "none",
            transition: "color 150ms ease",
          }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--c-text)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--c-text-tertiary)")}
          >
            Sign in
          </a>
        </div>
      </header>

      <div style={{ maxWidth: "64rem", margin: "0 auto", padding: "0 1.5rem" }}>

        {/* Hero */}
        <section style={{ paddingTop: "80px", paddingBottom: "64px" }}>
          <h1 style={{
            fontSize: "clamp(2rem, 5vw, 2.75rem)",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            color: "var(--c-text)",
            margin: 0,
            marginBottom: "12px",
            fontFamily: "var(--font-inter, -apple-system, BlinkMacSystemFont, sans-serif)",
          }}>
            Define what your AI does.
          </h1>
          <p style={{
            fontSize: "15px",
            color: "var(--c-text-tertiary)",
            margin: 0,
            marginBottom: "32px",
            lineHeight: 1.6,
          }}>
            Cryptographic proof that every AI action was authorized by policy.
          </p>

          {/* Search bar */}
          <div style={{ display: "flex", gap: "0", position: "relative" }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search by digest, signer key, attribution, or counter…"
              style={{
                flex: 1,
                height: "48px",
                border: "1px solid var(--c-border)",
                borderRight: "none",
                background: "var(--bg)",
                padding: "0 16px",
                fontSize: "14px",
                color: "var(--c-text)",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 150ms ease",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--c-text-secondary)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--c-border)")}
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                style={{
                  height: "48px",
                  width: "48px",
                  border: "1px solid var(--c-border)",
                  borderRight: "none",
                  background: "var(--bg)",
                  color: "var(--c-text-tertiary)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  lineHeight: 1,
                  transition: "color 150ms ease",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--c-text)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--c-text-tertiary)")}
                title="Clear search"
              >
                ×
              </button>
            )}
            <button
              onClick={handleSearch}
              disabled={searching || searchQuery.trim().length < 2}
              style={{
                height: "48px",
                padding: "0 20px",
                border: "1px solid var(--c-border)",
                background: "var(--c-text)",
                color: "var(--bg)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: searching || searchQuery.trim().length < 2 ? "default" : "pointer",
                opacity: searching || searchQuery.trim().length < 2 ? 0.4 : 1,
                transition: "opacity 150ms ease",
                fontFamily: "inherit",
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
              }}
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </section>

        {/* Proof List */}
        <section style={{ paddingBottom: "80px" }}>
          {/* Section header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}>
            <span style={{
              fontSize: "11px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "var(--c-text-tertiary)",
              fontFamily: "inherit",
            }}>
              {isSearchMode
                ? `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`
                : "Recent Proofs"}
            </span>
            {!isSearchMode && total > 0 && (
              <span style={{
                fontSize: "11px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "var(--c-text-tertiary)",
              }}>
                {total.toLocaleString()} total
              </span>
            )}
          </div>

          {/* Proof table */}
          {loading && !isSearchMode ? (
            <div style={{
              border: "1px solid var(--c-border-subtle)",
              padding: "32px 20px",
              color: "var(--c-text-tertiary)",
              fontSize: "13px",
            }}>
              Loading…
            </div>
          ) : displayProofs.length === 0 ? (
            <div style={{
              border: "1px solid var(--c-border-subtle)",
              background: "var(--bg-elevated)",
              padding: "48px 24px",
              textAlign: "center",
            }}>
              <div style={{ color: "var(--c-text-secondary)", fontSize: "14px" }}>
                {isSearchMode ? "No results found." : "No proofs yet."}
              </div>
              {!isSearchMode && (
                <div style={{ color: "var(--c-text-tertiary)", fontSize: "13px", marginTop: "6px" }}>
                  Install OCC and start using Claude Code to see proofs here.
                </div>
              )}
            </div>
          ) : (
            <div style={{ border: "1px solid var(--c-border-subtle)" }}>
              {displayProofs.map((p, i) => (
                <ProofRow
                  key={p.id}
                  proof={p}
                  isLast={i === displayProofs.length - 1}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!isSearchMode && totalPages > 1 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              marginTop: "24px",
            }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  height: "32px",
                  padding: "0 12px",
                  border: "1px solid var(--c-border-subtle)",
                  background: "var(--bg-elevated)",
                  color: page === 1 ? "var(--c-text-tertiary)" : "var(--c-text-secondary)",
                  fontSize: "12px",
                  cursor: page === 1 ? "default" : "pointer",
                  opacity: page === 1 ? 0.4 : 1,
                  fontFamily: "inherit",
                  transition: "color 150ms ease, border-color 150ms ease",
                }}
                onMouseEnter={e => { if (page !== 1) e.currentTarget.style.color = "var(--c-text)"; }}
                onMouseLeave={e => { if (page !== 1) e.currentTarget.style.color = "var(--c-text-secondary)"; }}
              >
                Previous
              </button>
              <span style={{
                fontSize: "12px",
                color: "var(--c-text-tertiary)",
                padding: "0 8px",
              }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  height: "32px",
                  padding: "0 12px",
                  border: "1px solid var(--c-border-subtle)",
                  background: "var(--bg-elevated)",
                  color: page === totalPages ? "var(--c-text-tertiary)" : "var(--c-text-secondary)",
                  fontSize: "12px",
                  cursor: page === totalPages ? "default" : "pointer",
                  opacity: page === totalPages ? 0.4 : 1,
                  fontFamily: "inherit",
                  transition: "color 150ms ease",
                }}
                onMouseEnter={e => { if (page !== totalPages) e.currentTarget.style.color = "var(--c-text)"; }}
                onMouseLeave={e => { if (page !== totalPages) e.currentTarget.style.color = "var(--c-text-secondary)"; }}
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/* ── Proof Row ── */

function ProofRow({ proof: p, isLast }: { proof: ProofSummary; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<OCCProof | null>(null);
  const [detailIndexedAt, setDetailIndexedAt] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [hovered, setHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail) {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(p.digestB64))}`);
        if (res.ok) {
          const data = await res.json();
          const first = data.proofs?.[0];
          if (first?.proof) {
            setDetail(first.proof);
            setDetailIndexedAt(first.indexedAt ?? null);
          }
        }
      } catch {}
      setLoadingDetail(false);
    }
  }, [expanded, detail, p.digestB64]);

  const truncated = truncateHash(p.digestB64, 16);

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--c-border-subtle)" }}>
      {/* Row */}
      <button
        onClick={toggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          height: "48px",
          padding: "0 16px",
          background: hovered ? "var(--bg-elevated)" : "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: "10px",
          transition: "background 150ms ease",
        }}
      >
        {/* Chevron */}
        <span style={{
          color: "var(--c-text-tertiary)",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          transform: expanded ? "rotate(90deg)" : "none",
          transition: "transform 200ms ease",
        }}>
          <ChevronRight />
        </span>

        {/* Hash */}
        <span style={{
          fontFamily: "var(--font-mono, 'JetBrains Mono', 'SF Mono', monospace)",
          fontSize: "12px",
          color: "var(--c-text)",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {truncated}
        </span>

        {/* Enforcement badge */}
        <span style={{
          fontSize: "11px",
          fontWeight: 500,
          flexShrink: 0,
          color: p.enforcement === "measured-tee" || p.enforcement === "hw-key"
            ? "#2563eb"
            : "#ca8a04",
          letterSpacing: "0.01em",
        }}>
          <span className="hidden-mobile">{enforcementLabel(p.enforcement)}</span>
          <span className="visible-mobile">
            {p.enforcement === "measured-tee" ? "TEE" : p.enforcement === "hw-key" ? "HW" : "SW"}
          </span>
        </span>

        {/* Agency shield */}
        {p.hasAgency && (
          <span title="Device-authorized" style={{
            color: "#2563eb",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
          }}>
            <ShieldIcon />
          </span>
        )}

        {/* Time */}
        <span style={{
          fontSize: "12px",
          color: "var(--c-text-tertiary)",
          flexShrink: 0,
          width: "56px",
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}>
          {p.commitTime ? relativeTime(p.commitTime) : "—"}
        </span>
      </button>

      {/* Expanded detail */}
      <div
        ref={contentRef}
        style={{
          overflow: "hidden",
          maxHeight: expanded ? "9999px" : "0",
          transition: expanded ? "max-height 200ms ease" : "max-height 200ms ease",
        }}
      >
        <div style={{
          padding: "16px",
          background: "var(--bg-elevated)",
          borderTop: expanded ? "1px solid var(--c-border-subtle)" : "none",
        }}>
          {loadingDetail ? (
            <div style={{ color: "var(--c-text-tertiary)", fontSize: "12px", padding: "8px 0" }}>
              Loading proof…
            </div>
          ) : detail ? (
            <FullProofDetail proof={detail} indexedAt={detailIndexedAt} />
          ) : (
            <div style={{ color: "var(--c-text-tertiary)", fontSize: "12px", padding: "8px 0" }}>
              Could not load proof details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Full Proof Detail
   ═══════════════════════════════════════════════════════════ */

const sectionNames: Record<string, string> = {
  version: "Version",
  artifact: "Artifact",
  commit: "Commit",
  signer: "Signer",
  environment: "Environment",
  timestamps: "Timestamps (RFC 3161)",
  agency: "Agency (Device Authorization)",
  slotAllocation: "Slot Allocation (Causal Ordering)",
  attribution: "Attribution",
  metadata: "Metadata (Advisory)",
  claims: "Claims",
};

const fieldLabels: Record<string, string> = {
  hashAlg: "Hash Algorithm",
  digestB64: "Digest (Base64)",
  nonceB64: "Nonce (Base64)",
  prevB64: "Previous Hash (Base64)",
  slotCounter: "Slot Counter",
  slotHashB64: "Slot Hash (Base64)",
  epochId: "Epoch ID",
  publicKeyB64: "Public Key (Base64)",
  signatureB64: "Signature (Base64)",
  reportB64: "Attestation Report (Base64)",
  tokenB64: "TSA Token (Base64)",
  digestAlg: "Digest Algorithm",
  actorKeyId: "Actor Key ID",
  artifactHash: "Artifact Hash",
  commitTime: "Commit Time",
  batchSize: "Batch Size",
  batchIndex: "Batch Index",
};

function humanLabel(key: string): string {
  return fieldLabels[key] || key;
}

function isEpochMs(key: string, value: unknown): boolean {
  if (typeof value !== "number") return false;
  if (!["time", "timestamp", "commitTime"].includes(key)) return false;
  return value > 1_000_000_000_000 && value < 2_000_000_000_000;
}

function FullProofDetail({ proof, indexedAt }: { proof: OCCProof; indexedAt: string | null }) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonHovered, setJsonHovered] = useState(false);
  const proofAny = proof as unknown as Record<string, unknown>;
  const orderedKeys = [
    "version", "artifact", "commit", "signer", "environment",
    "timestamps", "agency", "slotAllocation", "attribution", "metadata", "claims",
  ];
  const allKeys = [
    ...orderedKeys,
    ...Object.keys(proofAny).filter((k) => !orderedKeys.includes(k)),
  ].filter((k) => proofAny[k] !== undefined);

  const jsonStr = JSON.stringify(proof, null, 2);
  const jsonKb = (jsonStr.length / 1024).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Indexed at */}
      {indexedAt && (
        <div style={{ fontSize: "11px", color: "var(--c-text-tertiary)", marginBottom: "4px" }}>
          Indexed {new Date(indexedAt).toLocaleString()}
        </div>
      )}

      {/* Raw JSON toggle */}
      <button
        onClick={() => setJsonOpen(!jsonOpen)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          height: "36px",
          padding: "0 14px",
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--c-text-secondary)",
          background: jsonOpen ? "var(--bg-subtle)" : "var(--bg)",
          border: "1px solid var(--c-border)",
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "background 150ms ease, border-color 150ms ease",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--c-text-tertiary)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--c-border)"; }}
      >
        <span style={{
          display: "inline-flex",
          transform: jsonOpen ? "rotate(90deg)" : "none",
          transition: "transform 150ms ease",
        }}>
          <ChevronRight />
        </span>
        Raw JSON
        <span style={{ color: "var(--c-text-tertiary)", fontSize: "11px", fontWeight: 400 }}>
          {jsonKb} KB
        </span>
      </button>

      {jsonOpen && (
        <pre style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          color: "var(--c-text-secondary)",
          background: "var(--bg)",
          border: "1px solid var(--c-border-subtle)",
          padding: "16px",
          overflow: "auto",
          maxHeight: "256px",
          margin: 0,
          lineHeight: 1.6,
        }}>
          {jsonStr}
        </pre>
      )}

      {/* Section cards */}
      {allKeys.map((key) => {
        const value = proofAny[key];
        const title = sectionNames[key] || key;
        if (value === undefined || value === null) return null;

        return (
          <div key={key} style={{
            border: "1px solid var(--c-border-subtle)",
            background: "var(--bg)",
            overflow: "hidden",
          }}>
            {/* Section header */}
            <div style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--c-border-subtle)",
            }}>
              <span style={{
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "var(--c-text-tertiary)",
                fontFamily: "inherit",
              }}>
                {title}
              </span>
            </div>

            {/* Section body */}
            <div style={{ padding: "4px 14px" }}>
              {typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? (
                <ValueRow label={key} value={value} rawKey={key} />
              ) : typeof value === "object" ? (
                <ObjectRenderer data={value} />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Recursive Object Renderer ── */

function ObjectRenderer({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) return null;

  if (Array.isArray(data)) {
    if (data.length <= 5 && data.every((v) => typeof v === "string" || typeof v === "number")) {
      return (
        <div>
          {data.map((item, i) => (
            <ValueRow key={i} label={`[${i}]`} value={item} />
          ))}
        </div>
      );
    }
    return <CollapsibleArray items={data} />;
  }

  if (typeof data === "object") {
    return (
      <div style={depth > 0 ? {
        paddingLeft: "12px",
        borderLeft: "1px solid var(--c-border-subtle)",
        marginLeft: "4px",
      } : {}}>
        {Object.entries(data as Record<string, unknown>).map(([key, value]) => {
          if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            return (
              <div key={key} style={{ paddingTop: "8px", paddingBottom: "4px" }}>
                <div style={{
                  fontSize: "11px",
                  color: "var(--c-text-tertiary)",
                  fontWeight: 500,
                  marginBottom: "4px",
                }}>
                  {humanLabel(key)}
                </div>
                <ObjectRenderer data={value} depth={depth + 1} />
              </div>
            );
          }
          if (Array.isArray(value)) {
            return (
              <div key={key} style={{ paddingTop: "8px", paddingBottom: "4px" }}>
                <div style={{
                  fontSize: "11px",
                  color: "var(--c-text-tertiary)",
                  fontWeight: 500,
                  marginBottom: "4px",
                }}>
                  {humanLabel(key)} ({value.length} items)
                </div>
                <ObjectRenderer data={value} depth={depth + 1} />
              </div>
            );
          }
          return <ValueRow key={key} label={humanLabel(key)} value={value} rawKey={key} />;
        })}
      </div>
    );
  }

  return (
    <span style={{
      fontSize: "12px",
      fontFamily: "var(--font-mono, monospace)",
      color: "var(--c-text)",
      wordBreak: "break-all",
    }}>
      {String(data)}
    </span>
  );
}

/* ── Collapsible Array ── */

function CollapsibleArray({ items }: { items: unknown[] }) {
  const [exp, setExp] = useState(false);
  const preview = items.slice(0, 3);

  return (
    <div>
      {(exp ? items : preview).map((item, i) => (
        <div key={i} style={{
          display: "flex",
          gap: "12px",
          padding: "4px 0",
        }}>
          <span style={{
            fontSize: "11px",
            color: "var(--c-text-tertiary)",
            flexShrink: 0,
            width: "28px",
            textAlign: "right",
            fontFamily: "var(--font-mono, monospace)",
          }}>
            [{i}]
          </span>
          <span style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--c-text)",
            wordBreak: "break-all",
          }}>
            {typeof item === "object" ? JSON.stringify(item) : String(item)}
          </span>
        </div>
      ))}
      {items.length > 3 && (
        <button
          onClick={() => setExp(!exp)}
          style={{
            fontSize: "11px",
            color: "#2563eb",
            background: "none",
            border: "none",
            padding: "4px 0",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
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
  const [rowHovered, setRowHovered] = useState(false);

  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  const isLong = str.length > 20;
  const isBlob = str.length > 200;
  const isMono = isLong || typeof value === "number";
  const showTs = rawKey ? isEpochMs(rawKey, value) : false;
  const display = isBlob && !blobExp ? str.slice(0, 80) + "…" : str;

  const handleCopy = () => {
    navigator.clipboard.writeText(str);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onMouseEnter={() => setRowHovered(true)}
      onMouseLeave={() => setRowHovered(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        padding: "7px 0",
        borderBottom: "1px solid var(--c-border-subtle)",
      }}
    >
      {/* Label */}
      <span style={{
        fontSize: "11px",
        color: "var(--c-text-tertiary)",
        flexShrink: 0,
        paddingTop: "1px",
        minWidth: "100px",
      }}>
        {label}
      </span>

      {/* Value + copy */}
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        minWidth: 0,
      }}>
        <div style={{ textAlign: "right", minWidth: 0 }}>
          <span style={{
            fontSize: isMono ? "11px" : "12px",
            fontFamily: isMono ? "var(--font-mono, 'JetBrains Mono', monospace)" : "inherit",
            color: "var(--c-text)",
            wordBreak: "break-all",
          }}>
            {display}
          </span>
          {isBlob && (
            <button
              onClick={() => setBlobExp(!blobExp)}
              style={{
                display: "block",
                fontSize: "11px",
                color: "#2563eb",
                background: "none",
                border: "none",
                padding: "2px 0 0",
                cursor: "pointer",
                fontFamily: "inherit",
                marginLeft: "auto",
              }}
            >
              {blobExp ? "Collapse" : `Expand (${str.length.toLocaleString()} chars)`}
            </button>
          )}
          {showTs && (
            <div style={{
              fontSize: "10px",
              color: "var(--c-text-tertiary)",
              marginTop: "2px",
            }}>
              {new Date(value as number).toLocaleString()}
            </div>
          )}
        </div>

        {/* Copy button — hover only */}
        {isLong && (
          <button
            onClick={handleCopy}
            title="Copy"
            style={{
              color: copied ? "#22c55e" : "var(--c-text-tertiary)",
              background: "none",
              border: "none",
              padding: "2px",
              cursor: "pointer",
              flexShrink: 0,
              paddingTop: "1px",
              opacity: rowHovered ? 1 : 0,
              transition: "opacity 150ms ease, color 150ms ease",
              display: "flex",
              alignItems: "center",
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        )}
      </div>
    </div>
  );
}

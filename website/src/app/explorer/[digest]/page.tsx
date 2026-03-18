"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ProofViewer } from "@/components/proof-viewer";
import { AttestationVerifier } from "@/components/attestation-verifier";
import type { OCCProof } from "@/lib/occ";
import {
  fromUrlSafeB64,
  toUrlSafeB64,
  relativeTime,
  enforcementLabel,
  enforcementColor,
} from "@/lib/explorer";

/* ── Types ── */

interface LookupResult {
  proof: OCCProof;
  indexedAt: string;
}

/* ── Section display names ── */
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

/* ── Page ── */

export default function ProofDetailPage() {
  const params = useParams();
  const digestParam = params.digest as string;
  const digestB64 = fromUrlSafeB64(decodeURIComponent(digestParam));

  const [results, setResults] = useState<LookupResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(digestB64))}`)
      .then((r) => {
        if (r.status === 404) return { proofs: [] };
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data) => setResults(data.proofs ?? []))
      .catch(() => setError("Failed to load proof"))
      .finally(() => setLoading(false));
  }, [digestB64]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <div className="text-text-tertiary animate-pulse">Loading proof...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <div className="text-error">{error}</div>
        <Link href="/explorer" className="text-sm text-text-secondary hover:text-text mt-2 inline-block">
          &larr; Back to Explorer
        </Link>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <h1 className="text-2xl font-bold text-text">Proof Not Found</h1>
        <p className="mt-2 text-text-secondary">
          No proof exists for this artifact digest.
        </p>
        <code className="block mt-3 text-sm font-mono text-text-tertiary break-all">
          {digestB64}
        </code>
        <Link href="/explorer" className="text-sm text-text-secondary hover:text-text mt-4 inline-block">
          &larr; Back to Explorer
        </Link>
      </div>
    );
  }

  const { proof } = results[0];
  const proofAny = proof as unknown as Record<string, unknown>;

  // Ordered sections — render in this order, then any remaining keys
  const orderedKeys = [
    "version", "artifact", "commit", "signer", "environment",
    "timestamps", "agency", "slotAllocation", "attribution", "metadata", "claims",
  ];
  const remainingKeys = Object.keys(proofAny).filter((k) => !orderedKeys.includes(k));
  const allKeys = [...orderedKeys, ...remainingKeys].filter((k) => proofAny[k] !== undefined);

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
      {/* Breadcrumb */}
      <Link href="/explorer" className="text-sm text-text-tertiary hover:text-text transition-colors">
        &larr; Explorer
      </Link>

      {/* Hero */}
      <div className="mt-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-mono text-text-tertiary bg-bg-subtle/60 px-2 py-0.5 rounded">
            {proof.version}
          </span>
          <span className={`text-sm font-medium ${enforcementColor(proof.environment.enforcement)}`}>
            {enforcementLabel(proof.environment.enforcement)}
          </span>
          {proof.commit.counter && (
            <span className="text-sm font-mono text-text-tertiary">
              Proof #{proof.commit.counter}
            </span>
          )}
        </div>
        <h1 className="text-lg sm:text-xl font-mono font-bold text-text break-all leading-relaxed">
          {digestB64}
        </h1>
        {proof.commit.time && (
          <p className="mt-2 text-sm text-text-tertiary">
            Committed {new Date(proof.commit.time).toLocaleString()} ({relativeTime(proof.commit.time)})
          </p>
        )}
      </div>

      {/* Multiple proofs notice */}
      {results.length > 1 && (
        <div className="mt-4 rounded-lg bg-bg-subtle/50 border border-border-subtle px-4 py-3 text-sm text-text-secondary">
          This file has been proven {results.length} times. Showing the most recent.
        </div>
      )}

      {/* ── Detail Cards — one per top-level key ── */}
      <div className="mt-8 space-y-4">
        {allKeys.map((key) => {
          const value = proofAny[key];
          const title = sectionNames[key] || key;

          // Simple scalar — render inline
          if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            return (
              <SectionCard key={key} title={title} sectionKey={key}>
                <ValueRow label={key} value={value} />
              </SectionCard>
            );
          }

          // Object or array — render recursively
          if (typeof value === "object" && value !== null) {
            return (
              <SectionCard key={key} title={title} sectionKey={key}>
                <ObjectRenderer data={value} />
              </SectionCard>
            );
          }

          return null;
        })}

        {/* Attestation Verification */}
        {proof.environment?.attestation?.reportB64 && proof.environment?.measurement && (
          <AttestationVerifier
            reportB64={proof.environment.attestation.reportB64}
            measurement={proof.environment.measurement}
          />
        )}

        {/* Raw JSON */}
        <div className="mt-6">
          <ProofViewer proof={proof} />
        </div>
      </div>
    </div>
  );
}

/* ── Collapsible sections — these start expanded but can be toggled ── */

const collapsibleSections = new Set(["environment", "timestamps", "slotAllocation"]);

/* ── Section Card ── */

function SectionCard({ title, children, sectionKey }: { title: string; children: React.ReactNode; sectionKey?: string }) {
  const isCollapsible = sectionKey ? collapsibleSections.has(sectionKey) : false;
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
      <div
        role={isCollapsible ? "button" : undefined}
        tabIndex={isCollapsible ? 0 : undefined}
        onClick={isCollapsible ? () => setOpen(!open) : undefined}
        onKeyDown={isCollapsible ? (e) => e.key === "Enter" && setOpen(!open) : undefined}
        className={`w-full px-5 py-3.5 flex items-center justify-between ${isCollapsible ? "cursor-pointer hover:bg-bg-subtle/30 transition-colors" : ""} ${open ? "border-b border-border-subtle" : ""}`}
      >
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">{title}</h3>
        {isCollapsible && (
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="currentColor"
            className={`text-text-tertiary transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          >
            <path d="M4 1.5l5.5 5.5-5.5 5.5" />
          </svg>
        )}
      </div>
      {open && <div className="px-5 py-3">{children}</div>}
    </div>
  );
}

/* ── Human-readable field labels ── */

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
  clientDataJSON: "Client Data (WebAuthn)",
  authenticatorDataB64: "Authenticator Data (Base64)",
  keyId: "Key ID",
  commitTime: "Commit Time",
  batchSize: "Batch Size",
  batchIndex: "Batch Index",
  batchDigests: "Batch Digests",
};

function humanLabel(key: string): string {
  return fieldLabels[key] || key;
}

/* ── Detect epoch-ms timestamps ── */

function isEpochMs(key: string, value: unknown): boolean {
  if (typeof value !== "number") return false;
  if (!["time", "timestamp", "commitTime"].includes(key)) return false;
  return value > 1_000_000_000_000 && value < 2_000_000_000_000;
}

/* ── Recursive Object Renderer ── */

function ObjectRenderer({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) return null;

  // Array
  if (Array.isArray(data)) {
    // Short arrays of primitives — show inline
    if (data.length <= 5 && data.every((v) => typeof v === "string" || typeof v === "number")) {
      return (
        <div className="space-y-1">
          {data.map((item, i) => (
            <ValueRow key={i} label={`[${i}]`} value={item} />
          ))}
        </div>
      );
    }

    // Long arrays — collapsible
    return <CollapsibleArray items={data} />;
  }

  // Object
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    return (
      <div className={depth > 0 ? "pl-4 border-l border-border-subtle ml-1" : ""}>
        {entries.map(([key, value]) => {
          // Special: parse clientDataJSON as structured
          if (key === "clientDataJSON" && typeof value === "string") {
            try {
              const parsed = JSON.parse(value);
              return (
                <div key={key} className="py-2">
                  <div className="text-xs text-text-tertiary font-medium mb-1">{humanLabel(key)}</div>
                  <ObjectRenderer data={parsed} depth={depth + 1} />
                </div>
              );
            } catch {
              // fall through to scalar
            }
          }

          // Nested object — render with label + sub-renderer
          if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            return (
              <div key={key} className="py-2">
                <div className="text-xs text-text-tertiary font-medium mb-1">{humanLabel(key)}</div>
                <ObjectRenderer data={value} depth={depth + 1} />
              </div>
            );
          }

          // Nested array
          if (Array.isArray(value)) {
            return (
              <div key={key} className="py-2">
                <div className="text-xs text-text-tertiary font-medium mb-1">
                  {humanLabel(key)} ({value.length} items)
                </div>
                <ObjectRenderer data={value} depth={depth + 1} />
              </div>
            );
          }

          // Scalar
          return <ValueRow key={key} label={humanLabel(key)} value={value} rawKey={key} />;
        })}
      </div>
    );
  }

  // Scalar fallback
  return <span className="text-xs font-mono text-text break-all">{String(data)}</span>;
}

/* ── Collapsible Array (for long arrays like batchDigests) ── */

function CollapsibleArray({ items }: { items: unknown[] }) {
  const [expanded, setExpanded] = useState(false);
  const preview = items.slice(0, 3);
  const hasMore = items.length > 3;

  return (
    <div className="space-y-1">
      {(expanded ? items : preview).map((item, i) => (
        <div key={i} className="flex items-start gap-3 py-1">
          <span className="text-xs text-text-tertiary shrink-0 w-8 text-right">[{i}]</span>
          <span className="text-xs font-mono text-text break-all">
            {typeof item === "object" ? JSON.stringify(item) : String(item)}
          </span>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 transition-colors mt-2 font-medium"
        >
          <svg
            width="10" height="10" viewBox="0 0 14 14" fill="currentColor"
            className={`transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M4 1.5l5.5 5.5-5.5 5.5" />
          </svg>
          {expanded ? "Show less" : `Show all ${items.length} items`}
        </button>
      )}
    </div>
  );
}

/* ── Value Row with copy ── */

const BLOB_THRESHOLD = 200; // truncate values longer than this

function ValueRow({ label, value, rawKey }: { label: string; value: unknown; rawKey?: string }) {
  const [copied, setCopied] = useState(false);
  const [blobExpanded, setBlobExpanded] = useState(false);
  const strValue = typeof value === "object" ? JSON.stringify(value) : String(value);
  const isLong = strValue.length > 20;
  const isBlob = strValue.length > BLOB_THRESHOLD;
  const isMono = isLong || typeof value === "number";
  const showTimestamp = rawKey ? isEpochMs(rawKey, value) : false;
  const displayValue = isBlob && !blobExpanded ? strValue.slice(0, 80) + "..." : strValue;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(strValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [strValue]);

  return (
    <div className="flex items-start justify-between gap-4 py-2 group">
      <span className="text-xs text-text-tertiary shrink-0 pt-0.5">{label}</span>
      <div className="flex items-start gap-2 min-w-0">
        <div className="text-right">
          <span
            className={`text-xs break-all ${
              isMono ? "font-mono text-text" : "text-text-secondary"
            }`}
          >
            {displayValue}
          </span>
          {isBlob && (
            <button
              onClick={() => setBlobExpanded(!blobExpanded)}
              className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 transition-colors mt-1.5 ml-auto font-medium"
            >
              <svg
                width="10" height="10" viewBox="0 0 14 14" fill="currentColor"
                className={`transition-transform duration-200 ${blobExpanded ? "rotate-90" : ""}`}
              >
                <path d="M4 1.5l5.5 5.5-5.5 5.5" />
              </svg>
              {blobExpanded ? "Collapse" : `Expand (${strValue.length.toLocaleString()} chars)`}
            </button>
          )}
          {showTimestamp && (
            <div className="text-[10px] text-text-tertiary mt-0.5">
              {new Date(value as number).toLocaleString()}
            </div>
          )}
        </div>
        {isLong && (
          <button
            onClick={handleCopy}
            className="text-text-tertiary hover:text-text transition-colors opacity-0 group-hover:opacity-100 shrink-0 pt-0.5"
            title="Copy"
          >
            {copied ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

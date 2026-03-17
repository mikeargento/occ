"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ProofViewer } from "@/components/proof-viewer";
import type { OCCProof } from "@/lib/occ";
import {
  fromUrlSafeB64,
  toUrlSafeB64,
  relativeTime,
  enforcementLabel,
  enforcementColor,
  b64ToHex,
  truncateHash,
} from "@/lib/explorer";

/* ── Types ── */

interface LookupResult {
  proof: OCCProof;
  indexedAt: string;
}

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

  // Show the first (most recent) proof, with links to others if multiple exist
  const { proof } = results[0];

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
      {/* Breadcrumb */}
      <Link href="/explorer" className="text-sm text-text-tertiary hover:text-text transition-colors">
        &larr; Explorer
      </Link>

      {/* Hero */}
      <div className="mt-6">
        <div className="flex items-center gap-3 mb-3">
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

      {/* ── Detail Cards ── */}
      <div className="mt-8 space-y-4">
        {/* Artifact */}
        <DetailCard title="Artifact">
          <Row label="Hash Algorithm" value={proof.artifact.hashAlg.toUpperCase()} />
          <Row label="Digest (Base64)" value={proof.artifact.digestB64} mono copy />
          <Row label="Digest (Hex)" value={b64ToHex(proof.artifact.digestB64)} mono copy />
        </DetailCard>

        {/* Commit */}
        <DetailCard title="Commit">
          <Row label="Nonce" value={proof.commit.nonceB64} mono copy />
          {proof.commit.counter && <Row label="Counter" value={proof.commit.counter} />}
          {proof.commit.time && (
            <Row
              label="Time"
              value={`${new Date(proof.commit.time).toISOString()} (${proof.commit.time})`}
            />
          )}
          {proof.commit.epochId && <Row label="Epoch ID" value={proof.commit.epochId} mono copy />}
          {proof.commit.prevB64 && (
            <div className="flex items-start justify-between gap-3 py-2.5">
              <span className="text-xs text-text-tertiary shrink-0">Previous Proof</span>
              <Link
                href={`/explorer/${encodeURIComponent(toUrlSafeB64(proof.commit.prevB64))}`}
                className="text-xs font-mono text-emerald-400 hover:underline text-right break-all"
              >
                {truncateHash(proof.commit.prevB64, 24)}
              </Link>
            </div>
          )}
          {proof.commit.slotCounter && <Row label="Slot Counter" value={proof.commit.slotCounter} />}
          {proof.commit.slotHashB64 && <Row label="Slot Hash" value={proof.commit.slotHashB64} mono copy />}
        </DetailCard>

        {/* Signer */}
        <DetailCard title="Signer">
          <Row label="Public Key" value={proof.signer.publicKeyB64} mono copy />
          <Row label="Signature" value={proof.signer.signatureB64} mono copy />
        </DetailCard>

        {/* Environment */}
        <DetailCard title="Environment">
          <Row label="Enforcement" value={enforcementLabel(proof.environment.enforcement)} />
          <Row label="Measurement" value={proof.environment.measurement || "—"} mono={!!proof.environment.measurement} copy={!!proof.environment.measurement} />
          {proof.environment.attestation && (
            <>
              <Row label="Attestation Format" value={proof.environment.attestation.format} />
              <Row label="Attestation Report" value={truncateHash(proof.environment.attestation.reportB64, 40)} mono />
            </>
          )}
        </DetailCard>

        {/* Timestamps (TSA) */}
        {proof.timestamps && (
          <DetailCard title="Timestamps (RFC 3161)">
            {proof.timestamps.artifact && (
              <>
                <Row label="Artifact TSA" value={proof.timestamps.artifact.authority} />
                <Row label="Artifact Time" value={proof.timestamps.artifact.time} />
              </>
            )}
            {proof.timestamps.proof && (
              <>
                <Row label="Proof TSA" value={proof.timestamps.proof.authority} />
                <Row label="Proof Time" value={proof.timestamps.proof.time} />
              </>
            )}
          </DetailCard>
        )}

        {/* Agency */}
        {proof.agency && (
          <DetailCard title="Agency (Device Authorization)">
            <Row label="Actor Key ID" value={proof.agency.actor.keyId} mono copy />
            <Row label="Algorithm" value={proof.agency.actor.algorithm} />
            <Row label="Provider" value={proof.agency.actor.provider} />
            <Row label="Purpose" value={proof.agency.authorization.purpose} />
          </DetailCard>
        )}

        {/* Slot Allocation */}
        {proof.slotAllocation && (
          <DetailCard title="Slot Allocation (Causal Ordering)">
            <Row label="Nonce" value={proof.slotAllocation.nonceB64} mono copy />
            <Row label="Counter" value={proof.slotAllocation.counter} />
            <Row label="Time" value={new Date(proof.slotAllocation.time).toISOString()} />
            <Row label="Epoch ID" value={proof.slotAllocation.epochId} mono copy />
          </DetailCard>
        )}

        {/* Attribution */}
        {proof.attribution && (
          <DetailCard title="Attribution">
            {proof.attribution.name && <Row label="Name" value={proof.attribution.name} />}
            {proof.attribution.title && <Row label="Title" value={proof.attribution.title} />}
            {proof.attribution.message && <Row label="Message" value={proof.attribution.message} />}
          </DetailCard>
        )}

        {/* Metadata */}
        {proof.metadata && Object.keys(proof.metadata).length > 0 && (
          <DetailCard title="Metadata (Advisory)">
            {Object.entries(proof.metadata).map(([k, v]) => (
              <Row key={k} label={k} value={typeof v === "string" ? v : JSON.stringify(v)} />
            ))}
          </DetailCard>
        )}

        {/* Raw JSON */}
        <div className="mt-6">
          <ProofViewer proof={proof} />
        </div>
      </div>
    </div>
  );
}

/* ── Detail Card ── */

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border-subtle">
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-5 py-3 divide-y divide-border-subtle">{children}</div>
    </div>
  );
}

/* ── Row ── */

function Row({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <div className="flex items-start justify-between gap-4 py-2.5 group">
      <span className="text-xs text-text-tertiary shrink-0 pt-0.5">{label}</span>
      <div className="flex items-start gap-2 min-w-0">
        <span
          className={`text-xs text-right break-all ${
            mono ? "font-mono text-text" : "text-text-secondary"
          }`}
        >
          {value}
        </span>
        {copy && (
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

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getAuditEntry } from "@/lib/api";
import type { AuditEntry } from "@/lib/types";
import { Card } from "@/components/shared/card";
import { Badge } from "@/components/shared/badge";
import { JsonDisplay } from "@/components/shared/json-display";
import { formatTimestamp } from "@/lib/format";

export default function AuditEntryPage() {
  const params = useParams();
  const auditId = params.id as string;
  const [entry, setEntry] = useState<AuditEntry | null>(null);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAuditEntry(auditId)
      .then((res) => {
        setEntry(res.entry);
        setReceipt(res.receipt as Record<string, unknown> | null);
      })
      .catch((err) => setError(err.message));
  }, [auditId]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-[13px] text-error">
          {error}
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="skeleton h-8 w-48 mb-6" />
        <div className="skeleton h-[200px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary mb-6">
        <Link
          href="/audit"
          className="hover:text-text-secondary transition-colors"
        >
          Proof Log
        </Link>
        <ChevronRight />
        <span className="text-text-secondary font-mono">{auditId}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-lg font-semibold tracking-[-0.01em] font-mono">
          {entry.tool}
        </h1>
        {entry.decision.allowed ? (
          <Badge variant="success" dot>
            Allowed
          </Badge>
        ) : (
          <Badge variant="error" dot>
            Denied
          </Badge>
        )}
      </div>

      <div className="space-y-4">
        {/* Details */}
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-4">
            Event Details
          </p>
          <div className="grid grid-cols-2 gap-y-4 gap-x-8">
            <div>
              <p className="text-[11px] text-text-tertiary mb-0.5">Tool</p>
              <p className="text-[13px] font-mono text-text">{entry.tool}</p>
            </div>
            <div>
              <p className="text-[11px] text-text-tertiary mb-0.5">
                Timestamp
              </p>
              <p className="text-[13px] text-text tabular-nums">
                {formatTimestamp(entry.timestamp)}
              </p>
            </div>
            {entry.skill && (
              <div>
                <p className="text-[11px] text-text-tertiary mb-0.5">Skill</p>
                <p className="text-[13px] text-text">{entry.skill}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] text-text-tertiary mb-0.5">Decision</p>
              <p className="text-[13px]">
                {entry.decision.allowed ? (
                  <span className="text-success">Allowed</span>
                ) : (
                  <span className="text-error">Denied</span>
                )}
              </p>
            </div>
            {!entry.decision.allowed && (
              <div className="col-span-2 pt-2 border-t border-border-subtle">
                <p className="text-[11px] text-text-tertiary mb-1">
                  Violation
                </p>
                <p className="text-[13px] text-error">{entry.decision.reason}</p>
                <p className="text-[11px] text-text-tertiary font-mono mt-1">
                  {entry.decision.constraint}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Proof Digest */}
        {entry.proofDigestB64 && (
          <Card>
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-3">
              OCC Proof Digest
            </p>
            <div className="rounded-lg bg-bg-inset border border-border-subtle px-4 py-3">
              <p className="text-[12px] font-mono text-text-secondary break-all leading-relaxed">
                {entry.proofDigestB64}
              </p>
            </div>
          </Card>
        )}

        {/* Receipt */}
        {receipt != null && (
          <Card>
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-3">
              Execution Receipt
            </p>
            <JsonDisplay data={receipt} />
          </Card>
        )}
      </div>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      className="w-3 h-3 text-text-tertiary"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

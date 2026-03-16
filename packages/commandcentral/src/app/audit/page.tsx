"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAuditLog } from "@/lib/api";
import type { AuditEntry } from "@/lib/types";
import { Card } from "@/components/shared/card";
import { Badge } from "@/components/shared/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatTimestamp } from "@/lib/format";

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 25;

  useEffect(() => {
    setLoading(true);
    getAuditLog({ page, limit })
      .then((res) => {
        setEntries(res.entries);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Proof Log
          </h1>
          {total > 0 && (
            <p className="text-sm text-text-secondary mt-1">
              {total} recorded event{total !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="space-y-0">
          <div className="skeleton h-10 w-full rounded-t-xl" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-sm text-error">
          {error}
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <EmptyState
          icon="log"
          title="No activity recorded"
          description="Every tool call that flows through the proxy is logged here with its OCC proof."
        />
      )}

      {!loading && entries.length > 0 && (
        <Card padding={false}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-5 py-3">
                  Timestamp
                </th>
                <th className="text-left text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-4 py-3">
                  Tool
                </th>
                <th className="text-left text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-4 py-3">
                  Decision
                </th>
                <th className="text-left text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary px-5 py-3">
                  Proof
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border-subtle last:border-0 group hover:bg-bg-subtle/40 transition-colors duration-75"
                >
                  <td className="px-5 py-3 text-xs text-text-secondary tabular-nums whitespace-nowrap">
                    {formatTimestamp(entry.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-text">
                      {entry.tool}
                    </span>
                    {entry.skill && (
                      <span className="text-[11px] text-text-tertiary ml-1.5">
                        via {entry.skill}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {entry.decision.allowed ? (
                      <Badge variant="success" dot>
                        Allowed
                      </Badge>
                    ) : (
                      <Badge variant="error" dot>
                        Denied
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {entry.proofDigestB64 ? (
                      <Link
                        href={`/audit/${entry.id}`}
                        className="text-[11px] font-mono text-text-tertiary hover:text-info transition-colors"
                      >
                        {entry.proofDigestB64.slice(0, 16)}...
                      </Link>
                    ) : (
                      <span className="text-[11px] text-text-tertiary">
                        &mdash;
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > limit && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-xs text-text-secondary hover:text-text disabled:text-text-tertiary disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="text-[11px] text-text-tertiary tabular-nums">
                {page + 1} of {Math.ceil(total / limit)}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * limit >= total}
                className="text-xs text-text-secondary hover:text-text disabled:text-text-tertiary disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

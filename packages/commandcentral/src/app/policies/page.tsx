"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getPolicy } from "@/lib/api";
import type { AgentPolicy } from "@/lib/types";
import { Card } from "@/components/shared/card";
import { Badge } from "@/components/shared/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatTimestamp, formatCents } from "@/lib/format";
import { PolicyImport } from "@/components/policy-import";

export default function PoliciesPage() {
  const [policy, setPolicy] = useState<AgentPolicy | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [committedAt, setCommittedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPolicy = useCallback(() => {
    setLoading(true);
    getPolicy()
      .then((res) => {
        setPolicy(res.policy);
        setDigest(res.policyDigestB64 ?? null);
        setCommittedAt(res.committedAt ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Policies
          </h1>
          {!loading && policy && (
            <p className="text-sm text-text-secondary mt-1">
              1 active policy
            </p>
          )}
        </div>
        <Link
          href="/policies/new"
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-text text-bg hover:opacity-90 transition-opacity"
        >
          New Policy
        </Link>
      </div>

      {/* Import zone */}
      <PolicyImport onApplied={fetchPolicy} />

      {loading && <div className="skeleton h-[160px] rounded-xl" />}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-sm text-error">
          {error}
          <p className="text-xs text-text-tertiary mt-1">
            Make sure the proxy is running and connected.
          </p>
        </div>
      )}

      {!loading && !error && !policy && (
        <EmptyState
          icon="shield"
          title="No policy loaded"
          description="Create a policy to define constraints for your agents."
          action={
            <Link
              href="/policies/new"
              className="px-4 py-2 bg-bg-subtle border border-border rounded-lg text-sm text-text hover:bg-bg-subtle/80 transition-colors"
            >
              Create Policy
            </Link>
          }
        />
      )}

      {policy && (
        <Card>
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[14px] font-medium">{policy.name}</h2>
                <Badge variant="success" dot>
                  Active
                </Badge>
              </div>
              {policy.description && (
                <p className="text-sm text-text-secondary mt-1 leading-relaxed">
                  {policy.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-3 text-[11px] text-text-tertiary">
                {committedAt && <span>Committed {formatTimestamp(committedAt)}</span>}
                {digest && (
                  <span
                    className="font-mono truncate max-w-[200px]"
                    title={digest}
                  >
                    {digest.slice(0, 16)}...
                  </span>
                )}
              </div>
            </div>
            <Link
              href="/policies/active"
              className="text-xs text-text-secondary hover:text-text transition-colors flex-shrink-0 ml-4"
            >
              View details
            </Link>
          </div>

          {/* Constraint summary */}
          <div className="mt-5 pt-5 border-t border-border-subtle grid grid-cols-3 gap-6">
            <div>
              <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-1.5">
                Tools
              </p>
              <p className="text-[14px] font-medium">
                {policy.globalConstraints.allowedTools
                  ? `${policy.globalConstraints.allowedTools.length} allowed`
                  : "All allowed"}
                {policy.globalConstraints.blockedTools?.length
                  ? `, ${policy.globalConstraints.blockedTools.length} blocked`
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-1.5">
                Spend Limit
              </p>
              <p className="text-[14px] font-medium tabular-nums">
                {policy.globalConstraints.maxSpendCents !== undefined
                  ? formatCents(policy.globalConstraints.maxSpendCents)
                  : "Unlimited"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-1.5">
                Skills
              </p>
              <p className="text-[14px] font-medium">
                {Object.keys(policy.skills).length}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

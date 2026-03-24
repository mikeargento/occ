"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPolicy } from "@/lib/api";
import type { AgentPolicy } from "@/lib/types";
import { Card } from "@/components/shared/card";
import { JsonDisplay } from "@/components/shared/json-display";
import { Badge } from "@/components/shared/badge";

export default function PolicyDetailPage() {
  const [policy, setPolicy] = useState<AgentPolicy | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPolicy()
      .then((res) => {
        setPolicy(res.policy as any);
        setDigest(res.policyDigestB64 ?? null);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-[13px] text-error">
          {error}
        </div>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="skeleton h-[300px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary mb-6">
        <Link
          href="/policies"
          className="hover:text-text-secondary transition-colors"
        >
          Policies
        </Link>
        <ChevronRight />
        <span className="text-text-secondary">{policy.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em]">
            {policy.name}
          </h1>
          {policy.description && (
            <p className="text-[13px] text-text-secondary mt-1">
              {policy.description}
            </p>
          )}
        </div>
        <Badge variant="success" dot>
          Active
        </Badge>
      </div>

      <div className="space-y-4">
        {digest && (
          <Card>
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-2">
              OCC Policy Digest
            </p>
            <p className="text-[12px] font-mono text-text-secondary break-all leading-relaxed">
              {digest}
            </p>
          </Card>
        )}

        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Full Policy
          </p>
          <JsonDisplay data={policy} />
        </Card>
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

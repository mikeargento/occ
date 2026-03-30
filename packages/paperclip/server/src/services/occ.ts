/**
 * OCC Authorization Service
 *
 * Integrates cryptographic proofs into Paperclip's agent execution pipeline.
 * Every agent run gets an authorization proof (before) and execution proof (after).
 * Approval decisions also get proofs.
 *
 * All OCC operations are non-fatal — TEE failures log warnings but never block execution.
 */

import { createHash } from "node:crypto";
import { OCC_ENABLED, OCC_TEE_URL, OCC_EXPLORER_API, OCC_EXPLORER_URL } from "./occ-config.js";

// ── Types ──

interface OCCProof {
  version: string;
  artifact: { hashAlg: string; digestB64: string };
  commit: { counter?: string; time?: number; epochId?: string; [k: string]: unknown };
  signer: { publicKeyB64: string; signatureB64: string };
  environment: { enforcement: string; measurement: string; [k: string]: unknown };
  [k: string]: unknown;
}

interface ProofResult {
  digestB64: string;
  proof: OCCProof;
}

interface AgentInfo {
  id: string;
  name: string;
  companyId: string;
  adapterType: string;
}

interface RunInfo {
  id: string;
  status: string;
  contextSnapshot?: Record<string, unknown> | null;
}

interface AdapterResultInfo {
  exitCode?: number;
  timedOut?: boolean;
  usage?: { inputTokens?: number; outputTokens?: number } | null;
  summary?: string;
  errorMessage?: string;
}

interface ApprovalInfo {
  id: string;
  companyId: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
}

// ── Helpers ──

function sha256B64(data: string): string {
  return createHash("sha256").update(data).digest("base64");
}

function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalize((obj as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

async function commitToTEE(
  digestB64: string,
  metadata: Record<string, unknown>,
  attribution?: { name?: string; title?: string; message?: string },
): Promise<OCCProof | null> {
  const res = await fetch(`${OCC_TEE_URL}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      digests: [{ digestB64, hashAlg: "sha256" }],
      metadata,
      ...(attribution ? { attribution } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`TEE commit failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  // TEE returns array of proofs (one per digest)
  const proof = Array.isArray(data) ? data[0] : data.proofs?.[0] ?? data;
  return proof as OCCProof;
}

async function forwardToExplorer(proof: OCCProof): Promise<void> {
  try {
    await fetch(OCC_EXPLORER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof }),
    });
  } catch {
    // Non-critical — explorer indexing can fail silently
  }
}

// ── Service ──

export function occService() {
  return {
    isEnabled(): boolean {
      return OCC_ENABLED;
    },

    explorerUrl(digestB64: string): string {
      return `${OCC_EXPLORER_URL}/proof/${encodeURIComponent(digestB64)}`;
    },

    /**
     * Create an authorization proof BEFORE agent execution.
     * Records: agent identity, run ID, adapter type, timestamp.
     */
    async createRunAuthorizationProof(
      agent: AgentInfo,
      run: RunInfo,
    ): Promise<ProofResult | null> {
      if (!OCC_ENABLED) return null;

      const artifact = {
        type: "paperclip/run-authorization",
        agentId: agent.id,
        agentName: agent.name,
        companyId: agent.companyId,
        adapterType: agent.adapterType,
        runId: run.id,
        timestamp: Date.now(),
      };

      const canonical = canonicalize(artifact);
      const digestB64 = sha256B64(canonical);

      const proof = await commitToTEE(digestB64, {
        type: "paperclip/run-authorization",
        agentId: agent.id,
        runId: run.id,
        adapterType: agent.adapterType,
      }, {
        name: `${agent.name} — run authorized`,
        message: run.id,
      });

      if (!proof) return null;

      await forwardToExplorer(proof);
      return { digestB64: proof.artifact?.digestB64 ?? digestB64, proof };
    },

    /**
     * Create an execution proof AFTER agent execution completes.
     * Records: run result summary, exit code, usage, bound to auth proof via policy.
     */
    async createRunExecutionProof(
      agent: AgentInfo,
      run: RunInfo,
      result: AdapterResultInfo,
      authDigest: string | null,
    ): Promise<ProofResult | null> {
      if (!OCC_ENABLED) return null;

      const artifact = {
        type: "paperclip/run-execution",
        agentId: agent.id,
        companyId: agent.companyId,
        runId: run.id,
        exitCode: result.exitCode ?? null,
        timedOut: result.timedOut ?? false,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        hasError: !!result.errorMessage,
        timestamp: Date.now(),
      };

      const canonical = canonicalize(artifact);
      const digestB64 = sha256B64(canonical);

      const body: Record<string, unknown> = {
        digests: [{ digestB64, hashAlg: "sha256" }],
        metadata: {
          type: "paperclip/run-execution",
          agentId: agent.id,
          runId: run.id,
          exitCode: result.exitCode,
        },
        attribution: {
          name: `${agent.name} — run completed`,
          message: run.id,
        },
      };

      // Policy binding: link execution proof to authorization proof
      if (authDigest) {
        body.policy = { digestB64: authDigest, name: "paperclip-run-auth" };
      }

      const res = await fetch(`${OCC_TEE_URL}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`TEE commit failed: ${res.status}`);
      }

      const data = await res.json();
      const proof = (Array.isArray(data) ? data[0] : data.proofs?.[0] ?? data) as OCCProof;

      await forwardToExplorer(proof);
      return { digestB64: proof.artifact?.digestB64 ?? digestB64, proof };
    },

    /**
     * Create a proof when a Paperclip approval is resolved (approved/rejected).
     */
    async createApprovalResolutionProof(
      approval: ApprovalInfo,
      decision: "approved" | "rejected",
      decidedByUserId: string,
    ): Promise<ProofResult | null> {
      if (!OCC_ENABLED) return null;

      const artifact = {
        type: "paperclip/approval-resolution",
        approvalId: approval.id,
        companyId: approval.companyId,
        approvalType: approval.type,
        decision,
        // Hash the user ID for privacy (don't put email on chain)
        decidedBy: sha256B64(decidedByUserId),
        timestamp: Date.now(),
      };

      const canonical = canonicalize(artifact);
      const digestB64 = sha256B64(canonical);

      const proof = await commitToTEE(digestB64, {
        type: "paperclip/approval-resolution",
        approvalId: approval.id,
        decision,
      }, {
        name: `Approval ${decision}`,
        message: approval.id,
      });

      if (!proof) return null;

      await forwardToExplorer(proof);
      return { digestB64: proof.artifact?.digestB64 ?? digestB64, proof };
    },
  };
}

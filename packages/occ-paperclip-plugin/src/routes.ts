// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * HTTP route handlers exposed as Paperclip plugin data/action handlers.
 *
 * These back the plugin's UI and API:
 *   - "proofs"           → list proof entries for an agent
 *   - "verify"           → verify an agent's proof chain
 *   - "policy"           → get the loaded policy for an agent
 *   - "enforcement-stats" → get enforcement statistics for an agent
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { readProofLog } from "./proof-log.js";
import { verifyAgentProofs } from "./verifier.js";
import { loadPolicyFromAgent } from "./policy-loader.js";
import { getAgentContextSnapshot, getAgentAuditLog } from "./enforcer.js";

/**
 * Register all data handlers (backing usePluginData on the UI side).
 */
export function registerDataHandlers(ctx: PluginContext): void {
  // List proof log entries for an agent
  ctx.data.register("proofs", async (params) => {
    const agentId = typeof params["agentId"] === "string" ? params["agentId"] : "";
    if (!agentId) return { error: "agentId is required" };

    const limit = typeof params["limit"] === "number" ? params["limit"] : 100;
    const offset = typeof params["offset"] === "number" ? params["offset"] : 0;

    const entries = readProofLog(agentId);
    return {
      agentId,
      total: entries.length,
      entries: entries.slice(offset, offset + limit),
    };
  });

  // Verify proof chain for an agent
  ctx.data.register("verify", async (params) => {
    const agentId = typeof params["agentId"] === "string" ? params["agentId"] : "";
    if (!agentId) return { error: "agentId is required" };

    return await verifyAgentProofs(agentId);
  });

  // Get agent's loaded OCC policy
  ctx.data.register("policy", async (params) => {
    const agentId = typeof params["agentId"] === "string" ? params["agentId"] : "";
    const companyId = typeof params["companyId"] === "string" ? params["companyId"] : "";
    if (!agentId || !companyId) return { error: "agentId and companyId are required" };

    const agent = await ctx.agents.get(agentId, companyId);
    if (!agent) return { error: "Agent not found" };

    const policy = loadPolicyFromAgent(agent);
    return {
      agentId,
      hasPolicy: policy !== null,
      policy,
    };
  });

  // Get enforcement statistics
  ctx.data.register("enforcement-stats", async (params) => {
    const agentId = typeof params["agentId"] === "string" ? params["agentId"] : "";
    if (!agentId) return { error: "agentId is required" };

    const snapshot = getAgentContextSnapshot(agentId);
    const proofLog = readProofLog(agentId);

    const allowedCount = proofLog.filter((e) => e.decision === "allowed").length;
    const deniedCount = proofLog.filter((e) => e.decision === "denied").length;

    return {
      agentId,
      context: snapshot,
      proofLog: {
        totalEntries: proofLog.length,
        allowed: allowedCount,
        denied: deniedCount,
      },
    };
  });

  // Get audit log for an agent
  ctx.data.register("audit-log", async (params) => {
    const agentId = typeof params["agentId"] === "string" ? params["agentId"] : "";
    if (!agentId) return { error: "agentId is required" };

    const limit = typeof params["limit"] === "number" ? params["limit"] : 50;
    const offset = typeof params["offset"] === "number" ? params["offset"] : 0;

    const entries = getAgentAuditLog(agentId, { offset, limit });
    return {
      agentId,
      total: entries.length,
      entries,
    };
  });
}

/**
 * Register action handlers (backing usePluginAction on the UI side).
 */
export function registerActionHandlers(ctx: PluginContext): void {
  // Trigger a full proof chain verification
  ctx.actions.register("verify-proofs", async (params) => {
    const agentId = typeof params["agentId"] === "string" ? params["agentId"] : "";
    if (!agentId) throw new Error("agentId is required");

    const result = await verifyAgentProofs(agentId);

    // Log verification activity
    const companyId = typeof params["companyId"] === "string" ? params["companyId"] : "";
    if (companyId) {
      await ctx.activity.log({
        companyId,
        entityType: "agent",
        entityId: agentId,
        message: result.valid
          ? `OCC proof chain verified: ${result.verifiedEntries}/${result.totalEntries} entries valid`
          : `OCC proof chain verification FAILED: ${result.errors.length} errors`,
        metadata: {
          plugin: "occ.enforcement",
          valid: result.valid,
          totalEntries: result.totalEntries,
          errors: result.errors.length,
        },
      });
    }

    return result;
  });
}

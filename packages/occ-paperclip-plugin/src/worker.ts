// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * OCC Enforcement Plugin — Worker entry point.
 *
 * This plugin hooks into Paperclip's agent lifecycle to enforce OCC policies
 * on every tool call, with Ed25519-signed cryptographic proofs.
 *
 * Core flow:
 * 1. On setup, subscribes to agent events and registers enforcement tools
 * 2. When an agent runs, loads its OCC policy from metadata.occPolicy
 * 3. Every tool call is checked against the policy before execution
 * 4. Both allowed and denied calls get signed proofs
 * 5. Proofs are written to per-agent proof.jsonl files
 */

import {
  definePlugin,
  runWorker,
  type PluginContext,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, TOOL_NAMES, JOB_KEYS } from "./constants.js";
import { loadPolicyFromAgent, buildDefaultPolicy } from "./policy-loader.js";
import { enforceToolCall, resetAgentContext } from "./enforcer.js";
import { verifyAgentProofs } from "./verifier.js";
import { registerDataHandlers, registerActionHandlers } from "./routes.js";

interface OccEnforcementConfig {
  defaultDenyUnknownTools?: boolean;
  proofLogMaxEntries?: number;
  enableMetrics?: boolean;
}

const DEFAULT_CONFIG: OccEnforcementConfig = {
  defaultDenyUnknownTools: true,
  proofLogMaxEntries: 10000,
  enableMetrics: true,
};

let pluginCtx: PluginContext | null = null;

async function getConfig(ctx: PluginContext): Promise<OccEnforcementConfig> {
  const raw = await ctx.config.get();
  return { ...DEFAULT_CONFIG, ...(raw as OccEnforcementConfig) };
}

const plugin = definePlugin({
  async setup(ctx) {
    pluginCtx = ctx;
    ctx.logger.info("OCC Enforcement plugin starting");

    // Register data/action handlers for the UI
    registerDataHandlers(ctx);
    registerActionHandlers(ctx);

    // Subscribe to agent-related events
    await registerEventHandlers(ctx);

    // Register scheduled jobs
    await registerJobs(ctx);

    // Register agent tools
    await registerToolHandlers(ctx);

    ctx.logger.info("OCC Enforcement plugin setup complete");
  },

  async onHealth() {
    return {
      status: "ok",
      message: "OCC Enforcement plugin active",
      details: {
        pluginId: PLUGIN_ID,
      },
    };
  },

  async onConfigChanged(newConfig) {
    if (pluginCtx) {
      pluginCtx.logger.info("OCC Enforcement config updated", newConfig);
    }
  },

  async onValidateConfig(config) {
    const errors: string[] = [];
    const typed = config as OccEnforcementConfig;

    if (
      typed.proofLogMaxEntries !== undefined &&
      (typeof typed.proofLogMaxEntries !== "number" ||
        typed.proofLogMaxEntries < 100)
    ) {
      errors.push("proofLogMaxEntries must be a number >= 100");
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  },

  async onShutdown() {
    if (pluginCtx) {
      pluginCtx.logger.info("OCC Enforcement plugin shutting down");
    }
  },
});

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function registerEventHandlers(ctx: PluginContext): Promise<void> {
  // When an agent is updated, reset its enforcement context
  // (policy might have changed)
  ctx.events.on("agent.updated", async (event) => {
    const agentId = event.entityId;
    if (agentId) {
      resetAgentContext(agentId);
      ctx.logger.debug(`Reset enforcement context for agent ${agentId}`);
    }
  });

  // Log tool calls through OCC enforcement
  ctx.events.on("agent.run.started", async (event) => {
    const agentId = event.entityId;
    const companyId = event.companyId;
    if (!agentId) return;

    ctx.logger.debug(`Agent run started: ${agentId}`, {
      runId: (event.payload as Record<string, unknown>)?.["runId"] as string,
    });

    // Pre-load the policy so it's ready for enforcement
    const agent = await ctx.agents.get(agentId, companyId);
    if (agent) {
      const policy = loadPolicyFromAgent(agent);
      if (policy) {
        ctx.logger.info(`Loaded OCC policy for agent ${agentId}: ${policy.name}`);
      } else {
        ctx.logger.debug(`No OCC policy configured for agent ${agentId}`);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Scheduled jobs
// ---------------------------------------------------------------------------

async function registerJobs(ctx: PluginContext): Promise<void> {
  ctx.jobs.register(JOB_KEYS.pruneContexts, async (_job) => {
    ctx.logger.debug("Pruning stale execution contexts");
    // Contexts self-prune stale timestamps on access;
    // this job is a placeholder for future cleanup logic
    const config = await getConfig(ctx);
    if (config.enableMetrics) {
      await ctx.metrics.write("occ.enforcement.prune_job", 1, {
        source: "scheduled",
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Agent tool handlers
// ---------------------------------------------------------------------------

async function registerToolHandlers(ctx: PluginContext): Promise<void> {
  // Tool 1: Dry-run policy check
  ctx.tools.register(
    TOOL_NAMES.enforceCheck,
    {
      displayName: "OCC Policy Check",
      description:
        "Check whether a tool call would be allowed by the agent's OCC policy.",
      parametersSchema: {
        type: "object",
        properties: {
          toolName: { type: "string" },
          args: { type: "object" },
        },
        required: ["toolName"],
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const payload = params as { toolName?: string; args?: Record<string, unknown> };
      const toolName = payload.toolName;
      if (!toolName) {
        return { error: "toolName is required" };
      }

      const agent = await ctx.agents.get(runCtx.agentId, runCtx.companyId);
      if (!agent) {
        return { error: "Agent not found" };
      }

      const policy =
        loadPolicyFromAgent(agent) ??
        buildDefaultPolicy(agent.name);

      const result = await enforceToolCall(
        runCtx.agentId,
        policy,
        toolName,
        payload.args ?? {},
      );

      const config = await getConfig(ctx);
      if (config.enableMetrics) {
        await ctx.metrics.write("occ.enforcement.check", 1, {
          tool: toolName,
          allowed: String(result.decision.allowed),
        });
      }

      if (result.decision.allowed) {
        return {
          content: `Tool "${toolName}" is ALLOWED by OCC policy "${policy.name}"`,
          data: {
            allowed: true,
            policy: policy.name,
            proofSigned: result.proof !== null,
          },
        };
      }

      return {
        content: `Tool "${toolName}" is DENIED: ${result.decision.reason}`,
        data: {
          allowed: false,
          reason: result.decision.reason,
          constraint: result.decision.constraint,
          policy: policy.name,
          proofSigned: result.proof !== null,
        },
      };
    },
  );

  // Tool 2: Verify proof chain
  ctx.tools.register(
    TOOL_NAMES.verifyProofs,
    {
      displayName: "OCC Verify Proof Chain",
      description: "Verify the cryptographic proof chain for this agent.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const result = await verifyAgentProofs(runCtx.agentId);

      const config = await getConfig(ctx);
      if (config.enableMetrics) {
        await ctx.metrics.write("occ.enforcement.verify", 1, {
          valid: String(result.valid),
          entries: String(result.totalEntries),
        });
      }

      if (result.valid) {
        return {
          content: `Proof chain VALID: ${result.verifiedEntries}/${result.totalEntries} entries verified. Chain intact: ${result.chainIntact}`,
          data: result,
        };
      }

      return {
        content: `Proof chain INVALID: ${result.errors.length} errors found in ${result.totalEntries} entries`,
        data: result,
      };
    },
  );
}

export default plugin;
runWorker(plugin, import.meta.url);

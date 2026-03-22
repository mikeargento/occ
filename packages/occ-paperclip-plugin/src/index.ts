// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * OCC Enforcement Plugin for Paperclip
 *
 * Makes every Paperclip agent's tool calls go through OCC policy enforcement
 * with cryptographic proofs.
 *
 * ## As a Paperclip Plugin
 *
 * Install via the plugin manager:
 * ```
 * curl -X POST http://127.0.0.1:3100/api/plugins/install \
 *   -H "Content-Type: application/json" \
 *   -d '{"packageName":"/path/to/occ-paperclip-plugin","isLocalPath":true}'
 * ```
 *
 * ## As a Standalone Integration
 *
 * Import the enforcement functions directly:
 * ```ts
 * import { enforceToolCall, loadPolicyFromAgent, verifyAgentProofs } from "@occ/paperclip-plugin";
 * ```
 */

// Core enforcement
export { enforceToolCall, resetAgentContext, getAgentContextSnapshot, getAgentAuditLog } from "./enforcer.js";

// Policy loading
export { loadPolicyFromAgent, buildDefaultPolicy } from "./policy-loader.js";

// Proof signing
export { getAgentSigner, type PluginSigner } from "./signer.js";

// Proof log
export { readProofLog, appendProofEntry, getProofLogPath, type ProofLogEntry } from "./proof-log.js";

// Verification
export { verifyAgentProofs, type VerificationResult, type VerificationError } from "./verifier.js";

// Re-export key types from policy-sdk for convenience
export type {
  AgentPolicy,
  EnforcementDecision,
  EnforcementRequest,
  ExecutionContextState,
} from "occ-policy-sdk";

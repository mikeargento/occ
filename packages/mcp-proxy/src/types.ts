// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { AuditEntry, EnforcementDecision } from "occ-policy-sdk";
import type { ExecutionReceipt } from "occ-agent";

/** Tool metadata as discovered from downstream MCP servers. */
export interface DiscoveredTool {
  name: string;
  description?: string | undefined;
  inputSchema?: Record<string, unknown> | undefined;
  /** Which downstream server provides this tool. */
  source: string;
}

/** Events emitted by the proxy for real-time monitoring. */
export type ProxyEvent =
  | { type: "tool-executed"; timestamp: number; tool: string; skill?: string; agentId: string; costCents: number; proofDigestB64?: string }
  | { type: "policy-violation"; timestamp: number; tool: string; skill?: string; agentId: string; reason: string; constraint: string }
  | { type: "context-updated"; timestamp: number; agentId: string }
  | { type: "policy-loaded"; timestamp: number; policyName: string; policyDigestB64: string }
  | { type: "proxy-started"; timestamp: number; toolCount: number }
  | { type: "agent-connected"; timestamp: number; agentId: string }
  | { type: "agent-disconnected"; timestamp: number; agentId: string };

/** Result from the interceptor after handling a tool call. */
export interface InterceptResult {
  /** The tool result content to return to the agent. */
  content: Array<{ type: string; text?: string }>;
  /** Whether the content indicates an error. */
  isError: boolean;
  /** The enforcement decision. */
  decision: EnforcementDecision;
  /** The OCC receipt (only if execution succeeded). */
  receipt?: ExecutionReceipt | undefined;
  /** Audit entry ID. */
  auditId: string;
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { ConsensusEngine } from "./consensus.js";

export interface ConsensusRouteResponse {
  status: number;
  body: unknown;
}

/**
 * Handle consensus API routes.
 * Returns a response object or null if the route doesn't match.
 */
export function handleConsensusRoute(
  engine: ConsensusEngine,
  method: string,
  route: string,
  body?: Record<string, unknown>,
): ConsensusRouteResponse | null {
  // POST /api/consensus — submit new request
  if (method === "POST" && route === "/consensus") {
    if (!body || !body.agentId || !body.tool || body.requiredApprovals == null) {
      return { status: 400, body: { error: "agentId, tool, and requiredApprovals are required" } };
    }
    const request = engine.submit(
      body.agentId as string,
      body.tool as string,
      (body.args as Record<string, unknown>) ?? {},
      body.requiredApprovals as number,
    );
    return { status: 201, body: { request } };
  }

  // GET /api/consensus — list pending
  if (method === "GET" && route === "/consensus") {
    return { status: 200, body: { requests: engine.getPending() } };
  }

  // GET /api/consensus/:id
  const getMatch = route.match(/^\/consensus\/([^/]+)$/);
  if (method === "GET" && getMatch) {
    const id = getMatch[1]!;
    const request = engine.getRequest(id);
    if (!request) return { status: 404, body: { error: `Request "${id}" not found` } };
    return { status: 200, body: { request } };
  }

  // POST /api/consensus/:id/approve
  const approveMatch = route.match(/^\/consensus\/([^/]+)\/approve$/);
  if (method === "POST" && approveMatch) {
    const id = approveMatch[1]!;
    if (!body || !body.agentId) {
      return { status: 400, body: { error: "agentId is required" } };
    }
    try {
      const request = engine.approve(id, body.agentId as string);
      return { status: 200, body: { request } };
    } catch (err) {
      return { status: 400, body: { error: err instanceof Error ? err.message : "Failed" } };
    }
  }

  // POST /api/consensus/:id/fix
  const fixMatch = route.match(/^\/consensus\/([^/]+)\/fix$/);
  if (method === "POST" && fixMatch) {
    const id = fixMatch[1]!;
    if (!body || !body.agentId || !body.args) {
      return { status: 400, body: { error: "agentId and args are required" } };
    }
    try {
      const request = engine.fixAndApprove(
        id,
        body.agentId as string,
        body.args as Record<string, unknown>,
        body.note as string | undefined,
      );
      return { status: 200, body: { request } };
    } catch (err) {
      return { status: 400, body: { error: err instanceof Error ? err.message : "Failed" } };
    }
  }

  // POST /api/consensus/:id/changes
  const changesMatch = route.match(/^\/consensus\/([^/]+)\/changes$/);
  if (method === "POST" && changesMatch) {
    const id = changesMatch[1]!;
    if (!body || !body.agentId || !body.note) {
      return { status: 400, body: { error: "agentId and note are required" } };
    }
    try {
      const request = engine.requestChanges(
        id,
        body.agentId as string,
        body.note as string,
      );
      return { status: 200, body: { request } };
    } catch (err) {
      return { status: 400, body: { error: err instanceof Error ? err.message : "Failed" } };
    }
  }

  return null; // route not handled
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ProxyConfig {
  /** Unique proxy instance ID. */
  proxyId: string;
  /** Downstream MCP servers to connect to. */
  downstreamServers: DownstreamServer[];
  /** OCC signing mode: "local" uses embedded StubHost, "remote" uses external commit service. */
  signerMode: "local" | "remote";
  /** Path to persist local signer state (keypair, counter). Used when signerMode is "local". */
  signerStatePath: string;
  /** OCC commit service URL (only used when signerMode is "remote"). */
  occApiUrl: string;
  /** OCC API key (only used when signerMode is "remote"). */
  occApiKey?: string | undefined;
  /** Management API port (for dashboard). */
  managementPort: number;
  /** MCP server transport type. */
  mcpTransport: "stdio" | "http";
  /** HTTP port (if transport is "http"). */
  mcpPort?: number | undefined;
  /** Path to a default policy JSON file to auto-load on startup. */
  defaultPolicyPath?: string | undefined;
  /** Name for the auto-created default agent. */
  defaultAgentName?: string | undefined;
}

export interface DownstreamServer {
  /** Human-readable name. */
  name: string;
  /** How to connect: command (stdio) or URL (http). */
  transport: "stdio" | "http";
  /** For stdio: command to run. */
  command?: string | undefined;
  /** For stdio: command arguments. */
  args?: string[] | undefined;
  /** For http: server URL. */
  url?: string | undefined;
  /** Environment variables to pass (for stdio). */
  env?: Record<string, string> | undefined;
}

const DEFAULT_CONFIG: ProxyConfig = {
  proxyId: "occ-agent-1",
  downstreamServers: [],
  signerMode: "remote",
  signerStatePath: resolve(process.cwd(), ".occ/signer-state.json"),
  occApiUrl: "https://nitro.occproof.com/commit",
  managementPort: 9100,
  mcpTransport: "stdio",
};

export function loadConfig(path?: string): ProxyConfig {
  if (!path) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as Partial<ProxyConfig>;

  return {
    proxyId: parsed.proxyId ?? DEFAULT_CONFIG.proxyId,
    downstreamServers: parsed.downstreamServers ?? DEFAULT_CONFIG.downstreamServers,
    signerMode: parsed.signerMode ?? DEFAULT_CONFIG.signerMode,
    signerStatePath: parsed.signerStatePath ?? DEFAULT_CONFIG.signerStatePath,
    occApiUrl: parsed.occApiUrl ?? DEFAULT_CONFIG.occApiUrl,
    occApiKey: parsed.occApiKey,
    managementPort: parsed.managementPort ?? DEFAULT_CONFIG.managementPort,
    mcpTransport: parsed.mcpTransport ?? DEFAULT_CONFIG.mcpTransport,
    mcpPort: parsed.mcpPort,
    defaultPolicyPath: parsed.defaultPolicyPath,
    defaultAgentName: parsed.defaultAgentName,
  };
}

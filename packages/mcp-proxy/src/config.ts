// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Signer backend mode. */
export type SignerMode = "occ-cloud" | "custom-tee" | "local";

export interface ProxyConfig {
  /** Unique proxy instance ID. */
  proxyId: string;
  /** Downstream MCP servers to connect to. */
  downstreamServers: DownstreamServer[];
  /** Signer backend: "local" (Ed25519 on disk), "occ-cloud" (OCC Nitro Enclave), or "custom-tee" (your own TEE). */
  signerMode: SignerMode;
  /** Path to persist local signer state (keypair, counter). Used when signerMode is "local". */
  signerStatePath: string;
  /** TEE endpoint URL. Used when signerMode is "occ-cloud" or "custom-tee". */
  teeUrl: string;
  /** OCC API key (optional, for authenticated TEE endpoints). */
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

/** Default OCC Cloud TEE endpoint. */
export const OCC_CLOUD_URL = "https://nitro.occproof.com/commit";

const DEFAULT_CONFIG: ProxyConfig = {
  proxyId: "occ-agent-1",
  downstreamServers: [],
  signerMode: "local",
  signerStatePath: resolve(process.cwd(), ".occ/signer-state.json"),
  teeUrl: OCC_CLOUD_URL,
  managementPort: 9100,
  mcpTransport: "stdio",
};

export function loadConfig(path?: string): ProxyConfig {
  if (!path) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as Partial<ProxyConfig>;

  // Support legacy "remote" signerMode → map to "occ-cloud"
  let signerMode = parsed.signerMode ?? DEFAULT_CONFIG.signerMode;
  if (signerMode === ("remote" as string)) signerMode = "occ-cloud";

  // Support legacy "occApiUrl" field → map to "teeUrl"
  const teeUrl = parsed.teeUrl ?? (parsed as Record<string, unknown>).occApiUrl as string | undefined ?? DEFAULT_CONFIG.teeUrl;

  return {
    proxyId: parsed.proxyId ?? DEFAULT_CONFIG.proxyId,
    downstreamServers: parsed.downstreamServers ?? DEFAULT_CONFIG.downstreamServers,
    signerMode,
    signerStatePath: parsed.signerStatePath ?? DEFAULT_CONFIG.signerStatePath,
    teeUrl,
    occApiKey: parsed.occApiKey,
    managementPort: parsed.managementPort ?? DEFAULT_CONFIG.managementPort,
    mcpTransport: parsed.mcpTransport ?? DEFAULT_CONFIG.mcpTransport,
    mcpPort: parsed.mcpPort,
    defaultPolicyPath: parsed.defaultPolicyPath,
    defaultAgentName: parsed.defaultAgentName,
  };
}

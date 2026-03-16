#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * OCC Agent — control plane for autonomous AI agents.
 *
 * Usage:
 *   occ-mcp-proxy                         # start dashboard, auto-opens browser
 *   occ-mcp-proxy --config proxy.json     # custom config
 *   occ-mcp-proxy --mcp                   # also start MCP server (for Claude Desktop)
 *   occ-mcp-proxy --no-open               # don't auto-open browser
 */

import { loadConfig } from "./config.js";
import { ProxyEventBus } from "./events.js";
import { ToolRegistry } from "./tool-registry.js";
import { ProxyState } from "./state.js";
import { Interceptor } from "./interceptor.js";
import { startMcpServer } from "./mcp-server.js";
import { startManagementApi } from "./management-api.js";
import { createLocalSigner } from "./local-signer.js";

// ── Parse CLI args ──
const configPath = (() => {
  const idx = process.argv.indexOf("--config");
  return idx !== -1 ? process.argv[idx + 1] : undefined;
})();
const enableMcp = process.argv.includes("--mcp");

// ── Initialize ──
const config = loadConfig(configPath);
const events = new ProxyEventBus();
const registry = new ToolRegistry();
const state = new ProxyState(events);

async function main(): Promise<void> {
  console.error("");
  console.error("  OCC Agent");
  console.error("  Control plane for autonomous AI agents");
  console.error("");

  // ── Initialize signer ──
  let interceptor: Interceptor;
  let localSigner;

  if (config.signerMode === "local") {
    localSigner = await createLocalSigner(config.signerStatePath);
    console.error(`  Signer: local (${localSigner.publicKeyB64.slice(0, 12)}...)`);
    interceptor = new Interceptor(registry, state, events, { localSigner });
  } else {
    console.error(`  Signer: remote (${config.occApiUrl})`);
    interceptor = new Interceptor(registry, state, events, {
      occConfig: {
        apiUrl: config.occApiUrl,
        apiKey: config.occApiKey,
        runtime: "occ-agent",
      },
    });
  }

  // Connect to downstream servers
  if (config.downstreamServers.length > 0) {
    await registry.initialize(config.downstreamServers);
    console.error(`  Tools: ${registry.listTools().length} discovered`);
  } else {
    // No downstream servers — register demo tools for testing
    registry.registerDemoTools();
    console.error(`  Tools: ${registry.listTools().length} (demo mode)`);
  }

  // Auto-create default agent (default-deny: no tools enabled)
  const defaultAgent = state.createAgent(config.defaultAgentName ?? "default-agent");
  console.error(`  Agent: ${defaultAgent.name} (default-deny)`);
  console.error("");

  // Start management API + dashboard
  startManagementApi(config, state, events, registry, localSigner);

  // Start MCP server (only when --mcp flag is passed, for Claude Desktop)
  if (enableMcp) {
    await startMcpServer(config, registry, interceptor, events);
  }

  events.emit({
    type: "proxy-started",
    timestamp: Date.now(),
    toolCount: registry.listTools().length,
  });

  const url = `http://localhost:${config.managementPort}`;

  // Print Claude Desktop config snippet when MCP is enabled
  if (enableMcp) {
    const proxyPath = process.argv[1] ?? "occ-mcp-proxy";
    const configArg = configPath ? `, "--config", "${configPath}"` : "";
    console.error("");
    console.error("  Add to Claude Desktop (Settings → Developer → MCP Servers):");
    console.error("");
    console.error(`  {`);
    console.error(`    "mcpServers": {`);
    console.error(`      "occ-agent": {`);
    console.error(`        "command": "node",`);
    console.error(`        "args": ["${proxyPath}", "--mcp"${configArg}]`);
    console.error(`      }`);
    console.error(`    }`);
    console.error(`  }`);
    console.error("");
  }

  // Auto-open browser (only when --open flag is passed)
  if (process.argv.includes("--open")) {
    try {
      const { exec } = await import("node:child_process");
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${cmd} ${url}`);
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error("[occ-agent] Fatal error:", err);
  process.exit(1);
});

export { config, events, registry, state };

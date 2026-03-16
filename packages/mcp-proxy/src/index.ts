#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * OCC MCP Proxy — cryptographic proof for every AI tool call.
 *
 * Usage:
 *   occ-mcp-proxy --wrap <command> [args...]   # wrap any MCP server with proof
 *   occ-mcp-proxy --mcp                        # dashboard + MCP server mode
 *   occ-mcp-proxy --config proxy.json --mcp    # custom config
 */

import { resolve } from "node:path";

// ── Detect mode ──
const wrapIdx = process.argv.indexOf("--wrap");

if (wrapIdx !== -1) {
  // --wrap mode: transparent proof layer, no dashboard
  const useTee = process.argv.includes("--tee");
  const wrapArgs = process.argv.slice(wrapIdx + 1).filter((a) => a !== "--tee");
  if (wrapArgs.length === 0) {
    console.error("Usage: occ-mcp-proxy --wrap [--tee] <command> [args...]");
    console.error("");
    console.error("Example:");
    console.error("  occ-mcp-proxy --wrap npx my-mcp-server");
    console.error("  occ-mcp-proxy --wrap --tee npx my-mcp-server  # sign via Nitro Enclave");
    console.error("");
    console.error("Claude Desktop config:");
    console.error("  {");
    console.error('    "mcpServers": {');
    console.error('      "my-server": {');
    console.error('        "command": "npx",');
    console.error('        "args": ["occ-mcp-proxy", "--wrap", "npx", "my-mcp-server"]');
    console.error("      }");
    console.error("    }");
    console.error("  }");
    process.exit(1);
  }

  const command = wrapArgs[0]!;
  const args = wrapArgs.slice(1);

  runWrapMode(command, args, useTee).catch((err) => {
    console.error("[occ] Fatal:", err);
    process.exit(1);
  });
} else {
  // Dashboard mode (original behavior)
  runDashboardMode().catch((err) => {
    console.error("[occ-agent] Fatal error:", err);
    process.exit(1);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// --wrap mode: zero config, just proof
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function runWrapMode(command: string, args: string[], useTee = false): Promise<void> {
  const { ProxyEventBus } = await import("./events.js");
  const { ToolRegistry } = await import("./tool-registry.js");
  const { ProxyState } = await import("./state.js");
  const { Interceptor } = await import("./interceptor.js");
  const { startMcpServer } = await import("./mcp-server.js");
  const { ProofWriter } = await import("./proof-writer.js");
  const { mkdirSync } = await import("node:fs");

  const signerStatePath = resolve(process.cwd(), ".occ/signer-state.json");
  mkdirSync(resolve(process.cwd(), ".occ"), { recursive: true });

  console.error("");
  console.error("  OCC Proof");
  console.error("  Cryptographic proof for every tool call");
  console.error("");

  // 1. Connect to the downstream MCP server
  const events = new ProxyEventBus();
  const registry = new ToolRegistry();
  const state = new ProxyState(events);

  console.error(`  Wrapping: ${command} ${args.join(" ")}`);

  await registry.initialize([
    {
      name: "wrapped",
      transport: "stdio",
      command,
      args,
    },
  ]);

  const toolCount = registry.listTools().length;
  console.error(`  Tools: ${toolCount} discovered`);

  // 2. Allow-all agent (no enforcement — just proof)
  const allToolNames = registry.listTools().map((t) => t.name);
  state.createAgent("default", allToolNames);

  // 3. Proof file
  const proofWriter = new ProofWriter();

  // 4. Initialize signer (local or TEE)
  type InterceptorOpts = {
    localSigner?: Awaited<ReturnType<typeof import("./local-signer.js").createLocalSigner>>;
    occConfig?: { apiUrl: string; apiKey?: string | undefined; runtime: string };
    proofWriter: (entry: {
      timestamp: string; tool: string; args: Record<string, unknown>;
      output: unknown; receipt?: unknown | undefined; proofDigestB64?: string | undefined;
    }) => void;
  };

  const interceptorOpts: InterceptorOpts = {
    proofWriter: (entry) => proofWriter.append(entry),
  };

  if (useTee) {
    const OCC_API_URL = "https://nitro.occproof.com/commit";
    console.error(`  Signer: TEE (${OCC_API_URL})`);
    interceptorOpts.occConfig = { apiUrl: OCC_API_URL, runtime: "occ-agent" };
  } else {
    const { createLocalSigner } = await import("./local-signer.js");
    const localSigner = await createLocalSigner(signerStatePath);
    console.error(`  Signer: local (${localSigner.publicKeyB64.slice(0, 16)}...)`);
    interceptorOpts.localSigner = localSigner;
  }

  console.error(`  Proof log: ${proofWriter.path}`);
  console.error("");

  // 5. Interceptor: sign everything, write to file
  const interceptor = new Interceptor(registry, state, events, interceptorOpts);

  // 6. Start MCP server on stdio
  await startMcpServer(
    {
      proxyId: "occ-wrap",
      downstreamServers: [],
      signerMode: "local",
      signerStatePath,
      occApiUrl: "",
      managementPort: 0,
      mcpTransport: "stdio",
    },
    registry,
    interceptor,
    events,
    state,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dashboard mode (original)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function runDashboardMode(): Promise<void> {
  const { loadConfig } = await import("./config.js");
  const { ProxyEventBus } = await import("./events.js");
  const { ToolRegistry } = await import("./tool-registry.js");
  const { ProxyState } = await import("./state.js");
  const { Interceptor } = await import("./interceptor.js");
  const { startMcpServer } = await import("./mcp-server.js");
  const { startManagementApi, forwardAuditToPrimary, isManagementPrimary } = await import("./management-api.js");
  const { createLocalSigner } = await import("./local-signer.js");

  const configPath = (() => {
    const idx = process.argv.indexOf("--config");
    return idx !== -1 ? process.argv[idx + 1] : undefined;
  })();
  const enableMcp = process.argv.includes("--mcp");

  const config = loadConfig(configPath);
  const events = new ProxyEventBus();
  const registry = new ToolRegistry();
  const state = new ProxyState(events);

  console.error("");
  console.error("  OCC Agent");
  console.error("  Control plane for autonomous AI agents");
  console.error("");

  // Initialize signer
  let localSigner;

  if (config.signerMode === "local") {
    localSigner = await createLocalSigner(config.signerStatePath);
    console.error(`  Signer: local (${localSigner.publicKeyB64.slice(0, 12)}...)`);
  } else {
    console.error(`  Signer: remote (${config.occApiUrl})`);
  }

  const auditForwarder = (entry: {
    tool: string;
    agentId: string;
    decision: { allowed: boolean; reason?: string | undefined; constraint?: string | undefined };
    timestamp: number;
    receipt?: unknown | undefined;
    proofDigestB64?: string | undefined;
  }) => {
    if (!isManagementPrimary()) {
      forwardAuditToPrimary(entry).catch(() => {});
    }
  };

  const interceptor = localSigner
    ? new Interceptor(registry, state, events, { localSigner, auditForwarder })
    : new Interceptor(registry, state, events, {
        occConfig: {
          apiUrl: config.occApiUrl,
          apiKey: config.occApiKey,
          runtime: "occ-agent",
        },
        auditForwarder,
      });

  // Connect to downstream servers
  if (config.downstreamServers.length > 0) {
    await registry.initialize(config.downstreamServers);
    console.error(`  Tools: ${registry.listTools().length} discovered`);
  } else {
    registry.registerDemoTools();
    console.error(`  Tools: ${registry.listTools().length} (demo mode)`);
  }

  // Auto-create default agent (default-deny: no tools enabled)
  const defaultAgent = state.createAgent(config.defaultAgentName ?? "default-agent");
  console.error(`  Agent: ${defaultAgent.name} (default-deny)`);
  console.error("");

  // Start management API + dashboard
  startManagementApi(config, state, events, registry, localSigner);

  // Start MCP server (only when --mcp flag is passed)
  if (enableMcp) {
    await startMcpServer(config, registry, interceptor, events, state);
  }

  events.emit({
    type: "proxy-started",
    timestamp: Date.now(),
    toolCount: registry.listTools().length,
  });

  if (enableMcp) {
    const proxyPath = process.argv[1] ?? "occ-mcp-proxy";
    const configArg = configPath ? `, "--config", "${configPath}"` : "";
    console.error("");
    console.error("  Add to Claude Desktop (Settings → Developer → MCP Servers):");
    console.error("");
    console.error("  {");
    console.error('    "mcpServers": {');
    console.error('      "occ-agent": {');
    console.error('        "command": "node",');
    console.error(`        "args": ["${proxyPath}", "--mcp"${configArg}]`);
    console.error("      }");
    console.error("    }");
    console.error("  }");
    console.error("");
  }

  if (process.argv.includes("--open")) {
    try {
      const { exec } = await import("node:child_process");
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${cmd} http://localhost:${config.managementPort}`);
    } catch {
      // ignore
    }
  }
}

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
 *   occ-mcp-proxy verify <proof.jsonl> [--policy policy.json]  # verify a proof log
 */

import { resolve } from "node:path";

// ── Verify subcommand ──
const verifyIdx = process.argv.indexOf("verify");
if (verifyIdx !== -1) {
  const proofPath = process.argv[verifyIdx + 1];
  if (!proofPath) {
    console.error("Usage: occ-mcp-proxy verify <proof.jsonl> [--policy policy.json]");
    process.exit(1);
  }
  const policyIdx = process.argv.indexOf("--policy");
  const policyPath = policyIdx !== -1 ? process.argv[policyIdx + 1] : undefined;

  const { verifyProofChain } = await import("./verify.js");
  await verifyProofChain(resolve(proofPath), policyPath ? resolve(policyPath) : undefined);
  process.exit(0);
}

// ── Detect mode ──
const wrapIdx = process.argv.indexOf("--wrap");

if (wrapIdx !== -1) {
  // --wrap mode: transparent proof layer, no dashboard

  // Parse flags from wrap args
  let policyPath: string | undefined;
  let signerMode: "local" | "occ-cloud" | "custom-tee" = "local";
  let teeUrl: string | undefined;
  let dashboardPort = 9100;
  let noDashboard = false;
  const rawWrapArgs = process.argv.slice(wrapIdx + 1);
  const filteredWrapArgs: string[] = [];
  for (let i = 0; i < rawWrapArgs.length; i++) {
    if (rawWrapArgs[i] === "--policy") {
      policyPath = rawWrapArgs[++i];
    } else if (rawWrapArgs[i] === "--tee") {
      // Legacy shorthand for --signer occ-cloud
      signerMode = "occ-cloud";
    } else if (rawWrapArgs[i] === "--signer") {
      const val = rawWrapArgs[++i];
      if (val === "local" || val === "occ-cloud" || val === "custom-tee") {
        signerMode = val;
      } else {
        console.error(`Unknown signer mode: ${val}. Use: local, occ-cloud, custom-tee`);
        process.exit(1);
      }
    } else if (rawWrapArgs[i] === "--tee-url") {
      teeUrl = rawWrapArgs[++i];
    } else if (rawWrapArgs[i] === "--dashboard-port") {
      dashboardPort = parseInt(rawWrapArgs[++i] ?? "9100", 10);
    } else if (rawWrapArgs[i] === "--no-dashboard") {
      noDashboard = true;
    } else {
      filteredWrapArgs.push(rawWrapArgs[i]!);
    }
  }
  const wrapArgs = filteredWrapArgs;

  // Validate custom-tee requires --tee-url
  if (signerMode === "custom-tee" && !teeUrl) {
    console.error("Error: --signer custom-tee requires --tee-url <url>");
    process.exit(1);
  }

  if (wrapArgs.length === 0) {
    console.error("Usage: occ-mcp-proxy --wrap [--signer <mode>] [--tee-url <url>] [--policy <path>] <command> [args...]");
    console.error("");
    console.error("Signer modes:");
    console.error("  --signer local       Ed25519 signing on your machine (default)");
    console.error("  --signer occ-cloud   Hardware-attested via OCC Nitro Enclave");
    console.error("  --signer custom-tee  Your own TEE (requires --tee-url)");
    console.error("  --tee                Shorthand for --signer occ-cloud");
    console.error("");
    console.error("Example:");
    console.error("  occ-mcp-proxy --wrap npx my-mcp-server");
    console.error("  occ-mcp-proxy --wrap --signer occ-cloud npx my-mcp-server");
    console.error("  occ-mcp-proxy --wrap --signer custom-tee --tee-url https://my-tee.example.com/commit npx my-mcp-server");
    console.error("  occ-mcp-proxy --wrap --policy policy.json npx my-mcp-server");
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

  runWrapMode(command, args, signerMode, teeUrl, policyPath, noDashboard ? 0 : dashboardPort).catch((err) => {
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

async function runWrapMode(command: string, args: string[], signerMode: "local" | "occ-cloud" | "custom-tee" = "local", teeUrl?: string, policyPath?: string, dashboardPort: number = 9100): Promise<void> {
  const { ProxyEventBus } = await import("./events.js");
  const { ToolRegistry } = await import("./tool-registry.js");
  const { ProxyState } = await import("./state.js");
  const { Interceptor } = await import("./interceptor.js");
  const { startMcpServer } = await import("./mcp-server.js");
  const { ProofWriter } = await import("./proof-writer.js");
  const { mkdirSync, readFileSync } = await import("node:fs");

  // Use the proxy package dir (not cwd — Claude Desktop may set cwd to /)
  const { fileURLToPath } = await import("node:url");
  const proxyDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const signerStatePath = resolve(proxyDir, ".occ/signer-state.json");
  mkdirSync(resolve(proxyDir, ".occ"), { recursive: true });

  console.error("");
  console.error("  OCC.WTF");
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

  // 2. Create agent — with policy enforcement if --policy provided, otherwise allow-all
  const allToolNames = registry.listTools().map((t) => t.name);

  // If --policy points to a .md file, parse it as a markdown policy document
  // and create a cryptographic binding for the proof chain.
  let policyBinding: import("occproof").PolicyBinding | undefined;

  if (policyPath) {
    const resolvedPolicyPath = resolve(policyPath);
    const policyRaw = readFileSync(resolvedPolicyPath, "utf-8");

    if (resolvedPolicyPath.endsWith(".md")) {
      // Markdown policy document — parse for rules + compute hash binding
      const { parsePolicy, hashPolicy, validateAction } = await import("occproof");
      const policyDoc = parsePolicy(policyRaw);
      const digestB64 = hashPolicy(policyRaw);

      policyBinding = { digestB64 };
      if (policyDoc.name !== "Unnamed Policy") policyBinding.name = policyDoc.name;
      if (policyDoc.version !== "1.0") policyBinding.version = policyDoc.version;

      // Build a JSON policy from the markdown rules for the policy-sdk enforcer
      const allowedTools = policyDoc.rules.allowedTools;
      const agent = state.createAgent("default", allToolNames);

      if (allowedTools && allowedTools.length > 0) {
        const globalConstraints: Record<string, unknown> = { allowedTools };
        if (policyDoc.rules.maxActions !== undefined) {
          globalConstraints.maxActions = policyDoc.rules.maxActions;
        }
        if (policyDoc.rules.rateLimit !== undefined) {
          globalConstraints.rateLimit = { maxCalls: policyDoc.rules.rateLimit, windowMs: 60_000 };
        }

        const policy = {
          version: "occ/policy/1" as const,
          name: policyDoc.name,
          createdAt: Date.now(),
          globalConstraints,
          skills: {},
        };
        state.updateAgentPolicy(agent.id, policy);
      }

      console.error(`  Policy: ${resolvedPolicyPath}`);
      console.error(`  Policy name: ${policyDoc.name}`);
      console.error(`  Policy hash: ${digestB64.slice(0, 16)}...`);
      if (allowedTools) {
        console.error(`  Allowed tools: ${allowedTools.join(", ")}`);
      }
    } else {
      // JSON policy (existing behavior)
      const policyJson = JSON.parse(policyRaw);

      // Ensure required fields have sensible defaults for AgentPolicy shape
      const policy = {
        version: policyJson.version ?? ("occ/policy/1" as const),
        name: policyJson.name ?? "wrap-policy",
        createdAt: policyJson.createdAt ?? Date.now(),
        globalConstraints: policyJson.globalConstraints ?? {},
        skills: policyJson.skills ?? {},
        ...(policyJson.toolConstraints ? { toolConstraints: policyJson.toolConstraints } : {}),
      };

      // Create agent with all tools initially (policy enforcer handles allow/block)
      const agent = state.createAgent("default", allToolNames);
      state.updateAgentPolicy(agent.id, policy);

      // Also compute a binding for JSON policies so they appear in proofs
      const { hashPolicy } = await import("occproof");
      const digestB64 = hashPolicy(policyRaw);
      policyBinding = { digestB64, name: policy.name };

      console.error(`  Policy: ${resolvedPolicyPath}`);
      console.error(`  Policy name: ${policy.name}`);
      console.error(`  Policy hash: ${digestB64.slice(0, 16)}...`);
      if (policy.globalConstraints.allowedTools) {
        console.error(`  Allowed tools: ${policy.globalConstraints.allowedTools.join(", ")}`);
      }
      if (policy.globalConstraints.blockedTools) {
        console.error(`  Blocked tools: ${policy.globalConstraints.blockedTools.join(", ")}`);
      }
    }
  } else {
    state.createAgent("default", allToolNames);
  }

  // 3. Proof file (write next to the proxy, not in cwd which may be /)
  const proofWriter = new ProofWriter(resolve(proxyDir, "proof.jsonl"));

  // 4. Initialize signer (local or TEE)
  type InterceptorOpts = {
    localSigner?: Awaited<ReturnType<typeof import("./local-signer.js").createLocalSigner>>;
    occConfig?: { apiUrl: string; apiKey?: string | undefined; runtime: string };
    proofWriter: (entry: {
      timestamp: string; tool: string; args: Record<string, unknown>;
      output?: unknown; denied?: boolean; reason?: string; policyRule?: string;
      receipt?: unknown | undefined; proofDigestB64?: string | undefined;
    }) => void;
  };

  // Dashboard addProof callback (set after dashboard starts)
  let dashboardAddProof: ((entry: {
    timestamp: string; tool: string; args: Record<string, unknown>;
    output?: unknown; denied?: boolean; reason?: string; policyRule?: string;
    receipt?: unknown; proofDigestB64?: string | undefined;
  }) => void) | undefined;

  // Forward proofs to OCC Explorer (best-effort, fire-and-forget)
  const EXPLORER_API = process.env.OCC_EXPLORER_URL || "https://occ.wtf/api/proofs";
  function forwardToExplorer(entry: Record<string, unknown>) {
    const proof = (entry.receipt as Record<string, unknown>)?.proof;
    if (!proof) return;
    fetch(EXPLORER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof }),
    }).catch(() => {}); // best-effort
  }

  const interceptorOpts: InterceptorOpts = {
    proofWriter: (entry) => {
      proofWriter.append(entry);
      dashboardAddProof?.(entry);
      forwardToExplorer(entry as Record<string, unknown>);
    },
  };

  let signerPublicKey: string | undefined;

  if (signerMode === "occ-cloud") {
    const OCC_CLOUD_URL = "https://nitro.occproof.com/commit";
    console.error(`  Signer: OCC Cloud (nitro.occproof.com)`);
    interceptorOpts.occConfig = { apiUrl: OCC_CLOUD_URL, runtime: "occ-agent" };
  } else if (signerMode === "custom-tee") {
    const url = teeUrl!;
    let hostname: string;
    try { hostname = new URL(url).hostname; } catch { hostname = url; }
    console.error(`  Signer: Custom TEE (${hostname})`);
    interceptorOpts.occConfig = { apiUrl: url, runtime: "occ-agent" };
  } else {
    const { createLocalSigner } = await import("./local-signer.js");
    const localSigner = await createLocalSigner(signerStatePath);
    signerPublicKey = localSigner.publicKeyB64;
    console.error(`  Signer: ${signerPublicKey.slice(0, 16)}...`);
    interceptorOpts.localSigner = localSigner;
  }

  console.error(`  Proof log: ${proofWriter.path}`);

  // 5. Start local dashboard
  if (dashboardPort > 0) {
    const { startWrapDashboard } = await import("./wrap-dashboard.js");
    const dashboard = startWrapDashboard({
      port: dashboardPort,
      events,
      registry,
      state,
      signerMode,
      signerPublicKey,
      proofPath: proofWriter.path,
    });
    dashboardAddProof = dashboard.addProof;
    console.error(`  Dashboard: http://localhost:${dashboard.port}`);
  }

  console.error("");

  // 6. Interceptor: sign everything, write to file
  const interceptor = new Interceptor(registry, state, events, { ...interceptorOpts, policyBinding });

  // Emit policy-loaded event if a policy was loaded
  if (policyBinding) {
    events.emit({
      type: "policy-loaded",
      timestamp: Date.now(),
      policyName: policyBinding.name ?? "unnamed",
      policyDigestB64: policyBinding.digestB64,
    });
  }

  // 7. Start MCP server on stdio
  await startMcpServer(
    {
      proxyId: "occ-wrap",
      downstreamServers: [],
      signerMode,
      signerStatePath,
      teeUrl: teeUrl ?? "https://nitro.occproof.com/commit",
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

  // CLI overrides for signer mode (so you don't need a config file)
  const signerIdx = process.argv.indexOf("--signer");
  if (signerIdx !== -1) {
    const val = process.argv[signerIdx + 1];
    if (val === "local" || val === "occ-cloud" || val === "custom-tee") {
      config.signerMode = val;
    }
  }
  if (process.argv.includes("--tee")) {
    config.signerMode = "occ-cloud";
  }
  const teeUrlIdx = process.argv.indexOf("--tee-url");
  if (teeUrlIdx !== -1 && process.argv[teeUrlIdx + 1]) {
    config.teeUrl = process.argv[teeUrlIdx + 1]!;
  }
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
  } else if (config.signerMode === "occ-cloud") {
    console.error(`  Signer: OCC Cloud (nitro.occproof.com)`);
  } else {
    let hostname: string;
    try { hostname = new URL(config.teeUrl).hostname; } catch { hostname = config.teeUrl; }
    console.error(`  Signer: Custom TEE (${hostname})`);
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
          apiUrl: config.teeUrl,
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

  console.error(`  Dashboard: http://localhost:${config.managementPort}`);
  console.error("");
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Lightweight HTTP dashboard for --wrap mode.
 * Starts on port 9100 (configurable) and serves a live proof log UI.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProxyEventBus } from "./events.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { ProxyState } from "./state.js";
import type { ProxyEvent } from "./types.js";
import type { LocalSigner } from "./local-signer.js";
import type { PolicyBinding } from "occproof";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DASHBOARD_DIR = resolve(__dirname, "../dashboard");

function checkHasDashboard(): boolean {
  const result = existsSync(DASHBOARD_DIR) && existsSync(join(DASHBOARD_DIR, "index.html"));
  if (result) {
    console.error(`  CommandCentral: found at ${DASHBOARD_DIR}`);
  } else {
    console.error(`  CommandCentral: not found at ${DASHBOARD_DIR}, using inline dashboard`);
  }
  return result;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function serveDashboardFile(pathname: string, res: ServerResponse): boolean {

  // Exact file match (for _next/ assets, etc.)
  const exactPath = join(DASHBOARD_DIR, pathname);
  if (existsSync(exactPath) && statSync(exactPath).isFile()) {
    const ext = extname(exactPath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    const content = readFileSync(exactPath);
    const isAsset = pathname.includes("/_next/");
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length,
      "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(content);
    return true;
  }

  // Try with .html extension (/agents → agents.html)
  if (!extname(pathname)) {
    const htmlPath = exactPath + ".html";
    if (existsSync(htmlPath)) {
      const content = readFileSync(htmlPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": content.length, "Cache-Control": "no-cache" });
      res.end(content);
      return true;
    }
  }

  // Dynamic route fallback: /section/anything → /section/__.html
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const fallbackPath = join(DASHBOARD_DIR, parts[0]!, "__.html");
    if (existsSync(fallbackPath)) {
      const content = readFileSync(fallbackPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": content.length, "Cache-Control": "no-cache" });
      res.end(content);
      return true;
    }
  }

  return false;
}

export interface WrapDashboardOpts {
  port: number;
  events: ProxyEventBus;
  registry: ToolRegistry;
  state: ProxyState;
  signerMode: string;
  signerPublicKey?: string | undefined;
  proofPath: string;
  localSigner?: LocalSigner | undefined;
  policyBinding?: PolicyBinding | undefined;
  /** Called when the policy binding is updated (e.g., from dashboard PUT /api/policy). */
  onPolicyUpdate?: (binding: PolicyBinding) => void;
}

export interface ProofEntry {
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  output?: unknown;
  denied?: boolean;
  reason?: string;
  policyRule?: string;
  receipt?: unknown;
  proofDigestB64?: string | undefined;
}

const MAX_ENTRIES = 1000;

/** Load existing proofs from disk so dashboard shows history across restarts. */
function loadProofsFromDisk(proofPath: string): ProofEntry[] {
  try {
    if (!existsSync(proofPath)) return [];
    const content = readFileSync(proofPath, "utf-8").trim();
    if (!content) return [];
    const lines = content.split("\n");
    const entries: ProofEntry[] = [];
    // Only load last MAX_ENTRIES lines
    const start = Math.max(0, lines.length - MAX_ENTRIES);
    for (let i = start; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]!) as ProofEntry);
      } catch { /* skip malformed lines */ }
    }
    return entries;
  } catch { return []; }
}

export function startWrapDashboard(opts: WrapDashboardOpts): {
  addProof: (entry: ProofEntry) => void;
  port: number;
  /** Set after interceptor is created so policy updates can reach it. */
  setOnPolicyUpdate: (fn: (binding: PolicyBinding) => void) => void;
} {
  const hasDashboard = checkHasDashboard();

  // Load historical proofs from disk so dashboard shows them immediately
  const historical = loadProofsFromDisk(opts.proofPath);
  const proofBuffer: ProofEntry[] = [...historical];
  const sseClients: Set<ServerResponse> = new Set();

  // Push proof events to SSE clients
  opts.events.subscribe((event: ProxyEvent) => {
    for (const client of sseClients) {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  });

  const addProof = (entry: ProofEntry) => {
    proofBuffer.push(entry);
    if (proofBuffer.length > MAX_ENTRIES) proofBuffer.shift();
    // Push proof entry to SSE clients
    for (const client of sseClients) {
      client.write(`data: ${JSON.stringify({ type: "proof-written", entry })}\n\n`);
    }
  };

  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const json = JSON.stringify(body);
    res.writeHead(status, { ...corsHeaders, "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(json)) });
    res.end(json);
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${opts.port}`);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    // API routes
    if (path === "/api/proofs") {
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify(proofBuffer));
      return;
    }

    if (path === "/api/tools") {
      const tools = opts.registry.listTools().map((t) => ({
        name: t.name,
        description: t.description,
        source: t.source,
      }));
      sendJson(res, 200, { tools });
      return;
    }

    if (path === "/api/signer") {
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({
        mode: opts.signerMode,
        publicKey: opts.signerPublicKey ?? null,
        proofPath: opts.proofPath,
      }));
      return;
    }

    if (path === "/api/events") {
      res.writeHead(200, {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: {\"type\":\"connected\"}\n\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (path === "/api/health") {
      sendJson(res, 200, { ok: true, proxyId: "occ-wrap", timestamp: Date.now() });
      return;
    }

    if (path === "/api/status") {
      sendJson(res, 200, {
        ok: true,
        proxyId: "occ-wrap",
        mode: "live",
        toolCount: opts.registry.listTools().length,
        timestamp: Date.now(),
      });
      return;
    }

    // ── Agent routes (CommandCentral compatibility) ──
    if (path === "/api/agents" && req.method === "GET") {
      const agents = opts.state.getAgents().map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        policy: a.policy ?? null,
        totalCalls: 0,
        totalSpendCents: 0,
      }));
      sendJson(res, 200, { agents });
      return;
    }

    if (path === "/api/agents" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          const allTools = opts.registry.listTools().map((t) => t.name);
          const agent = opts.state.createAgent(body.name ?? "agent", body.allowedTools ?? allTools);
          sendJson(res, 201, { agent });
        } catch (err) {
          sendJson(res, 400, { error: "Invalid request" });
        }
      });
      return;
    }

    if (path.startsWith("/api/agents/") && req.method === "GET" && path.split("/").length === 4) {
      const agentId = decodeURIComponent(path.split("/")[3] ?? "");
      const agent = opts.state.getAgent(agentId);
      if (!agent) { sendJson(res, 404, { error: "Agent not found" }); return; }
      sendJson(res, 200, {
        agent,
        context: { totalSpendCents: 0, toolCallCounts: {}, totalCalls: 0, startedAt: agent.createdAt },
        auditCount: proofBuffer.length,
      });
      return;
    }

    if (path.startsWith("/api/agents/") && path.endsWith("/pause") && req.method === "PUT") {
      const agentId = decodeURIComponent(path.split("/")[3] ?? "");
      opts.state.pauseAgent(agentId);
      sendJson(res, 200, { paused: true });
      return;
    }

    if (path.startsWith("/api/agents/") && path.endsWith("/resume") && req.method === "PUT") {
      const agentId = decodeURIComponent(path.split("/")[3] ?? "");
      opts.state.resumeAgent(agentId);
      sendJson(res, 200, { paused: false });
      return;
    }

    if (path.startsWith("/api/agents/") && req.method === "DELETE" && !path.includes("/tools/")) {
      const agentId = decodeURIComponent(path.split("/")[3] ?? "");
      opts.state.deleteAgent(agentId);
      sendJson(res, 200, { deleted: true });
      return;
    }

    // Tool enable: PUT /api/agents/:id/tools/:toolName
    if (path.includes("/tools/") && path.startsWith("/api/agents/") && req.method === "PUT") {
      const parts = path.split("/");
      const agentId = decodeURIComponent(parts[3] ?? "");
      const toolName = decodeURIComponent(parts[5] ?? "");
      try {
        opts.state.toggleTool(agentId, toolName, true);
        sendJson(res, 200, { tool: toolName, enabled: true });
      } catch (err) {
        sendJson(res, 404, { error: err instanceof Error ? err.message : "Agent not found" });
      }
      return;
    }

    // Tool disable: DELETE /api/agents/:id/tools/:toolName
    if (path.includes("/tools/") && path.startsWith("/api/agents/") && req.method === "DELETE") {
      const parts = path.split("/");
      const agentId = decodeURIComponent(parts[3] ?? "");
      const toolName = decodeURIComponent(parts[5] ?? "");
      try {
        opts.state.toggleTool(agentId, toolName, false);
        sendJson(res, 200, { tool: toolName, enabled: false });
      } catch (err) {
        sendJson(res, 404, { error: err instanceof Error ? err.message : "Agent not found" });
      }
      return;
    }

    // ── Policy ──
    if (path === "/api/policy" && req.method === "GET") {
      if (opts.state.policyCommitment) {
        sendJson(res, 200, {
          policy: opts.state.policyCommitment.policy,
          policyDigestB64: opts.state.policyCommitment.policyDigestB64,
          committedAt: opts.state.policyCommitment.committedAt,
        });
      } else {
        sendJson(res, 200, { policy: null });
      }
      return;
    }

    if (path === "/api/policy" && req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", async () => {
        try {
          const policy = JSON.parse(Buffer.concat(chunks).toString());
          if (!policy || !policy.name) {
            sendJson(res, 400, { error: "Invalid policy: name is required" });
            return;
          }

          // Ensure required fields
          if (!policy.version) policy.version = "occ/policy/1";
          if (!policy.createdAt) policy.createdAt = Date.now();
          if (!policy.globalConstraints) policy.globalConstraints = { allowedTools: [] };
          if (!policy.skills) policy.skills = {};

          // Hash the policy
          const { hashPolicy } = await import("occ-policy-sdk");
          const policyDigestB64 = hashPolicy(policy);

          // Create the policy binding
          const binding: PolicyBinding = {
            digestB64: policyDigestB64,
            name: policy.name,
          };

          // Commit policy as an OCC proof if local signer available
          if (opts.localSigner) {
            const proof = await opts.localSigner.commitDigest(
              policyDigestB64,
              {
                kind: "policy-commitment",
                policyName: policy.name,
                policyVersion: policy.version,
              },
              binding,
            );

            // Compute the proof hash
            const { canonicalize } = await import("occproof");
            const { sha256 } = await import("@noble/hashes/sha256");
            const proofHash = Buffer.from(sha256(canonicalize(proof))).toString("base64");
            binding.authorProofDigestB64 = proofHash;

            // Write policy commitment to proof log
            addProof({
              timestamp: new Date().toISOString(),
              tool: "__policy_commitment",
              args: { name: policy.name, version: policy.version, digestB64: policyDigestB64 },
              receipt: { proof },
              proofDigestB64: proofHash,
            });

            console.error(`  Policy committed via dashboard (counter: ${proof.commit.counter})`);
          }

          // Store in state
          opts.state.policyCommitment = {
            policy,
            policyDigestB64,
            occProof: null as unknown as import("occproof").OCCProof,
            committedAt: Date.now(),
          };

          // Update all agents with the new policy's allowed tools
          const agents = opts.state.getAgents();
          for (const agent of agents) {
            const updatedPolicy = { ...agent.policy };
            if (policy.globalConstraints?.allowedTools) {
              updatedPolicy.globalConstraints = {
                ...updatedPolicy.globalConstraints,
                allowedTools: policy.globalConstraints.allowedTools,
              };
            }
            opts.state.updateAgentPolicy(agent.id, updatedPolicy);
          }

          // Notify parent (index.ts) so interceptor gets updated binding
          if (opts.onPolicyUpdate) {
            opts.onPolicyUpdate(binding);
          }

          sendJson(res, 200, {
            policy,
            policyDigestB64,
            committedAt: Date.now(),
          });
        } catch (err) {
          console.error(`  Policy commit error: ${err instanceof Error ? err.message : String(err)}`);
          sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to commit policy" });
        }
      });
      return;
    }

    // ── Audit ──
    if (path === "/api/audit" && req.method === "GET") {
      const page = Number(url.searchParams.get("page") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const allEntries = proofBuffer.map((p, i) => ({
        id: `wrap-${i}`,
        agentId: "default",
        timestamp: typeof p.timestamp === "string" ? new Date(p.timestamp).getTime() : p.timestamp,
        tool: p.tool,
        decision: p.denied
          ? { allowed: false as const, reason: p.reason ?? "Policy denied", constraint: p.policyRule ?? "unknown" }
          : { allowed: true as const },
        proofDigestB64: p.proofDigestB64,
      }));
      allEntries.reverse(); // newest first
      const paged = allEntries.slice(page * limit, page * limit + limit);
      sendJson(res, 200, { entries: paged, total: allEntries.length, page, limit });
      return;
    }

    // ── Single audit entry ──
    if (path.startsWith("/api/audit/") && req.method === "GET") {
      const auditId = decodeURIComponent(path.slice("/api/audit/".length));
      const idx = auditId.startsWith("wrap-") ? parseInt(auditId.slice(5), 10) : -1;
      const p = idx >= 0 && idx < proofBuffer.length ? proofBuffer[idx] : undefined;
      if (!p) { sendJson(res, 404, { error: `Audit entry "${auditId}" not found` }); return; }
      sendJson(res, 200, {
        entry: {
          id: auditId,
          agentId: "default",
          timestamp: typeof p.timestamp === "string" ? new Date(p.timestamp).getTime() : p.timestamp,
          tool: p.tool,
          decision: p.denied
            ? { allowed: false as const, reason: p.reason ?? "Policy denied", constraint: p.policyRule ?? "unknown" }
            : { allowed: true as const },
          proofDigestB64: p.proofDigestB64,
        },
        receipt: p.receipt ?? null,
      });
      return;
    }

    // ── Connections (downstream MCP servers) ──
    if (path === "/api/connections") {
      sendJson(res, 200, opts.registry.listServers());
      return;
    }

    // ── Keys ──
    if (path === "/api/keys") {
      sendJson(res, 200, []);
      return;
    }

    // Serve CommandCentral dashboard if it exists
    if (hasDashboard) {
      // Root → index.html
      if (path === "/" || path === "/index.html") {
        const content = readFileSync(join(DASHBOARD_DIR, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": content.length, "Cache-Control": "no-cache" });
        res.end(content);
        return;
      }
      // Try serving static file
      if (serveDashboardFile(path, res)) return;
      // SPA fallback — serve index.html for unmatched routes
      const content = readFileSync(join(DASHBOARD_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": content.length, "Cache-Control": "no-cache" });
      res.end(content);
      return;
    }

    // Fallback: inline proof dashboard (no CommandCentral build)
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDashboardHtml());
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  // Try the requested port, then next 4 ports if taken
  let actualPort = opts.port;
  const maxRetries = 5;
  let attempt = 0;

  function tryListen() {
    server.listen(actualPort, () => {
      // logged by caller
    });
  }

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < maxRetries) {
      attempt++;
      actualPort++;
      console.error(`  Dashboard: port ${actualPort - 1} in use, trying ${actualPort}...`);
      tryListen();
    } else if (err.code === "EADDRINUSE") {
      console.error(`  Dashboard: all ports ${opts.port}-${actualPort} in use, skipping`);
    } else {
      console.error(`  Dashboard error: ${err.message}`);
    }
  });

  tryListen();

  let policyUpdateFn: ((binding: PolicyBinding) => void) | undefined = opts.onPolicyUpdate;

  return {
    addProof,
    port: actualPort,
    setOnPolicyUpdate: (fn: (binding: PolicyBinding) => void) => {
      policyUpdateFn = fn;
      opts.onPolicyUpdate = fn;
    },
  };
}

// ── Self-contained dashboard HTML ──

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OCC Proof Dashboard</title>
<style>
  :root {
    --bg: #0a0a0f;
    --bg-elevated: #141419;
    --bg-subtle: #1a1a22;
    --text: #e8e8ec;
    --text-secondary: #9a9aaa;
    --text-tertiary: #6a6a7a;
    --border: #2a2a35;
    --emerald: #22c55e;
    --emerald-dim: rgba(34, 197, 94, 0.1);
    --red: #ef4444;
    --red-dim: rgba(239, 68, 68, 0.1);
    --mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }

  /* Header */
  .header {
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 10;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo {
    font-weight: 900;
    font-size: 18px;
    letter-spacing: -0.02em;
  }
  .logo span { color: var(--text-tertiary); font-weight: 400; }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--emerald);
    animation: pulse 2s infinite;
  }
  .status-dot.disconnected { background: var(--red); animation: none; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Layout */
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 20px;
  }
  @media (max-width: 768px) {
    .grid { grid-template-columns: 1fr; }
  }

  /* Cards */
  .card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .card-header {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .card-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }
  .card-body { padding: 0; }
  .card-body.padded { padding: 18px; }

  /* Stats row */
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  @media (max-width: 768px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
  }
  .stat {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    font-family: var(--mono);
    letter-spacing: -0.02em;
  }
  .stat-label {
    font-size: 11px;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 4px;
  }

  /* Proof log */
  .proof-list { list-style: none; }
  .proof-entry {
    padding: 12px 18px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.15s;
  }
  .proof-entry:hover { background: var(--bg-subtle); }
  .proof-entry:last-child { border-bottom: none; }
  .proof-entry.new {
    animation: slideIn 0.3s ease-out;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .proof-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .proof-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }
  .proof-badge.allowed {
    background: var(--emerald-dim);
    color: var(--emerald);
  }
  .proof-badge.denied {
    background: var(--red-dim);
    color: var(--red);
  }
  .proof-tool {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .proof-time {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text-tertiary);
    flex-shrink: 0;
  }
  .proof-digest {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text-tertiary);
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .proof-details {
    display: none;
    margin-top: 10px;
    padding: 10px;
    background: var(--bg);
    border-radius: 8px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 300px;
    overflow-y: auto;
  }
  .proof-entry.expanded .proof-details { display: block; }

  /* Tools list */
  .tool-item {
    padding: 10px 18px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tool-item:last-child { border-bottom: none; }
  .tool-name {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    flex: 1;
  }
  .tool-source {
    font-size: 10px;
    color: var(--text-tertiary);
    background: var(--bg-subtle);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .tool-count {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-tertiary);
    min-width: 24px;
    text-align: right;
  }

  /* Signer info */
  .signer-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
  }
  .signer-label {
    font-size: 11px;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .signer-value {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-secondary);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .signer-value.copyable {
    cursor: pointer;
  }
  .signer-value.copyable:hover {
    color: var(--text);
  }

  /* Empty state */
  .empty {
    padding: 40px 18px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 13px;
  }
  .empty-icon {
    font-size: 32px;
    margin-bottom: 8px;
    opacity: 0.5;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="logo">OCC <span>Proof</span></div>
    </div>
    <div class="status">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">Connecting...</span>
    </div>
  </div>

  <div class="container">
    <div class="stats">
      <div class="stat">
        <div class="stat-value" id="statTotal">0</div>
        <div class="stat-label">Total Proofs</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="statAllowed" style="color: var(--emerald)">0</div>
        <div class="stat-label">Allowed</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="statDenied" style="color: var(--red)">0</div>
        <div class="stat-label">Denied</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="statTools">0</div>
        <div class="stat-label">Tools</div>
      </div>
    </div>

    <div class="grid">
      <!-- Proof Log -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Proof Log</span>
          <span class="card-title" id="proofCount" style="font-weight:400"></span>
        </div>
        <div class="card-body">
          <ul class="proof-list" id="proofList">
            <li class="empty">
              <div class="empty-icon">\u{1F512}</div>
              Waiting for tool calls...
            </li>
          </ul>
        </div>
      </div>

      <!-- Sidebar -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Signer -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Signer</span>
          </div>
          <div class="card-body padded" id="signerInfo">
            <div class="signer-row">
              <span class="signer-label">Mode</span>
              <span class="signer-value" id="signerMode">—</span>
            </div>
            <div class="signer-row">
              <span class="signer-label">Public Key</span>
              <span class="signer-value copyable" id="signerKey" title="Click to copy">—</span>
            </div>
            <div class="signer-row">
              <span class="signer-label">Proof File</span>
              <span class="signer-value" id="signerPath">—</span>
            </div>
          </div>
        </div>

        <!-- Tools -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Tools</span>
            <span class="card-title" id="toolCount" style="font-weight:400"></span>
          </div>
          <div class="card-body">
            <div id="toolList">
              <div class="empty">Discovering tools...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

<script>
(function() {
  let totalProofs = 0;
  let allowedCount = 0;
  let deniedCount = 0;
  const toolCalls = {};

  // Fetch initial data
  Promise.all([
    fetch('/api/signer').then(r => r.json()),
    fetch('/api/tools').then(r => r.json()),
    fetch('/api/proofs').then(r => r.json()),
  ]).then(([signer, tools, proofs]) => {
    // Signer
    document.getElementById('signerMode').textContent = signer.mode;
    if (signer.publicKey) {
      const keyEl = document.getElementById('signerKey');
      keyEl.textContent = signer.publicKey.slice(0, 24) + '...';
      keyEl.title = signer.publicKey;
      keyEl.onclick = () => {
        navigator.clipboard.writeText(signer.publicKey);
        keyEl.textContent = 'Copied!';
        setTimeout(() => { keyEl.textContent = signer.publicKey.slice(0, 24) + '...'; }, 1000);
      };
    }
    document.getElementById('signerPath').textContent = signer.proofPath.split('/').pop();
    document.getElementById('signerPath').title = signer.proofPath;

    // Tools
    document.getElementById('statTools').textContent = tools.length;
    document.getElementById('toolCount').textContent = tools.length;
    const toolListEl = document.getElementById('toolList');
    if (tools.length === 0) {
      toolListEl.innerHTML = '<div class="empty">No tools discovered</div>';
    } else {
      toolListEl.innerHTML = tools.map(t =>
        '<div class="tool-item">' +
          '<span class="tool-name">' + escapeHtml(t.name) + '</span>' +
          '<span class="tool-count" data-tool="' + escapeHtml(t.name) + '">0</span>' +
        '</div>'
      ).join('');
    }

    // Existing proofs
    if (proofs.length > 0) {
      document.getElementById('proofList').innerHTML = '';
      proofs.forEach(p => addProofEntry(p, false));
    }
  });

  // SSE
  let es;
  function connectSSE() {
    es = new EventSource('/api/events');
    es.onopen = () => {
      document.getElementById('statusDot').classList.remove('disconnected');
      document.getElementById('statusText').textContent = 'Live';
    };
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'proof-written' && data.entry) {
        addProofEntry(data.entry, true);
      }
    };
    es.onerror = () => {
      document.getElementById('statusDot').classList.add('disconnected');
      document.getElementById('statusText').textContent = 'Reconnecting...';
    };
  }
  connectSSE();

  function addProofEntry(entry, animate) {
    const list = document.getElementById('proofList');
    // Remove empty state
    const empty = list.querySelector('.empty');
    if (empty) empty.remove();

    totalProofs++;
    if (entry.denied) deniedCount++;
    else allowedCount++;

    // Update stats
    document.getElementById('statTotal').textContent = totalProofs;
    document.getElementById('statAllowed').textContent = allowedCount;
    document.getElementById('statDenied').textContent = deniedCount;
    document.getElementById('proofCount').textContent = totalProofs + ' entries';

    // Update tool call count
    toolCalls[entry.tool] = (toolCalls[entry.tool] || 0) + 1;
    const toolCountEl = document.querySelector('[data-tool="' + CSS.escape(entry.tool) + '"]');
    if (toolCountEl) toolCountEl.textContent = toolCalls[entry.tool];

    // Create entry
    const li = document.createElement('li');
    li.className = 'proof-entry' + (animate ? ' new' : '');
    li.onclick = () => li.classList.toggle('expanded');

    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const badge = entry.denied
      ? '<span class="proof-badge denied">Denied</span>'
      : '<span class="proof-badge allowed">Allowed</span>';

    const digest = entry.proofDigestB64
      ? '<div class="proof-digest">\u{1F512} ' + entry.proofDigestB64.slice(0, 32) + '...</div>'
      : '';

    const details = JSON.stringify({
      args: entry.args,
      ...(entry.output !== undefined ? { output: typeof entry.output === 'string' && entry.output.length > 500 ? entry.output.slice(0, 500) + '...' : entry.output } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.receipt ? { receipt: entry.receipt } : {}),
    }, null, 2);

    li.innerHTML =
      '<div class="proof-row">' +
        badge +
        '<span class="proof-tool">' + escapeHtml(entry.tool) + '</span>' +
        '<span class="proof-time">' + timeStr + '</span>' +
      '</div>' +
      digest +
      '<div class="proof-details">' + escapeHtml(details) + '</div>';

    // Prepend (newest first)
    list.insertBefore(li, list.firstChild);

    // Cap at 200 DOM entries
    while (list.children.length > 200) {
      list.removeChild(list.lastChild);
    }
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
</script>
</body>
</html>`;
}

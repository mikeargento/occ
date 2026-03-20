// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentPolicy } from "occ-policy-sdk";
import type { ProxyState } from "./state.js";
import type { ProxyEventBus } from "./events.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { ProxyConfig, SignerMode } from "./config.js";
import { OCC_CLOUD_URL } from "./config.js";
import type { LocalSigner } from "./local-signer.js";
import { createLocalSigner } from "./local-signer.js";
import { getDemoPageHtml } from "./demo-page.js";
import { ConsensusEngine } from "./consensus.js";
import { handleConsensusRoute } from "./consensus-api.js";
import { KeyStore } from "./key-store.js";
import { ConnectionManager } from "./connections.js";

/** Read the self-contained management UI HTML. */
function getUiHtml(): string {
  const uiPath = resolve(fileURLToPath(new URL(".", import.meta.url)), "../ui.html");
  return readFileSync(uiPath, "utf-8");
}

// ── Static file serving ──

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DASHBOARD_DIR = resolve(__dirname, "../dashboard");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function serveFile(filePath: string, res: ServerResponse): void {
  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const content = readFileSync(filePath);
  const isAsset = filePath.includes("/_next/");
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": content.length,
    "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.end(content);
}

function serveDashboard(url: URL, res: ServerResponse): boolean {
  if (!existsSync(DASHBOARD_DIR)) return false;

  const pathname = url.pathname;

  // 1. Exact file match (for _next/ assets, etc.)
  const exactPath = join(DASHBOARD_DIR, pathname);
  if (existsSync(exactPath) && statSync(exactPath).isFile()) {
    serveFile(exactPath, res);
    return true;
  }

  // 2. Try with .html extension (/agents → agents.html)
  if (!extname(pathname)) {
    const htmlPath = exactPath + ".html";
    if (existsSync(htmlPath)) {
      serveFile(htmlPath, res);
      return true;
    }
  }

  // 3. Dynamic route fallback: /section/anything → /section/__.html
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const fallbackPath = join(DASHBOARD_DIR, parts[0]!, "__.html");
    if (existsSync(fallbackPath)) {
      serveFile(fallbackPath, res);
      return true;
    }
  }

  // 4. Root fallback → index.html
  const rootIndex = join(DASHBOARD_DIR, "index.html");
  if (existsSync(rootIndex)) {
    serveFile(rootIndex, res);
    return true;
  }

  return false;
}

// ── HTTP helpers ──

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Known API paths ──

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname === "/api";
}

/** Strip /api prefix to get the internal route path */
function stripApiPrefix(pathname: string): string {
  return pathname.slice(4) || "/"; // "/api/health" → "/health"
}

/** Whether this instance is the primary (owns the port) or a follower. */
let isPrimary = false;
let primaryUrl = "";

/** Forward an audit entry + receipt to the primary instance. */
export async function forwardAuditToPrimary(entry: {
  tool: string;
  agentId: string;
  decision: { allowed: boolean; reason?: string | undefined; constraint?: string | undefined };
  timestamp: number;
  receipt?: unknown;
  proofDigestB64?: string | undefined;
}): Promise<void> {
  if (isPrimary || !primaryUrl) return;
  try {
    const res = await fetch(`${primaryUrl}/api/audit/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      console.error(`[occ-agent] Failed to forward audit: ${res.status}`);
    }
  } catch {
    // Best effort
  }
}

/** Whether this proxy instance owns the management port. */
export function isManagementPrimary(): boolean {
  return isPrimary;
}

/**
 * Start the management HTTP API + dashboard for OCC Agent.
 */
/** Mutable signer state so we can switch modes at runtime. */
export interface SignerState {
  mode: SignerMode;
  teeUrl: string;
  localSigner?: LocalSigner | undefined;
}

export function startManagementApi(
  config: ProxyConfig,
  state: ProxyState,
  events: ProxyEventBus,
  registry: ToolRegistry,
  localSigner?: LocalSigner,
): void {
  primaryUrl = `http://localhost:${config.managementPort}`;
  const hasDashboard = existsSync(DASHBOARD_DIR);
  const consensusEngine = new ConsensusEngine();

  // Key store + connection manager — use .occ dir from signer state path
  const occDir = resolve(config.signerStatePath, "..");
  const keyStore = new KeyStore(resolve(occDir, "keys.json"));
  const connectionManager = new ConnectionManager(keyStore, resolve(occDir, "connections.json"));

  // Mutable signer state — can be changed via PUT /api/signer
  const signerState: SignerState = {
    mode: config.signerMode,
    teeUrl: config.teeUrl,
    localSigner,
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${config.managementPort}`);
    const method = req.method ?? "GET";

    try {
      if (method === "OPTIONS") {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }

      // ── API Routes ──

      // ── Management UI ──
      if (method === "GET" && (url.pathname === "/" || url.pathname === "")) {
        const html = getUiHtml();
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(html),
          "Cache-Control": "no-cache",
        });
        res.end(html);
        return;
      }

      // ── Demo page ──
      if (method === "GET" && (url.pathname === "/demo" || url.pathname === "/demo/")) {
        const html = getDemoPageHtml();
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(html),
          "Cache-Control": "no-cache",
        });
        res.end(html);
        return;
      }

      if (isApiRoute(url.pathname)) {
        const route = stripApiPrefix(url.pathname);

        // ── Health ──
        if (method === "GET" && route === "/health") {
          sendJson(res, 200, { ok: true, proxyId: config.proxyId, timestamp: Date.now() });
          return;
        }

        // ── Status (includes mode) ──
        if (method === "GET" && route === "/status") {
          const tools = registry.listTools();
          const isDemo = tools.length > 0 && tools.every((t) => t.source === "demo");
          sendJson(res, 200, {
            ok: true,
            proxyId: config.proxyId,
            mode: isDemo ? "demo" : "live",
            toolCount: tools.length,
            timestamp: Date.now(),
          });
          return;
        }

        // ── Signer ──
        if (method === "GET" && route === "/signer") {
          const resp: Record<string, unknown> = { mode: signerState.mode };
          if (signerState.mode === "local" && signerState.localSigner) {
            resp.publicKey = signerState.localSigner.publicKeyB64;
          }
          if (signerState.mode === "occ-cloud") {
            resp.teeUrl = OCC_CLOUD_URL;
          }
          if (signerState.mode === "custom-tee") {
            resp.teeUrl = signerState.teeUrl;
          }
          sendJson(res, 200, resp);
          return;
        }

        if (method === "PUT" && route === "/signer") {
          const raw = await readBody(req);
          let body: { mode?: string; teeUrl?: string };
          try {
            body = JSON.parse(raw.toString("utf-8")) as { mode?: string; teeUrl?: string };
          } catch {
            sendError(res, 400, "Invalid JSON body");
            return;
          }
          const mode = body.mode as SignerMode | undefined;
          if (!mode || !["occ-cloud", "custom-tee", "local"].includes(mode)) {
            sendError(res, 400, 'mode must be "occ-cloud", "custom-tee", or "local"');
            return;
          }
          if (mode === "custom-tee" && !body.teeUrl) {
            sendError(res, 400, "teeUrl is required for custom-tee mode");
            return;
          }

          // Reinitialize signer for the new mode
          signerState.mode = mode;
          config.signerMode = mode;

          if (mode === "local") {
            if (!signerState.localSigner) {
              signerState.localSigner = await createLocalSigner(config.signerStatePath);
            }
            signerState.teeUrl = OCC_CLOUD_URL;
            config.teeUrl = OCC_CLOUD_URL;
          } else if (mode === "occ-cloud") {
            signerState.teeUrl = OCC_CLOUD_URL;
            config.teeUrl = OCC_CLOUD_URL;
            signerState.localSigner = undefined;
          } else {
            signerState.teeUrl = body.teeUrl!;
            config.teeUrl = body.teeUrl!;
            signerState.localSigner = undefined;
          }

          const resp: Record<string, unknown> = { mode: signerState.mode };
          if (signerState.mode === "local" && signerState.localSigner) {
            resp.publicKey = signerState.localSigner.publicKeyB64;
          }
          if (signerState.mode === "occ-cloud") resp.teeUrl = OCC_CLOUD_URL;
          if (signerState.mode === "custom-tee") resp.teeUrl = signerState.teeUrl;
          sendJson(res, 200, resp);
          return;
        }

        // ── Tools ──
        if (method === "GET" && route === "/tools") {
          sendJson(res, 200, { tools: registry.listTools() });
          return;
        }

        // ── Legacy Policy ──
        if (method === "GET" && route === "/policy") {
          if (!state.policyCommitment) {
            sendJson(res, 200, { policy: null });
          } else {
            sendJson(res, 200, {
              policy: state.policyCommitment.policy,
              policyDigestB64: state.policyCommitment.policyDigestB64,
              committedAt: state.policyCommitment.committedAt,
              occProof: state.policyCommitment.occProof,
            });
          }
          return;
        }

        if (method === "PUT" && route === "/policy") {
          const raw = await readBody(req);
          let policy: AgentPolicy;
          try {
            policy = JSON.parse(raw.toString("utf-8")) as AgentPolicy;
          } catch {
            sendError(res, 400, "Invalid JSON body");
            return;
          }
          try {
            let commitment;
            if (localSigner) {
              commitment = await state.loadPolicyWithLocalSigner(policy, localSigner);
            } else {
              try {
                commitment = await state.loadPolicy(policy, { apiUrl: config.teeUrl, apiKey: config.occApiKey });
              } catch {
                state.loadPolicyLocal(policy);
                commitment = state.policyCommitment!;
              }
            }
            sendJson(res, 200, {
              policy: commitment.policy,
              policyDigestB64: commitment.policyDigestB64,
              committedAt: commitment.committedAt,
            });
          } catch (err) {
            sendError(res, 400, err instanceof Error ? err.message : "Policy load failed");
          }
          return;
        }

        // ── Agent CRUD ──
        if (method === "POST" && route === "/agents") {
          const raw = await readBody(req);
          let body: { name: string; allowedTools?: string[] };
          try {
            body = JSON.parse(raw.toString("utf-8")) as { name: string; allowedTools?: string[] };
          } catch {
            sendError(res, 400, "Invalid JSON body");
            return;
          }
          if (!body.name) { sendError(res, 400, "name is required"); return; }
          const agent = state.createAgent(body.name, body.allowedTools);
          sendJson(res, 201, { agent });
          return;
        }

        if (method === "GET" && route === "/agents") {
          const agents = state.getAgents().map((agent) => {
            const ctx = state.getContext(agent.id);
            const snap = ctx.snapshot();
            return {
              ...agent,
              totalCalls: Object.values(snap.toolCallCounts).reduce((a, b) => a + b, 0),
              totalSpendCents: snap.totalSpendCents,
              auditCount: ctx.auditCount,
            };
          });
          sendJson(res, 200, { agents });
          return;
        }

        const agentMatch = route.match(/^\/agents\/([^/]+)(\/.*)?$/);
        if (agentMatch) {
          const agentId = agentMatch[1]!;
          const subpath = agentMatch[2] ?? "";

          if (method === "GET" && subpath === "") {
            const agent = state.getAgent(agentId);
            if (!agent) { sendError(res, 404, `Agent "${agentId}" not found`); return; }
            const ctx = state.getContext(agentId);
            const snap = ctx.snapshot();
            sendJson(res, 200, { agent, context: snap, auditCount: ctx.auditCount });
            return;
          }

          if (method === "DELETE" && subpath === "") {
            if (!state.deleteAgent(agentId)) { sendError(res, 404, `Agent "${agentId}" not found`); return; }
            sendJson(res, 200, { deleted: true });
            return;
          }

          if (method === "PUT" && subpath === "/policy") {
            const raw = await readBody(req);
            let policy: AgentPolicy;
            try { policy = JSON.parse(raw.toString("utf-8")) as AgentPolicy; }
            catch { sendError(res, 400, "Invalid JSON body"); return; }
            try { state.updateAgentPolicy(agentId, policy); sendJson(res, 200, { policy }); }
            catch (err) { sendError(res, 400, err instanceof Error ? err.message : "Failed"); }
            return;
          }

          const toolEnableMatch = subpath.match(/^\/tools\/(.+)$/);
          if (method === "PUT" && toolEnableMatch) {
            const toolName = decodeURIComponent(toolEnableMatch[1]!);
            try { state.toggleTool(agentId, toolName, true); sendJson(res, 200, { tool: toolName, enabled: true }); }
            catch (err) { sendError(res, 400, err instanceof Error ? err.message : "Failed"); }
            return;
          }
          if (method === "DELETE" && toolEnableMatch) {
            const toolName = decodeURIComponent(toolEnableMatch[1]!);
            try { state.toggleTool(agentId, toolName, false); sendJson(res, 200, { tool: toolName, enabled: false }); }
            catch (err) { sendError(res, 400, err instanceof Error ? err.message : "Failed"); }
            return;
          }

          if (method === "PUT" && subpath === "/pause") {
            try { state.pauseAgent(agentId); sendJson(res, 200, { paused: true }); }
            catch (err) { sendError(res, 400, err instanceof Error ? err.message : "Failed"); }
            return;
          }
          if (method === "PUT" && subpath === "/resume") {
            try { state.resumeAgent(agentId); sendJson(res, 200, { paused: false }); }
            catch (err) { sendError(res, 400, err instanceof Error ? err.message : "Failed"); }
            return;
          }
        }

        // ── Context ──
        if (method === "GET" && route === "/context") {
          const agentId = url.searchParams.get("agentId") ?? "default-agent";
          const ctx = state.getContext(agentId);
          sendJson(res, 200, ctx.snapshot());
          return;
        }

        // ── Audit ──
        if (method === "GET" && route === "/audit") {
          const agentIdParam = url.searchParams.get("agentId");
          const page = Number(url.searchParams.get("page") ?? "0");
          const limit = Number(url.searchParams.get("limit") ?? "50");

          if (!agentIdParam) {
            // Aggregate audit from all agents
            const allEntries: Array<Record<string, unknown>> = [];
            for (const agent of state.getAgents()) {
              const ctx = state.getContext(agent.id);
              const entries = ctx.getAuditLog({ offset: 0, limit: 1000 });
              for (const e of entries) {
                allEntries.push({ ...e, agentId: agent.id, agentName: agent.name });
              }
            }
            allEntries.sort((a, b) => (b.timestamp as number) - (a.timestamp as number));
            const paged = allEntries.slice(page * limit, page * limit + limit);
            sendJson(res, 200, { entries: paged, total: allEntries.length, page, limit });
          } else {
            // Resolve name to ID if needed
            let agentId = agentIdParam;
            const byName = state.getAgents().find((a) => a.name === agentIdParam);
            if (byName) agentId = byName.id;
            const ctx = state.getContext(agentId);
            const entries = ctx.getAuditLog({ offset: page * limit, limit });
            sendJson(res, 200, { entries, total: ctx.auditCount, page, limit });
          }
          return;
        }

        if (method === "GET" && route.startsWith("/audit/")) {
          const auditId = route.slice("/audit/".length);
          const agentIdParam = url.searchParams.get("agentId");
          // Search all agents for the audit entry
          let foundEntry = null;
          let foundAgentId = "";
          if (agentIdParam) {
            let agentId = agentIdParam;
            const byName = state.getAgents().find((a) => a.name === agentIdParam);
            if (byName) agentId = byName.id;
            const ctx = state.getContext(agentId);
            foundEntry = ctx.getAuditEntry(auditId);
            foundAgentId = agentId;
          } else {
            for (const agent of state.getAgents()) {
              const ctx = state.getContext(agent.id);
              const entry = ctx.getAuditEntry(auditId);
              if (entry) { foundEntry = entry; foundAgentId = agent.id; break; }
            }
          }
          if (!foundEntry) { sendError(res, 404, `Audit entry "${auditId}" not found`); return; }
          const receipt = state.getReceipt(auditId);
          sendJson(res, 200, { entry: foundEntry, receipt: receipt ?? null, agentId: foundAgentId });
          return;
        }

        // ── Audit ingest (from follower instances) ──
        if (method === "POST" && route === "/audit/ingest") {
          const raw = await readBody(req);
          try {
            const data = JSON.parse(raw.toString("utf-8"));
            // Use the primary's first agent (the one the dashboard shows)
            const agents = state.getAgents();
            const firstAgent = agents[0];
            const agentId = firstAgent ? firstAgent.id : "default-agent";
            const ctx = state.getContext(agentId);
            const auditOpts: { proofDigestB64?: string } = {};
            if (data.proofDigestB64) auditOpts.proofDigestB64 = data.proofDigestB64;
            const auditId = ctx.addAudit(data.tool, data.decision ?? { allowed: true }, auditOpts);
            if (data.receipt) {
              state.storeReceipt(auditId, data.receipt);
            }
            ctx.recordCall(data.tool, undefined, 0, data.timestamp ?? Date.now());
            events.emit({
              type: "tool-executed",
              timestamp: data.timestamp ?? Date.now(),
              tool: data.tool,
              agentId,
              costCents: 0,
              ...(data.proofDigestB64 ? { proofDigestB64: data.proofDigestB64 } : {}),
            });
            sendJson(res, 200, { ok: true, auditId });
          } catch {
            sendError(res, 400, "Invalid JSON body");
          }
          return;
        }

        // ── SSE Events ──
        if (method === "GET" && route === "/events") {
          res.writeHead(200, {
            ...CORS_HEADERS,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          });
          res.write(":\n\n");
          const unsubscribe = events.subscribe((event) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          });
          req.on("close", () => { unsubscribe(); });
          return;
        }

        // ── Keys ──
        if (method === "GET" && route === "/keys") {
          const keys = await keyStore.listKeys();
          sendJson(res, 200, { keys });
          return;
        }

        const keyMatch = route.match(/^\/keys\/([^/]+)$/);
        if (keyMatch) {
          const keyId = decodeURIComponent(keyMatch[1]!);

          if (method === "PUT") {
            const raw = await readBody(req);
            let body: { name?: string; value?: string };
            try {
              body = JSON.parse(raw.toString("utf-8")) as { name?: string; value?: string };
            } catch {
              sendError(res, 400, "Invalid JSON body");
              return;
            }
            if (!body.name || !body.value) {
              sendError(res, 400, "name and value are required");
              return;
            }
            const stored = await keyStore.setKey(keyId, body.name, body.value);
            sendJson(res, 200, {
              id: stored.id,
              name: stored.name,
              maskedValue: stored.maskedValue,
              createdAt: stored.createdAt,
              updatedAt: stored.updatedAt,
            });
            return;
          }

          if (method === "DELETE") {
            const deleted = await keyStore.deleteKey(keyId);
            if (!deleted) { sendError(res, 404, `Key "${keyId}" not found`); return; }
            sendJson(res, 200, { deleted: true });
            return;
          }
        }

        // ── Connections ──
        if (method === "GET" && route === "/connections") {
          const connections = await connectionManager.listConnections();
          sendJson(res, 200, { connections });
          return;
        }

        const connMatch = route.match(/^\/connections\/([^/]+)(\/.*)?$/);
        if (connMatch) {
          const connId = decodeURIComponent(connMatch[1]!);
          const subpath = connMatch[2] ?? "";

          if (method === "POST" && subpath === "/test") {
            const result = await connectionManager.testConnection(connId);
            sendJson(res, 200, result);
            return;
          }

          if (method === "POST" && subpath === "") {
            const raw = await readBody(req);
            let body: { apiKey?: string; config?: Record<string, string> };
            try {
              body = JSON.parse(raw.toString("utf-8")) as { apiKey?: string; config?: Record<string, string> };
            } catch {
              sendError(res, 400, "Invalid JSON body");
              return;
            }
            if (!body.apiKey) {
              sendError(res, 400, "apiKey is required");
              return;
            }
            try {
              const conn = await connectionManager.connect(connId, body.apiKey, body.config);
              sendJson(res, 200, { connection: conn });
            } catch (err) {
              sendError(res, 400, err instanceof Error ? err.message : "Connection failed");
            }
            return;
          }

          if (method === "DELETE" && subpath === "") {
            await connectionManager.disconnect(connId);
            sendJson(res, 200, { disconnected: true });
            return;
          }
        }

        // ── Consensus ──
        {
          let consensusBody: Record<string, unknown> | undefined;
          if (method === "POST") {
            const raw = await readBody(req);
            try { consensusBody = JSON.parse(raw.toString("utf-8")) as Record<string, unknown>; }
            catch { /* leave undefined */ }
          }
          const consensusResult = handleConsensusRoute(consensusEngine, method, route, consensusBody);
          if (consensusResult) {
            sendJson(res, consensusResult.status, consensusResult.body);
            return;
          }
        }

        sendError(res, 404, `${method} ${url.pathname} not found`);
        return;
      }

      // ── Dashboard (static files) ──

      if (method === "GET" && hasDashboard) {
        if (serveDashboard(url, res)) return;
      }

      sendError(res, 404, `${method} ${url.pathname} not found`);
    } catch (err) {
      console.error("[occ-agent] unhandled error:", err);
      sendError(res, 500, "internal server error");
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      isPrimary = false;
      console.error(`[occ-agent] Port ${config.managementPort} in use — forwarding audit to primary`);
    } else {
      console.error(`[occ-agent] Server error:`, err);
    }
  });

  server.listen(config.managementPort, () => {
    isPrimary = true;
    if (hasDashboard) {
      console.error(`[occ-agent] Dashboard → http://localhost:${config.managementPort}`);
    } else {
      console.error(`[occ-agent] API → http://localhost:${config.managementPort}`);
    }
  });
}

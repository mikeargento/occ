import { Router } from "express";

// ── In-memory state for the proxy control plane ──

interface SignerConfig {
  mode: "occ-cloud" | "custom-tee" | "local";
  teeUrl?: string;
  publicKey?: string;
}

interface PolicyConfig {
  readPaths: string[];
  writePaths: string[];
  permissions: Record<string, boolean>;
  globalRate: number;
  maxSpend: number;
  requiredApprovals: number;
  toolSettings: Record<string, {
    rateLimit?: number;
    argsPattern?: string;
    filePaths?: string;
    notes?: string;
  }>;
  allowedTools: string[];
}

interface AuditEntry {
  id: string;
  tool: string;
  allowed: boolean;
  timestamp: number;
  hash?: string;
  agentId?: string;
}

interface ConsensusApproval {
  agentId: string;
  version: number;
  timestamp: number;
}

interface ConsensusEvent {
  type: "submitted" | "approved" | "fixed" | "changes_requested" | "consensus_reached";
  agentId: string;
  version: number;
  timestamp: number;
  note?: string;
  changes?: Record<string, unknown>;
}

interface ConsensusRequest {
  id: string;
  agentId: string;
  tool: string;
  args: Record<string, unknown>;
  requiredApprovals: number;
  status: "pending" | "approved" | "rejected";
  version: number;
  approvals: ConsensusApproval[];
  history: ConsensusEvent[];
  createdAt: number;
  updatedAt: number;
}

// ── In-memory stores ──

let signerConfig: SignerConfig = {
  mode: "local",
  publicKey: undefined,
};

let policyConfig: PolicyConfig = {
  readPaths: [],
  writePaths: [],
  permissions: {
    writeCode: true,
    createFiles: true,
    deleteFiles: false,
    executeCommands: true,
    accessNetwork: true,
    accessSecrets: false,
  },
  globalRate: 60,
  maxSpend: 0,
  requiredApprovals: 0,
  toolSettings: {},
  allowedTools: [],
};

const auditLog: AuditEntry[] = [];
const MAX_AUDIT = 1000;
let auditCounter = 0;

const consensusRequests = new Map<string, ConsensusRequest>();

// SSE subscribers
const sseClients: Set<{
  write: (data: string) => void;
  close: () => void;
}> = new Set();

function broadcastSSE(event: Record<string, unknown>) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

export function proxyControlRoutes() {
  const router = Router();

  // ── Signer ──

  router.get("/proxy/signer", (_req, res) => {
    res.json(signerConfig);
  });

  router.put("/proxy/signer", (req, res) => {
    const { mode, teeUrl } = req.body as { mode?: string; teeUrl?: string };
    if (!mode || !["occ-cloud", "custom-tee", "local"].includes(mode)) {
      res.status(400).json({ error: 'mode must be "occ-cloud", "custom-tee", or "local"' });
      return;
    }
    if (mode === "custom-tee" && !teeUrl) {
      res.status(400).json({ error: "teeUrl is required for custom-tee mode" });
      return;
    }
    signerConfig = {
      mode: mode as SignerConfig["mode"],
      teeUrl: mode === "custom-tee" ? teeUrl : mode === "occ-cloud" ? "https://commit.occ.dev" : undefined,
      publicKey: mode === "local" ? signerConfig.publicKey : undefined,
    };
    broadcastSSE({ type: "signer-updated", ...signerConfig, timestamp: Date.now() });
    res.json(signerConfig);
  });

  // ── Policy ──

  router.get("/proxy/policy", (_req, res) => {
    res.json({ policy: policyConfig });
  });

  router.put("/proxy/policy", (req, res) => {
    const body = req.body as Partial<PolicyConfig>;
    if (body.readPaths !== undefined) policyConfig.readPaths = body.readPaths;
    if (body.writePaths !== undefined) policyConfig.writePaths = body.writePaths;
    if (body.permissions !== undefined) policyConfig.permissions = body.permissions;
    if (body.globalRate !== undefined) policyConfig.globalRate = body.globalRate;
    if (body.maxSpend !== undefined) policyConfig.maxSpend = body.maxSpend;
    if (body.requiredApprovals !== undefined) policyConfig.requiredApprovals = body.requiredApprovals;
    if (body.toolSettings !== undefined) policyConfig.toolSettings = body.toolSettings;
    if (body.allowedTools !== undefined) policyConfig.allowedTools = body.allowedTools;
    broadcastSSE({ type: "policy-updated", timestamp: Date.now() });
    res.json({ policy: policyConfig });
  });

  // ── Tools ──

  router.get("/proxy/tools", (_req, res) => {
    // Return the allowed tools list from policy
    const tools = policyConfig.allowedTools.map((name) => ({
      name,
      enabled: true,
      settings: policyConfig.toolSettings[name] ?? null,
    }));
    res.json({ tools });
  });

  // ── Audit ──

  router.get("/proxy/audit", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const entries = auditLog.slice(offset, offset + limit);
    res.json({ entries, total: auditLog.length });
  });

  router.post("/proxy/audit", (req, res) => {
    const { tool, allowed, agentId, hash } = req.body as {
      tool: string;
      allowed: boolean;
      agentId?: string;
      hash?: string;
    };
    if (!tool) {
      res.status(400).json({ error: "tool is required" });
      return;
    }
    auditCounter++;
    const entry: AuditEntry = {
      id: `audit-${auditCounter}`,
      tool,
      allowed: allowed !== false,
      timestamp: Date.now(),
      hash,
      agentId,
    };
    auditLog.push(entry);
    if (auditLog.length > MAX_AUDIT) auditLog.shift();
    broadcastSSE({
      type: allowed !== false ? "tool-executed" : "policy-violation",
      tool,
      agentId,
      timestamp: entry.timestamp,
    });
    res.json(entry);
  });

  // ── Consensus ──

  router.post("/proxy/consensus", (req, res) => {
    const { agentId, tool, args, requiredApprovals } = req.body as {
      agentId?: string;
      tool?: string;
      args?: Record<string, unknown>;
      requiredApprovals?: number;
    };
    if (!agentId || !tool || requiredApprovals == null) {
      res.status(400).json({ error: "agentId, tool, and requiredApprovals are required" });
      return;
    }
    const id = `cr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const request: ConsensusRequest = {
      id,
      agentId,
      tool,
      args: args ?? {},
      requiredApprovals,
      status: "pending",
      version: 1,
      approvals: [],
      history: [{ type: "submitted", agentId, version: 1, timestamp: now }],
      createdAt: now,
      updatedAt: now,
    };
    consensusRequests.set(id, request);
    res.status(201).json({ request });
  });

  router.get("/proxy/consensus", (_req, res) => {
    const pending: ConsensusRequest[] = [];
    for (const req of consensusRequests.values()) {
      if (req.status === "pending") pending.push(req);
    }
    res.json({ requests: pending });
  });

  router.get("/proxy/consensus/:id", (req, res) => {
    const request = consensusRequests.get(req.params.id);
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    res.json({ request });
  });

  router.post("/proxy/consensus/:id/approve", (req, res) => {
    const request = consensusRequests.get(req.params.id);
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (request.status !== "pending") {
      res.status(400).json({ error: `Request is already ${request.status}` });
      return;
    }
    const { agentId } = req.body as { agentId?: string };
    if (!agentId) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }
    if (agentId === request.agentId) {
      res.status(400).json({ error: "Submitter cannot approve their own request" });
      return;
    }
    const alreadyApproved = request.approvals.some(
      (a) => a.agentId === agentId && a.version === request.version,
    );
    if (alreadyApproved) {
      res.status(400).json({ error: `Agent already approved version ${request.version}` });
      return;
    }
    const now = Date.now();
    request.approvals.push({ agentId, version: request.version, timestamp: now });
    request.history.push({ type: "approved", agentId, version: request.version, timestamp: now });
    request.updatedAt = now;
    const validCount = request.approvals.filter((a) => a.version === request.version).length;
    if (validCount >= request.requiredApprovals) {
      request.status = "approved";
      request.history.push({ type: "consensus_reached", agentId, version: request.version, timestamp: now });
    }
    res.json({ request });
  });

  router.post("/proxy/consensus/:id/fix", (req, res) => {
    const request = consensusRequests.get(req.params.id);
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (request.status !== "pending") {
      res.status(400).json({ error: `Request is already ${request.status}` });
      return;
    }
    const { agentId, args, note } = req.body as {
      agentId?: string;
      args?: Record<string, unknown>;
      note?: string;
    };
    if (!agentId || !args) {
      res.status(400).json({ error: "agentId and args are required" });
      return;
    }
    const now = Date.now();
    request.version += 1;
    request.args = { ...args };
    request.approvals = [];
    request.history.push({
      type: "fixed",
      agentId,
      version: request.version,
      timestamp: now,
      note,
      changes: args,
    });
    if (agentId !== request.agentId) {
      request.approvals.push({ agentId, version: request.version, timestamp: now });
      request.history.push({ type: "approved", agentId, version: request.version, timestamp: now });
      const validCount = request.approvals.filter((a) => a.version === request.version).length;
      if (validCount >= request.requiredApprovals) {
        request.status = "approved";
        request.history.push({ type: "consensus_reached", agentId, version: request.version, timestamp: now });
      }
    }
    request.updatedAt = now;
    res.json({ request });
  });

  router.post("/proxy/consensus/:id/changes", (req, res) => {
    const request = consensusRequests.get(req.params.id);
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (request.status !== "pending") {
      res.status(400).json({ error: `Request is already ${request.status}` });
      return;
    }
    const { agentId, note } = req.body as { agentId?: string; note?: string };
    if (!agentId || !note) {
      res.status(400).json({ error: "agentId and note are required" });
      return;
    }
    const now = Date.now();
    request.history.push({
      type: "changes_requested",
      agentId,
      version: request.version,
      timestamp: now,
      note,
    });
    request.updatedAt = now;
    res.json({ request });
  });

  // ── SSE Events ──

  router.get("/proxy/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(":\n\n");
    const client = {
      write: (data: string) => res.write(data),
      close: () => res.end(),
    };
    sseClients.add(client);
    req.on("close", () => {
      sseClients.delete(client);
    });
  });

  return router;
}

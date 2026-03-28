import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("railway")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return pool;
}

export const db = {
  async init() {
    const p = getPool();
    // Use occ_ prefix to avoid conflicts with Paperclip's old tables
    await p.query(`
      CREATE TABLE IF NOT EXISTS occ_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        avatar TEXT,
        provider TEXT NOT NULL DEFAULT 'anonymous',
        provider_id TEXT NOT NULL DEFAULT 'anonymous',
        mcp_token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS occ_agents (
        id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        allowed_tools TEXT[] DEFAULT '{}',
        custom_rules TEXT DEFAULT '',
        paused BOOLEAN DEFAULT false,
        total_calls INTEGER DEFAULT 0,
        allowed_count INTEGER DEFAULT 0,
        denied_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, user_id)
      );

      -- Add custom_rules column if table already exists
      ALTER TABLE occ_agents ADD COLUMN IF NOT EXISTS custom_rules TEXT DEFAULT '';

      CREATE TABLE IF NOT EXISTS occ_proofs (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'default-agent',
        tool TEXT NOT NULL,
        allowed BOOLEAN NOT NULL,
        args JSONB,
        output JSONB,
        reason TEXT,
        proof_digest TEXT,
        receipt JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_occ_proofs_user_id ON occ_proofs(user_id);
      CREATE INDEX IF NOT EXISTS idx_occ_proofs_created_at ON occ_proofs(created_at DESC);

      CREATE TABLE IF NOT EXISTS occ_policies (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        allowed_tools TEXT[] DEFAULT '{}',
        max_actions INTEGER,
        rate_limit TEXT,
        policy_digest TEXT,
        categories JSONB DEFAULT '{}',
        custom_rules JSONB DEFAULT '[]',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Add columns if they don't exist (migration for existing DBs)
      ALTER TABLE occ_policies ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '{}';
      ALTER TABLE occ_policies ADD COLUMN IF NOT EXISTS custom_rules JSONB DEFAULT '[]';

      -- Permission requests table (the core of permission-first model)
      CREATE TABLE IF NOT EXISTS occ_permission_requests (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        client_name TEXT,
        request_args JSONB,
        proof_digest TEXT,
        receipt JSONB,
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );

      ALTER TABLE occ_permission_requests ADD COLUMN IF NOT EXISTS tool_description TEXT;
      ALTER TABLE occ_permission_requests ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT FALSE;

      CREATE INDEX IF NOT EXISTS idx_occ_perm_user_status ON occ_permission_requests(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_occ_perm_user_agent_tool ON occ_permission_requests(user_id, agent_id, tool);

      -- Add blocked_tools column to agents
      ALTER TABLE occ_agents ADD COLUMN IF NOT EXISTS blocked_tools TEXT[] DEFAULT '{}';

      -- Per-agent MCP tokens (each agent gets its own URL)
      ALTER TABLE occ_agents ADD COLUMN IF NOT EXISTS mcp_token TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_occ_agents_mcp_token ON occ_agents(mcp_token) WHERE mcp_token IS NOT NULL;

      -- Per-agent proxy tokens (each agent gets its own API proxy URL)
      ALTER TABLE occ_agents ADD COLUMN IF NOT EXISTS proxy_token TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_occ_agents_proxy_token ON occ_agents(proxy_token) WHERE proxy_token IS NOT NULL;

      -- Authorization objects — the core of the authorization-object model
      -- Each row IS a cryptographic authorization (or revocation).
      -- Not a permission flag. An object that must exist for execution to be reachable.
      CREATE TABLE IF NOT EXISTS occ_authorizations (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'authorization',
        proof_digest TEXT NOT NULL,
        proof JSONB,
        references_digest TEXT,
        constraints JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_occ_auth_lookup ON occ_authorizations(user_id, agent_id, tool, type);
      CREATE INDEX IF NOT EXISTS idx_occ_auth_digest ON occ_authorizations(proof_digest);

      -- Anthropic API key storage (encrypted at rest via column-level)
      ALTER TABLE occ_users ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;

      -- Phone number for SMS approvals
      ALTER TABLE occ_users ADD COLUMN IF NOT EXISTS phone TEXT;

      -- ═══════════════════════════════════════════════════════════
      -- V2 TABLES — Request-first control model
      -- ═══════════════════════════════════════════════════════════

      CREATE TABLE IF NOT EXISTS occ_v2_runs (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        name TEXT,
        summary TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        request_count INTEGER DEFAULT 0,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_v2_runs_user ON occ_v2_runs(user_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS occ_v2_requests (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        run_id INTEGER REFERENCES occ_v2_runs(id),
        tool TEXT NOT NULL,
        capability TEXT,
        label TEXT,
        risk_lane TEXT NOT NULL DEFAULT 'unknown',
        summary TEXT,
        origin_type TEXT NOT NULL DEFAULT 'api',
        origin_client TEXT,
        request_args JSONB,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_v2_req_user_status ON occ_v2_requests(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_v2_req_user_time ON occ_v2_requests(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_v2_req_run ON occ_v2_requests(run_id);
      CREATE INDEX IF NOT EXISTS idx_v2_req_lane ON occ_v2_requests(user_id, risk_lane, status);

      CREATE TABLE IF NOT EXISTS occ_v2_decisions (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES occ_v2_requests(id),
        user_id TEXT NOT NULL,
        decided_by TEXT NOT NULL DEFAULT 'human',
        decision TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'once',
        reason TEXT,
        proof_digest TEXT,
        proof JSONB,
        decided_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_v2_dec_req ON occ_v2_decisions(request_id);
      CREATE INDEX IF NOT EXISTS idx_v2_dec_user ON occ_v2_decisions(user_id, decided_at DESC);

      CREATE TABLE IF NOT EXISTS occ_v2_executions (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES occ_v2_requests(id),
        decision_id INTEGER NOT NULL REFERENCES occ_v2_decisions(id),
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        args JSONB,
        output JSONB,
        duration_ms INTEGER,
        auth_digest TEXT,
        exec_digest TEXT,
        proof JSONB,
        status TEXT NOT NULL DEFAULT 'completed',
        error TEXT,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_v2_exec_req ON occ_v2_executions(request_id);
      CREATE INDEX IF NOT EXISTS idx_v2_exec_user ON occ_v2_executions(user_id, executed_at DESC);

      CREATE TABLE IF NOT EXISTS occ_v2_risk_lanes (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        lane TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'ask',
        conditions JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, lane)
      );

      -- Create anonymous user for pre-auth testing
      INSERT INTO occ_users (id, email, name, provider, provider_id, mcp_token)
      VALUES ('anonymous', 'anon@occ.wtf', 'Anonymous', 'anonymous', 'anonymous', 'anon-token')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Backfill: generate MCP tokens for agents that don't have one
    const { randomBytes } = await import("node:crypto");
    const noToken = await p.query("SELECT id, user_id FROM occ_agents WHERE mcp_token IS NULL");
    for (const row of noToken.rows) {
      const tok = randomBytes(24).toString("hex");
      await p.query("UPDATE occ_agents SET mcp_token = $1 WHERE id = $2 AND user_id = $3", [tok, row.id, row.user_id]);
    }
    if (noToken.rows.length > 0) {
      console.log(`  Database: backfilled ${noToken.rows.length} agent MCP tokens`);
    }

    // Backfill: generate proxy tokens for agents that don't have one
    const noProxyToken = await p.query("SELECT id, user_id FROM occ_agents WHERE proxy_token IS NULL");
    for (const row of noProxyToken.rows) {
      const tok = randomBytes(24).toString("hex");
      await p.query("UPDATE occ_agents SET proxy_token = $1 WHERE id = $2 AND user_id = $3", [tok, row.id, row.user_id]);
    }
    if (noProxyToken.rows.length > 0) {
      console.log(`  Database: backfilled ${noProxyToken.rows.length} agent proxy tokens`);
    }

    console.log("  Database: connected and migrated");
  },

  // ── Users ──

  async getUserByToken(token: string) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_users WHERE mcp_token = $1", [token]);
    return res.rows[0] ?? null;
  },

  async getUserById(id: string) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_users WHERE id = $1", [id]);
    return res.rows[0] ?? null;
  },

  async getUserByEmail(email: string) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_users WHERE email = $1", [email]);
    return res.rows[0] ?? null;
  },

  async upsertUser(user: { id: string; email: string; name: string; avatar: string; provider: string; providerId: string; mcpToken: string }) {
    const p = getPool();
    // First check if a user with this email already exists (different provider, same person)
    const existing = await p.query("SELECT id, mcp_token FROM occ_users WHERE email = $1", [user.email]);
    if (existing.rows.length > 0) {
      // Same person, different provider — update the existing record
      await p.query(
        "UPDATE occ_users SET name = $1, avatar = $2 WHERE email = $3",
        [user.name, user.avatar, user.email]
      );
      return existing.rows[0];
    }
    await p.query(
      `INSERT INTO occ_users (id, email, name, avatar, provider, provider_id, mcp_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET email = $2, name = $3, avatar = $4`,
      [user.id, user.email, user.name, user.avatar, user.provider, user.providerId, user.mcpToken]
    );
    return { id: user.id, mcp_token: user.mcpToken };
  },

  // ── Proofs ──

  async addProof(userId: string, entry: { agentId: string; tool: string; allowed: boolean; args?: unknown; output?: unknown; reason?: string; proofDigest?: string; receipt?: unknown }) {
    const p = getPool();
    await p.query(
      `INSERT INTO occ_proofs (user_id, agent_id, tool, allowed, args, output, reason, proof_digest, receipt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, entry.agentId, entry.tool, entry.allowed, JSON.stringify(entry.args), JSON.stringify(entry.output), entry.reason, entry.proofDigest, JSON.stringify(entry.receipt)]
    );
  },

  async getProof(userId: string, proofId: string) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_proofs WHERE id = $1 AND user_id = $2", [proofId, userId]);
    return res.rows[0] ?? null;
  },

  async getProofs(userId: string, limit = 50, offset = 0) {
    const p = getPool();
    const res = await p.query(
      "SELECT * FROM occ_proofs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [userId, limit, offset]
    );
    const countRes = await p.query("SELECT COUNT(*) FROM occ_proofs WHERE user_id = $1", [userId]);
    return { entries: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  // ── Agents ──

  async getAgents(userId: string) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_agents WHERE user_id = $1 ORDER BY created_at", [userId]);
    return res.rows;
  },

  async getAgent(userId: string, agentId: string) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_agents WHERE user_id = $1 AND id = $2", [userId, agentId]);
    return res.rows[0] ?? null;
  },

  async upsertAgent(userId: string, agent: { id: string; name: string; allowedTools?: string[]; mcpToken?: string; proxyToken?: string }) {
    const p = getPool();
    await p.query(
      `INSERT INTO occ_agents (id, user_id, name, allowed_tools, mcp_token, proxy_token)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id, user_id) DO UPDATE SET name = $3, allowed_tools = $4`,
      [agent.id, userId, agent.name, agent.allowedTools ?? [], agent.mcpToken ?? null, agent.proxyToken ?? null]
    );
  },

  async getAgentByToken(token: string) {
    const p = getPool();
    const res = await p.query(
      `SELECT a.*, u.id as owner_id, u.email, u.provider, u.provider_id
       FROM occ_agents a JOIN occ_users u ON a.user_id = u.id
       WHERE a.mcp_token = $1`,
      [token]
    );
    return res.rows[0] ?? null;
  },

  async renameAgent(userId: string, agentId: string, name: string) {
    const p = getPool();
    await p.query("UPDATE occ_agents SET name = $3 WHERE user_id = $1 AND id = $2", [userId, agentId, name]);
  },

  async deleteAgent(userId: string, agentId: string) {
    const p = getPool();
    await p.query("DELETE FROM occ_agents WHERE user_id = $1 AND id = $2", [userId, agentId]);
  },

  async enableTool(userId: string, agentId: string, tool: string) {
    const p = getPool();
    await p.query(
      `UPDATE occ_agents SET allowed_tools = array_append(allowed_tools, $3)
       WHERE user_id = $1 AND id = $2 AND NOT ($3 = ANY(allowed_tools))`,
      [userId, agentId, tool]
    );
  },

  async disableTool(userId: string, agentId: string, tool: string) {
    const p = getPool();
    await p.query(
      `UPDATE occ_agents SET allowed_tools = array_remove(allowed_tools, $3)
       WHERE user_id = $1 AND id = $2`,
      [userId, agentId, tool]
    );
  },

  async unblockTool(userId: string, agentId: string, tool: string) {
    const p = getPool();
    await p.query(
      `UPDATE occ_agents SET blocked_tools = array_remove(blocked_tools, $3)
       WHERE user_id = $1 AND id = $2`,
      [userId, agentId, tool]
    );
  },

  async setAgentPaused(userId: string, agentId: string, paused: boolean) {
    const p = getPool();
    await p.query(
      "UPDATE occ_agents SET paused = $3 WHERE user_id = $1 AND id = $2",
      [userId, agentId, paused]
    );
  },

  async updateAgentRules(userId: string, agentId: string, rules: string) {
    const p = getPool();
    await p.query(
      "UPDATE occ_agents SET custom_rules = $3 WHERE user_id = $1 AND id = $2",
      [userId, agentId, rules]
    );
  },

  async incrementAgentCalls(userId: string, agentId: string, allowed: boolean) {
    const p = getPool();
    const col = allowed ? "allowed_count" : "denied_count";
    await p.query(
      `UPDATE occ_agents SET total_calls = total_calls + 1, ${col} = ${col} + 1 WHERE user_id = $1 AND id = $2`,
      [userId, agentId]
    );
  },

  // ── Permissions ──

  async createPermissionRequest(userId: string, agentId: string, tool: string, clientName: string, args?: unknown, toolDescription?: string) {
    const p = getPool();
    // Dedup: don't create another pending request for the same tool
    const existing = await p.query(
      "SELECT id FROM occ_permission_requests WHERE user_id = $1 AND agent_id = $2 AND tool = $3 AND status = 'pending'",
      [userId, agentId, tool]
    );
    if (existing.rows.length > 0) return existing.rows[0];
    const res = await p.query(
      `INSERT INTO occ_permission_requests (user_id, agent_id, tool, client_name, request_args, tool_description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, agentId, tool, clientName, JSON.stringify(args), toolDescription || null]
    );
    return res.rows[0];
  },

  async getPendingPermissions(userId: string) {
    const p = getPool();
    const res = await p.query(
      "SELECT * FROM occ_permission_requests WHERE user_id = $1 AND status = 'pending' ORDER BY requested_at DESC",
      [userId]
    );
    return res.rows;
  },

  async getPermissionHistory(userId: string, limit = 50, offset = 0) {
    const p = getPool();
    const res = await p.query(
      "SELECT * FROM occ_permission_requests WHERE user_id = $1 AND status != 'pending' ORDER BY resolved_at DESC LIMIT $2 OFFSET $3",
      [userId, limit, offset]
    );
    const countRes = await p.query(
      "SELECT COUNT(*) FROM occ_permission_requests WHERE user_id = $1 AND status != 'pending'",
      [userId]
    );
    return { entries: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async resolvePermission(userId: string, requestId: number, decision: 'approved' | 'denied', proofDigest: string, receipt: unknown) {
    const p = getPool();
    // Get the request first
    const req = await p.query("SELECT * FROM occ_permission_requests WHERE id = $1 AND user_id = $2 AND status = 'pending'", [requestId, userId]);
    if (req.rows.length === 0) return null;
    const perm = req.rows[0];

    // Update the request
    await p.query(
      `UPDATE occ_permission_requests SET status = $3, resolved_at = NOW(), proof_digest = $4, receipt = $5
       WHERE id = $1 AND user_id = $2`,
      [requestId, userId, decision, proofDigest, JSON.stringify(receipt)]
    );

    // Update the agent's allowed/blocked tools
    if (decision === 'approved') {
      await p.query(
        `UPDATE occ_agents SET allowed_tools = array_append(allowed_tools, $3),
                               blocked_tools = array_remove(blocked_tools, $3)
         WHERE user_id = $1 AND id = $2 AND NOT ($3 = ANY(allowed_tools))`,
        [userId, perm.agent_id, perm.tool]
      );
    } else {
      await p.query(
        `UPDATE occ_agents SET blocked_tools = array_append(blocked_tools, $3),
                               allowed_tools = array_remove(allowed_tools, $3)
         WHERE user_id = $1 AND id = $2 AND NOT ($3 = ANY(blocked_tools))`,
        [userId, perm.agent_id, perm.tool]
      );
    }

    return { ...perm, status: decision, proof_digest: proofDigest };
  },

  async revokePermission(userId: string, agentId: string, tool: string, proofDigest: string, receipt: unknown) {
    const p = getPool();
    // Remove from allowed, add to blocked
    await p.query(
      `UPDATE occ_agents SET allowed_tools = array_remove(allowed_tools, $3),
                             blocked_tools = array_append(blocked_tools, $3)
       WHERE user_id = $1 AND id = $2`,
      [userId, agentId, tool]
    );
    // Update any existing approved rows to revoked
    await p.query(
      `UPDATE occ_permission_requests SET status = 'revoked', resolved_at = NOW()
       WHERE user_id = $1 AND agent_id = $2 AND tool = $3 AND status = 'approved'`,
      [userId, agentId, tool]
    );
    // Record the revocation
    await p.query(
      `INSERT INTO occ_permission_requests (user_id, agent_id, tool, status, proof_digest, receipt, resolved_at)
       VALUES ($1, $2, $3, 'revoked', $4, $5, NOW())`,
      [userId, agentId, tool, proofDigest, JSON.stringify(receipt)]
    );
  },

  async getActivePermissions(userId: string) {
    const p = getPool();
    const res = await p.query(
      `SELECT pr.* FROM occ_permission_requests pr
       INNER JOIN (
         SELECT DISTINCT ON (agent_id, tool) id FROM occ_permission_requests
         WHERE user_id = $1 AND status = 'approved'
         ORDER BY agent_id, tool, resolved_at DESC
       ) latest ON pr.id = latest.id
       ORDER BY pr.resolved_at DESC`,
      [userId]
    );
    return res.rows;
  },

  /** Get ALL permissions (pending + resolved) with full context */
  async getAllPermissions(userId: string) {
    const p = getPool();
    const res = await p.query(
      `SELECT * FROM occ_permission_requests WHERE user_id = $1 ORDER BY requested_at DESC`,
      [userId]
    );
    return res.rows;
  },

  // ── Authorization Objects ──

  async storeAuthorization(userId: string, agentId: string, tool: string, type: string, proofDigest: string, proof: unknown, referencesDigest?: string, constraints?: unknown) {
    const p = getPool();
    await p.query(
      `INSERT INTO occ_authorizations (user_id, agent_id, tool, type, proof_digest, proof, references_digest, constraints)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, agentId, tool, type, proofDigest, JSON.stringify(proof), referencesDigest ?? null, JSON.stringify(constraints ?? null)]
    );
  },

  /** Find a valid authorization: latest auth with no subsequent revocation */
  async getValidAuthorization(userId: string, agentId: string, tool: string): Promise<{ proofDigest: string; proof: any; constraints: any } | null> {
    const p = getPool();
    // Get the latest authorization
    const authRes = await p.query(
      `SELECT * FROM occ_authorizations
       WHERE user_id = $1 AND agent_id = $2 AND tool = $3 AND type = 'authorization'
       ORDER BY created_at DESC LIMIT 1`,
      [userId, agentId, tool]
    );
    if (authRes.rows.length === 0) return null;
    const auth = authRes.rows[0];

    // Check if there's a revocation that supersedes it
    const revokeRes = await p.query(
      `SELECT id FROM occ_authorizations
       WHERE user_id = $1 AND agent_id = $2 AND tool = $3 AND type = 'revocation'
       AND created_at > $4 LIMIT 1`,
      [userId, agentId, tool, auth.created_at]
    );
    if (revokeRes.rows.length > 0) return null; // Revoked

    return {
      proofDigest: auth.proof_digest,
      proof: auth.proof,
      constraints: auth.constraints,
    };
  },

  /** Get the full authorization chain for a tool (authorizations, revocations) */
  async getAuthorizationChain(userId: string, agentId: string, tool: string) {
    const p = getPool();
    const res = await p.query(
      `SELECT * FROM occ_authorizations
       WHERE user_id = $1 AND agent_id = $2 AND tool = $3
       ORDER BY created_at ASC`,
      [userId, agentId, tool]
    );
    return res.rows;
  },

  /** Get authorization by digest */
  async getAuthorizationByDigest(digest: string) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_authorizations WHERE proof_digest = $1", [digest]);
    return res.rows[0] ?? null;
  },

  // ── Policies ──

  async getActivePolicy(userId: string) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_policies WHERE user_id = $1 AND active = true ORDER BY created_at DESC LIMIT 1", [userId]);
    return res.rows[0] ?? null;
  },

  // ── Notifications ──

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const p = getPool();
    const res = await p.query(
      "SELECT COUNT(*) FROM occ_permission_requests WHERE user_id = $1 AND status = 'pending' AND notified = false",
      [userId]
    );
    return parseInt(res.rows[0].count, 10);
  },

  async markNotificationsRead(userId: string) {
    const p = getPool();
    await p.query(
      "UPDATE occ_permission_requests SET notified = true WHERE user_id = $1 AND status = 'pending' AND notified = false",
      [userId]
    );
  },

  async getPermissionRequest(requestId: number) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_permission_requests WHERE id = $1", [requestId]);
    return res.rows[0] ?? null;
  },

  // ── API Keys ──

  async setAnthropicKey(userId: string, key: string) {
    const p = getPool();
    await p.query("UPDATE occ_users SET anthropic_api_key = $2 WHERE id = $1", [userId, key]);
  },

  async getAnthropicKey(userId: string): Promise<string | null> {
    const p = getPool();
    const res = await p.query("SELECT anthropic_api_key FROM occ_users WHERE id = $1", [userId]);
    return res.rows[0]?.anthropic_api_key ?? null;
  },

  async setPhone(userId: string, phone: string) {
    const p = getPool();
    await p.query("UPDATE occ_users SET phone = $2 WHERE id = $1", [userId, phone]);
  },

  async getUserByPhone(phone: string) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_users WHERE phone = $1", [phone]);
    return res.rows[0] ?? null;
  },

  async deleteAnthropicKey(userId: string) {
    const p = getPool();
    await p.query("UPDATE occ_users SET anthropic_api_key = NULL WHERE id = $1", [userId]);
  },

  // ── Proxy Tokens ──

  async getAgentByProxyToken(token: string) {
    const p = getPool();
    const res = await p.query(
      `SELECT a.*, u.id as owner_id, u.email, u.provider, u.provider_id, u.anthropic_api_key
       FROM occ_agents a JOIN occ_users u ON a.user_id = u.id
       WHERE a.proxy_token = $1`,
      [token]
    );
    return res.rows[0] ?? null;
  },

  // ═══════════════════════════════════════════════════════════
  // V2 — Request-first control model
  // ═══════════════════════════════════════════════════════════

  // ── V2 Requests ──

  async v2CreateRequest(userId: string, req: {
    agentId: string; runId?: number; tool: string; capability?: string;
    label?: string; riskLane: string; summary?: string;
    originType: string; originClient?: string; requestArgs?: unknown;
  }) {
    const p = getPool();
    const res = await p.query(
      `INSERT INTO occ_v2_requests (user_id, agent_id, run_id, tool, capability, label, risk_lane, summary, origin_type, origin_client, request_args)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [userId, req.agentId, req.runId ?? null, req.tool, req.capability ?? null,
       req.label ?? null, req.riskLane, req.summary ?? null,
       req.originType, req.originClient ?? null, JSON.stringify(req.requestArgs ?? null)]
    );
    return res.rows[0];
  },

  async v2GetRequests(userId: string, filters?: {
    status?: string; riskLane?: string; agentId?: string; runId?: number;
    limit?: number; offset?: number;
  }) {
    const p = getPool();
    const where = ["user_id = $1"];
    const params: unknown[] = [userId];
    let idx = 2;
    if (filters?.status) { where.push(`status = $${idx++}`); params.push(filters.status); }
    if (filters?.riskLane) { where.push(`risk_lane = $${idx++}`); params.push(filters.riskLane); }
    if (filters?.agentId) { where.push(`agent_id = $${idx++}`); params.push(filters.agentId); }
    if (filters?.runId) { where.push(`run_id = $${idx++}`); params.push(filters.runId); }
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;
    const res = await p.query(
      `SELECT * FROM occ_v2_requests WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    const countRes = await p.query(
      `SELECT COUNT(*) FROM occ_v2_requests WHERE ${where.join(" AND ")}`,
      params
    );
    return { requests: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async v2GetRequest(requestId: number) {
    const p = getPool();
    const req = await p.query("SELECT * FROM occ_v2_requests WHERE id = $1", [requestId]);
    if (!req.rows[0]) return null;
    const decisions = await p.query("SELECT * FROM occ_v2_decisions WHERE request_id = $1 ORDER BY decided_at", [requestId]);
    const executions = await p.query("SELECT * FROM occ_v2_executions WHERE request_id = $1 ORDER BY executed_at", [requestId]);
    return { ...req.rows[0], decisions: decisions.rows, executions: executions.rows };
  },

  async v2UpdateRequestStatus(requestId: number, status: string) {
    const p = getPool();
    await p.query("UPDATE occ_v2_requests SET status = $2 WHERE id = $1", [requestId, status]);
  },

  async v2GetRequestStats(userId: string) {
    const p = getPool();
    const res = await p.query(
      `SELECT status, risk_lane, COUNT(*)::int as count
       FROM occ_v2_requests WHERE user_id = $1
       GROUP BY status, risk_lane`,
      [userId]
    );
    return res.rows;
  },

  // ── V2 Decisions ──

  async v2CreateDecision(req: {
    requestId: number; userId: string; decidedBy: string;
    decision: string; mode: string; reason?: string;
    proofDigest?: string; proof?: unknown;
  }) {
    const p = getPool();
    const res = await p.query(
      `INSERT INTO occ_v2_decisions (request_id, user_id, decided_by, decision, mode, reason, proof_digest, proof)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.requestId, req.userId, req.decidedBy, req.decision, req.mode,
       req.reason ?? null, req.proofDigest ?? null, JSON.stringify(req.proof ?? null)]
    );
    return res.rows[0];
  },

  // ── V2 Executions ──

  async v2CreateExecution(req: {
    requestId: number; decisionId: number; userId: string; agentId: string;
    tool: string; args?: unknown; output?: unknown; durationMs?: number;
    authDigest?: string; execDigest?: string; proof?: unknown;
    status?: string; error?: string;
  }) {
    const p = getPool();
    const res = await p.query(
      `INSERT INTO occ_v2_executions (request_id, decision_id, user_id, agent_id, tool, args, output, duration_ms, auth_digest, exec_digest, proof, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [req.requestId, req.decisionId, req.userId, req.agentId, req.tool,
       JSON.stringify(req.args ?? null), JSON.stringify(req.output ?? null),
       req.durationMs ?? null, req.authDigest ?? null, req.execDigest ?? null,
       JSON.stringify(req.proof ?? null), req.status ?? "completed", req.error ?? null]
    );
    return res.rows[0];
  },

  // ── V2 Runs ──

  async v2CreateRun(userId: string, agentId: string, name?: string) {
    const p = getPool();
    const res = await p.query(
      `INSERT INTO occ_v2_runs (user_id, agent_id, name) VALUES ($1, $2, $3) RETURNING *`,
      [userId, agentId, name ?? null]
    );
    return res.rows[0];
  },

  async v2GetRuns(userId: string, filters?: { status?: string; agentId?: string; limit?: number; offset?: number }) {
    const p = getPool();
    const where = ["user_id = $1"];
    const params: unknown[] = [userId];
    let idx = 2;
    if (filters?.status) { where.push(`status = $${idx++}`); params.push(filters.status); }
    if (filters?.agentId) { where.push(`agent_id = $${idx++}`); params.push(filters.agentId); }
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;
    const res = await p.query(
      `SELECT * FROM occ_v2_runs WHERE ${where.join(" AND ")} ORDER BY started_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    return res.rows;
  },

  async v2GetRun(runId: number) {
    const p = getPool();
    const run = await p.query("SELECT * FROM occ_v2_runs WHERE id = $1", [runId]);
    if (!run.rows[0]) return null;
    const requests = await p.query(
      "SELECT * FROM occ_v2_requests WHERE run_id = $1 ORDER BY created_at", [runId]
    );
    return { ...run.rows[0], requests: requests.rows };
  },

  async v2IncrementRunCount(runId: number) {
    const p = getPool();
    await p.query("UPDATE occ_v2_runs SET request_count = request_count + 1 WHERE id = $1", [runId]);
  },

  // ── V2 Risk Lanes ──

  async v2GetRiskLanes(userId: string) {
    const p = getPool();
    const res = await p.query("SELECT * FROM occ_v2_risk_lanes WHERE user_id = $1 ORDER BY lane", [userId]);
    return res.rows;
  },

  async v2SetRiskLane(userId: string, lane: string, mode: string) {
    const p = getPool();
    await p.query(
      `INSERT INTO occ_v2_risk_lanes (user_id, lane, mode, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, lane) DO UPDATE SET mode = $3, updated_at = NOW()`,
      [userId, lane, mode]
    );
  },

  async v2GetRiskLane(userId: string, lane: string): Promise<string> {
    const p = getPool();
    const res = await p.query(
      "SELECT mode FROM occ_v2_risk_lanes WHERE user_id = $1 AND lane = $2",
      [userId, lane]
    );
    return res.rows[0]?.mode ?? "ask"; // default: require human approval
  },

  // ── V2 Overview ──

  async v2GetOverview(userId: string) {
    const p = getPool();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [pending, todayStats, recentActivity, activeRuns] = await Promise.all([
      p.query("SELECT COUNT(*)::int as count FROM occ_v2_requests WHERE user_id = $1 AND status = 'pending'", [userId]),
      p.query(
        `SELECT status, COUNT(*)::int as count FROM occ_v2_requests
         WHERE user_id = $1 AND created_at >= $2 GROUP BY status`,
        [userId, today]
      ),
      p.query(
        `SELECT r.*, d.decision, d.decided_at, e.status as exec_status
         FROM occ_v2_requests r
         LEFT JOIN occ_v2_decisions d ON d.request_id = r.id
         LEFT JOIN occ_v2_executions e ON e.request_id = r.id
         WHERE r.user_id = $1
         ORDER BY r.created_at DESC LIMIT 20`,
        [userId]
      ),
      p.query("SELECT COUNT(*)::int as count FROM occ_v2_runs WHERE user_id = $1 AND status = 'active'", [userId]),
    ]);

    const stats: Record<string, number> = { pending: 0, approved: 0, denied: 0, auto_approved: 0 };
    for (const row of todayStats.rows) stats[row.status] = row.count;

    return {
      pending: pending.rows[0].count,
      todayApproved: stats.approved + stats.auto_approved,
      todayDenied: stats.denied,
      todayTotal: Object.values(stats).reduce((a, b) => a + b, 0),
      activeRuns: activeRuns.rows[0].count,
      recentActivity: recentActivity.rows,
    };
  },

  // ── V2 Proofs (reads from existing occ_proofs + v2_executions) ──

  async v2GetProofs(userId: string, filters?: {
    agentId?: string; tool?: string; digest?: string;
    limit?: number; offset?: number;
  }) {
    const p = getPool();
    const where = ["user_id = $1"];
    const params: unknown[] = [userId];
    let idx = 2;
    if (filters?.agentId) { where.push(`agent_id = $${idx++}`); params.push(filters.agentId); }
    if (filters?.tool) { where.push(`tool = $${idx++}`); params.push(filters.tool); }
    if (filters?.digest) { where.push(`proof_digest ILIKE $${idx++}`); params.push(`%${filters.digest}%`); }
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;
    const res = await p.query(
      `SELECT * FROM occ_proofs WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    const countRes = await p.query(
      `SELECT COUNT(*) FROM occ_proofs WHERE ${where.join(" AND ")}`, params
    );
    return { proofs: res.rows, total: parseInt(countRes.rows[0].count, 10) };
  },

  async createPolicy(userId: string, policy: { name: string; allowedTools: string[]; maxActions?: number; rateLimit?: string; policyDigest?: string; categories?: Record<string, boolean>; customRules?: string[] }) {
    const p = getPool();
    await p.query("UPDATE occ_policies SET active = false WHERE user_id = $1", [userId]);
    const res = await p.query(
      `INSERT INTO occ_policies (user_id, name, allowed_tools, max_actions, rate_limit, policy_digest, categories, custom_rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, policy.name, policy.allowedTools, policy.maxActions ?? null, policy.rateLimit ?? null, policy.policyDigest ?? null, JSON.stringify(policy.categories ?? {}), JSON.stringify(policy.customRules ?? [])]
    );
    return res.rows[0];
  },

  async v2WipeAll(userId: string) {
    const p = getPool();
    await p.query("DELETE FROM occ_v2_executions WHERE user_id = $1", [userId]);
    await p.query("DELETE FROM occ_v2_decisions WHERE user_id = $1", [userId]);
    await p.query("DELETE FROM occ_v2_requests WHERE user_id = $1", [userId]);
    await p.query("DELETE FROM occ_proofs WHERE user_id = $1", [userId]);
  },
};

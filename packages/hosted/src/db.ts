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

      CREATE INDEX IF NOT EXISTS idx_occ_perm_user_status ON occ_permission_requests(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_occ_perm_user_agent_tool ON occ_permission_requests(user_id, agent_id, tool);

      -- Add blocked_tools column to agents
      ALTER TABLE occ_agents ADD COLUMN IF NOT EXISTS blocked_tools TEXT[] DEFAULT '{}';

      -- Per-agent MCP tokens (each agent gets its own URL)
      ALTER TABLE occ_agents ADD COLUMN IF NOT EXISTS mcp_token TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_occ_agents_mcp_token ON occ_agents(mcp_token) WHERE mcp_token IS NOT NULL;

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

  async upsertAgent(userId: string, agent: { id: string; name: string; allowedTools?: string[]; mcpToken?: string }) {
    const p = getPool();
    await p.query(
      `INSERT INTO occ_agents (id, user_id, name, allowed_tools, mcp_token)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id, user_id) DO UPDATE SET name = $3, allowed_tools = $4`,
      [agent.id, userId, agent.name, agent.allowedTools ?? [], agent.mcpToken ?? null]
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
};

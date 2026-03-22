import pg from "pg";
const { Pool } = pg;
let pool;
function getPool() {
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
        await p.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        avatar TEXT,
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        mcp_token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS proofs (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
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

      CREATE INDEX IF NOT EXISTS idx_proofs_user_id ON proofs(user_id);
      CREATE INDEX IF NOT EXISTS idx_proofs_created_at ON proofs(created_at DESC);

      CREATE TABLE IF NOT EXISTS policies (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        allowed_tools TEXT[] DEFAULT '{}',
        max_actions INTEGER,
        rate_limit TEXT,
        policy_digest TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        allowed_tools TEXT[] DEFAULT '{}',
        paused BOOLEAN DEFAULT false,
        total_calls INTEGER DEFAULT 0,
        allowed_count INTEGER DEFAULT 0,
        denied_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, user_id)
      );
    `);
        console.log("  Database: connected and migrated");
    },
    // ── Users ──
    async getUserByToken(token) {
        const p = getPool();
        const res = await p.query("SELECT * FROM users WHERE mcp_token = $1", [token]);
        return res.rows[0] ?? null;
    },
    async getUserById(id) {
        const p = getPool();
        const res = await p.query("SELECT * FROM users WHERE id = $1", [id]);
        return res.rows[0] ?? null;
    },
    async upsertUser(user) {
        const p = getPool();
        await p.query(`INSERT INTO users (id, email, name, avatar, provider, provider_id, mcp_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET email = $2, name = $3, avatar = $4`, [user.id, user.email, user.name, user.avatar, user.provider, user.providerId, user.mcpToken]);
    },
    // ── Proofs ──
    async addProof(userId, entry) {
        const p = getPool();
        await p.query(`INSERT INTO proofs (user_id, agent_id, tool, allowed, args, output, reason, proof_digest, receipt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [userId, entry.agentId, entry.tool, entry.allowed, JSON.stringify(entry.args), JSON.stringify(entry.output), entry.reason, entry.proofDigest, JSON.stringify(entry.receipt)]);
    },
    async getProofs(userId, limit = 50, offset = 0) {
        const p = getPool();
        const res = await p.query("SELECT * FROM proofs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", [userId, limit, offset]);
        const countRes = await p.query("SELECT COUNT(*) FROM proofs WHERE user_id = $1", [userId]);
        return { entries: res.rows, total: parseInt(countRes.rows[0].count, 10) };
    },
    // ── Agents ──
    async getAgents(userId) {
        const p = getPool();
        const res = await p.query("SELECT * FROM agents WHERE user_id = $1 ORDER BY created_at", [userId]);
        return res.rows;
    },
    async getAgent(userId, agentId) {
        const p = getPool();
        const res = await p.query("SELECT * FROM agents WHERE user_id = $1 AND id = $2", [userId, agentId]);
        return res.rows[0] ?? null;
    },
    async upsertAgent(userId, agent) {
        const p = getPool();
        await p.query(`INSERT INTO agents (id, user_id, name, allowed_tools)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id, user_id) DO UPDATE SET name = $3, allowed_tools = $4`, [agent.id, userId, agent.name, agent.allowedTools ?? []]);
    },
    async deleteAgent(userId, agentId) {
        const p = getPool();
        await p.query("DELETE FROM agents WHERE user_id = $1 AND id = $2", [userId, agentId]);
    },
    async incrementAgentCalls(userId, agentId, allowed) {
        const p = getPool();
        const col = allowed ? "allowed_count" : "denied_count";
        await p.query(`UPDATE agents SET total_calls = total_calls + 1, ${col} = ${col} + 1 WHERE user_id = $1 AND id = $2`, [userId, agentId]);
    },
    // ── Policies ──
    async getActivePolicy(userId) {
        const p = getPool();
        const res = await p.query("SELECT * FROM policies WHERE user_id = $1 AND active = true ORDER BY created_at DESC LIMIT 1", [userId]);
        return res.rows[0] ?? null;
    },
    async createPolicy(userId, policy) {
        const p = getPool();
        // Deactivate old policies
        await p.query("UPDATE policies SET active = false WHERE user_id = $1", [userId]);
        const res = await p.query(`INSERT INTO policies (user_id, name, allowed_tools, max_actions, rate_limit, policy_digest)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [userId, policy.name, policy.allowedTools, policy.maxActions ?? null, policy.rateLimit ?? null, policy.policyDigest ?? null]);
        return res.rows[0];
    },
};
//# sourceMappingURL=db.js.map
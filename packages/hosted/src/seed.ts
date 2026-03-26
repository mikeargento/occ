/**
 * Seed demo data for the OCC dashboard.
 * Creates realistic-looking requests, decisions, executions, and runs.
 */

import { db } from "./db.js";

const DEMO_ACTIONS = [
  { tool: "send_email", args: { to: "david.chen@acme.com", subject: "Follow-up on pilot", body: "Hi David..." }, lane: "external_comms" },
  { tool: "read_file", args: { path: "/reports/q1-metrics.csv" }, lane: "read_only" },
  { tool: "write_file", args: { path: "/output/analysis.md", content: "# Q1 Analysis\n..." }, lane: "file_modification" },
  { tool: "search_web", args: { query: "competitor pricing 2026" }, lane: "read_only" },
  { tool: "fetch_url", args: { url: "https://api.stripe.com/v1/charges" }, lane: "read_only" },
  { tool: "send_email", args: { to: "team@company.com", subject: "Deploy notification", body: "Deploying v2.1..." }, lane: "external_comms" },
  { tool: "delete_file", args: { path: "/tmp/staging-cache.json" }, lane: "file_modification" },
  { tool: "list_directory", args: { path: "/var/log/agents" }, lane: "read_only" },
  { tool: "write_file", args: { path: "/config/deploy.yaml", content: "version: 2.1\n..." }, lane: "file_modification" },
  { tool: "send_email", args: { to: "billing@vendor.com", subject: "Invoice inquiry", body: "Regarding invoice #4521..." }, lane: "external_comms" },
  { tool: "fetch_url", args: { url: "https://crm.company.com/api/contacts/12345" }, lane: "read_only" },
  { tool: "write_file", args: { path: "/data/customer-export.csv", content: "name,email,plan\n..." }, lane: "file_modification" },
  { tool: "read_file", args: { path: "/secrets/api-keys.env" }, lane: "credential_access" },
  { tool: "send_email", args: { to: "support@customer.com", subject: "Refund processed", body: "Your refund of $149..." }, lane: "external_comms" },
  { tool: "move_file", args: { from: "/staging/report.pdf", to: "/published/report.pdf" }, lane: "file_modification" },
];

const AGENTS = ["research-bot", "deploy-agent", "support-agent", "analytics"];
const CLIENTS = ["Claude Code", "Cursor", "API Client", "Paperclip"];
const ORIGINS: string[] = ["mcp", "llm_proxy", "api"];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function minutesAgo(min: number): Date {
  return new Date(Date.now() - min * 60_000);
}

export async function seedDemoData(userId: string) {
  const p = (await import("pg")).default;
  const pool = new p.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : undefined,
  });

  // Create a couple of runs
  const run1 = await db.v2CreateRun(userId, "research-bot", "Customer analysis workflow");
  const run2 = await db.v2CreateRun(userId, "deploy-agent", "Deploy v2.1 to production");

  const runs = [run1.id, run2.id, null, null]; // Some requests not in runs

  // Create requests with varying statuses and times
  const statuses = ["approved", "denied", "auto_approved", "pending", "approved", "approved", "denied", "pending", "approved", "auto_approved", "approved", "denied", "denied", "approved", "pending"];

  for (let i = 0; i < DEMO_ACTIONS.length; i++) {
    const action = DEMO_ACTIONS[i]!;
    const agent = randomPick(AGENTS);
    const status = statuses[i] ?? "pending";
    const minsAgo = 5 + i * 12 + Math.floor(Math.random() * 10); // Spread over ~3 hours

    // Generate summary
    const summaryMap: Record<string, string> = {
      send_email: `Send email to ${(action.args as any).to} with subject "${(action.args as any).subject}"`,
      read_file: `Read file ${(action.args as any).path}`,
      write_file: `Write to ${(action.args as any).path}`,
      delete_file: `Delete ${(action.args as any).path}`,
      list_directory: `List contents of ${(action.args as any).path}`,
      search_web: `Search the web for "${(action.args as any).query}"`,
      fetch_url: `Fetch ${(action.args as any).url}`,
      move_file: `Move ${(action.args as any).from} to ${(action.args as any).to}`,
    };

    const request = await pool.query(
      `INSERT INTO occ_v2_requests (user_id, agent_id, run_id, tool, risk_lane, summary, label, origin_type, origin_client, request_args, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [userId, agent, randomPick(runs), action.tool, action.lane,
       summaryMap[action.tool] ?? action.tool,
       action.tool.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
       randomPick(ORIGINS), randomPick(CLIENTS),
       JSON.stringify(action.args), status, minutesAgo(minsAgo)]
    );

    const reqId = request.rows[0].id;

    // Create decisions for non-pending requests
    if (status !== "pending") {
      const decision = status === "denied" ? "denied" : "approved";
      const decidedBy = status === "auto_approved" ? "policy_auto" : "human";
      const decRes = await pool.query(
        `INSERT INTO occ_v2_decisions (request_id, user_id, decided_by, decision, mode, reason, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [reqId, userId, decidedBy, decision, "once",
         decision === "denied" ? "Action not permitted for this workflow" : null,
         minutesAgo(minsAgo - 1)]
      );

      // Create executions for approved requests
      if (decision === "approved") {
        await pool.query(
          `INSERT INTO occ_v2_executions (request_id, decision_id, user_id, agent_id, tool, args, duration_ms, status, executed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [reqId, decRes.rows[0].id, userId, agent, action.tool,
           JSON.stringify(action.args), 50 + Math.floor(Math.random() * 500),
           "completed", minutesAgo(minsAgo - 2)]
        );
      }
    }
  }

  // Update run request counts
  await pool.query(
    "UPDATE occ_v2_runs SET request_count = (SELECT COUNT(*) FROM occ_v2_requests WHERE run_id = occ_v2_runs.id) WHERE user_id = $1",
    [userId]
  );

  console.log(`  [seed] Created ${DEMO_ACTIONS.length} demo requests for ${userId}`);
}

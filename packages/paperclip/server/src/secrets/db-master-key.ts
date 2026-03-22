/**
 * DB-based master key persistence for containerized deployments.
 *
 * On Railway (and similar platforms), each deploy gets a fresh container so
 * filesystem-based master keys are lost. This module stores the master key in
 * PostgreSQL so it survives container restarts.
 *
 * Priority order (matches loadOrCreateMasterKey in local-encrypted-provider.ts):
 *   1. PAPERCLIP_SECRETS_MASTER_KEY env var (explicit override — always wins)
 *   2. Database row in `system_kv` table (persisted across deploys)
 *   3. Filesystem key file (local dev fallback — handled by the provider itself)
 *   4. Generate new key and store in DB (first boot in container)
 *
 * Call `ensureMasterKeyFromDb()` early in server startup, AFTER the database
 * connection is ready but BEFORE any code touches the secrets provider.
 * It sets `process.env.PAPERCLIP_SECRETS_MASTER_KEY` so the existing
 * synchronous `loadOrCreateMasterKey()` picks it up without modification.
 */

import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { logger } from "../middleware/logger.js";

const SYSTEM_KV_TABLE = "system_kv";
const MASTER_KEY_ID = "secrets_master_key";

function isContainerizedEnvironment(): boolean {
  return !!(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    (process.env.PAPERCLIP_DEPLOYMENT_MODE &&
      process.env.PAPERCLIP_DEPLOYMENT_MODE !== "local_trusted")
  );
}

/**
 * Ensures the secrets master key is available via env var for containerized
 * deployments. No-op if the env var is already set or if not running in a
 * container environment.
 */
export async function ensureMasterKeyFromDb(databaseUrl: string): Promise<void> {
  // 1. If the env var is already set, nothing to do.
  if (process.env.PAPERCLIP_SECRETS_MASTER_KEY?.trim()) {
    return;
  }

  // 2. Only activate DB persistence in containerized environments.
  if (!isContainerizedEnvironment()) {
    return;
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  try {
    // Ensure the system_kv table exists (idempotent).
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${SYSTEM_KV_TABLE} (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Try to read an existing key from the DB.
    const rows = await sql.unsafe(
      `SELECT value FROM ${SYSTEM_KV_TABLE} WHERE key = $1`,
      [MASTER_KEY_ID],
    );

    if (rows.length > 0 && typeof rows[0].value === "string" && rows[0].value.trim()) {
      process.env.PAPERCLIP_SECRETS_MASTER_KEY = rows[0].value.trim();
      logger.info("Loaded secrets master key from database (persisted across deploys)");
      return;
    }

    // No key in DB — generate one and persist it.
    const generated = randomBytes(32).toString("base64");

    await sql.unsafe(
      `INSERT INTO ${SYSTEM_KV_TABLE} (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [MASTER_KEY_ID, generated],
    );

    process.env.PAPERCLIP_SECRETS_MASTER_KEY = generated;
    logger.info("Generated and stored new secrets master key in database");
  } finally {
    await sql.end();
  }
}

// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { KeyStore } from "./key-store.js";

/** A persisted connection record. */
export interface Connection {
  id: string;
  name: string;
  type: "orchestrator" | "observability" | "platform";
  status: "connected" | "disconnected" | "error";
  keyId: string | null;
  config: Record<string, string>;
  lastChecked: number | null;
  error: string | null;
}

/** Definition of an available connection. */
export interface ConnectionDefinition {
  id: string;
  name: string;
  type: "orchestrator" | "observability" | "platform";
  testUrl: string | null;
  keyHeader: string | null;
}

/** Built-in connection definitions. */
const AVAILABLE_CONNECTIONS: ConnectionDefinition[] = [
  { id: "composio", name: "Composio", type: "orchestrator", testUrl: "https://backend.composio.dev/api/v1/apps", keyHeader: "x-api-key" },
  { id: "langsmith", name: "LangSmith", type: "observability", testUrl: "https://api.smith.langchain.com/runs", keyHeader: "x-api-key" },
  { id: "agentops", name: "AgentOps", type: "observability", testUrl: "https://api.agentops.ai/v2/health", keyHeader: "Authorization" },
  { id: "julep", name: "Julep", type: "orchestrator", testUrl: "https://api.julep.ai/api/agents", keyHeader: "Authorization" },
  { id: "relevanceai", name: "Relevance AI", type: "platform", testUrl: "https://api-bcbe5a.stack.tryrelevance.com/latest/datasets/list", keyHeader: "Authorization" },
  { id: "letta", name: "Letta (MemGPT)", type: "orchestrator", testUrl: null, keyHeader: null },
  { id: "superagi", name: "SuperAGI", type: "orchestrator", testUrl: null, keyHeader: null },
];

/**
 * Manages connections to external orchestrator services.
 * Each connection type has a test function to verify the API key works.
 */
export class ConnectionManager {
  #keyStore: KeyStore;
  #configPath: string;
  #connections: Map<string, Connection> = new Map();

  constructor(keyStore: KeyStore, configPath?: string) {
    this.#keyStore = keyStore;
    this.#configPath = configPath ?? ".occ/connections.json";
    this.#load();
  }

  #load(): void {
    if (!existsSync(this.#configPath)) return;
    try {
      const raw = readFileSync(this.#configPath, "utf-8");
      const data = JSON.parse(raw) as Connection[];
      for (const conn of data) {
        this.#connections.set(conn.id, conn);
      }
    } catch {
      this.#connections.clear();
    }
  }

  #save(): void {
    const dir = dirname(this.#configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data = Array.from(this.#connections.values());
    writeFileSync(this.#configPath, JSON.stringify(data, null, 2), "utf-8");
  }

  /** Get the definition for a connection ID. */
  #getDefinition(id: string): ConnectionDefinition | undefined {
    return AVAILABLE_CONNECTIONS.find((c) => c.id === id);
  }

  /** List all available connections with their current status. */
  async listConnections(): Promise<Connection[]> {
    const result: Connection[] = [];
    for (const def of AVAILABLE_CONNECTIONS) {
      const existing = this.#connections.get(def.id);
      if (existing) {
        result.push({ ...existing });
      } else {
        result.push({
          id: def.id,
          name: def.name,
          type: def.type,
          status: "disconnected",
          keyId: null,
          config: {},
          lastChecked: null,
          error: null,
        });
      }
    }
    return result;
  }

  /** Connect to a service by storing its API key and testing the connection. */
  async connect(id: string, apiKey: string, config?: Record<string, string>): Promise<Connection> {
    const def = this.#getDefinition(id);
    if (!def) throw new Error(`Unknown connection: "${id}"`);

    // Store the key
    await this.#keyStore.setKey(id, def.name, apiKey);

    // Create/update connection record
    const conn: Connection = {
      id: def.id,
      name: def.name,
      type: def.type,
      status: "connected",
      keyId: id,
      config: config ?? {},
      lastChecked: Date.now(),
      error: null,
    };

    // Test if possible
    if (def.testUrl && def.keyHeader) {
      const testResult = await this.#testRemote(def, apiKey);
      if (!testResult.ok) {
        conn.status = "error";
        conn.error = testResult.error ?? "Connection test failed";
      }
    }

    this.#connections.set(id, conn);
    this.#save();
    return conn;
  }

  /** Disconnect a service and remove its stored key. */
  async disconnect(id: string): Promise<void> {
    await this.#keyStore.deleteKey(id);
    this.#connections.delete(id);
    this.#save();
  }

  /** Test whether a connection's API key is still valid. */
  async testConnection(id: string): Promise<{ ok: boolean; error?: string }> {
    const def = this.#getDefinition(id);
    if (!def) return { ok: false, error: `Unknown connection: "${id}"` };

    if (!def.testUrl || !def.keyHeader) {
      // Self-hosted — check if we have a key stored
      const conn = this.#connections.get(id);
      if (!conn || !conn.keyId) return { ok: false, error: "Not connected" };
      const key = await this.#keyStore.getKey(conn.keyId);
      if (!key) return { ok: false, error: "Key not found" };
      // Can't verify self-hosted without a custom URL
      const testUrl = conn.config["testUrl"];
      if (testUrl) {
        return this.#testRemote({ ...def, testUrl, keyHeader: "Authorization" }, key);
      }
      return { ok: true }; // Assume ok if key exists for self-hosted
    }

    const key = await this.#keyStore.getKey(id);
    if (!key) return { ok: false, error: "No API key stored" };

    const result = await this.#testRemote(def, key);

    // Update connection status
    const conn = this.#connections.get(id);
    if (conn) {
      conn.lastChecked = Date.now();
      conn.status = result.ok ? "connected" : "error";
      conn.error = result.ok ? null : (result.error ?? "Connection test failed");
      this.#save();
    }

    return result;
  }

  /** Get the list of available connection definitions. */
  getAvailableConnections(): ConnectionDefinition[] {
    return [...AVAILABLE_CONNECTIONS];
  }

  /** Test a remote endpoint with an API key. */
  async #testRemote(
    def: { testUrl: string | null; keyHeader: string | null },
    apiKey: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!def.testUrl || !def.keyHeader) return { ok: false, error: "No test URL configured" };
    try {
      const headers: Record<string, string> = {};
      if (def.keyHeader === "Authorization") {
        headers["Authorization"] = `Bearer ${apiKey}`;
      } else {
        headers[def.keyHeader] = apiKey;
      }
      const resp = await fetch(def.testUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (resp.ok || resp.status === 401 || resp.status === 403) {
        // 401/403 means the endpoint exists but key is bad
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false, error: `Authentication failed (${resp.status})` };
        }
        return { ok: true };
      }
      return { ok: false, error: `HTTP ${resp.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  }
}

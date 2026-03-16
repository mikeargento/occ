// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { DownstreamServer } from "./config.js";
import type { DiscoveredTool } from "./types.js";

interface ConnectedServer {
  config: DownstreamServer;
  client: Client;
  tools: DiscoveredTool[];
}

/**
 * Discovers and manages downstream MCP tool servers.
 * Connects to each downstream server, lists their tools,
 * and routes tool calls to the correct server.
 */
export class ToolRegistry {
  #servers: Map<string, ConnectedServer> = new Map();
  #toolIndex: Map<string, string> = new Map(); // tool name → server name

  /** Connect to all downstream servers and discover their tools. */
  async initialize(servers: DownstreamServer[]): Promise<void> {
    for (const server of servers) {
      await this.#connectServer(server);
    }
  }

  async #connectServer(config: DownstreamServer): Promise<void> {
    const client = new Client({ name: "occ-proxy", version: "1.0.0" });

    let transport;
    if (config.transport === "stdio") {
      if (!config.command) throw new Error(`Downstream "${config.name}" missing command`);
      const stdioOpts: { command: string; args: string[]; env?: Record<string, string> } = {
        command: config.command,
        args: config.args ?? [],
      };
      if (config.env) stdioOpts.env = config.env;
      transport = new StdioClientTransport(stdioOpts);
    } else {
      if (!config.url) throw new Error(`Downstream "${config.name}" missing url`);
      transport = new StreamableHTTPClientTransport(new URL(config.url));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.connect(transport as any);

    // Discover tools
    const tools: DiscoveredTool[] = [];
    let cursor: string | undefined;
    do {
      const result = await client.listTools({ cursor });
      for (const t of result.tools) {
        const discovered: DiscoveredTool = {
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown> | undefined,
          source: config.name,
        };
        tools.push(discovered);
        this.#toolIndex.set(t.name, config.name);
      }
      cursor = result.nextCursor;
    } while (cursor);

    this.#servers.set(config.name, { config, client, tools });
    console.error(`[proxy] Connected to "${config.name}" — ${tools.length} tool(s)`);
  }

  /** Register demo tools for testing when no downstream servers are configured. */
  registerDemoTools(): void {
    const demoTools: DiscoveredTool[] = [
      { name: "read-order", description: "Look up an order by ID", source: "demo" },
      { name: "search-db", description: "Search the customer database", source: "demo" },
      { name: "check-eligibility", description: "Check refund eligibility for an order", source: "demo" },
      { name: "issue-refund", description: "Issue a refund to the customer", source: "demo" },
      { name: "send-email", description: "Send an email to a customer", source: "demo" },
      { name: "read-file", description: "Read a file from the filesystem", source: "demo" },
      { name: "write-file", description: "Write content to a file", source: "demo" },
      { name: "delete-user", description: "Permanently delete a user account", source: "demo" },
      { name: "drop-table", description: "Drop a database table", source: "demo" },
      { name: "deploy-service", description: "Deploy a service to production", source: "demo" },
    ];
    for (const tool of demoTools) {
      this.#demoTools.push(tool);
      this.#toolIndex.set(tool.name, "demo");
    }
    console.error(`[proxy] Registered ${demoTools.length} demo tools for testing`);
  }

  #demoTools: DiscoveredTool[] = [];

  /** Get the merged tool list from all downstream servers. */
  listTools(): DiscoveredTool[] {
    const all: DiscoveredTool[] = [...this.#demoTools];
    for (const server of this.#servers.values()) {
      all.push(...server.tools);
    }
    return all;
  }

  /** Route a tool call to the correct downstream server. */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
    const serverName = this.#toolIndex.get(name);
    if (!serverName) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    // Demo tools return mock responses
    if (serverName === "demo") {
      return {
        content: [{ type: "text", text: `[demo] ${name} executed with args: ${JSON.stringify(args)}` }],
      };
    }

    const server = this.#servers.get(serverName);
    if (!server) {
      return {
        content: [{ type: "text", text: `Server "${serverName}" not connected` }],
        isError: true,
      };
    }

    const result = await server.client.callTool({ name, arguments: args });
    return {
      content: result.content as Array<{ type: string; text?: string }>,
      ...(result.isError ? { isError: result.isError as boolean } : {}),
    };
  }

  /** Get which server owns a tool. */
  getToolSource(name: string): string | undefined {
    return this.#toolIndex.get(name);
  }

  /** Disconnect all downstream servers. */
  async shutdown(): Promise<void> {
    for (const server of this.#servers.values()) {
      try {
        await server.client.close();
      } catch {
        // Best effort
      }
    }
    this.#servers.clear();
    this.#toolIndex.clear();
  }
}

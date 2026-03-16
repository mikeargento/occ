// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ToolRegistry } from "./tool-registry.js";
import type { Interceptor } from "./interceptor.js";
import type { ProxyEventBus } from "./events.js";
import type { ProxyConfig } from "./config.js";
import type { ProxyState } from "./state.js";

/**
 * Convert a JSON Schema properties object to a Zod shape
 * so the MCP SDK can expose parameter names to the client.
 */
function jsonSchemaToZod(inputSchema?: Record<string, unknown>): Record<string, z.ZodTypeAny> | null {
  if (!inputSchema) return null;
  const properties = inputSchema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return null;
  const required = new Set((inputSchema.required as string[]) ?? []);

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(properties)) {
    let field: z.ZodTypeAny;
    const desc = (prop.description as string) ?? undefined;
    switch (prop.type) {
      case "number":
      case "integer":
        field = desc ? z.number().describe(desc) : z.number();
        break;
      case "boolean":
        field = desc ? z.boolean().describe(desc) : z.boolean();
        break;
      case "array":
        field = desc ? z.array(z.unknown()).describe(desc) : z.array(z.unknown());
        break;
      case "object":
        field = desc ? z.record(z.string(), z.unknown()).describe(desc) : z.record(z.string(), z.unknown());
        break;
      default: // string or unknown
        field = desc ? z.string().describe(desc) : z.string();
    }
    shape[key] = required.has(key) ? field : field.optional();
  }
  return shape;
}

/**
 * MCP server that agents connect to.
 * Exposes the merged tool catalog from all downstream servers,
 * routing calls through the interceptor for policy enforcement.
 */
export async function startMcpServer(
  config: ProxyConfig,
  registry: ToolRegistry,
  interceptor: Interceptor,
  events: ProxyEventBus,
  state?: ProxyState,
): Promise<McpServer> {
  const server = new McpServer({
    name: "OCC Agent Proxy",
    version: "1.0.0",
  });

  // Register all discovered tools from downstream servers
  const tools = registry.listTools();
  for (const tool of tools) {
    const zodShape = jsonSchemaToZod(tool.inputSchema);
    const description = tool.description ?? `Proxied tool: ${tool.name}`;

    if (zodShape) {
      server.tool(
        tool.name,
        description,
        zodShape,
        async (params) => {
          const agentId = state?.resolveAgentId("default-agent") ?? "default-agent";
          const args = (params ?? {}) as Record<string, unknown>;
          const result = await interceptor.handleToolCall(agentId, tool.name, args);
          return {
            content: result.content.map((c) => ({
              type: c.type as "text",
              text: c.text ?? "",
            })),
            isError: result.isError,
          };
        },
      );
    } else {
      server.tool(
        tool.name,
        description,
        async (params) => {
          const agentId = state?.resolveAgentId("default-agent") ?? "default-agent";
          const args = (params ?? {}) as Record<string, unknown>;
          const result = await interceptor.handleToolCall(agentId, tool.name, args);
          return {
            content: result.content.map((c) => ({
              type: c.type as "text",
              text: c.text ?? "",
            })),
            isError: result.isError,
          };
        },
      );
    }
  }

  // Start the MCP transport
  if (config.mcpTransport === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[proxy] MCP server started on stdio");

    events.emit({
      type: "agent-connected",
      timestamp: Date.now(),
      agentId: "default-agent",
    });
  }
  // HTTP transport would go here for v2

  return server;
}

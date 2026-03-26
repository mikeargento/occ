/**
 * Capability Registry
 *
 * Clean separation between three layers:
 * 1. Dashboard labels — what humans see ("Write files")
 * 2. Canonical capabilities — what policies reference ("file.write")
 * 3. MCP tool names — what AI agents call ("write_file")
 *
 * The registry maps between all three layers.
 * Tools are ALWAYS visible to agents. Policy governs execution, not visibility.
 */

// ── Tool Definition ──

export type ExecutionMode = "local" | "remote";

export interface ToolDef {
  /** MCP tool name the agent calls */
  name: string;
  /** Human-readable description */
  description: string;
  /** Canonical capability for policy enforcement */
  capability: string;
  /** Dashboard category this tool belongs to */
  category: string;
  /** Dashboard label for this tool */
  label: string;
  /** JSON Schema for tool parameters */
  inputSchema: Record<string, unknown>;
  /**
   * Where this tool executes:
   * - "local": Client executes locally. Proxy authorizes + returns proof. Client does the work.
   * - "remote": Proxy executes server-side. Proxy authorizes + executes + returns result.
   */
  execution: ExecutionMode;
}

// ── File Tools (proof of concept) ──

const FILE_TOOLS: ToolDef[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at a given path",
    capability: "file.read",
    category: "files",
    label: "Read files",
    execution: "local",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at a given path. Creates the file if it doesn't exist.",
    capability: "file.write",
    category: "files",
    label: "Write files",
    execution: "local",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file to write" },
        content: { type: "string", description: "Content to write to the file" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file at a given path",
    capability: "file.delete",
    category: "files",
    label: "Delete files",
    execution: "local",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file to delete" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_directory",
    description: "List the contents of a directory",
    capability: "file.list",
    category: "files",
    label: "List directories",
    execution: "local",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the directory to list" },
      },
      required: ["path"],
    },
  },
  {
    name: "move_file",
    description: "Move or rename a file from one path to another",
    capability: "file.move",
    category: "files",
    label: "Move / rename files",
    execution: "local",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Current file path" },
        to: { type: "string", description: "New file path" },
      },
      required: ["from", "to"],
    },
  },
];

// ── Web Tools (stub — no execution yet) ──

const WEB_TOOLS: ToolDef[] = [
  {
    name: "search_web",
    description: "Search the web for information",
    capability: "web.search",
    category: "web",
    label: "Search the web",
    execution: "remote",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_url",
    description: "Fetch the contents of a URL",
    capability: "web.fetch",
    category: "web",
    label: "Fetch URLs",
    execution: "remote",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
      },
      required: ["url"],
    },
  },
];

// ── Messaging Tools (stub) ──

const MESSAGING_TOOLS: ToolDef[] = [
  {
    name: "send_email",
    description: "Send an email",
    capability: "messaging.email.send",
    category: "messaging",
    label: "Send email",
    execution: "remote",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body" },
      },
      required: ["to", "subject", "body"],
    },
  },
];

// ── Built-in OCC tools (always available, not governed by policy) ──

const OCC_TOOLS: ToolDef[] = [
  {
    name: "occ_list_proofs",
    description: "List recent proof log entries",
    capability: "occ.internal",
    category: "occ",
    label: "List proofs",
    execution: "remote",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of entries to return (default 10)" },
      },
    },
  },
  {
    name: "occ_get_policy",
    description: "Get the current active policy",
    capability: "occ.internal",
    category: "occ",
    label: "Get policy",
    execution: "remote",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "occ_check_request",
    description: "Check the status of a pending permission request. Use this to poll for approval after receiving REQUIRES_HUMAN_APPROVAL.",
    capability: "occ.internal",
    category: "occ",
    label: "Check request status",
    execution: "remote",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "number", description: "The request ID to check" },
      },
      required: ["requestId"],
    },
  },
];

// ── Registry ──

/** All registered tools */
export const ALL_TOOLS: ToolDef[] = [
  ...FILE_TOOLS,
  ...WEB_TOOLS,
  ...MESSAGING_TOOLS,
  ...OCC_TOOLS,
];

/** Look up a tool definition by MCP tool name */
export function getToolDef(name: string): ToolDef | undefined {
  return ALL_TOOLS.find(t => t.name === name);
}

/** Get the canonical capability for a tool name */
export function getCapability(toolName: string): string | undefined {
  return getToolDef(toolName)?.capability;
}

/** Check if a tool is an internal OCC tool (not governed by policy) */
export function isOccInternal(toolName: string): boolean {
  return getToolDef(toolName)?.capability === "occ.internal";
}

/** Get all tools for MCP tools/list (always returns all — policy governs execution, not visibility) */
export function getToolsForListing(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return ALL_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

/** Get all tools in a category */
export function getToolsByCategory(category: string): ToolDef[] {
  return ALL_TOOLS.filter(t => t.category === category);
}

/** Get the category and label for a tool (for denial messages) */
export function getToolContext(toolName: string): { category: string; label: string; capability: string } | undefined {
  const def = getToolDef(toolName);
  if (!def) return undefined;
  return { category: def.category, label: def.label, capability: def.capability };
}

/** Check if a tool executes locally (client-side) vs remotely (server-side) */
export function isLocalTool(toolName: string): boolean {
  return getToolDef(toolName)?.execution === "local";
}

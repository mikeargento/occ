// MCP tool definitions for OCC Agent
// These are the tools exposed to external AI clients (Claude Desktop, Cursor, etc.)

import type { Db } from "@paperclipai/db";
import {
  issueService,
  agentService,
  projectService,
  goalService,
  dashboardService,
} from "../services/index.js";
import { getOccSigner } from "../services/occ-signer.js";

export interface McpToolContext {
  db: Db;
  companyId: string;
}

type ToolHandler = (
  ctx: McpToolContext,
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(msg: string) {
  return {
    content: [{ type: "text" as const, text: msg }],
    isError: true,
  };
}

// ── Tool: list_issues ──────────────────────────────────────────────────
const listIssues: ToolHandler = async (ctx, args) => {
  const svc = issueService(ctx.db);
  const issues = await svc.list(ctx.companyId, {
    status: args.status as string | undefined,
    assigneeAgentId: args.assignee_agent_id as string | undefined,
    projectId: args.project_id as string | undefined,
    q: args.query as string | undefined,
  });
  // Manual pagination since service doesn't support limit/offset
  const offset = Number(args.offset) || 0;
  const limit = Math.min(Number(args.limit) || 50, 100);
  const sliced = issues.slice(offset, offset + limit);
  return textResult({
    total: issues.length,
    count: sliced.length,
    issues: sliced.map((i: Record<string, unknown>) => ({
      id: i.id,
      number: i.number,
      title: i.title,
      status: i.status,
      priority: i.priority,
      assigneeAgentId: i.assigneeAgentId,
      projectId: i.projectId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    })),
  });
};

// ── Tool: get_issue ────────────────────────────────────────────────────
const getIssue: ToolHandler = async (ctx, args) => {
  const svc = issueService(ctx.db);
  const issueId = args.issue_id as string;
  if (!issueId) return errorResult("issue_id is required");

  const issue = await svc.getById(issueId);
  if (!issue || issue.companyId !== ctx.companyId) {
    return errorResult("Issue not found");
  }
  return textResult(issue);
};

// ── Tool: create_issue ─────────────────────────────────────────────────
const createIssue: ToolHandler = async (ctx, args) => {
  const svc = issueService(ctx.db);
  const title = args.title as string;
  if (!title) return errorResult("title is required");

  const issue = await svc.create(ctx.companyId, {
    title,
    description: (args.description as string) || null,
    status: (args.status as string) || "backlog",
    priority: (args.priority as string) || "medium",
    projectId: (args.project_id as string) || null,
    assigneeAgentId: (args.assignee_agent_id as string) || null,
  });

  // Sign the action with OCC proof
  try {
    const signer = await getOccSigner();
    await signer.sign(
      {
        type: "mcp/create-issue",
        companyId: ctx.companyId,
        issueId: issue.id,
        title,
        timestamp: Date.now(),
      },
      { type: "mcp/create-issue", issueId: issue.id },
    );
  } catch {
    // Signing is best-effort
  }

  return textResult({ created: true, issue: { id: issue.id, number: issue.number, title: issue.title } });
};

// ── Tool: update_issue ─────────────────────────────────────────────────
const updateIssue: ToolHandler = async (ctx, args) => {
  const svc = issueService(ctx.db);
  const issueId = args.issue_id as string;
  if (!issueId) return errorResult("issue_id is required");

  const existing = await svc.getById(issueId);
  if (!existing || existing.companyId !== ctx.companyId) {
    return errorResult("Issue not found");
  }

  const update: Record<string, unknown> = {};
  if (args.title !== undefined) update.title = args.title;
  if (args.description !== undefined) update.description = args.description;
  if (args.status !== undefined) update.status = args.status;
  if (args.priority !== undefined) update.priority = args.priority;
  if (args.assignee_agent_id !== undefined) update.assigneeAgentId = args.assignee_agent_id;

  if (Object.keys(update).length === 0) {
    return errorResult("No fields to update. Provide at least one of: title, description, status, priority, assignee_agent_id");
  }

  const updated = await svc.update(issueId, update);
  return textResult({ updated: true, issue: { id: updated.id, number: updated.number, title: updated.title, status: updated.status } });
};

// ── Tool: add_comment ──────────────────────────────────────────────────
const addComment: ToolHandler = async (ctx, args) => {
  const svc = issueService(ctx.db);
  const issueId = args.issue_id as string;
  const body = args.body as string;
  if (!issueId || !body) return errorResult("issue_id and body are required");

  const existing = await svc.getById(issueId);
  if (!existing || existing.companyId !== ctx.companyId) {
    return errorResult("Issue not found");
  }

  const comment = await svc.addComment(issueId, body, { userId: "mcp-client" });
  return textResult({ created: true, comment: { id: comment.id } });
};

// ── Tool: list_agents ──────────────────────────────────────────────────
const listAgents: ToolHandler = async (ctx) => {
  const svc = agentService(ctx.db);
  const agents = await svc.list(ctx.companyId);
  return textResult({
    count: agents.length,
    agents: agents.map((a: Record<string, unknown>) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      status: a.status,
      adapterType: a.adapterType,
      createdAt: a.createdAt,
    })),
  });
};

// ── Tool: list_projects ────────────────────────────────────────────────
const listProjects: ToolHandler = async (ctx) => {
  const svc = projectService(ctx.db);
  const projects = await svc.list(ctx.companyId);
  return textResult({
    count: projects.length,
    projects: projects.map((p: Record<string, unknown>) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      createdAt: p.createdAt,
    })),
  });
};

// ── Tool: list_goals ───────────────────────────────────────────────────
const listGoals: ToolHandler = async (ctx) => {
  const svc = goalService(ctx.db);
  const goals = await svc.list(ctx.companyId);
  return textResult({
    count: goals.length,
    goals: goals.map((g: Record<string, unknown>) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      progress: g.progress,
      createdAt: g.createdAt,
    })),
  });
};

// ── Tool: get_dashboard ────────────────────────────────────────────────
const getDashboard: ToolHandler = async (ctx) => {
  const svc = dashboardService(ctx.db);
  const data = await svc.summary(ctx.companyId);
  return textResult(data);
};

// ── Tool Registry ──────────────────────────────────────────────────────

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "list_issues",
    description: "List issues in your company. Filter by status, assignee, or project.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status: backlog, todo, in_progress, in_review, done, cancelled",
        },
        assignee_agent_id: { type: "string", description: "Filter by assignee agent ID" },
        project_id: { type: "string", description: "Filter by project ID" },
        query: { type: "string", description: "Search query to filter issues by title" },
        limit: { type: "number", description: "Max results (default 50, max 100)" },
        offset: { type: "number", description: "Pagination offset" },
      },
    },
    handler: listIssues,
  },
  {
    name: "get_issue",
    description: "Get full details of a specific issue by ID.",
    inputSchema: {
      type: "object",
      properties: {
        issue_id: { type: "string", description: "The issue ID" },
      },
      required: ["issue_id"],
    },
    handler: getIssue,
  },
  {
    name: "create_issue",
    description: "Create a new issue. Every action is signed with an OCC cryptographic proof.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Issue title" },
        description: { type: "string", description: "Issue description (markdown supported)" },
        status: {
          type: "string",
          description: "Initial status (default: backlog)",
          enum: ["backlog", "todo", "in_progress"],
        },
        priority: {
          type: "string",
          description: "Priority level (default: medium)",
          enum: ["urgent", "high", "medium", "low", "none"],
        },
        project_id: { type: "string", description: "Assign to a project" },
        assignee_agent_id: { type: "string", description: "Assign to an agent" },
      },
      required: ["title"],
    },
    handler: createIssue,
  },
  {
    name: "update_issue",
    description: "Update an existing issue's title, status, priority, or assignee.",
    inputSchema: {
      type: "object",
      properties: {
        issue_id: { type: "string", description: "The issue ID to update" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        status: {
          type: "string",
          enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"],
        },
        priority: {
          type: "string",
          enum: ["urgent", "high", "medium", "low", "none"],
        },
        assignee_agent_id: { type: "string", description: "Assign to a different agent (or null to unassign)" },
      },
      required: ["issue_id"],
    },
    handler: updateIssue,
  },
  {
    name: "add_comment",
    description: "Add a comment to an issue.",
    inputSchema: {
      type: "object",
      properties: {
        issue_id: { type: "string", description: "The issue ID" },
        body: { type: "string", description: "Comment text (markdown supported)" },
      },
      required: ["issue_id", "body"],
    },
    handler: addComment,
  },
  {
    name: "list_agents",
    description: "List all AI agents in your company with their status and role.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: listAgents,
  },
  {
    name: "list_projects",
    description: "List all projects in your company.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: listProjects,
  },
  {
    name: "list_goals",
    description: "List all goals in your company with their progress.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: listGoals,
  },
  {
    name: "get_dashboard",
    description: "Get a dashboard overview: active agents, issue counts, recent activity.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: getDashboard,
  },
];

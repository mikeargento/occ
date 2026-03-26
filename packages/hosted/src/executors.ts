/**
 * Tool Executors
 *
 * The actual implementations that run when policy allows a tool call.
 * Each executor receives validated arguments and returns an MCP-compatible result.
 *
 * Executors are pure functions — no policy logic here.
 * Policy enforcement happens in the MCP handler before executors are called.
 */

import { readFile, writeFile, unlink, readdir, rename, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

// ── File Executors ──

async function executeReadFile(args: Record<string, unknown>): Promise<ToolResult> {
  const path = args.path as string;
  if (!path) return { content: [{ type: "text", text: "Missing required argument: path" }], isError: true };

  try {
    const content = await readFile(resolve(path), "utf-8");
    return { content: [{ type: "text", text: content }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Failed to read file: ${msg}` }], isError: true };
  }
}

async function executeWriteFile(args: Record<string, unknown>): Promise<ToolResult> {
  const path = args.path as string;
  const content = args.content as string;
  if (!path) return { content: [{ type: "text", text: "Missing required argument: path" }], isError: true };
  if (content === undefined) return { content: [{ type: "text", text: "Missing required argument: content" }], isError: true };

  try {
    await writeFile(resolve(path), content, "utf-8");
    return { content: [{ type: "text", text: `File written: ${path} (${Buffer.byteLength(content)} bytes)` }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Failed to write file: ${msg}` }], isError: true };
  }
}

async function executeDeleteFile(args: Record<string, unknown>): Promise<ToolResult> {
  const path = args.path as string;
  if (!path) return { content: [{ type: "text", text: "Missing required argument: path" }], isError: true };

  try {
    await unlink(resolve(path));
    return { content: [{ type: "text", text: `File deleted: ${path}` }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Failed to delete file: ${msg}` }], isError: true };
  }
}

async function executeListDirectory(args: Record<string, unknown>): Promise<ToolResult> {
  const path = (args.path as string) || ".";

  try {
    const resolved = resolve(path);
    const entries = await readdir(resolved, { withFileTypes: true });
    const listing = entries.map(e => {
      const type = e.isDirectory() ? "dir" : e.isFile() ? "file" : "other";
      return `${type}\t${e.name}`;
    }).join("\n");
    return { content: [{ type: "text", text: listing || "(empty directory)" }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Failed to list directory: ${msg}` }], isError: true };
  }
}

async function executeMoveFile(args: Record<string, unknown>): Promise<ToolResult> {
  const from = args.from as string;
  const to = args.to as string;
  if (!from) return { content: [{ type: "text", text: "Missing required argument: from" }], isError: true };
  if (!to) return { content: [{ type: "text", text: "Missing required argument: to" }], isError: true };

  try {
    await rename(resolve(from), resolve(to));
    return { content: [{ type: "text", text: `Moved: ${from} → ${to}` }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Failed to move file: ${msg}` }], isError: true };
  }
}

// ── Executor Registry ──

const executors: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
  read_file: executeReadFile,
  write_file: executeWriteFile,
  delete_file: executeDeleteFile,
  list_directory: executeListDirectory,
  move_file: executeMoveFile,
};

/**
 * Execute a tool by name.
 * Returns the result or null if no executor exists for this tool.
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  const executor = executors[name];
  if (!executor) return null;
  return executor(args);
}

/** Check if a tool has a real executor (vs being a stub) */
export function hasExecutor(name: string): boolean {
  return name in executors;
}

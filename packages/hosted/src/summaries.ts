/**
 * Plain-language summary generation for tool calls.
 *
 * Translates raw tool names + args into human-readable descriptions.
 * Example: write_file({ path: "/tmp/report.txt", content: "..." })
 *        → "Write to /tmp/report.txt"
 */

const SUMMARIES: Record<string, (args: any) => string> = {
  read_file:       (a) => `Read file ${a?.path ?? ""}`.trim(),
  write_file:      (a) => `Write to ${a?.path ?? "a file"}`.trim(),
  delete_file:     (a) => `Delete ${a?.path ?? "a file"}`.trim(),
  move_file:       (a) => `Move ${a?.from ?? "file"} to ${a?.to ?? "destination"}`.trim(),
  list_directory:  (a) => `List contents of ${a?.path ?? "directory"}`.trim(),
  search_web:      (a) => `Search the web for "${a?.query ?? ""}"`.trim(),
  fetch_url:       (a) => `Fetch ${a?.url ?? "a URL"}`.trim(),
  send_email:      (a) => {
    const to = a?.to ?? "someone";
    const subj = a?.subject ? ` with subject "${a.subject}"` : "";
    return `Send email to ${to}${subj}`.trim();
  },
};

/**
 * Generate a plain-language summary of a tool call.
 */
export function generateSummary(toolName: string, args?: unknown): string {
  const generator = SUMMARIES[toolName];
  if (generator && args) {
    try { return generator(args); } catch {}
  }

  // Fallback: humanize the tool name
  const name = toolName.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return name;
}

/**
 * Get a short label for a tool name (human-readable).
 */
export function toolLabel(toolName: string): string {
  return toolName.replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

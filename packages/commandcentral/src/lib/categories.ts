export interface ToolCategory {
  id: string;
  label: string;
  icon: string; // SVG path data
  keywords: string[];
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: "communication",
    label: "Communication",
    icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
    keywords: ["email", "slack", "sms", "message", "send", "notify", "chat", "mail", "draft", "reply", "forward"],
  },
  {
    id: "filesystem",
    label: "File System",
    icon: "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7",
    keywords: ["file", "read_file", "write_file", "delete_file", "move", "copy", "directory", "fs", "folder", "upload", "download"],
  },
  {
    id: "web",
    label: "Web",
    icon: "M12 2a10 10 0 100 20 10 10 0 000-20z M2 12h20 M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
    keywords: ["search", "fetch", "scrape", "browse", "http", "url", "web", "crawl", "navigate", "search_web", "read_news", "weather"],
  },
  {
    id: "code",
    label: "Code",
    icon: "M16 18l6-6-6-6 M8 6l-6 6 6 6",
    keywords: ["run", "exec", "commit", "deploy", "test", "build", "compile", "git", "code", "terminal", "bash", "shell", "calculate"],
  },
  {
    id: "data",
    label: "Data",
    icon: "M12 2C6.48 2 2 4.02 2 6.5v11C2 19.98 6.48 22 12 22s10-2.02 10-4.5v-11C22 4.02 17.52 2 12 2z M2 6.5C2 8.98 6.48 11 12 11s10-2.02 10-4.5 M2 12c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5",
    keywords: ["query", "database", "db", "sql", "spreadsheet", "analytics", "csv", "table", "record", "read_contacts", "search_notes"],
  },
  {
    id: "payments",
    label: "Payments",
    icon: "M12 2v20 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
    keywords: ["charge", "refund", "transfer", "payment", "invoice", "billing", "stripe", "price", "cost", "buy", "purchase", "money"],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: "M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z M16 2v4 M8 2v4 M3 10h18",
    keywords: ["calendar", "event", "schedule", "meeting", "appointment", "booking", "reminder", "set_reminder", "search_calendar"],
  },
  {
    id: "contacts",
    label: "Contacts",
    icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z",
    keywords: ["contact", "person", "user", "profile", "address", "phone", "people", "read_contacts"],
  },
];

/** Map a tool name to a category ID, or "other" if no match */
export function categorize(toolName: string): string {
  const lower = toolName.toLowerCase().replace(/[_-]/g, "");
  for (const cat of TOOL_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (lower.includes(kw.replace(/[_-]/g, ""))) return cat.id;
    }
  }
  return "other";
}

/** Group tool names by category */
export function categorizeTools(toolNames: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const cat of TOOL_CATEGORIES) {
    result[cat.id] = [];
  }
  result["other"] = [];
  for (const name of toolNames) {
    const catId = categorize(name);
    if (!result[catId]) result[catId] = [];
    result[catId].push(name);
  }
  return result;
}

/** Get enabled status per category */
export function getCategoryStatuses(
  allTools: string[],
  enabledTools: Set<string>
): Record<string, "on" | "off" | "partial"> {
  const grouped = categorizeTools(allTools);
  const result: Record<string, "on" | "off" | "partial"> = {};
  for (const [catId, tools] of Object.entries(grouped)) {
    if (tools.length === 0) {
      result[catId] = "off";
      continue;
    }
    const enabledCount = tools.filter((t) => enabledTools.has(t)).length;
    if (enabledCount === 0) result[catId] = "off";
    else if (enabledCount === tools.length) result[catId] = "on";
    else result[catId] = "partial";
  }
  return result;
}

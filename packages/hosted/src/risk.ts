/**
 * Risk Lane Classification
 *
 * Maps tool names/capabilities to risk categories.
 * Risk lanes drive policy: each lane can be set to auto_approve, ask, or auto_deny.
 */

export type RiskLane =
  | "read_only"
  | "file_modification"
  | "external_comms"
  | "deployment"
  | "financial"
  | "credential_access"
  | "unknown";

export const RISK_LANES: Record<RiskLane, { label: string; description: string; severity: number }> = {
  read_only:          { label: "Read-only",             description: "Reading files, listing directories, fetching data",   severity: 1 },
  file_modification:  { label: "File modification",     description: "Writing, deleting, or moving files",                  severity: 3 },
  external_comms:     { label: "External communication", description: "Sending emails, messages, or webhooks",              severity: 4 },
  deployment:         { label: "Deployment",             description: "Deploying code, running builds, system changes",     severity: 5 },
  financial:          { label: "Financial",              description: "Payments, refunds, billing actions",                  severity: 5 },
  credential_access:  { label: "Credential access",     description: "Reading or modifying secrets, keys, or tokens",       severity: 5 },
  unknown:            { label: "Unknown",                description: "Unclassified actions",                                severity: 2 },
};

const CLASSIFICATION_RULES: Array<{ patterns: RegExp[]; lane: RiskLane }> = [
  // Read-only
  { patterns: [/^read_file$/, /^list_directory$/, /^fetch_url$/, /^search_web$/, /^occ_list_proofs$/, /^occ_get_policy$/, /^occ_check_request$/], lane: "read_only" },
  { patterns: [/read/i, /list/i, /get/i, /fetch/i, /search/i, /query/i, /view/i, /show/i], lane: "read_only" },

  // File modification
  { patterns: [/^write_file$/, /^delete_file$/, /^move_file$/, /^create_file$/], lane: "file_modification" },
  { patterns: [/write/i, /delete/i, /move/i, /create/i, /update/i, /edit/i, /modify/i, /remove/i], lane: "file_modification" },

  // External comms
  { patterns: [/^send_email$/, /^send_message$/, /^post_message$/], lane: "external_comms" },
  { patterns: [/email/i, /slack/i, /message/i, /notify/i, /webhook/i, /sms/i], lane: "external_comms" },

  // Deployment
  { patterns: [/deploy/i, /build/i, /release/i, /publish/i, /push/i, /exec/i, /run_command/i, /shell/i], lane: "deployment" },

  // Financial
  { patterns: [/pay/i, /charge/i, /refund/i, /invoice/i, /billing/i, /stripe/i, /transfer/i], lane: "financial" },

  // Credential access
  { patterns: [/secret/i, /credential/i, /password/i, /token/i, /key/i, /auth/i, /encrypt/i, /decrypt/i], lane: "credential_access" },
];

/**
 * Classify a tool name into a risk lane.
 */
export function classifyRisk(toolName: string): RiskLane {
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.patterns.some(p => p.test(toolName))) {
      return rule.lane;
    }
  }
  return "unknown";
}

/**
 * Get a human-readable label for a risk lane.
 */
export function getRiskLabel(lane: RiskLane): string {
  return RISK_LANES[lane]?.label ?? "Unknown";
}

/**
 * Generate a human-readable risk assessment for a tool call.
 * Helps the user decide whether to authorize.
 */
export function assessRisk(toolName: string, args?: Record<string, unknown>): {
  lane: RiskLane;
  severity: number;
  label: string;
  summary: string;
  warnings: string[];
} {
  const lane = classifyRisk(toolName);
  const info = RISK_LANES[lane];
  const warnings: string[] = [];
  let summary = info.description;

  // Tool-specific assessments
  const cleanName = toolName.toLowerCase().replace(/^mcp__[^_]+__/, "");

  if (cleanName === "write" || cleanName === "write_file" || cleanName === "edit") {
    const path = String(args?.file_path || args?.path || "");
    if (path.includes(".env") || path.includes("credentials") || path.includes(".ssh")) {
      warnings.push("Targets a sensitive file");
    }
    if (path.includes("/etc/") || path.includes("/usr/") || path.includes("/System/")) {
      warnings.push("Targets a system directory");
    }
    if (path.includes("settings.json") || path.includes("config")) {
      warnings.push("Modifies configuration");
    }
    summary = path ? `Writes to ${path}` : "Writes to a file";
  }

  if (cleanName === "bash" || cleanName === "run_command" || cleanName === "exec") {
    const cmd = String(args?.command || args?.cmd || "");
    if (cmd.includes("rm ") || cmd.includes("rm -")) warnings.push("Contains delete command");
    if (cmd.includes("sudo")) warnings.push("Requests elevated privileges");
    if (cmd.includes("curl") || cmd.includes("wget")) warnings.push("Downloads from the internet");
    if (cmd.includes("chmod") || cmd.includes("chown")) warnings.push("Changes file permissions");
    if (cmd.includes("|") || cmd.includes(">")) warnings.push("Pipes or redirects output");
    summary = cmd ? `Runs: ${cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd}` : "Executes a shell command";
  }

  if (cleanName === "delete_file" || cleanName === "delete") {
    warnings.push("Permanently deletes a file");
    const path = String(args?.file_path || args?.path || "");
    summary = path ? `Deletes ${path}` : "Deletes a file";
  }

  if (cleanName === "move_file" || cleanName === "move" || cleanName === "rename") {
    summary = "Moves or renames a file";
  }

  if (lane === "external_comms") {
    warnings.push("Communicates externally");
    const to = String(args?.to || args?.recipient || args?.email || "");
    if (to) summary = `Sends to ${to}`;
  }

  if (lane === "credential_access") {
    warnings.push("Accesses sensitive credentials");
  }

  if (lane === "financial") {
    warnings.push("Involves financial action");
  }

  if (lane === "deployment") {
    warnings.push("May affect production systems");
  }

  return {
    lane,
    severity: info.severity,
    label: info.label,
    summary,
    warnings,
  };
}

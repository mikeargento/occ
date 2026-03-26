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

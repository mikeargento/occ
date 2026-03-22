// MCP connection token auth — no API keys, just a URL
// Token = base64url(companyId) + "." + hmac(companyId, secret)
// The entire auth is baked into the URL. One copy, done.

import { createHmac } from "node:crypto";

const MCP_TOKEN_SECRET =
  process.env.BETTER_AUTH_SECRET ||
  process.env.MCP_TOKEN_SECRET ||
  "occ-mcp-default-secret";

/**
 * Generate a connection token for a company.
 * Token format: base64url(companyId).hmac-hex-prefix
 * This token IS the auth — no headers, no API keys.
 */
export function generateMcpToken(companyId: string): string {
  const idPart = Buffer.from(companyId).toString("base64url");
  const hmac = createHmac("sha256", MCP_TOKEN_SECRET)
    .update(`mcp:${companyId}`)
    .digest("hex")
    .slice(0, 24);
  return `${idPart}.${hmac}`;
}

/**
 * Verify and extract the company ID from a connection token.
 * Returns the companyId if valid, null if invalid.
 */
export function verifyMcpToken(token: string): string | null {
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return null;

  const idPart = token.slice(0, dotIdx);
  const hmacPart = token.slice(dotIdx + 1);

  let companyId: string;
  try {
    companyId = Buffer.from(idPart, "base64url").toString("utf-8");
  } catch {
    return null;
  }

  const expected = createHmac("sha256", MCP_TOKEN_SECRET)
    .update(`mcp:${companyId}`)
    .digest("hex")
    .slice(0, 24);

  // Constant-time comparison
  if (hmacPart.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < hmacPart.length; i++) {
    diff |= hmacPart.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return diff === 0 ? companyId : null;
}

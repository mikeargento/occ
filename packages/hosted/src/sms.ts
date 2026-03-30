/**
 * SMS Gateway — the entire OCC user experience
 *
 * Agent wants to do something → user gets a text → replies YES or NO → done.
 * Proofs still get created and chained in the background. User never sees them.
 *
 * Uses Twilio for SMS. Set these env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER (your Twilio number, e.g. +15551234567)
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "./db.js";
import { createAuthorizationObject } from "./authorization.js";
import { eventBus } from "./events.js";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER ?? "";

// In-memory map of pending SMS approvals: messageId -> { requestId, userId, agentId, tool }
const pendingApprovals = new Map<string, {
  requestId: number;
  userId: string;
  agentId: string;
  tool: string;
  args: unknown;
  phone: string;
  sentAt: number;
}>();

// Map phone number -> userId for reply routing
const phoneToUser = new Map<string, string>();

/**
 * Send an SMS via Twilio
 */
async function sendSMS(to: string, body: string): Promise<string | null> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.log("  [sms] Twilio not configured — would send to", to, ":", body);
    return null;
  }

  try {
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
    const params = new URLSearchParams({
      From: TWILIO_FROM,
      To: to,
      Body: body,
    });

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("  [sms] Twilio error:", res.status, err);
      return null;
    }

    const data = await res.json();
    console.log("  [sms] Sent to", to, "sid:", data.sid);
    return data.sid;
  } catch (err) {
    console.error("  [sms] Send failed:", (err as Error).message);
    return null;
  }
}

/**
 * Send an approval request via SMS
 * Called by the hook endpoint when a request needs human approval
 */
export async function sendApprovalSMS(
  userId: string,
  agentId: string,
  tool: string,
  args: unknown,
  requestId: number,
  summary: string
): Promise<boolean> {
  // Look up user's phone number
  const user = await db.getUserById(userId);
  const phone = user?.phone;

  if (!phone) {
    console.log("  [sms] No phone number for user", userId);
    return false;
  }

  // Register phone -> user mapping
  phoneToUser.set(phone, userId);

  // Compose the message
  const toolDisplay = tool.replace(/[_-]/g, " ");
  const message = `OCC: "${toolDisplay}" wants to run.\n\n${summary}\n\nReply YES to allow or NO to deny.`;

  const sid = await sendSMS(phone, message);

  if (sid) {
    pendingApprovals.set(`${userId}:${requestId}`, {
      requestId, userId, agentId, tool, args, phone, sentAt: Date.now(),
    });
  }

  return !!sid;
}

/**
 * Handle incoming SMS reply from Twilio webhook
 * POST /sms/webhook
 */
export async function handleSmsWebhook(req: IncomingMessage, res: ServerResponse) {
  // Parse URL-encoded body from Twilio
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = new URLSearchParams(Buffer.concat(chunks).toString("utf-8"));

  const from = body.get("From") ?? "";
  const text = (body.get("Body") ?? "").trim().toUpperCase();

  console.log("  [sms] Received from", from, ":", text);

  // Find user by phone
  const userId = phoneToUser.get(from);
  if (!userId) {
    // Try to look up by phone in DB
    const user = await db.getUserByPhone?.(from);
    if (user) {
      phoneToUser.set(from, user.id);
      await handleReply(user.id, text, res);
      return;
    }
    // Unknown number
    return twimlResponse(res, "OCC: Unknown number. Sign up at agent.occ.wtf");
  }

  await handleReply(userId, text, res);
}

async function handleReply(userId: string, text: string, res: ServerResponse) {
  // Find the most recent pending approval for this user
  let found: { key: string; data: typeof pendingApprovals extends Map<string, infer V> ? V : never } | null = null;

  for (const [key, data] of pendingApprovals.entries()) {
    if (data.userId === userId) {
      if (!found || data.sentAt > found.data.sentAt) {
        found = { key, data };
      }
    }
  }

  if (!found) {
    // Check DB for pending requests
    const pending = await db.getPendingPermissions(userId);
    if (pending.length === 0) {
      return twimlResponse(res, "OCC: No pending requests.");
    }
    // Use the most recent one
    const latest = pending[0];
    found = {
      key: `${userId}:${latest.id}`,
      data: {
        requestId: latest.id,
        userId,
        agentId: latest.agent_id,
        tool: latest.tool,
        args: latest.request_args,
        phone: "",
        sentAt: Date.now(),
      },
    };
  }

  const { requestId, agentId, tool } = found.data;
  const isYes = text === "YES" || text === "Y" || text === "ALLOW" || text === "OK";
  const isNo = text === "NO" || text === "N" || text === "DENY" || text === "BLOCK";

  if (!isYes && !isNo) {
    return twimlResponse(res, "OCC: Reply YES or NO.");
  }

  // Process the decision
  const decision = isYes ? "approved" : "denied";
  const chainId = undefined;
  const principal = { id: userId };

  let digestB64 = "";
  let proof: unknown = null;

  if (isYes) {
    // Create authorization object
    const authResult = await createAuthorizationObject(userId, agentId, tool, undefined, chainId, principal);
    digestB64 = authResult.digest;
    proof = authResult.proof;
    await db.enableTool(userId, agentId, tool);
  }

  // Resolve the permission
  await db.resolvePermission(userId, requestId, decision as "approved" | "denied", digestB64, proof);

  // Log proof
  await db.addProof(userId, {
    agentId, tool, allowed: isYes,
    reason: isYes ? `Approved via SMS` : `Denied via SMS`,
    proofDigest: digestB64 || undefined,
    receipt: proof,
  });

  // Emit event (for long-polling hook to pick up)
  eventBus.emit(userId, {
    type: "permission-resolved",
    tool, agentId, decision,
    proofDigest: digestB64,
    timestamp: Date.now(),
  });

  // Remove from pending
  pendingApprovals.delete(found.key);

  const toolDisplay = tool.replace(/[_-]/g, " ");
  const reply = isYes
    ? `OCC: "${toolDisplay}" allowed. Proof recorded.`
    : `OCC: "${toolDisplay}" denied.`;

  return twimlResponse(res, reply);
}

/**
 * Return TwiML response (Twilio expects this format)
 */
function twimlResponse(res: ServerResponse, message: string) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

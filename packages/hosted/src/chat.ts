/**
 * AI Chat — Haiku-powered conversational interface
 *
 * The AI IS the UI. Users talk to it to approve/deny requests,
 * check activity, manage permissions, and explore proofs.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "./db.js";

function json(res: ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function getUserId(req: IncomingMessage): string | null {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/occ_session=([^;]+)/);
  return match?.[1] ?? null;
}

// Build system context from user's current state
async function buildContext(userId: string): Promise<string> {
  // Get pending requests
  let pending: unknown[] = [];
  let recent: unknown[] = [];
  try {
    const p = await db.v2GetRequests(userId, { status: "pending", limit: 20 });
    pending = p.requests ?? [];
  } catch { /* v2 tables may not exist */ }

  try {
    const r = await db.v2GetRequests(userId, { limit: 20 });
    recent = r.requests ?? [];
  } catch { /* v2 tables may not exist */ }

  const pendingText = pending.length > 0
    ? pending.map((r: any) => `  - [ID:${r.id}] ${r.tool} (${r.summary || r.label || "no description"}) — requested ${new Date(r.created_at).toLocaleTimeString()}`).join("\n")
    : "  None";

  const recentText = recent.slice(0, 10).map((r: any) => {
    const status = r.status === "approved" ? "✓ Allowed" : r.status === "denied" ? "✗ Denied" : r.status;
    return `  - ${r.tool}: ${status} (${new Date(r.created_at).toLocaleTimeString()})`;
  }).join("\n");

  return `You are the AiMessage assistant — the control interface for OCC (Origin Controlled Computing).

You help the user manage their AI agent's permissions. You are friendly, concise, and conversational — like texting a smart friend.

CURRENT STATE:
Pending requests awaiting the user's decision:
${pendingText}

Recent activity:
${recentText}

CAPABILITIES — what you can do:
1. Show pending requests and help the user approve or deny them
2. Show recent activity and history
3. Answer questions about what tools have been used
4. Explain what a tool does when asked
5. Help manage permissions

APPROVAL COMMANDS — when the user wants to approve or deny:
- If the user says "yes", "allow", "approve", "ok", or similar → respond with: {"action":"approve","id":<request_id>,"mode":"always"}
- If the user says "once" or "just this once" → respond with: {"action":"approve","id":<request_id>,"mode":"once"}
- If the user says "no", "deny", "block", "nope" → respond with: {"action":"deny","id":<request_id>}
- Put the JSON on its own line, wrapped in triple backticks with "action" language tag

IMPORTANT RULES:
- Be conversational. Don't be robotic.
- When there are pending requests, mention them naturally. Don't dump a table.
- Keep responses SHORT. 1-3 sentences max for approvals. Slightly longer for explanations.
- If the user says "yes" or "allow" without specifying which request, approve the MOST RECENT pending one.
- After approving/denying, confirm what you did in plain English.
- Never make up requests or IDs. Only reference actual pending requests from the context above.
- If there are no pending requests and the user says "yes" or "allow", tell them there's nothing pending.`;
}

export async function handleChat(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }

  const userId = getUserId(req);
  if (!userId) {
    json(res, { error: "Not authenticated" }, 401);
    return;
  }

  // Get user's API key for Haiku
  const apiKey = await db.getAnthropicKey(userId);
  if (!apiKey) {
    json(res, { error: "No API key configured. Go to Settings and add your Anthropic API key." }, 400);
    return;
  }

  let body: { messages: { role: string; content: string }[] };
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    json(res, { error: "Invalid JSON" }, 400);
    return;
  }

  const systemPrompt = await buildContext(userId);

  // Stream response from Haiku
  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: body.messages.slice(-20), // Keep last 20 messages for context
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      json(res, { error: `Haiku error: ${anthropicRes.status}`, detail: err }, 502);
      return;
    }

    const result = await anthropicRes.json() as any;
    const text = result.content?.[0]?.text ?? "Sorry, I couldn't generate a response.";

    // Check if the response contains an action command
    const actionMatch = text.match(/```action\n(\{.*?\})\n```/s);
    let actionResult: any = null;

    if (actionMatch) {
      try {
        const action = JSON.parse(actionMatch[1]);
        if (action.action === "approve" && action.id) {
          await db.v2UpdateRequestStatus(action.id, "approved");
          await db.v2CreateDecision({
            requestId: action.id, userId, decidedBy: "human",
            decision: "approved", mode: action.mode === "once" ? "once" : "always",
            reason: "Approved via AiMessage chat",
          });
          actionResult = { type: "approved", id: action.id, mode: action.mode || "always" };
        } else if (action.action === "deny" && action.id) {
          await db.v2UpdateRequestStatus(action.id, "denied");
          await db.v2CreateDecision({
            requestId: action.id, userId, decidedBy: "human",
            decision: "denied", mode: "once",
            reason: "Denied via AiMessage chat",
          });
          actionResult = { type: "denied", id: action.id };
        }
      } catch { /* action parsing failed, that's ok */ }
    }

    // Clean the response — remove the action block from visible text
    const cleanText = text.replace(/```action\n\{.*?\}\n```/s, "").trim();

    json(res, {
      response: cleanText,
      action: actionResult,
    });

  } catch (err: any) {
    json(res, { error: "Failed to reach Haiku", detail: err.message }, 500);
  }
}

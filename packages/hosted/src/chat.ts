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
  // Get pending requests, recent activity, and proof chain
  let pending: unknown[] = [];
  let recent: unknown[] = [];
  let proofs: unknown[] = [];
  try {
    const p = await db.v2GetRequests(userId, { status: "pending", limit: 20 });
    pending = p.requests ?? [];
  } catch { /* v2 tables may not exist */ }

  try {
    const r = await db.v2GetRequests(userId, { limit: 20 });
    recent = r.requests ?? [];
  } catch { /* v2 tables may not exist */ }

  try {
    const proofData = await db.getProofs(userId, 15);
    proofs = proofData.entries ?? [];
  } catch { /* proofs table may not exist */ }

  const pendingText = pending.length > 0
    ? pending.map((r: any) => `  - [ID:${r.id}] ${r.tool} (${r.summary || r.label || "no description"}) — requested ${new Date(r.created_at).toLocaleTimeString()}`).join("\n")
    : "  None";

  const recentText = recent.slice(0, 10).map((r: any) => {
    const status = r.status === "approved" ? "✓ Allowed" : r.status === "denied" ? "✗ Denied" : r.status;
    return `  - ${r.tool}: ${status} (${new Date(r.created_at).toLocaleTimeString()})`;
  }).join("\n");

  return `You are an OCC expert assistant embedded in the OCC dashboard.

OCC = Origin Controlled Computing. The core principle: Artificial Intelligence. Human Authority.

WHAT OCC IS:
- A system where AI actions are only executable if authorized by the human through a cryptographic proof
- The proof is not a log or receipt — it IS the authorization. No proof = no execution path
- Every proof links causally to the previous one (counter + prevB64 hash). No gaps, no forks
- Proofs are signed inside an AWS Nitro Enclave (TEE) — hardware-attested, tamper-proof
- Default-deny: nothing executes unless the human creates the authorization proof
- The AI proposes. The human authorizes. The proof becomes the command

HOW IT WORKS:
1. User installs OCC: curl -fsSL https://agent.occ.wtf/install | bash
2. Sets their token: export OCC_TOKEN=<token>
3. Opens Claude Code — a PreToolUse hook fires before every action
4. Hook calls agent.occ.wtf/api/v2/hook/check with the tool name and args
5. Request appears on the dashboard as "Proposed Action"
6. User clicks Authorize → TEE creates a signed proof → proof is returned to the hook
7. Hook passes the proof back to Claude Code → action executes
8. If denied or timeout (55s) → no proof → action blocked

PROOF FORMAT (occ/1):
- version: "occ/1"
- artifact: { hashAlg: "sha256", digestB64: "<hash>" }
- commit: { time, chainId, counter, epochId, prevB64, nonceB64 }
- signer: { publicKeyB64, signatureB64 }
- policy: { name, digestB64 }
- principal: { id, provider }
- environment: { enforcement: "measured-tee", attestation: { format: "aws-nitro", reportB64 } }
- timestamps: { artifact: { time, authority: "freetsa.org", tokenB64 } }

TRUST MODEL:
- TEE mandatory — if enclave is unavailable, action is denied (fail closed)
- Ed25519 signatures — private key generated inside enclave, never leaves
- RFC 3161 timestamps — independent third-party time proof
- Causal chain — each proof must fit the previous one. Counter is monotonic
- Policy binding — rules are SHA-256 hashed and signed into every proof

KEY CONCEPTS:
- "Authorization object" = the proof. Created by the TEE when the human says yes
- "Slot allocation" = reserves a position in the chain before the proof is created
- "Execution proof" = links to the authorization proof, records that the action happened
- "Default-deny" = empty policy blocks everything. The faucet is off unless turned on
- The proof chain is append-only. You cannot delete, reorder, or fork it

CURRENT USER STATE:
Pending requests (awaiting authority):
${pendingText}

Recent activity:
${recentText}

Proof chain (most recent ${proofs.length} proofs):
${proofs.length > 0 ? proofs.map((p: any) => {
    const receipt = p.receipt || {};
    const commit = receipt.commit || {};
    const env = receipt.environment || {};
    return `  - #${commit.counter || "?"} | ${p.tool} | ${p.allowed ? "Allowed" : "Denied"} | ${env.enforcement || "unknown"} | ${p.proof_digest ? p.proof_digest.slice(0, 20) + "..." : "no digest"} | ${commit.time ? new Date(commit.time).toLocaleString() : "—"}`;
  }).join("\n") : "  No proofs yet"}

IMPORTANT URLS (never make up URLs — only use these):
- Dashboard: agent.occ.wtf (this is where the user is right now)
- Homepage: occ.wtf
- Docs: occ.wtf/docs
- Explorer (public): occ.wtf/explorer
- Install: agent.occ.wtf/install
- GitHub: github.com/mikeargento/occ

BEHAVIOR:
- Answer questions about OCC clearly and technically
- When the user asks about proofs, the chain, the TEE, or how things work — explain precisely
- Keep responses concise but thorough. Technical accuracy matters
- When referencing a specific proof, use its counter number (e.g., "Proof #60") and mention the tool and timestamp from the proof chain data above. The user can find it by scrolling through the Explorer list on their dashboard
- Never make up URLs, endpoints, or API paths that aren't listed above
- If the user wants to approve/deny a pending request, respond with the action JSON:

For approve: \`\`\`action
{"action":"approve","id":<request_id>,"mode":"always"}
\`\`\`

For deny: \`\`\`action
{"action":"deny","id":<request_id>}
\`\`\`

- If user says "yes"/"allow" without specifying, approve the most recent pending request
- Never make up request IDs. Only reference actual pending requests from the context above
- If no pending requests, say so when asked to approve`;
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

  // Use server-side API key — no user key needed
  const apiKey = process.env.OCC_CHAT_API_KEY;
  if (!apiKey) {
    json(res, { error: "Chat is not configured on this server." }, 500);
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

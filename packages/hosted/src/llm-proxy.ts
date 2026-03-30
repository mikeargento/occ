/**
 * LLM API Proxy — the core of OCC v2
 *
 * Sits between the agent and the Anthropic API.
 * The agent sets base_url to OCC. OCC forwards to the real API.
 * When Claude responds with tool_use blocks, OCC intercepts them
 * and checks policy before the agent ever sees them.
 *
 * Flow:
 *   Agent → OCC proxy → Anthropic API → Claude response
 *   → OCC intercepts tool_use blocks → checks policy per tool
 *   → allowed: pass through
 *   → denied: strip from response, replace with error
 *   → ask: hold response, create pending request
 *
 * The agent doesn't know OCC exists. It just thinks it's talking to Claude.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { db } from "./db.js";
import { createExecutionProof, createAuthorizationObject } from "./authorization.js";
import { eventBus } from "./events.js";

const ANTHROPIC_API = "https://api.anthropic.com";

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function jsonResponse(res: ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Handle a proxied API request.
 * URL format: /v1/{proxyToken}/v1/messages (or any Anthropic API path)
 */
export async function handleLlmProxy(
  req: IncomingMessage,
  res: ServerResponse,
  proxyToken: string,
  apiPath: string
) {
  // Look up agent by proxy token
  const agent = await db.getAgentByProxyToken(proxyToken);
  if (!agent) {
    return jsonResponse(res, { error: "Invalid proxy token" }, 401);
  }

  const userId = agent.user_id;
  const agentId = agent.id;
  const anthropicKey = agent.anthropic_api_key;

  if (!anthropicKey) {
    return jsonResponse(res, {
      error: "No Anthropic API key configured. Go to agent.occ.wtf → Settings to add your key.",
    }, 403);
  }

  // Read the request body
  const bodyBuf = await readBody(req);
  const bodyStr = bodyBuf.toString("utf-8");

  // For non-messages endpoints, just forward transparently
  if (!apiPath.endsWith("/messages")) {
    return forwardRaw(req, res, anthropicKey, apiPath, bodyBuf);
  }

  // Parse the messages request
  let requestBody: any;
  try {
    requestBody = JSON.parse(bodyStr);
  } catch {
    return jsonResponse(res, { error: "Invalid JSON body" }, 400);
  }

  // Check if streaming
  const isStreaming = requestBody.stream === true;

  if (isStreaming) {
    return handleStreamingRequest(req, res, anthropicKey, apiPath, requestBody, userId, agentId, agent);
  } else {
    return handleNonStreamingRequest(req, res, anthropicKey, apiPath, requestBody, userId, agentId, agent);
  }
}

/**
 * Forward a request to Anthropic without interception (for non-messages endpoints)
 */
async function forwardRaw(
  req: IncomingMessage,
  res: ServerResponse,
  apiKey: string,
  apiPath: string,
  body: Buffer
) {
  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  };

  // Forward anthropic-specific headers
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.startsWith("anthropic-") && key !== "anthropic-version" && typeof value === "string") {
      headers[key] = value;
    }
  }

  try {
    const upstream = await fetch(`${ANTHROPIC_API}${apiPath}`, {
      method: req.method ?? "POST",
      headers,
      body: body.length > 0 ? new Uint8Array(body) : undefined,
    });

    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    });

    if (upstream.body) {
      const reader = upstream.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      await pump();
    } else {
      res.end(await upstream.text());
    }
  } catch (err) {
    jsonResponse(res, { error: `Upstream error: ${(err as Error).message}` }, 502);
  }
}

/**
 * Handle a non-streaming /v1/messages request.
 * Forward to Anthropic, intercept the response, check tool_use blocks against policy.
 */
async function handleNonStreamingRequest(
  req: IncomingMessage,
  res: ServerResponse,
  apiKey: string,
  apiPath: string,
  requestBody: any,
  userId: string,
  agentId: string,
  agent: any
) {
  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  };

  for (const [key, value] of Object.entries(req.headers)) {
    if (key.startsWith("anthropic-") && key !== "anthropic-version" && typeof value === "string") {
      headers[key] = value;
    }
  }

  try {
    const upstream = await fetch(`${ANTHROPIC_API}${apiPath}`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(errText);
      return;
    }

    const responseBody = await upstream.json();

    // Intercept tool_use blocks
    const governed = await governResponse(responseBody, userId, agentId, agent);
    jsonResponse(res, governed, 200);
  } catch (err) {
    jsonResponse(res, { error: `Upstream error: ${(err as Error).message}` }, 502);
  }
}

/**
 * Handle a streaming /v1/messages request.
 * Forward to Anthropic, intercept SSE events, check tool_use blocks against policy.
 */
async function handleStreamingRequest(
  req: IncomingMessage,
  res: ServerResponse,
  apiKey: string,
  apiPath: string,
  requestBody: any,
  userId: string,
  agentId: string,
  agent: any
) {
  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  };

  for (const [key, value] of Object.entries(req.headers)) {
    if (key.startsWith("anthropic-") && key !== "anthropic-version" && typeof value === "string") {
      headers[key] = value;
    }
  }

  try {
    const upstream = await fetch(`${ANTHROPIC_API}${apiPath}`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(errText);
      return;
    }

    // Set up SSE response
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Buffer the full response to capture tool_use blocks, then re-stream
    // For streaming, we need to collect content_block events to identify tool_use
    // and then decide whether to pass them through or replace them
    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let allEvents: string[] = [];
    let toolUseBlocks: Array<{ index: number; id: string; name: string; input: any }> = [];
    let currentToolBlock: { index: number; id: string; name: string; inputJson: string } | null = null;

    // Read all events first, then govern and re-emit
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep incomplete line

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          allEvents.push(data);

          try {
            const event = JSON.parse(data);

            // Track tool_use content blocks
            if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
              currentToolBlock = {
                index: event.index,
                id: event.content_block.id,
                name: event.content_block.name,
                inputJson: "",
              };
            }

            if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta" && currentToolBlock) {
              currentToolBlock.inputJson += event.delta.partial_json;
            }

            if (event.type === "content_block_stop" && currentToolBlock) {
              let input = {};
              try { input = JSON.parse(currentToolBlock.inputJson); } catch {}
              toolUseBlocks.push({
                index: currentToolBlock.index,
                id: currentToolBlock.id,
                name: currentToolBlock.name,
                input,
              });
              currentToolBlock = null;
            }
          } catch {
            // not JSON, pass through
          }
        }
      }
    }

    // Now govern each tool_use block
    const allowedTools = new Set<string>(agent.allowed_tools ?? []);
    const blockedTools = new Set<string>(agent.blocked_tools ?? []);
    const deniedBlocks = new Set<number>(); // indices of denied tool_use blocks
    const pendingBlocks = new Set<number>(); // indices of pending tool_use blocks

    for (const block of toolUseBlocks) {
      const decision = await governToolCall(block.name, block.input, userId, agentId, agent, allowedTools, blockedTools);

      if (decision.action === "deny") {
        deniedBlocks.add(block.index);
      } else if (decision.action === "ask") {
        pendingBlocks.add(block.index);
      }
      // "allow" passes through unchanged
    }

    // Re-emit events, replacing denied/pending tool_use blocks
    let skipBlockIndex: number | null = null;
    let replacedBlockIds = new Map<string, { action: "deny" | "ask"; toolName: string; requestId?: number }>();

    // Map block indices to their info for replacement
    for (const block of toolUseBlocks) {
      if (deniedBlocks.has(block.index)) {
        replacedBlockIds.set(block.id, { action: "deny", toolName: block.name });
      } else if (pendingBlocks.has(block.index)) {
        replacedBlockIds.set(block.id, { action: "ask", toolName: block.name });
      }
    }

    for (const data of allEvents) {
      try {
        const event = JSON.parse(data);

        // Replace content_block_start for denied/pending tool blocks with text blocks
        if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
          const blockId = event.content_block.id;
          const replacement = replacedBlockIds.get(blockId);
          if (replacement) {
            skipBlockIndex = event.index;
            // Replace with a text block explaining the denial/pending
            const msg = replacement.action === "deny"
              ? `[OCC] Tool "${replacement.toolName}" is blocked by policy. This action was denied.`
              : `[OCC] Tool "${replacement.toolName}" requires human approval. Request sent to dashboard at agent.occ.wtf`;
            const replaced = {
              ...event,
              content_block: {
                type: "text",
                text: msg,
              },
            };
            res.write(`event: content_block_start\ndata: ${JSON.stringify(replaced)}\n\n`);
            continue;
          }
        }

        // Skip input_json_delta events for replaced blocks
        if (event.type === "content_block_delta" && skipBlockIndex !== null && event.index === skipBlockIndex) {
          continue;
        }

        // Handle content_block_stop for replaced blocks
        if (event.type === "content_block_stop" && skipBlockIndex !== null && event.index === skipBlockIndex) {
          skipBlockIndex = null;
          res.write(`event: content_block_stop\ndata: ${JSON.stringify(event)}\n\n`);
          continue;
        }

        // For message_delta with stop_reason "tool_use", if ALL tool blocks were denied,
        // change stop_reason to "end_turn"
        if (event.type === "message_delta" && event.delta?.stop_reason === "tool_use") {
          const allToolsDenied = toolUseBlocks.every(b =>
            deniedBlocks.has(b.index) || pendingBlocks.has(b.index)
          );
          if (allToolsDenied && toolUseBlocks.length > 0) {
            event.delta.stop_reason = "end_turn";
          }
        }

        // Determine event type for SSE
        const eventType = event.type ?? "unknown";
        res.write(`event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Non-JSON event (like [DONE]), pass through
        if (data === "[DONE]") {
          res.write(`event: done\ndata: ${data}\n\n`);
        } else {
          res.write(`data: ${data}\n\n`);
        }
      }
    }

    res.end();
  } catch (err) {
    jsonResponse(res, { error: `Upstream error: ${(err as Error).message}` }, 502);
  }
}

/**
 * Govern a non-streaming response by checking each tool_use block against policy.
 */
async function governResponse(
  responseBody: any,
  userId: string,
  agentId: string,
  agent: any
): Promise<any> {
  if (!responseBody.content || !Array.isArray(responseBody.content)) {
    return responseBody;
  }

  const allowedTools = new Set<string>(agent.allowed_tools ?? []);
  const blockedTools = new Set<string>(agent.blocked_tools ?? []);
  const newContent: any[] = [];
  let anyDenied = false;
  let anyPending = false;

  for (const block of responseBody.content) {
    if (block.type !== "tool_use") {
      newContent.push(block);
      continue;
    }

    const decision = await governToolCall(
      block.name, block.input, userId, agentId, agent, allowedTools, blockedTools
    );

    if (decision.action === "allow") {
      newContent.push(block);
    } else if (decision.action === "deny") {
      anyDenied = true;
      // Replace tool_use with text explaining denial
      newContent.push({
        type: "text",
        text: `[OCC] Tool "${block.name}" is blocked by policy. This action was denied.`,
      });
    } else if (decision.action === "ask") {
      anyPending = true;
      // Replace tool_use with text explaining pending approval
      newContent.push({
        type: "text",
        text: `[OCC] Tool "${block.name}" requires human approval. Request #${decision.requestId} sent to dashboard at agent.occ.wtf. Check back after approval.`,
      });
    }
  }

  const result = { ...responseBody, content: newContent };

  // If all tool_use blocks were removed, change stop_reason
  if ((anyDenied || anyPending) && result.stop_reason === "tool_use") {
    const hasToolUse = newContent.some((b: any) => b.type === "tool_use");
    if (!hasToolUse) {
      result.stop_reason = "end_turn";
    }
  }

  return result;
}

/**
 * Check a single tool call against the agent's policy.
 * Returns: allow, deny, or ask.
 */
async function governToolCall(
  toolName: string,
  toolInput: any,
  userId: string,
  agentId: string,
  agent: any,
  allowedTools: Set<string>,
  blockedTools: Set<string>
): Promise<{ action: "allow" | "deny" | "ask"; requestId?: number }> {
  const chainId = undefined;
  const principal = { id: userId, provider: agent.provider };

  // 1. ALLOWED — tool is in the allow list
  if (allowedTools.has(toolName)) {
    // Create authorization proof — the ticket
    const auth = await db.getValidAuthorization(userId, agentId, toolName);
    if (!auth) {
      await createAuthorizationObject(userId, agentId, toolName, undefined, chainId, principal);
    }

    console.log(`  [proxy] ALLOW ${toolName} for ${agentId}`);
    return { action: "allow" };
  }

  // 2. DENIED — tool is in the block list
  if (blockedTools.has(toolName)) {
    await db.addProof(userId, {
      agentId, tool: toolName, allowed: false,
      args: toolInput,
      reason: "DENIED_BY_POLICY",
    });
    await db.incrementAgentCalls(userId, agentId, false);

    console.log(`  [proxy] DENY ${toolName} for ${agentId}`);
    return { action: "deny" };
  }

  // 3. ASK — tool is in neither list, needs human approval
  const permReq = await db.createPermissionRequest(
    userId, agentId, toolName, "API Proxy",
    toolInput, `Tool call: ${toolName}`
  );

  await db.addProof(userId, {
    agentId, tool: toolName, allowed: false,
    args: toolInput,
    reason: "PENDING_HUMAN_APPROVAL",
  });
  await db.incrementAgentCalls(userId, agentId, false);

  eventBus.emit(userId, {
    type: "permission-request",
    tool: toolName, agentId,
    requestId: permReq.id, timestamp: Date.now(),
  });

  console.log(`  [proxy] ASK ${toolName} for ${agentId} → request #${permReq.id}`);
  return { action: "ask", requestId: permReq.id };
}

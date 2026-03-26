# LLM API Proxy — Transparent Agent Governance

## What This Is

OCC becomes a transparent proxy between agents and the Anthropic/OpenAI API. The agent changes one line — its base URL — and every tool call is now governed by OCC.

```
Agent → api.occ.wtf/v1/messages → OCC forwards to Anthropic → Claude responds with tool calls → OCC intercepts → checks policy → strips denied tools → returns to agent
```

The agent never sees a tool call that wasn't authorized. Zero bypass.

## Architecture

### New file: `packages/hosted/src/llm-proxy.ts`

Handles `POST /v1/messages` (Anthropic format).

### Flow

1. **Agent sends request** to `https://agent.occ.wtf/v1/messages`
   - Authorization header contains OCC agent token (NOT the Anthropic key)
   - The real Anthropic API key is stored server-side per user

2. **OCC authenticates** — looks up agent by token, gets user + agent + policy

3. **OCC forwards** the request to `https://api.anthropic.com/v1/messages`
   - Swaps the auth header for the user's real Anthropic key
   - Passes through model, messages, tools, system, etc.

4. **Claude responds** with content blocks including `tool_use` blocks

5. **OCC intercepts each `tool_use` block**:
   - Look up tool name in agent's policy
   - **allowed_tools** → pass through, create proof
   - **blocked_tools** → strip from response, create denial proof
   - **neither** → strip from response, create pending request, add text block explaining the tool needs approval

6. **OCC returns modified response** to agent
   - Only authorized tool calls remain
   - Denied/pending tools replaced with text explaining what happened

7. **Streaming support** — for `stream: true` requests:
   - Buffer the response until tool_use blocks are complete
   - Check policy on each tool_use
   - Forward allowed content, strip denied content

### Authentication Model

The agent's API key IS its OCC agent token. The real Anthropic key is stored in OCC.

```
Agent config:
  base_url: https://agent.occ.wtf
  api_key: occ_8f9803f6880283d47a414285a584ff980715292f761362fc

OCC stores:
  user's real Anthropic API key (encrypted in DB)
```

This means the agent never has the real API key. OCC holds it. Double win:
- Agent can't bypass OCC (no direct API access)
- Agent can't leak the API key

### New DB field

Add `anthropic_api_key TEXT` to `occ_users` table. Encrypted at rest.

### Route in index.ts

```
if (pathname.startsWith("/v1/")) {
  await handleLLMProxy(req, res, url);
  return;
}
```

### What the agent sees

**Tool allowed:**
Normal Anthropic response — tool_use block passes through unchanged.

**Tool denied:**
The tool_use block is replaced with a text block:
```json
{
  "type": "text",
  "text": "[OCC] Tool 'write_file' was denied by policy. Capability: file.write"
}
```

**Tool pending approval:**
```json
{
  "type": "text",
  "text": "[OCC] Tool 'write_file' requires human approval. Request #42 is pending at agent.occ.wtf"
}
```

### Proof creation

Same as MCP path — reuse `createExecutionProof()`, `createAuthorizationObject()`, `db.addProof()`.

## Implementation Steps

1. Add `anthropic_api_key` column to `occ_users` table
2. Add API endpoint to set/update the Anthropic key (`POST /api/settings/api-key`)
3. Add settings UI for entering the Anthropic key
4. Create `llm-proxy.ts` with:
   - Request parsing (Anthropic messages format)
   - Auth (agent token → user + agent)
   - Forward to Anthropic API
   - Response interception (tool_use filtering)
   - Proof creation for each tool decision
   - Non-streaming first, then streaming
5. Add route in `index.ts`
6. Update dashboard to show API proxy usage in agent connection info
7. Test: agent with `ANTHROPIC_BASE_URL=https://agent.occ.wtf` makes tool calls

## What this replaces

The MCP integration still works — it's a different path to the same governance. But the API proxy is strictly better because:
- Zero agent modification beyond base URL
- Agent can't bypass it (no direct API access)
- Works with every SDK, framework, and tool
- No MCP support required in the client
- The real API key never leaves OCC

## Files to create/modify

- **NEW**: `packages/hosted/src/llm-proxy.ts` — the proxy handler
- **MODIFY**: `packages/hosted/src/index.ts` — add `/v1/` route
- **MODIFY**: `packages/hosted/src/db.ts` — add anthropic_api_key column + getter/setter
- **MODIFY**: `packages/hosted/src/api.ts` — add API key management endpoint
- **MODIFY**: `packages/commandcentral/src/app/settings/page.tsx` — API key input in settings
- **MODIFY**: `packages/commandcentral/src/app/page.tsx` — show proxy URL in agent connection info

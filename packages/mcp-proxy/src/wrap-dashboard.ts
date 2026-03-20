// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Lightweight HTTP dashboard for --wrap mode.
 * Starts on port 9100 (configurable) and serves a live proof log UI.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ProxyEventBus } from "./events.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { ProxyEvent } from "./types.js";

export interface WrapDashboardOpts {
  port: number;
  events: ProxyEventBus;
  registry: ToolRegistry;
  signerMode: string;
  signerPublicKey?: string | undefined;
  proofPath: string;
}

export interface ProofEntry {
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  output?: unknown;
  denied?: boolean;
  reason?: string;
  policyRule?: string;
  receipt?: unknown;
  proofDigestB64?: string | undefined;
}

const MAX_ENTRIES = 1000;

export function startWrapDashboard(opts: WrapDashboardOpts): {
  addProof: (entry: ProofEntry) => void;
  port: number;
} {
  const proofBuffer: ProofEntry[] = [];
  const sseClients: Set<ServerResponse> = new Set();

  // Push proof events to SSE clients
  opts.events.subscribe((event: ProxyEvent) => {
    for (const client of sseClients) {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  });

  const addProof = (entry: ProofEntry) => {
    proofBuffer.push(entry);
    if (proofBuffer.length > MAX_ENTRIES) proofBuffer.shift();
    // Push proof entry to SSE clients
    for (const client of sseClients) {
      client.write(`data: ${JSON.stringify({ type: "proof-written", entry })}\n\n`);
    }
  };

  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${opts.port}`);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    // API routes
    if (path === "/api/proofs") {
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify(proofBuffer));
      return;
    }

    if (path === "/api/tools") {
      const tools = opts.registry.listTools().map((t) => ({
        name: t.name,
        description: t.description,
        source: t.source,
      }));
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify(tools));
      return;
    }

    if (path === "/api/signer") {
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({
        mode: opts.signerMode,
        publicKey: opts.signerPublicKey ?? null,
        proofPath: opts.proofPath,
      }));
      return;
    }

    if (path === "/api/events") {
      res.writeHead(200, {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: {\"type\":\"connected\"}\n\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (path === "/api/health") {
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Serve dashboard HTML
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDashboardHtml());
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(opts.port, () => {
    // logged by caller
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`  Dashboard: port ${opts.port} in use, skipping`);
    } else {
      console.error(`  Dashboard error: ${err.message}`);
    }
  });

  return { addProof, port: opts.port };
}

// ── Self-contained dashboard HTML ──

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OCC Proof Dashboard</title>
<style>
  :root {
    --bg: #0a0a0f;
    --bg-elevated: #141419;
    --bg-subtle: #1a1a22;
    --text: #e8e8ec;
    --text-secondary: #9a9aaa;
    --text-tertiary: #6a6a7a;
    --border: #2a2a35;
    --emerald: #22c55e;
    --emerald-dim: rgba(34, 197, 94, 0.1);
    --red: #ef4444;
    --red-dim: rgba(239, 68, 68, 0.1);
    --mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }

  /* Header */
  .header {
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 10;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo {
    font-weight: 900;
    font-size: 18px;
    letter-spacing: -0.02em;
  }
  .logo span { color: var(--text-tertiary); font-weight: 400; }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--emerald);
    animation: pulse 2s infinite;
  }
  .status-dot.disconnected { background: var(--red); animation: none; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Layout */
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 20px;
  }
  @media (max-width: 768px) {
    .grid { grid-template-columns: 1fr; }
  }

  /* Cards */
  .card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .card-header {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .card-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }
  .card-body { padding: 0; }
  .card-body.padded { padding: 18px; }

  /* Stats row */
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  @media (max-width: 768px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
  }
  .stat {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    font-family: var(--mono);
    letter-spacing: -0.02em;
  }
  .stat-label {
    font-size: 11px;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 4px;
  }

  /* Proof log */
  .proof-list { list-style: none; }
  .proof-entry {
    padding: 12px 18px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.15s;
  }
  .proof-entry:hover { background: var(--bg-subtle); }
  .proof-entry:last-child { border-bottom: none; }
  .proof-entry.new {
    animation: slideIn 0.3s ease-out;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .proof-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .proof-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }
  .proof-badge.allowed {
    background: var(--emerald-dim);
    color: var(--emerald);
  }
  .proof-badge.denied {
    background: var(--red-dim);
    color: var(--red);
  }
  .proof-tool {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .proof-time {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text-tertiary);
    flex-shrink: 0;
  }
  .proof-digest {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text-tertiary);
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .proof-details {
    display: none;
    margin-top: 10px;
    padding: 10px;
    background: var(--bg);
    border-radius: 8px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 300px;
    overflow-y: auto;
  }
  .proof-entry.expanded .proof-details { display: block; }

  /* Tools list */
  .tool-item {
    padding: 10px 18px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tool-item:last-child { border-bottom: none; }
  .tool-name {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    flex: 1;
  }
  .tool-source {
    font-size: 10px;
    color: var(--text-tertiary);
    background: var(--bg-subtle);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .tool-count {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-tertiary);
    min-width: 24px;
    text-align: right;
  }

  /* Signer info */
  .signer-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
  }
  .signer-label {
    font-size: 11px;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .signer-value {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-secondary);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .signer-value.copyable {
    cursor: pointer;
  }
  .signer-value.copyable:hover {
    color: var(--text);
  }

  /* Empty state */
  .empty {
    padding: 40px 18px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 13px;
  }
  .empty-icon {
    font-size: 32px;
    margin-bottom: 8px;
    opacity: 0.5;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="logo">OCC <span>Proof</span></div>
    </div>
    <div class="status">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">Connecting...</span>
    </div>
  </div>

  <div class="container">
    <div class="stats">
      <div class="stat">
        <div class="stat-value" id="statTotal">0</div>
        <div class="stat-label">Total Proofs</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="statAllowed" style="color: var(--emerald)">0</div>
        <div class="stat-label">Allowed</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="statDenied" style="color: var(--red)">0</div>
        <div class="stat-label">Denied</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="statTools">0</div>
        <div class="stat-label">Tools</div>
      </div>
    </div>

    <div class="grid">
      <!-- Proof Log -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Proof Log</span>
          <span class="card-title" id="proofCount" style="font-weight:400"></span>
        </div>
        <div class="card-body">
          <ul class="proof-list" id="proofList">
            <li class="empty">
              <div class="empty-icon">\u{1F512}</div>
              Waiting for tool calls...
            </li>
          </ul>
        </div>
      </div>

      <!-- Sidebar -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Signer -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Signer</span>
          </div>
          <div class="card-body padded" id="signerInfo">
            <div class="signer-row">
              <span class="signer-label">Mode</span>
              <span class="signer-value" id="signerMode">—</span>
            </div>
            <div class="signer-row">
              <span class="signer-label">Public Key</span>
              <span class="signer-value copyable" id="signerKey" title="Click to copy">—</span>
            </div>
            <div class="signer-row">
              <span class="signer-label">Proof File</span>
              <span class="signer-value" id="signerPath">—</span>
            </div>
          </div>
        </div>

        <!-- Tools -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Tools</span>
            <span class="card-title" id="toolCount" style="font-weight:400"></span>
          </div>
          <div class="card-body">
            <div id="toolList">
              <div class="empty">Discovering tools...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

<script>
(function() {
  let totalProofs = 0;
  let allowedCount = 0;
  let deniedCount = 0;
  const toolCalls = {};

  // Fetch initial data
  Promise.all([
    fetch('/api/signer').then(r => r.json()),
    fetch('/api/tools').then(r => r.json()),
    fetch('/api/proofs').then(r => r.json()),
  ]).then(([signer, tools, proofs]) => {
    // Signer
    document.getElementById('signerMode').textContent = signer.mode;
    if (signer.publicKey) {
      const keyEl = document.getElementById('signerKey');
      keyEl.textContent = signer.publicKey.slice(0, 24) + '...';
      keyEl.title = signer.publicKey;
      keyEl.onclick = () => {
        navigator.clipboard.writeText(signer.publicKey);
        keyEl.textContent = 'Copied!';
        setTimeout(() => { keyEl.textContent = signer.publicKey.slice(0, 24) + '...'; }, 1000);
      };
    }
    document.getElementById('signerPath').textContent = signer.proofPath.split('/').pop();
    document.getElementById('signerPath').title = signer.proofPath;

    // Tools
    document.getElementById('statTools').textContent = tools.length;
    document.getElementById('toolCount').textContent = tools.length;
    const toolListEl = document.getElementById('toolList');
    if (tools.length === 0) {
      toolListEl.innerHTML = '<div class="empty">No tools discovered</div>';
    } else {
      toolListEl.innerHTML = tools.map(t =>
        '<div class="tool-item">' +
          '<span class="tool-name">' + escapeHtml(t.name) + '</span>' +
          '<span class="tool-count" data-tool="' + escapeHtml(t.name) + '">0</span>' +
        '</div>'
      ).join('');
    }

    // Existing proofs
    if (proofs.length > 0) {
      document.getElementById('proofList').innerHTML = '';
      proofs.forEach(p => addProofEntry(p, false));
    }
  });

  // SSE
  let es;
  function connectSSE() {
    es = new EventSource('/api/events');
    es.onopen = () => {
      document.getElementById('statusDot').classList.remove('disconnected');
      document.getElementById('statusText').textContent = 'Live';
    };
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'proof-written' && data.entry) {
        addProofEntry(data.entry, true);
      }
    };
    es.onerror = () => {
      document.getElementById('statusDot').classList.add('disconnected');
      document.getElementById('statusText').textContent = 'Reconnecting...';
    };
  }
  connectSSE();

  function addProofEntry(entry, animate) {
    const list = document.getElementById('proofList');
    // Remove empty state
    const empty = list.querySelector('.empty');
    if (empty) empty.remove();

    totalProofs++;
    if (entry.denied) deniedCount++;
    else allowedCount++;

    // Update stats
    document.getElementById('statTotal').textContent = totalProofs;
    document.getElementById('statAllowed').textContent = allowedCount;
    document.getElementById('statDenied').textContent = deniedCount;
    document.getElementById('proofCount').textContent = totalProofs + ' entries';

    // Update tool call count
    toolCalls[entry.tool] = (toolCalls[entry.tool] || 0) + 1;
    const toolCountEl = document.querySelector('[data-tool="' + CSS.escape(entry.tool) + '"]');
    if (toolCountEl) toolCountEl.textContent = toolCalls[entry.tool];

    // Create entry
    const li = document.createElement('li');
    li.className = 'proof-entry' + (animate ? ' new' : '');
    li.onclick = () => li.classList.toggle('expanded');

    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const badge = entry.denied
      ? '<span class="proof-badge denied">Denied</span>'
      : '<span class="proof-badge allowed">Allowed</span>';

    const digest = entry.proofDigestB64
      ? '<div class="proof-digest">\u{1F512} ' + entry.proofDigestB64.slice(0, 32) + '...</div>'
      : '';

    const details = JSON.stringify({
      args: entry.args,
      ...(entry.output !== undefined ? { output: typeof entry.output === 'string' && entry.output.length > 500 ? entry.output.slice(0, 500) + '...' : entry.output } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.receipt ? { receipt: entry.receipt } : {}),
    }, null, 2);

    li.innerHTML =
      '<div class="proof-row">' +
        badge +
        '<span class="proof-tool">' + escapeHtml(entry.tool) + '</span>' +
        '<span class="proof-time">' + timeStr + '</span>' +
      '</div>' +
      digest +
      '<div class="proof-details">' + escapeHtml(details) + '</div>';

    // Prepend (newest first)
    list.insertBefore(li, list.firstChild);

    // Cap at 200 DOM entries
    while (list.children.length > 200) {
      list.removeChild(list.lastChild);
    }
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
</script>
</body>
</html>`;
}

#!/usr/bin/env node

// AiMessage — PreToolUse hook for Claude Code
// Reads tool call from stdin, sends iMessage, waits for reply, allows or denies.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const CONFIG_DIR = path.join(os.homedir(), ".aimessage");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const PROOFS_PATH = path.join(CONFIG_DIR, "proofs.json");
const ALLOWED_PATH = path.join(CONFIG_DIR, "allowed.json");

// Read-only tools that don't need approval
const SKIP_TOOLS = new Set([
  "Read", "Glob", "Grep", "WebSearch", "WebFetch",
  "mcp__Claude_Preview__preview_screenshot",
  "mcp__Claude_Preview__preview_snapshot",
  "mcp__Claude_Preview__preview_inspect",
  "mcp__Claude_Preview__preview_logs",
  "mcp__Claude_Preview__preview_console_logs",
  "mcp__Claude_Preview__preview_network",
  "mcp__Claude_Preview__preview_list",
  "TaskOutput",
]);

async function main() {
  // Read stdin (Claude Code sends JSON with tool info)
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  let data;
  try { data = JSON.parse(input); } catch { process.exit(0); } // Can't parse = allow

  const tool = data.tool_name || data.tool || "unknown";
  const args = data.tool_input || data.input || {};

  // Skip read-only tools
  if (SKIP_TOOLS.has(tool)) process.exit(0);

  // Load config
  if (!fs.existsSync(CONFIG_PATH)) {
    process.stderr.write("AiMessage not set up. Run: aimessage setup\n");
    process.exit(0); // Allow if not configured (don't block)
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const phone = config.phone;

  // Check if already allowed
  const allowed = loadAllowed();
  if (allowed.has(tool)) {
    recordProof(tool, args, "allow", "previously approved");
    process.exit(0);
  }

  // Build human-readable message
  const summary = buildSummary(tool, args);
  const msg = `🔒 ${summary}\n\nReply: YES (always) / ONCE / NO`;

  // Send iMessage
  try {
    sendMessage(phone, msg);
  } catch (e) {
    process.stderr.write(`AiMessage: couldn't send iMessage: ${e.message}\n`);
    process.exit(0); // Allow if can't message (don't block work)
  }

  // Wait for reply (poll Messages for up to 120 seconds)
  const reply = await waitForReply(phone, 120);

  if (!reply) {
    // Timeout — deny
    recordProof(tool, args, "deny", "timeout");
    sendMessage(phone, "⏰ Timed out. Action denied.");
    process.stderr.write("AiMessage: timed out waiting for reply. Denied.\n");
    process.exit(2);
  }

  const answer = reply.trim().toUpperCase();

  if (answer === "YES" || answer === "Y") {
    // Always allow this tool
    allowed.add(tool);
    saveAllowed(allowed);
    recordProof(tool, args, "allow", "always");
    sendMessage(phone, "✅ Allowed (always).");
    process.exit(0);
  } else if (answer === "ONCE" || answer === "1") {
    // Allow once
    recordProof(tool, args, "allow", "once");
    sendMessage(phone, "✅ Allowed (once).");
    process.exit(0);
  } else {
    // Deny
    recordProof(tool, args, "deny", "denied by user");
    sendMessage(phone, "❌ Denied.");
    process.stderr.write("AiMessage: denied by user.\n");
    process.exit(2);
  }
}

function buildSummary(tool, args) {
  const name = tool.replace(/[_-]/g, " ");

  if (args.file_path || args.path) return `${name}: ${args.file_path || args.path}`;
  if (args.command) return `${name}: $ ${String(args.command).slice(0, 80)}`;
  if (args.url) return `${name}: ${args.url}`;
  if (args.query) return `${name}: "${String(args.query).slice(0, 60)}"`;
  if (args.content && args.file_path) return `${name}: write to ${args.file_path}`;

  return name;
}

function sendMessage(phone, text) {
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  execSync(`osascript <<'SCPT'
tell application "Messages"
  set targetService to id of 1st account whose service type = iMessage
  set theBuddy to participant "${phone}" of account id targetService
  send "${escaped}" to theBuddy
end tell
SCPT`, { stdio: "pipe", timeout: 10000 });
}

function waitForReply(phone, timeoutSeconds) {
  return new Promise((resolve) => {
    const start = Date.now();
    const deadline = start + timeoutSeconds * 1000;

    // Get current message count to know baseline
    const baseline = getLatestMessage(phone);
    const baselineText = baseline || "";
    const baselineTime = Date.now();

    const poll = setInterval(() => {
      if (Date.now() > deadline) {
        clearInterval(poll);
        resolve(null);
        return;
      }

      try {
        const latest = getLatestMessage(phone);
        // Check if it's a new message (different from baseline)
        if (latest && latest !== baselineText) {
          const upper = latest.trim().toUpperCase();
          if (["YES", "Y", "NO", "N", "ONCE", "1"].includes(upper)) {
            clearInterval(poll);
            resolve(latest);
            return;
          }
        }
      } catch {}
    }, 2000); // Poll every 2 seconds
  });
}

function getLatestMessage(phone) {
  try {
    // Query Messages database directly for the most recent incoming message
    const dbPath = path.join(os.homedir(), "Library", "Messages", "chat.db");
    const result = execSync(`sqlite3 "${dbPath}" "
      SELECT m.text FROM message m
      JOIN handle h ON m.handle_id = h.ROWID
      WHERE h.id LIKE '%${phone.replace(/[^0-9+]/g, "")}%'
        AND m.is_from_me = 0
      ORDER BY m.date DESC LIMIT 1;
    "`, { stdio: "pipe", timeout: 5000 }).toString().trim();
    return result || null;
  } catch {
    return null;
  }
}

function loadAllowed() {
  if (!fs.existsSync(ALLOWED_PATH)) return new Set();
  try {
    return new Set(JSON.parse(fs.readFileSync(ALLOWED_PATH, "utf8")));
  } catch { return new Set(); }
}

function saveAllowed(set) {
  fs.writeFileSync(ALLOWED_PATH, JSON.stringify([...set], null, 2));
}

function recordProof(tool, args, decision, reason) {
  let proofs = [];
  if (fs.existsSync(PROOFS_PATH)) {
    try { proofs = JSON.parse(fs.readFileSync(PROOFS_PATH, "utf8")); } catch {}
  }

  const prevHash = proofs.length > 0 ? proofs[proofs.length - 1].hash : null;
  const payload = JSON.stringify({ tool, decision, reason, timestamp: new Date().toISOString(), prevHash });
  const hash = crypto.createHash("sha256").update(payload).digest("hex");

  proofs.push({
    tool,
    args: typeof args === "object" ? JSON.stringify(args).slice(0, 500) : null,
    decision,
    reason,
    timestamp: new Date().toISOString(),
    prevHash,
    hash,
  });

  fs.writeFileSync(PROOFS_PATH, JSON.stringify(proofs, null, 2));
}

main().catch(() => process.exit(0));

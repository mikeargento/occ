#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const cmd = process.argv[2];

if (!cmd || cmd === "setup") {
  setup();
} else if (cmd === "status") {
  status();
} else if (cmd === "proofs") {
  proofs();
} else if (cmd === "uninstall") {
  uninstall();
} else {
  console.log(`
  aimessage — Your AI asks before it acts.

  Commands:
    setup       Install the Claude Code hook
    status      Check if hook is active
    proofs      Show recent proofs
    uninstall   Remove the hook
  `);
}

function setup() {
  console.log("\n  AiMessage Setup\n");

  // Check macOS
  if (process.platform !== "darwin") {
    console.log("  ✗ AiMessage requires macOS (for iMessage).\n");
    process.exit(1);
  }

  // Check Messages app access
  try {
    execSync('osascript -e \'tell application "Messages" to name\'', { stdio: "pipe" });
    console.log("  ✓ Messages app accessible");
  } catch {
    console.log("  ✗ Can't access Messages app. Open Messages and sign in to iMessage first.\n");
    process.exit(1);
  }

  // Get phone number
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question("  Your phone number (for iMessage replies): ", (phone) => {
    phone = phone.trim();
    if (!phone) {
      console.log("  ✗ Phone number required.\n");
      process.exit(1);
    }

    // Save config
    const configDir = path.join(os.homedir(), ".aimessage");
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({
      phone,
      createdAt: new Date().toISOString(),
    }, null, 2));

    console.log("  ✓ Phone saved");

    // Create proof database
    initDb(configDir);
    console.log("  ✓ Proof database created");

    // Install hook into Claude Code settings
    installHook(configDir);
    console.log("  ✓ Claude Code hook installed");

    // Test iMessage
    console.log("\n  Sending test message...");
    try {
      sendMessage(phone, 'AiMessage is set up. Reply "ok" to confirm.');
      console.log("  ✓ Check your phone for the test message");
    } catch (e) {
      console.log("  ⚠ Couldn't send test message. Make sure Messages is open and signed in.");
    }

    console.log("\n  Done. Open Claude Code — every action will ask you first.\n");
    rl.close();
  });
}

function installHook(configDir) {
  const hookScript = path.join(configDir, "hook.sh");
  const nodeScript = path.join(configDir, "check.js");

  // Write the check script (Node.js — handles iMessage + proofs)
  fs.writeFileSync(nodeScript, fs.readFileSync(path.join(__dirname, "..", "lib", "check.js"), "utf8"));

  // Write the shell hook
  fs.writeFileSync(hookScript, `#!/bin/bash
node "${nodeScript}"
`, { mode: 0o755 });

  // Update Claude Code settings.json
  const claudeDir = path.join(os.homedir(), ".claude");
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  const settingsPath = path.join(claudeDir, "settings.json");
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch {}
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];

  // Remove existing aimessage hooks
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
    h => !JSON.stringify(h).includes("aimessage")
  );

  // Add new hook
  settings.hooks.PreToolUse.push({
    matcher: "",
    hooks: [{
      type: "command",
      command: hookScript,
    }],
  });

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function initDb(configDir) {
  const dbPath = path.join(configDir, "proofs.db");
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS proofs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool TEXT NOT NULL,
        args TEXT,
        decision TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        prev_hash TEXT,
        hash TEXT
      )
    `);
    db.close();
  } catch {
    // If better-sqlite3 isn't available, we'll create on first use
    fs.writeFileSync(path.join(configDir, "proofs.json"), "[]");
  }
}

function sendMessage(phone, text) {
  const escaped = text.replace(/"/g, '\\"');
  execSync(`osascript -e '
    tell application "Messages"
      set targetBuddy to "${phone}"
      set targetService to id of 1st account whose service type = iMessage
      set theBuddy to participant targetBuddy of account id targetService
      send "${escaped}" to theBuddy
    end tell
  '`, { stdio: "pipe" });
}

function status() {
  const configDir = path.join(os.homedir(), ".aimessage");
  const configPath = path.join(configDir, "config.json");

  if (!fs.existsSync(configPath)) {
    console.log("\n  AiMessage is not set up. Run: aimessage setup\n");
    return;
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  console.log(`\n  AiMessage Status`);
  console.log(`  Phone: ${config.phone}`);
  console.log(`  Since: ${new Date(config.createdAt).toLocaleDateString()}`);

  // Check hook
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const hasHook = JSON.stringify(settings.hooks || {}).includes("aimessage");
    console.log(`  Hook: ${hasHook ? "active" : "not found"}`);
  }

  console.log("");
}

function proofs() {
  const configDir = path.join(os.homedir(), ".aimessage");

  // Try JSON fallback
  const jsonPath = path.join(configDir, "proofs.json");
  if (fs.existsSync(jsonPath)) {
    const proofs = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (proofs.length === 0) {
      console.log("\n  No proofs yet.\n");
      return;
    }
    console.log(`\n  Recent proofs (${proofs.length} total):\n`);
    proofs.slice(-10).forEach(p => {
      const icon = p.decision === "allow" ? "✓" : "✗";
      console.log(`  ${icon} ${p.tool} — ${p.decision} — ${new Date(p.timestamp).toLocaleString()}`);
    });
    console.log("");
    return;
  }

  // Try SQLite
  try {
    const Database = require("better-sqlite3");
    const db = new Database(path.join(configDir, "proofs.db"));
    const rows = db.prepare("SELECT * FROM proofs ORDER BY id DESC LIMIT 10").all();
    db.close();

    if (rows.length === 0) {
      console.log("\n  No proofs yet.\n");
      return;
    }
    console.log(`\n  Recent proofs:\n`);
    rows.reverse().forEach(r => {
      const icon = r.decision === "allow" ? "✓" : "✗";
      console.log(`  ${icon} ${r.tool} — ${r.decision} — ${new Date(r.timestamp).toLocaleString()}`);
    });
    console.log("");
  } catch {
    console.log("\n  No proofs found.\n");
  }
}

function uninstall() {
  // Remove hook from settings
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (settings.hooks?.PreToolUse) {
        settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
          h => !JSON.stringify(h).includes("aimessage")
        );
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("\n  ✓ Hook removed from Claude Code");
    } catch {}
  }

  console.log("  ✓ AiMessage uninstalled\n");
  console.log("  Your proofs are still in ~/.aimessage/\n");
}

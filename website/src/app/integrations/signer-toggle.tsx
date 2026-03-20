"use client";

import { useState } from "react";

function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="absolute top-3 right-3 p-1.5 rounded-md text-text-tertiary hover:text-text hover:bg-bg-subtle transition-colors"
      title="Copy"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

export function SignerToggle({ onChange }: { onChange?: (mode: "local" | "tee") => void }) {
  const [mode, setMode] = useState<"local" | "tee">("local");

  function toggle(m: "local" | "tee") {
    setMode(m);
    onChange?.(m);
  }

  return (
    <div className="inline-flex items-center rounded-full border border-border-subtle bg-bg-elevated p-1 gap-0.5">
      <button
        onClick={() => toggle("local")}
        className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
          mode === "local"
            ? "bg-text text-bg shadow-sm"
            : "text-text-tertiary hover:text-text"
        }`}
      >
        Local Signing
      </button>
      <button
        onClick={() => toggle("tee")}
        className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
          mode === "tee"
            ? "bg-text text-bg shadow-sm"
            : "text-text-tertiary hover:text-text"
        }`}
      >
        TEE (Hardware)
      </button>
    </div>
  );
}

export function SignerDescription({ mode }: { mode: "local" | "tee" }) {
  if (mode === "local") {
    return (
      <p className="text-text-secondary text-sm leading-relaxed">
        <strong className="text-text">Local signing</strong> — Ed25519 keypair generated on your machine.
        Proofs stored locally. No external dependencies. Fully offline.
        <br />
        <span className="text-text-tertiary">You don&apos;t have to trust anyone. That&apos;s the point.</span>
      </p>
    );
  }
  return (
    <p className="text-text-secondary text-sm leading-relaxed">
      <strong className="text-text">TEE signing</strong> — Hardware-attested via AWS Nitro Enclave.
      Only a cryptographic hash leaves your machine. The enclave is sealed — not even OCC can access it.
      <br />
      <span className="text-text-tertiary">Open source. Verify the attestation yourself.</span>
    </p>
  );
}

const localBash = `npx occ-mcp-proxy --wrap npx -y @modelcontextprotocol/server-filesystem ~/Desktop`;
const teeBash = `npx occ-mcp-proxy --wrap --signer occ-cloud npx -y @modelcontextprotocol/server-filesystem ~/Desktop`;

const localConfig = `{
  "command": "npx",
  "args": ["occ-mcp-proxy", "--wrap",
    "npx", "-y",
    "@modelcontextprotocol/server-filesystem",
    "/home"]
}`;

const teeConfig = `{
  "command": "npx",
  "args": ["occ-mcp-proxy", "--wrap",
    "--signer", "occ-cloud",
    "npx", "-y",
    "@modelcontextprotocol/server-filesystem",
    "/home"]
}`;

export function InteractiveSignerSection() {
  const [mode, setMode] = useState<"local" | "tee">("local");

  const bashCmd = mode === "local" ? localBash : teeBash;
  const configCmd = mode === "local" ? localConfig : teeConfig;

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4 sm:p-8 md:p-10 mb-16 sm:mb-28 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] mb-1">
            Choose your signer
          </h2>
          <p className="text-sm text-text-tertiary">
            Every integration supports both modes. Switch anytime.
          </p>
        </div>
        <SignerToggle onChange={setMode} />
      </div>

      <SignerDescription mode={mode} />

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Terminal command */}
        <div className="relative rounded-lg bg-bg p-4">
          <CopyInline text={bashCmd} />
          <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-3">
            Terminal
          </div>
          <pre className="text-sm font-mono text-text leading-relaxed mb-3">
            <code>{bashCmd}</code>
          </pre>
          <p className="text-xs text-text-tertiary leading-relaxed">
            {mode === "local"
              ? "Wraps any MCP server. Proofs written to ./proof.jsonl. No network calls."
              : "Same command, one extra flag. Your data never leaves your machine — only a SHA-256 hash is sent to the enclave."}
          </p>
        </div>

        {/* Claude Desktop config */}
        <div className="relative rounded-lg bg-bg p-4">
          <CopyInline text={configCmd} />
          <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-3">
            Claude Desktop Config
          </div>
          <pre className="text-sm font-mono text-text leading-relaxed mb-3">
            <code>{configCmd}</code>
          </pre>
          <p className="text-xs text-text-tertiary leading-relaxed">
            Add to <code className="text-[11px] font-mono bg-bg-subtle px-1 py-0.5 rounded">claude_desktop_config.json</code> under mcpServers. Claude routes all tool calls through the proxy automatically.
          </p>
        </div>
      </div>

      {/* What's the difference */}
      <div className="mt-6 border-t border-border-subtle pt-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div>
            <div className="font-medium text-text mb-2">Local signing</div>
            <ul className="space-y-1.5 text-text-secondary text-xs">
              <li>Ed25519 keypair on your disk</li>
              <li>Zero network dependencies</li>
              <li>You control the key</li>
              <li>Good for development &amp; self-hosted</li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-text mb-2">TEE signing (Hardware)</div>
            <ul className="space-y-1.5 text-text-secondary text-xs">
              <li>AWS Nitro Enclave — sealed, auditable</li>
              <li>Only a 32-byte hash crosses the network</li>
              <li>Attestation certificate in every proof</li>
              <li>Good for production &amp; compliance</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Verify it yourself */}
      <div className="mt-5 border-t border-border-subtle pt-5 flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          <span className="text-success font-medium">Try it now</span> — drop any file into <a href="/studio" className="text-text underline underline-offset-2 hover:text-text-secondary transition-colors">Proof Studio</a> and get a signed proof in seconds. Then verify it in the <a href="/explorer" className="text-text underline underline-offset-2 hover:text-text-secondary transition-colors">Explorer</a>.
        </p>
        <a
          href="/studio"
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-text text-bg hover:opacity-90 transition-opacity"
        >
          Make a Proof
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </div>
  );
}

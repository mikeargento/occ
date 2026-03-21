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
      className="absolute top-3 right-3 p-1.5 rounded-md text-text-tertiary hover:text-text hover:bg-bg-subtle/50 transition-colors duration-150"
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
    <div className="inline-flex items-center rounded-full border border-border-subtle bg-bg p-1 gap-0.5">
      <button
        onClick={() => toggle("local")}
        className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ${
          mode === "local"
            ? "bg-emerald-500 text-white shadow-[0_0_12px_rgba(34,197,94,0.3)]"
            : "text-text-tertiary hover:text-text"
        }`}
      >
        Local Signing
      </button>
      <button
        onClick={() => toggle("tee")}
        className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ${
          mode === "tee"
            ? "bg-emerald-500 text-white shadow-[0_0_12px_rgba(34,197,94,0.3)]"
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
    <div className="rounded-2xl border border-border bg-bg-elevated/80 backdrop-blur-sm p-4 sm:p-8 md:p-10 mb-20 sm:mb-32 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
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
        <div className="relative rounded-xl border border-border-subtle overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-bg-subtle/30">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-text-tertiary/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-text-tertiary/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-text-tertiary/30" />
              </div>
              <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider ml-1">Terminal</span>
            </div>
            <CopyInline text={bashCmd} />
          </div>
          <div className="p-4 bg-bg">
            <pre className="text-sm font-mono text-emerald-400 leading-relaxed whitespace-pre-wrap break-all">
              <span className="text-text-tertiary select-none">$ </span><code>{bashCmd}</code>
            </pre>
          </div>
          <div className="px-4 py-3 border-t border-border-subtle/50 bg-bg">
            <p className="text-xs text-text-tertiary leading-relaxed">
              {mode === "local"
                ? "Wraps any MCP server. Proofs written to ./proof.jsonl. No network calls."
                : "Same command, one extra flag. Your data never leaves your machine — only a SHA-256 hash is sent to the enclave."}
            </p>
          </div>
        </div>

        {/* Claude Desktop config */}
        <div className="relative rounded-xl border border-border-subtle overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-bg-subtle/30">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">claude_desktop_config.json</span>
            </div>
            <CopyInline text={configCmd} />
          </div>
          <div className="p-4 bg-bg">
            <pre className="text-sm font-mono text-text-secondary leading-relaxed">
              <code>{configCmd}</code>
            </pre>
          </div>
          <div className="px-4 py-3 border-t border-border-subtle/50 bg-bg">
            <p className="text-xs text-text-tertiary leading-relaxed">
              Add to <code className="text-[11px] font-mono text-text-tertiary">mcpServers</code> in your config. Claude routes all tool calls through the proxy.
            </p>
          </div>
        </div>
      </div>

      {/* What's the difference */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border-subtle p-5 bg-bg/50">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div className="font-medium text-text text-sm">Local signing</div>
          </div>
          <ul className="space-y-2 text-text-secondary text-xs">
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5 shrink-0">&#x2713;</span>
              Ed25519 keypair on your disk
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5 shrink-0">&#x2713;</span>
              Zero network dependencies
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5 shrink-0">&#x2713;</span>
              You control the key
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5 shrink-0">&#x2713;</span>
              Good for development &amp; self-hosted
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-border-subtle p-5 bg-bg/50">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
            </div>
            <div className="font-medium text-text text-sm">TEE signing (Hardware)</div>
          </div>
          <ul className="space-y-2 text-text-secondary text-xs">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5 shrink-0">&#x2713;</span>
              AWS Nitro Enclave — sealed, auditable
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5 shrink-0">&#x2713;</span>
              Only a 32-byte hash crosses the network
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5 shrink-0">&#x2713;</span>
              Attestation certificate in every proof
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5 shrink-0">&#x2713;</span>
              Good for production &amp; compliance
            </li>
          </ul>
        </div>
      </div>

    </div>
  );
}

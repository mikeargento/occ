"use client";

import { useState } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-auto pl-3 text-text-tertiary hover:text-text transition-colors flex-shrink-0"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ProofIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
      <path d="M9 12l2 2 4-4" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export default function AgentSetupPage() {
  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] mb-4">
          OCC Agent
        </h1>
        <p className="text-lg text-text-secondary leading-relaxed">
          A control plane for AI agents that cryptographically proves every action they take.
        </p>
      </div>

      {/* Value prop */}
      <div className="mb-12">
        <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-text-tertiary mb-5">
          Why this exists
        </h2>
        <div className="space-y-4 text-[15px] text-text-secondary leading-relaxed">
          <p>
            Permission toggles are trust-based. You configure them, then hope they worked. There is no record of what actually happened, no way to verify after the fact, and no proof you can hand to anyone else.
          </p>
          <p>
            OCC Agent replaces trust with cryptography. Every tool call produces a signed receipt: a portable, self-contained JSON artifact. Anyone can verify it independently. No API call. No database. No third party.
          </p>
          <p className="text-text font-medium">
            The agent could not have done anything it wasn&apos;t authorized to do. And you can prove it.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="mb-12">
        <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-text-tertiary mb-5">
          How it works
        </h2>
        <div className="space-y-3">
          <div className="flex gap-4 p-4 rounded-xl bg-bg-elevated border border-border-subtle">
            <div className="mt-0.5 flex-shrink-0">
              <LockIcon />
            </div>
            <div>
              <p className="text-sm font-medium text-text mb-1">Default-deny</p>
              <p className="text-sm text-text-secondary">
                Agents start with zero authority. Tools must be explicitly enabled. Nothing flows unless you allow it.
              </p>
            </div>
          </div>
          <div className="flex gap-4 p-4 rounded-xl bg-bg-elevated border border-border-subtle">
            <div className="mt-0.5 flex-shrink-0">
              <ProofIcon />
            </div>
            <div>
              <p className="text-sm font-medium text-text mb-1">Signed receipts</p>
              <p className="text-sm text-text-secondary">
                Every tool call produces an Ed25519-signed proof. Each receipt is a standalone JSON file that can be verified offline by anyone with the public key.
              </p>
            </div>
          </div>
          <div className="flex gap-4 p-4 rounded-xl bg-bg-elevated border border-border-subtle">
            <div className="mt-0.5 flex-shrink-0">
              <ShieldIcon />
            </div>
            <div>
              <p className="text-sm font-medium text-text mb-1">Granular policies</p>
              <p className="text-sm text-text-secondary">
                Rate limits, spend caps, argument restrictions, per-agent rules. Each agent gets its own policy. Each policy is enforced and signed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Install */}
      <div className="mb-12">
        <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-text-tertiary mb-5">
          Get started
        </h2>
        <div className="rounded-xl bg-bg-elevated border border-border-subtle overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-border-subtle">
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
              Terminal
            </span>
          </div>
          <div className="px-5 py-4 font-mono text-sm">
            <div className="flex items-center">
              <span className="text-text-tertiary select-none">$ </span>
              <span className="text-text">npx occ-mcp-proxy</span>
              <CopyButton text="npx occ-mcp-proxy" />
            </div>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">
          The proxy starts, the dashboard opens, and you can configure agent permissions immediately. Runs locally on your machine.
        </p>
      </div>

      {/* Claude Desktop integration */}
      <div className="mb-12">
        <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-text-tertiary mb-5">
          Connect to Claude Desktop
        </h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-4">
          Add the proxy as an MCP server in your Claude Desktop config. All tool calls will route through policy enforcement and produce signed proofs.
        </p>
        <div className="rounded-xl bg-bg-elevated border border-border-subtle overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
              claude_desktop_config.json
            </span>
            <CopyButton text={`{\n  "mcpServers": {\n    "occ-agent": {\n      "command": "npx",\n      "args": ["occ-mcp-proxy", "--mcp"]\n    }\n  }\n}`} />
          </div>
          <div className="px-5 py-4 font-mono text-xs text-text-secondary leading-relaxed">
            <pre>{`{
  "mcpServers": {
    "occ-agent": {
      "command": "npx",
      "args": ["occ-mcp-proxy", "--mcp"]
    }
  }
}`}</pre>
          </div>
        </div>
      </div>

      {/* What the proof looks like */}
      <div className="mb-12">
        <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-text-tertiary mb-5">
          What a proof looks like
        </h2>
        <div className="rounded-xl bg-bg-elevated border border-border-subtle overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
              proof.json
            </span>
          </div>
          <div className="px-5 py-4 font-mono text-xs text-text-secondary leading-relaxed">
            <pre>{`{
  "version": "occ/proof/1",
  "tool": "send_email",
  "agent": "customer-service-bot",
  "decision": "allowed",
  "policy": "occ/policy/1",
  "timestamp": "2026-03-15T10:30:00Z",
  "signature": "ed25519:a3f8c2..."
}`}</pre>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed mt-4">
          Each proof is self-contained and portable. Verify it with the public key. No API, no database, no trust required.
        </p>
      </div>

      {/* Footer link */}
      <div className="pt-6 border-t border-border-subtle">
        <p className="text-xs text-text-tertiary">
          Open source &middot;{" "}
          <a
            href="https://github.com/mikeargento/occ"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-secondary hover:text-text transition-colors"
          >
            github.com/mikeargento/occ
          </a>
        </p>
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { FileDrop } from "@/components/file-drop";
import { ProofViewer } from "@/components/proof-viewer";
import { ProofMeta } from "@/components/proof-meta";
import type { ProofLogEntry } from "@/lib/proof-log";
import type { LogVerification } from "@/lib/proof-log";
import { verifyLog } from "@/lib/verify-log";

// ─── Setup Section ───────────────────────────────────────────────────────────

function SetupSection() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copy = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const wrapCommand = `npx occ-mcp-proxy --wrap npx <your-mcp-server>`;

  const claudeConfig = `{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["occ-mcp-proxy", "--wrap", "npx", "my-mcp-server"]
    }
  }
}`;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-text tracking-tight">Get Started</h2>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-xl">
          Wrap any MCP server with cryptographic proof. Every tool call gets an Ed25519-signed receipt
          written to <code className="font-mono text-xs bg-bg-subtle px-1.5 py-0.5 rounded">proof.jsonl</code>.
        </p>
      </div>

      {/* Wrap command */}
      <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <span className="text-xs text-text-tertiary font-mono">Terminal</span>
          <button
            onClick={() => copy(wrapCommand, 0)}
            className="text-xs text-text-tertiary hover:text-text transition-colors"
          >
            {copiedIdx === 0 ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="px-5 py-4 text-sm font-mono text-text overflow-x-auto">
          <span className="text-text-tertiary">$ </span>{wrapCommand}
        </pre>
      </div>

      {/* Claude Desktop config */}
      <div>
        <h3 className="text-sm font-semibold text-text mb-3">Claude Desktop</h3>
        <p className="text-xs text-text-tertiary mb-3">
          Add to Settings → Developer → MCP Servers:
        </p>
        <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
            <span className="text-xs text-text-tertiary font-mono">claude_desktop_config.json</span>
            <button
              onClick={() => copy(claudeConfig, 1)}
              className="text-xs text-text-tertiary hover:text-text transition-colors"
            >
              {copiedIdx === 1 ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="px-5 py-4 text-xs font-mono text-text-secondary overflow-x-auto leading-relaxed">{claudeConfig}</pre>
        </div>
      </div>

      {/* Other clients */}
      <div>
        <h3 className="text-sm font-semibold text-text mb-2">Other MCP Clients</h3>
        <p className="text-xs text-text-secondary leading-relaxed max-w-xl">
          Works with Cursor, Windsurf, Paperclip, or any MCP-compatible agent.
          Point the MCP server command at <code className="font-mono bg-bg-subtle px-1.5 py-0.5 rounded">npx occ-mcp-proxy --wrap</code> followed
          by your server command.
        </p>
      </div>
    </section>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "pass" | "fail" | "warn" | "info" | "skip" }) {
  const colors = {
    pass: "bg-success/15 text-success",
    fail: "bg-error/15 text-error",
    warn: "bg-warning/15 text-warning",
    info: "bg-info/15 text-info",
    skip: "bg-bg-subtle text-text-tertiary",
  };
  const labels = { pass: "Pass", fail: "Fail", warn: "Warn", info: "Info", skip: "Skip" };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

// ─── Timeline Entry ──────────────────────────────────────────────────────────

function TimelineEntry({
  entry,
  verification,
  expanded,
  onToggle,
}: {
  entry: ProofLogEntry;
  verification?: { checks: { label: string; status: "pass" | "fail" | "warn" | "info" | "skip"; detail: string }[]; allPassed: boolean };
  expanded: boolean;
  onToggle: () => void;
}) {
  const ts = new Date(entry.timestamp);
  const timeStr = ts.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = ts.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // Summary of args (first 2 keys)
  const argKeys = Object.keys(entry.args || {}).slice(0, 2);
  const argSummary = argKeys.map((k) => {
    const v = entry.args[k];
    const vs = typeof v === "string" ? (v.length > 30 ? v.slice(0, 30) + "…" : v) : JSON.stringify(v);
    return `${k}: ${vs}`;
  }).join(", ");

  const overallStatus = !verification ? "info" : verification.allPassed ? "pass" : "fail";

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden transition-all">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-bg-subtle/30 transition-colors"
      >
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          overallStatus === "pass" ? "bg-success" : overallStatus === "fail" ? "bg-error" : "bg-text-tertiary"
        }`} />

        {/* Tool name */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-semibold text-text">{entry.tool}</span>
            {!entry.receipt && (
              <span className="text-[10px] text-text-tertiary bg-bg-subtle px-1.5 py-0.5 rounded">no receipt</span>
            )}
          </div>
          {argSummary && (
            <div className="text-xs text-text-tertiary mt-0.5 truncate font-mono">{argSummary}</div>
          )}
        </div>

        {/* Timestamp */}
        <div className="text-xs text-text-tertiary shrink-0 text-right">
          <div>{timeStr}</div>
          <div className="text-[10px]">{dateStr}</div>
        </div>

        {/* Chevron */}
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="currentColor"
          className={`text-text-tertiary transition-transform duration-200 shrink-0 ${expanded ? "rotate-90" : ""}`}
        >
          <path d="M4 1.5l5.5 5.5-5.5 5.5" />
        </svg>
      </button>

      {/* Expanded detail */}
      <div className={`grid transition-all duration-300 ease-in-out ${
        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5 space-y-4 border-t border-border-subtle pt-4">
            {/* Verification checks */}
            {verification && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-text-secondary mb-2">Verification</div>
                {verification.checks.map((check, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs">
                    <StatusBadge status={check.status} />
                    <div className="min-w-0">
                      <span className="text-text font-medium">{check.label}</span>
                      <span className="text-text-tertiary ml-2">{check.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Proof metadata */}
            {entry.receipt?.proof && (
              <div>
                <ProofMeta proof={entry.receipt.proof} />
              </div>
            )}

            {/* Receipt JSON viewer */}
            {entry.receipt?.proof && (
              <ProofViewer proof={entry.receipt.proof} />
            )}

            {/* Args */}
            {entry.args && Object.keys(entry.args).length > 0 && (
              <details className="group">
                <summary className="text-xs font-semibold text-text-secondary cursor-pointer hover:text-text transition-colors">
                  Arguments
                </summary>
                <pre className="mt-2 text-xs font-mono text-text-tertiary bg-bg-subtle/50 rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(entry.args, null, 2)}
                </pre>
              </details>
            )}

            {/* Output */}
            {entry.output && (
              <details className="group">
                <summary className="text-xs font-semibold text-text-secondary cursor-pointer hover:text-text transition-colors">
                  Output
                </summary>
                <pre className="mt-2 text-xs font-mono text-text-tertiary bg-bg-subtle/50 rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(entry.output, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [file, setFile] = useState<File | null>(null);
  const [entries, setEntries] = useState<ProofLogEntry[]>([]);
  const [verification, setVerification] = useState<LogVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setParseError(null);
    setVerification(null);
    setExpandedIndex(null);

    try {
      const text = await f.text();
      const lines = text.split("\n").filter((l) => l.trim());
      const parsed: ProofLogEntry[] = [];

      for (let i = 0; i < lines.length; i++) {
        try {
          parsed.push(JSON.parse(lines[i]));
        } catch {
          setParseError(`Failed to parse line ${i + 1}`);
          return;
        }
      }

      setEntries(parsed);

      // Auto-verify
      setVerifying(true);
      const result = await verifyLog(parsed);
      setVerification(result);
      setVerifying(false);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to read file");
    }
  }, []);

  const handleClear = useCallback(() => {
    setFile(null);
    setEntries([]);
    setVerification(null);
    setParseError(null);
    setExpandedIndex(null);
  }, []);

  const handleDownload = () => {
    if (!file) return;
    // Re-download the file they dropped
    const blob = new Blob([entries.map((e) => JSON.stringify(e)).join("\n") + "\n"], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text">OCC Agent</h1>
        <p className="mt-3 text-sm text-text-secondary leading-relaxed max-w-lg">
          Cryptographic proof for every AI tool call. Wrap any MCP server — every execution gets
          an Ed25519-signed receipt.
        </p>
      </div>

      {/* Setup instructions */}
      <SetupSection />

      {/* Divider */}
      <div className="my-16 border-t border-border-subtle" />

      {/* Proof Viewer */}
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-text tracking-tight">Verify Proof Log</h2>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-xl">
            Drop a <code className="font-mono text-xs bg-bg-subtle px-1.5 py-0.5 rounded">proof.jsonl</code> file
            to verify every receipt. All verification happens in your browser.
          </p>
        </div>

        <FileDrop
          file={file}
          onFile={handleFile}
          onClear={handleClear}
          accept=".jsonl"
          hint="Drop proof.jsonl — verified locally in your browser"
        />

        {parseError && (
          <div className="rounded-xl border border-error/30 bg-error/5 px-5 py-4 text-sm text-error">
            {parseError}
          </div>
        )}

        {verifying && (
          <div className="text-sm text-text-secondary animate-pulse">Verifying {entries.length} entries…</div>
        )}

        {/* Summary */}
        {verification && (
          <div className="rounded-xl border border-border-subtle bg-bg-elevated px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              {/* Count */}
              <span className="font-mono text-text">
                {verification.summary.total} tool call{verification.summary.total !== 1 ? "s" : ""}
              </span>

              {/* Status */}
              {verification.summary.failures === 0 && verification.summary.skipped === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-success">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  All verified
                </span>
              ) : (
                <>
                  {verification.summary.failures > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-error">
                      <span className="w-2 h-2 rounded-full bg-error" />
                      {verification.summary.failures} failure{verification.summary.failures !== 1 ? "s" : ""}
                    </span>
                  )}
                  {verification.summary.skipped > 0 && (
                    <span className="text-text-tertiary">
                      {verification.summary.skipped} skipped
                    </span>
                  )}
                </>
              )}

              {/* Signer */}
              {verification.summary.signerPublicKeyB64 && (
                <span className="text-xs text-text-tertiary font-mono">
                  signer: {verification.summary.signerPublicKeyB64.slice(0, 12)}…
                </span>
              )}

              {/* Download */}
              <button
                onClick={handleDownload}
                className="ml-auto text-xs text-text-tertiary hover:text-text transition-colors"
              >
                Download
              </button>
            </div>
          </div>
        )}

        {/* Timeline */}
        {entries.length > 0 && (
          <div className="space-y-2">
            {entries.map((entry, i) => (
              <TimelineEntry
                key={i}
                entry={entry}
                verification={verification?.entries[i]}
                expanded={expandedIndex === i}
                onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

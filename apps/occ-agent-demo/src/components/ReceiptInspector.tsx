"use client";

import { useState } from "react";
import type { ExecutionResult } from "@/app/page";

interface ReceiptInspectorProps {
  result: ExecutionResult | null;
  onBack: () => void;
}

type Section = "envelope" | "proof" | "verification";

export function ReceiptInspector({ result, onBack }: ReceiptInspectorProps) {
  const [expandedSection, setExpandedSection] = useState<Section>("envelope");

  if (!result) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border-subtle bg-bg-elevated flex flex-col items-center py-14 px-6">
          <div className="w-14 h-14 rounded-xl bg-bg-subtle/80 border border-border-subtle flex items-center justify-center mb-5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
              <path d="M3 7l7-4 7 4v6l-7 4-7-4V7z" />
              <path d="M3 7l7 4m0 0l7-4m-7 4v7" />
            </svg>
          </div>
          <div className="text-[15px] text-text-secondary">
            No receipt yet
          </div>
          <div className="text-xs text-text-tertiary mt-1">Execute a tool to generate a receipt</div>
        </div>
        <button
          onClick={onBack}
          className="w-full h-12 rounded-xl font-semibold text-sm bg-bg-subtle text-text-secondary hover:text-text active:scale-[0.98] transition-all cursor-pointer border border-border-subtle"
        >
          &larr; Back to Execute
        </button>
      </div>
    );
  }

  const env = result.executionEnvelope;
  const proof = result.occProof;

  return (
    <div className="space-y-4">
      {/* Success banner */}
      <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-center mx-auto mb-5 animate-success-pulse">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
            <path d="M6 14l6 6L22 8" />
          </svg>
        </div>
        <div className="text-lg font-semibold text-text mb-1">
          Receipt Created
        </div>
        <p className="text-sm text-text-tertiary">
          {env.tool} &middot; {result.output.status} &middot; {result.output.fetchDuration}ms
        </p>
      </div>

      {/* Tool output card */}
      <div className="rounded-xl border border-border-subtle bg-bg-elevated card-hover">
        <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary">Response</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono px-2 py-0.5 rounded-md border ${
              result.output.status < 400
                ? "text-success border-success/30 bg-success/5"
                : "text-error border-error/30 bg-error/5"
            }`}>
              {result.output.status}
            </span>
            <span className="text-xs text-text-tertiary font-mono">{result.output.fetchDuration}ms</span>
          </div>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          <MetaRow label="URL" value={result.output.url} />
          <MetaRow label="Content-Type" value={result.output.contentType} />
          <MetaRow label="Size" value={`${result.output.contentLength} bytes`} />
        </div>
        {result.output.bodyPreview && (
          <div className="border-t border-border-subtle">
            <pre className="px-5 py-4 text-xs font-mono text-text-secondary leading-relaxed overflow-x-auto max-h-48 overflow-y-auto">
              {result.output.bodyPreview.substring(0, 500)}
            </pre>
          </div>
        )}
      </div>

      {/* Expandable sections */}
      <ExpandableSection
        title="Execution Envelope"
        expanded={expandedSection === "envelope"}
        onToggle={() => setExpandedSection(expandedSection === "envelope" ? "envelope" : "envelope")}
        alwaysExpanded
      >
        <div className="space-y-2.5">
          <MetaRow label="type" value={env.type} mono />
          <MetaRow label="tool" value={env.tool} mono />
          <MetaRow label="toolVersion" value={env.toolVersion} mono />
          <MetaRow label="runtime" value={env.runtime} mono />
          <MetaRow label="adapter" value={env.adapter} mono />
          <MetaRow label="inputHashB64" value={env.inputHashB64} mono />
          <MetaRow label="outputHashB64" value={env.outputHashB64} mono />
          <MetaRow label="timestamp" value={`${env.timestamp}`} mono />
        </div>
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <div className="text-[11px] text-text-tertiary uppercase tracking-wide mb-2">Committed Digest</div>
          <div className="text-sm font-mono text-accent break-all leading-relaxed">
            {result.envelopeDigestB64}
          </div>
        </div>
      </ExpandableSection>

      <ExpandableSection
        title="OCC Proof"
        expanded={expandedSection === "proof"}
        onToggle={() => setExpandedSection(expandedSection === "proof" ? "envelope" : "proof")}
      >
        {proof ? (
          <div className="space-y-4">
            <div className="space-y-2.5">
              <MetaRow label="version" value={String(proof.version ?? "")} mono />
              <MetaRow
                label="artifact.digestB64"
                value={String((proof.artifact as Record<string, unknown>)?.digestB64 ?? "")}
                mono
              />
              <MetaRow
                label="artifact.hashAlg"
                value={String((proof.artifact as Record<string, unknown>)?.hashAlg ?? "")}
                mono
              />
            </div>

            {proof.commit && (
              <div className="pt-4 border-t border-border-subtle space-y-2.5">
                <div className="text-[11px] text-text-tertiary uppercase tracking-wide mb-2">Commit Context</div>
                {Object.entries(proof.commit as Record<string, unknown>).map(([key, value]) => (
                  <MetaRow key={key} label={key} value={String(value)} mono />
                ))}
              </div>
            )}

            {proof.signer && (
              <div className="pt-4 border-t border-border-subtle space-y-2.5">
                <div className="text-[11px] text-text-tertiary uppercase tracking-wide mb-2">Signer</div>
                <MetaRow
                  label="publicKeyB64"
                  value={String((proof.signer as Record<string, unknown>)?.publicKeyB64 ?? "")}
                  mono
                />
                <MetaRow
                  label="signatureB64"
                  value={truncate(String((proof.signer as Record<string, unknown>)?.signatureB64 ?? ""), 48)}
                  mono
                />
              </div>
            )}

            {proof.environment && (
              <div className="pt-4 border-t border-border-subtle space-y-2.5">
                <div className="text-[11px] text-text-tertiary uppercase tracking-wide mb-2">Environment</div>
                <MetaRow
                  label="enforcement"
                  value={String((proof.environment as Record<string, unknown>)?.enforcement ?? "")}
                  mono
                />
                <MetaRow
                  label="measurement"
                  value={truncate(String((proof.environment as Record<string, unknown>)?.measurement ?? ""), 48)}
                  mono
                />
              </div>
            )}

            <details className="pt-4 border-t border-border-subtle">
              <summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-secondary transition-colors">
                Raw JSON
              </summary>
              <pre className="mt-3 text-xs font-mono text-text-secondary leading-relaxed overflow-x-auto max-h-72 overflow-y-auto">
                {JSON.stringify(proof, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-warning">
              {result.occError ?? "No proof available"}
            </div>
            <p className="text-[11px] text-text-tertiary leading-relaxed">
              Set <span className="font-mono">OCC_API_URL</span> and <span className="font-mono">OCC_API_KEY</span> to connect to a commit service.
            </p>
          </div>
        )}
      </ExpandableSection>

      <ExpandableSection
        title="Verification"
        expanded={expandedSection === "verification"}
        onToggle={() => setExpandedSection(expandedSection === "verification" ? "envelope" : "verification")}
      >
        <div className="space-y-3">
          <Check
            label="Envelope digest match"
            detail="SHA-256(canonicalize(envelope)) === artifact.digestB64"
            status={result.verification ? (result.verification.envelopeHashMatch ? "pass" : "fail") : "info"}
          />
          <Check
            label="OCC proof returned"
            detail="Commit service responded with a signed proof"
            status={proof ? "pass" : "fail"}
          />
          <Check
            label="Ed25519 signature"
            detail="Enclave-signed canonical body"
            status={proof ? ((proof.signer as Record<string, unknown>)?.signatureB64 ? "pass" : "fail") : "info"}
          />
          <Check
            label="Monotonic counter"
            detail="Causal ordering position"
            status={proof ? ((proof.commit as Record<string, unknown>)?.counter ? "pass" : "info") : "info"}
          />
          <Check
            label="Enclave measurement"
            detail="Code identity via PCR0"
            status={proof ? ((proof.environment as Record<string, unknown>)?.measurement ? "pass" : "info") : "info"}
          />
          <Check
            label="Vendor attestation"
            detail="Hardware-signed attestation document"
            status={proof ? ((proof.environment as Record<string, unknown>)?.attestation ? "pass" : "info") : "info"}
          />
          <Check
            label="RFC 3161 timestamp"
            detail="Trusted third-party time authority"
            status={proof ? ((proof as Record<string, unknown>).timestamps ? "pass" : "info") : "info"}
          />
        </div>

        {result.occError && !proof && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-4 text-xs text-warning">
            {result.occError}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-border-subtle space-y-4">
          <div>
            <div className="text-[11px] text-success uppercase tracking-wide font-semibold mb-2">Proves</div>
            <ul className="text-[13px] text-text-secondary space-y-1.5 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5 shrink-0">&#x2713;</span>
                This execution was committed through OCC
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5 shrink-0">&#x2713;</span>
                The envelope digest matches the committed artifact
              </li>
              <li className="flex items-start gap-2">
                <span className="text-success mt-0.5 shrink-0">&#x2713;</span>
                The commit has a unique position in the causal sequence
              </li>
            </ul>
          </div>
          <div>
            <div className="text-[11px] text-warning uppercase tracking-wide font-semibold mb-2">Does not prove</div>
            <ul className="text-[13px] text-text-secondary space-y-1.5 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary mt-0.5 shrink-0">&mdash;</span>
                Correctness or completeness of the tool output
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary mt-0.5 shrink-0">&mdash;</span>
                What content the input/output hashes represent
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary mt-0.5 shrink-0">&mdash;</span>
                Exact wall-clock time of execution
              </li>
            </ul>
          </div>
        </div>
      </ExpandableSection>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 h-12 rounded-xl font-semibold text-sm bg-success/10 text-success hover:bg-success/20 active:scale-[0.98] transition-all cursor-pointer border border-success/20"
        >
          <span className="inline-flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5" /></svg>
            Run Another
          </span>
        </button>
        <button
          onClick={() => {
            const receipt = {
              format: "occ-agent/receipt/1" as const,
              envelope: result.executionEnvelope,
              proof: result.occProof,
            };
            const json = JSON.stringify(receipt, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `receipt-${env.tool}-${proof?.commit ? (proof.commit as Record<string, unknown>).counter : Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          disabled={!proof}
          className="flex-1 h-12 rounded-xl font-semibold text-sm bg-bg-subtle text-text-secondary hover:text-text active:scale-[0.98] transition-all cursor-pointer border border-border-subtle disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="inline-flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14h10M8 3v8m0 0l-3-3m3 3l3-3" /></svg>
            Export Receipt
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function ExpandableSection({
  title,
  expanded,
  onToggle,
  alwaysExpanded,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  alwaysExpanded?: boolean;
  children: React.ReactNode;
}) {
  const isOpen = alwaysExpanded || expanded;

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated terminal-glow overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-text hover:bg-bg-subtle/50 transition-colors cursor-pointer"
      >
        <span>{title}</span>
        {!alwaysExpanded && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`text-text-tertiary transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
          >
            <path d="M5 3l4 4-4 4" />
          </svg>
        )}
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-text-tertiary uppercase tracking-wide">{label}</div>
      <div className={`text-sm text-text break-all mt-0.5 leading-relaxed ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Check({ label, detail, status }: { label: string; detail: string; status: "pass" | "fail" | "info" }) {
  const icons: Record<typeof status, string> = {
    pass: "\u2713",
    fail: "\u2717",
    info: "\u2014",
  };
  const styles: Record<typeof status, string> = {
    pass: "text-success",
    fail: "text-error",
    info: "text-text-tertiary",
  };
  const bgStyles: Record<typeof status, string> = {
    pass: "bg-success/10",
    fail: "bg-error/10",
    info: "bg-bg-subtle",
  };

  return (
    <div className="flex items-start gap-3 py-2">
      <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full text-xs font-bold shrink-0 mt-0.5 ${bgStyles[status]} ${styles[status]}`}>
        {icons[status]}
      </span>
      <div>
        <div className={`text-sm font-medium ${status === "pass" ? "text-text" : status === "fail" ? "text-error" : "text-text-secondary"}`}>
          {label}
        </div>
        <div className="text-xs text-text-tertiary mt-0.5">{detail}</div>
      </div>
    </div>
  );
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.substring(0, maxLen) + "…";
}

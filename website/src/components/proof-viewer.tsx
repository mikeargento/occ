"use client";

import { useState } from "react";
import type { OCCProof } from "@/lib/occ";

interface ProofViewerProps {
  proof: OCCProof;
}

export function ProofViewer({ proof }: ProofViewerProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const json = JSON.stringify(proof, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `occ-proof-${proof.commit?.counter || "latest"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-mono text-text-tertiary hover:text-text transition-colors flex items-center gap-1.5"
        >
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
            className={`transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M3 1l4 4-4 4" />
          </svg>
          proof.json
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="text-xs text-text-tertiary hover:text-text transition-colors"
          >
            Download
          </button>
          <button
            onClick={handleCopy}
            className="text-xs text-text-tertiary hover:text-text transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      {expanded && (
        <pre className="p-4 overflow-x-auto text-xs leading-relaxed font-mono max-w-full">
          <code className="break-all">
            {highlightJson(json)}
          </code>
        </pre>
      )}
    </div>
  );
}

function highlightJson(json: string): React.ReactNode[] {
  // Simple JSON syntax highlighting
  const lines = json.split("\n");
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    // Match key-value patterns
    const keyMatch = remaining.match(/^(\s*)"([^"]+)":/);
    if (keyMatch) {
      parts.push(<span key={key++} className="text-text-tertiary">{keyMatch[1]}</span>);
      parts.push(<span key={key++} className="text-syntax-key">&quot;{keyMatch[2]}&quot;</span>);
      parts.push(<span key={key++} className="text-text-tertiary">: </span>);
      remaining = remaining.slice(keyMatch[0].length);

      // Value after colon
      remaining = remaining.trimStart();
      if (remaining.startsWith('"')) {
        // String value
        const strMatch = remaining.match(/^"([^"]*)"(,?)$/);
        if (strMatch) {
          const val = strMatch[1];
          parts.push(<span key={key++} className="text-syntax-string">&quot;{val}&quot;</span>);
          if (strMatch[2]) parts.push(<span key={key++} className="text-text-tertiary">,</span>);
        } else {
          parts.push(<span key={key++} className="text-syntax-string">{remaining}</span>);
        }
      } else if (remaining.match(/^\d/)) {
        parts.push(<span key={key++} className="text-syntax-number">{remaining.replace(/,$/, "")}</span>);
        if (remaining.endsWith(",")) parts.push(<span key={key++} className="text-text-tertiary">,</span>);
      } else {
        parts.push(<span key={key++} className="text-text-secondary">{remaining}</span>);
      }
    } else {
      // Brackets, braces, etc.
      parts.push(<span key={key++} className="text-text-tertiary">{line}</span>);
    }

    return (
      <span key={i}>
        {parts}
        {i < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

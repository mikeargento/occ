"use client";

import { useState } from "react";
import type { OCCProof } from "@/lib/occ";

interface ProofViewerProps {
  proof: OCCProof;
  defaultExpanded?: boolean;
}

export function ProofViewer({ proof, defaultExpanded = false }: ProofViewerProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
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
    <div className="terminal-glow border border-border-subtle bg-bg-elevated overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => e.key === "Enter" && setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg-subtle/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="currentColor"
            className={`text-blue-600 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M4 1.5l5.5 5.5-5.5 5.5" />
          </svg>
          <span className="text-sm font-medium text-text">Raw Proof JSON</span>
          <span className="text-xs text-text-tertiary font-mono">{(json.length / 1024).toFixed(1)} KB</span>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
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
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <pre className="p-5 overflow-x-auto text-xs leading-relaxed font-mono max-w-full">
            <code className="break-all">
              {highlightJson(json)}
            </code>
          </pre>
        </div>
      </div>
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

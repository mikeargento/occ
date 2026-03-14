"use client";

import { useState } from "react";
import type { ExecutionResult } from "@/app/page";

interface ToolRunnerProps {
  onResult: (result: ExecutionResult) => void;
}

export function ToolRunner({ onResult }: ToolRunnerProps) {
  const [url, setUrl] = useState("https://httpbin.org/json");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExecute() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "fetch_url",
          input: { url },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? `Request failed: ${response.status}`);
        return;
      }

      onResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tool card */}
      <div className="rounded-xl border border-border-subtle bg-bg-elevated p-5 card-hover">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-success" />
          <span className="text-sm font-semibold text-text">fetch_url</span>
          <span className="text-xs text-text-tertiary ml-auto font-mono">v1.0.0</span>
        </div>
        <p className="text-[13px] text-text-secondary leading-relaxed mt-2">
          Fetch a URL and receive a normalized response with an OCC execution receipt.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-xl border border-border-subtle bg-bg-elevated p-5">
        <div className="text-sm font-medium text-text mb-3">Target URL</div>
        <div className="rounded-lg border border-border-subtle overflow-hidden">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full h-11 bg-bg px-3 text-base sm:text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:bg-bg-elevated transition-colors"
          />
        </div>
        <p className="text-[11px] text-text-tertiary mt-2 leading-relaxed">
          Response will be normalized and hashed into a canonical execution envelope.
        </p>
      </div>

      {/* Execute button */}
      <button
        onClick={handleExecute}
        disabled={loading || !url}
        className={`
          relative w-full h-12 rounded-xl font-semibold text-sm
          active:scale-[0.98] transition-all cursor-pointer
          shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]
          disabled:cursor-not-allowed
          ${loading
            ? "bg-bg-subtle text-text-tertiary border border-border-subtle"
            : "bg-success text-bg hover:bg-success/85"
          }
        `}
      >
        {loading && (
          <div className="absolute inset-0 overflow-hidden rounded-xl">
            <div className="h-full bg-text/10 animate-progress-fill" />
          </div>
        )}
        <span className="relative z-10">
          {loading ? "Executing…" : "Execute"}
        </span>
      </button>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-error/30 bg-error/5 p-4">
          <div className="text-sm text-error font-medium mb-1">Error</div>
          <div className="text-sm text-text-secondary">{error}</div>
        </div>
      )}
    </div>
  );
}

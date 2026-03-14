"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ExecutionResult } from "@/app/page";

interface ToolRunnerProps {
  onResult: (result: ExecutionResult) => void;
}

type ExecutionState =
  | { phase: "idle" }
  | { phase: "executing"; startedAt: number }
  | { phase: "error"; message: string; retryable: boolean }
  | { phase: "success" };

function isValidUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function ToolRunner({ onResult }: ToolRunnerProps) {
  const [url, setUrl] = useState("https://httpbin.org/json");
  const [state, setState] = useState<ExecutionState>({ phase: "idle" });
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const urlEmpty = url.trim() === "";
  const urlValid = isValidUrl(url.trim());
  const showValidation = touched && !urlEmpty && !urlValid;
  const canExecute = urlValid && state.phase !== "executing";

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleExecute = useCallback(async () => {
    if (!canExecute) return;

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ phase: "executing", startedAt: Date.now() });

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "fetch_url",
          input: { url: url.trim() },
        }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data.error ?? `Request failed with status ${response.status}`;
        setState({
          phase: "error",
          message,
          retryable: response.status >= 500 || response.status === 0,
        });
        return;
      }

      setState({ phase: "success" });

      // Brief pause so user sees the success state before switching tabs
      setTimeout(() => onResult(data), 300);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;

      const message = e instanceof Error ? e.message : String(e);
      const isNetwork =
        message.includes("fetch") ||
        message.includes("network") ||
        message.includes("Failed to fetch");

      setState({
        phase: "error",
        message: isNetwork
          ? "Network error — check the URL and your connection."
          : `Execution failed: ${message}`,
        retryable: true,
      });
    }
  }, [canExecute, url, onResult]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canExecute) {
      e.preventDefault();
      handleExecute();
    }
  }

  function handleRetry() {
    setState({ phase: "idle" });
    // Re-run automatically
    setTimeout(() => handleExecute(), 50);
  }

  const isExecuting = state.phase === "executing";

  return (
    <div className="space-y-4">
      {/* Tool card */}
      <div className="rounded-xl border border-border-subtle bg-bg-elevated p-5">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-bg-subtle border border-border-subtle flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-text-secondary">
              <path d="M2 3h12M2 8h12M2 13h8" />
            </svg>
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-semibold text-text font-mono">fetch_url</span>
            <span className="text-[11px] text-text-tertiary font-mono">v1.0.0</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-success" />
            <span className="text-[11px] text-text-tertiary">Available</span>
          </div>
        </div>
        <p className="text-[13px] text-text-secondary leading-relaxed">
          Fetches a URL via GET. Response headers and body are normalized, hashed, and sealed into an execution envelope.
          The envelope digest is committed through OCC. You get the response plus a portable receipt.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-xl border border-border-subtle bg-bg-elevated p-5">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="tool-url" className="text-sm font-medium text-text">
            URL
          </label>
          <span className="text-[11px] text-text-tertiary font-mono">GET</span>
        </div>
        <div className={`rounded-lg border overflow-hidden transition-colors ${
          showValidation
            ? "border-error/50"
            : isExecuting
              ? "border-border-subtle opacity-60"
              : "border-border-subtle focus-within:border-text-tertiary"
        }`}>
          <input
            ref={inputRef}
            id="tool-url"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (state.phase === "error") setState({ phase: "idle" });
            }}
            onBlur={() => setTouched(true)}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com/api/data"
            disabled={isExecuting}
            className="w-full h-11 bg-bg px-3 text-base sm:text-sm text-text font-mono placeholder:text-text-tertiary/60 focus:outline-none focus:bg-bg-elevated transition-colors disabled:opacity-60"
          />
        </div>
        {showValidation ? (
          <p className="text-[11px] text-error/80 mt-2 leading-relaxed">
            Enter a valid HTTP or HTTPS URL.
          </p>
        ) : (
          <p className="text-[11px] text-text-tertiary mt-2 leading-relaxed">
            The response will be normalized and hashed into a canonical execution envelope.
            Only the SHA-256 digest is committed — raw data stays local.
          </p>
        )}
      </div>

      {/* Execute button */}
      <button
        onClick={handleExecute}
        disabled={!canExecute}
        className={`
          relative w-full h-12 rounded-xl font-sans font-semibold text-sm
          transition-all cursor-pointer
          disabled:cursor-not-allowed
          ${isExecuting
            ? "bg-bg-subtle text-text-secondary border border-border-subtle"
            : state.phase === "success"
              ? "bg-success/20 text-success border border-success/20"
              : canExecute
                ? "bg-text text-bg hover:opacity-90 active:scale-[0.98] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                : "bg-bg-subtle text-text-tertiary border border-border-subtle"
          }
        `}
      >
        {isExecuting && (
          <div className="absolute inset-0 overflow-hidden rounded-xl">
            <div className="h-full bg-text/8 animate-progress-fill" />
          </div>
        )}
        <span className="relative z-10 inline-flex items-center gap-2">
          {isExecuting ? (
            <>
              <Spinner />
              Executing&hellip;
            </>
          ) : state.phase === "success" ? (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l3 3 5-5" /></svg>
              Receipt created
            </>
          ) : (
            "Execute"
          )}
        </span>
      </button>

      {/* Error */}
      {state.phase === "error" && (
        <div className="rounded-xl border border-error/20 bg-error/5 p-4 animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-error/10 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-error">
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-text-secondary leading-relaxed">{state.message}</div>
              {state.retryable && (
                <button
                  onClick={handleRetry}
                  className="mt-2 text-xs text-text-tertiary hover:text-text underline underline-offset-2 cursor-pointer transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
      <path d="M12.5 7a5.5 5.5 0 00-5.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

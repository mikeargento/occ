"use client";

import { useState } from "react";
import { ToolRunner } from "@/components/ToolRunner";
import { ReceiptInspector } from "@/components/ReceiptInspector";

export interface ExecutionResult {
  output: {
    url: string;
    status: number;
    statusText: string;
    contentType: string;
    contentLength: number;
    headers: Record<string, string>;
    bodyPreview: string;
    fetchDuration: number;
  };
  executionEnvelope: {
    type: string;
    tool: string;
    toolVersion: string;
    runtime: string;
    adapter: string;
    inputHashB64: string;
    outputHashB64: string;
    timestamp: number;
  };
  envelopeDigestB64: string;
  occProof: Record<string, unknown> | null;
  occError: string | null;
  verification: { envelopeHashMatch: boolean } | null;
}

type Tab = "execute" | "inspect";

export default function Home() {
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("execute");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] mb-3">
          OCC Agent
        </h1>
        <p className="text-text-secondary text-[15px] leading-relaxed max-w-lg">
          Run a tool. Get a portable cryptographic receipt.
          Input and output are hashed, sealed in an execution envelope, and committed through OCC.
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-8">
        <div className="flex gap-1 p-1 rounded-xl bg-bg-elevated border border-border-subtle">
          <button
            onClick={() => setActiveTab("execute")}
            className={`flex-1 h-11 rounded-lg text-sm font-sans font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === "execute"
                ? "bg-bg text-text shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Run
          </button>
          <button
            onClick={() => setActiveTab("inspect")}
            className={`flex-1 h-11 rounded-lg text-sm font-sans font-semibold transition-all duration-200 cursor-pointer relative ${
              activeTab === "inspect"
                ? "bg-bg text-text shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Receipt
            {result && activeTab !== "inspect" && (
              <span className="absolute top-2.5 right-[calc(50%-36px)] w-1.5 h-1.5 rounded-full bg-success" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === "execute" && (
        <div className="space-y-4 animate-slide-up">
          <ToolRunner onResult={(r) => { setResult(r); setActiveTab("inspect"); window.scrollTo({ top: 0 }); }} />
        </div>
      )}
      {activeTab === "inspect" && (
        <div className="space-y-4 animate-slide-up">
          <ReceiptInspector result={result} onBack={() => setActiveTab("execute")} />
        </div>
      )}

      {/* Execution flow */}
      <div className="mt-12">
        <div className="rounded-xl border border-border-subtle bg-bg-elevated p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-text-tertiary mb-4">
            What happens when you run a tool
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-tertiary flex-wrap">
            <StepPill>input</StepPill>
            <Arrow />
            <StepPill>normalize</StepPill>
            <Arrow />
            <StepPill>hash</StepPill>
            <Arrow />
            <StepPill>execute</StepPill>
            <Arrow />
            <StepPill>envelope</StepPill>
            <Arrow />
            <StepPill className="text-accent border-accent/20">commit</StepPill>
            <Arrow />
            <StepPill className="text-success border-success/20">receipt</StepPill>
          </div>
          <div className="mt-4 space-y-1.5">
            <p className="text-[11px] text-text-tertiary leading-relaxed">
              Only the SHA-256 digest of the execution envelope is committed through OCC.
            </p>
            <p className="text-[11px] text-text-tertiary leading-relaxed">
              Raw input, output, and response data never leave your environment.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function StepPill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`px-2 py-1 rounded-md border border-border-subtle bg-bg-subtle/50 ${className}`}>
      {children}
    </span>
  );
}

function Arrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-tertiary/50 shrink-0">
      <path d="M3 2l4 3-4 3" />
    </svg>
  );
}

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
        <p className="text-text-secondary text-[15px] leading-relaxed">
          Run tools with portable, cryptographic execution receipts.
          Every call is hashed, committed through OCC, and returned with a verifiable proof.
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
            Execute
          </button>
          <button
            onClick={() => setActiveTab("inspect")}
            className={`flex-1 h-11 rounded-lg text-sm font-sans font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === "inspect"
                ? "bg-bg text-text shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Receipt
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === "execute" && (
        <div className="space-y-4 animate-slide-up">
          <ToolRunner onResult={(r) => { setResult(r); setActiveTab("inspect"); }} />
        </div>
      )}
      {activeTab === "inspect" && (
        <div className="space-y-4 animate-slide-up">
          <ReceiptInspector result={result} onBack={() => setActiveTab("execute")} />
        </div>
      )}

      {/* Execution flow */}
      <div className="mt-12">
        <div className="text-xs font-semibold uppercase tracking-[0.15em] text-text-secondary mb-4">
          Execution Flow
        </div>
        <div className="rounded-xl border border-border-subtle bg-bg-elevated p-5">
          <div className="flex items-center justify-between text-[11px] font-mono text-text-tertiary">
            <span>input</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary shrink-0"><path d="M4 2l4 4-4 4" /></svg>
            <span>hash</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary shrink-0"><path d="M4 2l4 4-4 4" /></svg>
            <span>execute</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary shrink-0"><path d="M4 2l4 4-4 4" /></svg>
            <span>envelope</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary shrink-0"><path d="M4 2l4 4-4 4" /></svg>
            <span className="text-accent">commit</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary shrink-0"><path d="M4 2l4 4-4 4" /></svg>
            <span className="text-success">receipt</span>
          </div>
          <p className="text-[11px] text-text-tertiary mt-3 leading-relaxed">
            Only the SHA-256 digest of the execution envelope is committed. Raw data stays local.
          </p>
        </div>
      </div>
    </main>
  );
}

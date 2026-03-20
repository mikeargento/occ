"use client";

import { useState } from "react";

export function SignerToggle({ onChange }: { onChange?: (mode: "local" | "tee") => void }) {
  const [mode, setMode] = useState<"local" | "tee">("local");

  function toggle(m: "local" | "tee") {
    setMode(m);
    onChange?.(m);
  }

  return (
    <div className="inline-flex items-center rounded-full border border-border-subtle bg-bg-elevated p-1 gap-0.5">
      <button
        onClick={() => toggle("local")}
        className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
          mode === "local"
            ? "bg-text text-bg shadow-sm"
            : "text-text-tertiary hover:text-text"
        }`}
      >
        Local Signing
      </button>
      <button
        onClick={() => toggle("tee")}
        className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
          mode === "tee"
            ? "bg-text text-bg shadow-sm"
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

export function InteractiveSignerSection() {
  const [mode, setMode] = useState<"local" | "tee">("local");

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated p-8 sm:p-10 mb-20 sm:mb-28">
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
        <div className="rounded-lg bg-bg p-4">
          <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-2">
            {mode === "local" ? "bash" : "bash"}
          </div>
          <pre className="text-sm font-mono text-text-secondary overflow-x-auto">
            <code>{mode === "local"
              ? `npx occ-mcp-proxy --wrap npx <server>

# Default: local Ed25519 signing
# Proofs in ./proof.jsonl`
              : `npx occ-mcp-proxy --wrap --signer occ-cloud npx <server>

# Hardware-attested via Nitro Enclave
# Only a hash is sent for signing`
            }</code>
          </pre>
        </div>
        <div className="rounded-lg bg-bg p-4">
          <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-2">
            claude desktop config
          </div>
          <pre className="text-sm font-mono text-text-secondary overflow-x-auto">
            <code>{mode === "local"
              ? `{
  "command": "npx",
  "args": ["occ-mcp-proxy", "--wrap",
    "npx", "<your-server>"]
}`
              : `{
  "command": "npx",
  "args": ["occ-mcp-proxy", "--wrap",
    "--signer", "occ-cloud",
    "npx", "<your-server>"]
}`
            }</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

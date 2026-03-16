"use client";

import { useState, useEffect, useCallback } from "react";

interface HealthCheck {
  status: "checking" | "online" | "offline";
  latencyMs: number | null;
  checkedAt: Date | null;
}

const TEE_ENDPOINT = "https://nitro.occproof.com";

// Known enclave measurement from our deployed image
const ENCLAVE_MEASUREMENT =
  "8db9ab687fd5f66d813cdcd813e09c7c88f10a9d729f012056bf9914df8975baa40f2a65009517c712241c2fc66cd19d";

export function TeeStatus() {
  const [health, setHealth] = useState<HealthCheck>({
    status: "checking",
    latencyMs: null,
    checkedAt: null,
  });
  const [expanded, setExpanded] = useState(false);

  const checkHealth = useCallback(async () => {
    setHealth((h) => ({ ...h, status: "checking" }));
    const start = performance.now();
    try {
      const res = await fetch(`${TEE_ENDPOINT}/health`, { cache: "no-store" });
      const latency = Math.round(performance.now() - start);
      if (res.ok) {
        setHealth({ status: "online", latencyMs: latency, checkedAt: new Date() });
      } else {
        setHealth({ status: "offline", latencyMs: null, checkedAt: new Date() });
      }
    } catch {
      setHealth({ status: "offline", latencyMs: null, checkedAt: new Date() });
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const statusColor =
    health.status === "online"
      ? "bg-emerald-500"
      : health.status === "checking"
        ? "bg-amber-400"
        : "bg-red-500";

  const statusLabel =
    health.status === "online"
      ? "Enclave Online"
      : health.status === "checking"
        ? "Checking..."
        : "Enclave Offline";

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="relative flex h-2.5 w-2.5">
            {health.status === "online" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${statusColor}`} />
          </div>
          <span className="text-sm font-semibold text-text">{statusLabel}</span>
        </div>
        {health.latencyMs !== null && (
          <span className="text-[10px] font-mono text-text-tertiary">{health.latencyMs}ms</span>
        )}
      </div>

      {/* Info grid */}
      <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <InfoRow label="Environment" value="AWS Nitro Enclave" />
        <InfoRow label="Region" value="us-east-2" />
        <InfoRow label="Enforcement" value="measured-tee" />
        <InfoRow label="Attestation" value="aws-nitro" />
        <InfoRow label="Signing" value="Ed25519" />
        <InfoRow label="Endpoint" value="nitro.occproof.com" mono />
      </div>

      {/* Expandable measurement */}
      <div className="border-t border-border-subtle">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-bg-subtle/30 transition-colors"
        >
          <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-medium">
            Enclave Measurement (PCR0)
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            className={`text-text-tertiary transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M2 4.5l4 4 4-4" />
          </svg>
        </button>

        <div
          className={`grid transition-all duration-300 ease-in-out ${
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="px-5 pb-4 space-y-3">
              <code className="block text-[10px] font-mono text-emerald-400/90 leading-relaxed break-all bg-bg-subtle/50 rounded-lg p-3">
                {ENCLAVE_MEASUREMENT}
              </code>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                This SHA-384 hash uniquely identifies the code running inside the enclave.
                It&apos;s included in every AWS Nitro attestation report, allowing independent
                verification that the signing key never leaves the hardware-isolated environment.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-between">
        <span className="text-[10px] text-text-tertiary">
          {health.checkedAt
            ? `Checked ${health.checkedAt.toLocaleTimeString()}`
            : "Checking..."}
        </span>
        <button
          onClick={checkHealth}
          disabled={health.status === "checking"}
          className="text-[10px] font-medium text-text-tertiary hover:text-text transition-colors disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-0.5">{label}</div>
      <div className={`text-xs text-text-secondary ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

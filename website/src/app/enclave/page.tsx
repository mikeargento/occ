"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const TEE_ENDPOINT = "https://nitro.occproof.com";

const ENCLAVE_MEASUREMENT =
  "8db9ab687fd5f66d813cdcd813e09c7c88f10a9d729f012056bf9914df8975baa40f2a65009517c712241c2fc66cd19d";

interface HealthCheck {
  status: "checking" | "online" | "offline";
  latencyMs: number | null;
  checkedAt: Date | null;
}

interface KeyInfo {
  publicKeyB64: string | null;
  measurement: string | null;
  enforcement: string | null;
  epochId: string | null;
  counter: string | null;
}

function StatusDot({ status }: { status: "checking" | "online" | "offline" }) {
  const color =
    status === "online"
      ? "bg-emerald-500"
      : status === "checking"
        ? "bg-amber-400"
        : "bg-red-500";
  return (
    <div className="relative flex h-3 w-3">
      {status === "online" && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      )}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${color}`} />
    </div>
  );
}

function InfoCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border-subtle bg-bg-elevated p-6 ${className}`}>
      <h3 className="text-xs uppercase tracking-wider text-text-tertiary font-medium mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DataRow({
  label,
  value,
  mono,
  description,
}: {
  label: string;
  value: string;
  mono?: boolean;
  description?: string;
}) {
  return (
    <div className="py-3 border-b border-border-subtle last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm text-text-secondary">{label}</div>
        <div
          className={`text-sm text-text text-right ${mono ? "font-mono" : "font-medium"}`}
        >
          {value}
        </div>
      </div>
      {description && (
        <p className="mt-1.5 text-xs text-text-tertiary leading-relaxed">{description}</p>
      )}
    </div>
  );
}

export default function EnclavePage() {
  const [health, setHealth] = useState<HealthCheck>({
    status: "checking",
    latencyMs: null,
    checkedAt: null,
  });
  const [keyInfo, setKeyInfo] = useState<KeyInfo>({
    publicKeyB64: null,
    measurement: null,
    enforcement: null,
    epochId: null,
    counter: null,
  });
  const [pcrExpanded, setPcrExpanded] = useState(true);

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

  const fetchKeyInfo = useCallback(async () => {
    try {
      const res = await fetch(`${TEE_ENDPOINT}/key`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setKeyInfo({
          publicKeyB64: data.publicKeyB64 ?? null,
          measurement: data.measurement ?? null,
          enforcement: data.enforcement ?? null,
          epochId: data.epochId ?? null,
          counter: data.counter ?? null,
        });
      }
    } catch {
      // silently fail — health check covers status
    }
  }, []);

  useEffect(() => {
    checkHealth();
    fetchKeyInfo();
    const interval = setInterval(() => {
      checkHealth();
      fetchKeyInfo();
    }, 30000);
    return () => clearInterval(interval);
  }, [checkHealth, fetchKeyInfo]);

  const statusLabel =
    health.status === "online"
      ? "Enclave Online"
      : health.status === "checking"
        ? "Checking..."
        : "Enclave Offline";

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="pt-28 sm:pt-32 pb-12">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex items-center gap-4 mb-6">
            <StatusDot status={health.status} />
            <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-text">
              {statusLabel}
            </h1>
            {health.latencyMs !== null && (
              <span className="text-sm font-mono text-text-tertiary">{health.latencyMs}ms</span>
            )}
          </div>
          <p className="text-lg text-text-secondary max-w-3xl">
            Every ProofStudio proof is signed inside an AWS Nitro Enclave.
            The Ed25519 signing key is generated in enclave memory on boot and never
            leaves the hardware-isolated environment. Every response includes a
            cryptographic attestation report from the Nitro Security Module.
          </p>
          <div className="mt-6 flex items-center gap-4">
            <span className="text-xs text-text-tertiary">
              {health.checkedAt
                ? `Last checked ${health.checkedAt.toLocaleTimeString()}`
                : "Checking..."}
            </span>
            <button
              onClick={() => {
                checkHealth();
                fetchKeyInfo();
              }}
              disabled={health.status === "checking"}
              className="text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Live enclave data */}
      <section className="pb-16">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Identity */}
            <InfoCard title="Enclave Identity">
              <DataRow
                label="Public Key (Ed25519)"
                value={keyInfo.publicKeyB64 ?? "Loading..."}
                mono
                description="Generated in enclave memory on boot. Changes on every restart. This key signs every proof."
              />
              <DataRow
                label="Epoch ID"
                value={keyInfo.epochId ? `${keyInfo.epochId.slice(0, 32)}...` : "Loading..."}
                mono
                description="Unique identifier for this enclave lifecycle. Derived from SHA-256(publicKey + bootNonce)."
              />
              <DataRow
                label="Proof Counter"
                value={keyInfo.counter ?? "Loading..."}
                mono
                description="Monotonically increasing counter. Each proof gets a unique counter value. Never decrements."
              />
            </InfoCard>

            {/* Infrastructure */}
            <InfoCard title="Infrastructure">
              <DataRow label="Provider" value="Amazon Web Services" />
              <DataRow
                label="Environment"
                value="Nitro Enclave"
                description="Hardware-isolated VM with no persistent storage, no network access, no interactive login."
              />
              <DataRow label="Region" value="us-east-2 (Ohio)" />
              <DataRow label="Enclave CPU" value="2 vCPUs" />
              <DataRow label="Enclave Memory" value="1024 MB" />
              <DataRow label="Endpoint" value="nitro.occproof.com" mono />
            </InfoCard>

            {/* Cryptography */}
            <InfoCard title="Cryptography">
              <DataRow
                label="Signing Algorithm"
                value="Ed25519"
                description="EdDSA over Curve25519. 256-bit security. Deterministic signatures with no random nonce needed."
              />
              <DataRow
                label="Hash Algorithm"
                value="SHA-256"
                description="Used for artifact digests, proof chain hashes, epoch ID derivation, and slot binding."
              />
              <DataRow
                label="Canonical Serialization"
                value="Sorted-key JSON"
                description="Deterministic JSON encoding: keys sorted lexicographically, no whitespace. Ensures identical bytes for identical data."
              />
              <DataRow
                label="Nonce Source"
                value="NSM Hardware RNG"
                description="Nonces sourced from the Nitro Security Module's hardware random number generator. 256-bit (32 bytes)."
              />
              <DataRow
                label="Library"
                value="@noble/ed25519"
                mono
                description="Audited, zero-dependency JavaScript implementation. No native bindings, no OpenSSL."
              />
            </InfoCard>

            {/* Attestation */}
            <InfoCard title="Attestation">
              <DataRow
                label="Format"
                value="aws-nitro"
                description="COSE Sign1 structure containing CBOR-encoded attestation document from the Nitro Security Module."
              />
              <DataRow
                label="Enforcement"
                value={keyInfo.enforcement ?? "measured-tee"}
                description="Indicates proofs are signed inside a measured Trusted Execution Environment, not software-only."
              />
              <DataRow
                label="Certificate Chain"
                value="AWS Nitro root → zonal → instance → enclave"
                description="Four-level certificate chain rooted at AWS Nitro Enclaves root CA. Verifiable against AWS public root."
              />
              <DataRow
                label="User Data"
                value="SHA-256 of signed proof body"
                description="The attestation document binds to the specific proof being signed via user_data field."
              />
            </InfoCard>
          </div>
        </div>
      </section>

      {/* PCR Measurement */}
      <section className="pb-16">
        <div className="mx-auto max-w-5xl px-6">
          <InfoCard title="Enclave Measurement (PCR0)" className="overflow-hidden">
            <button
              onClick={() => setPcrExpanded(!pcrExpanded)}
              className="w-full flex items-center justify-between text-left mb-4"
            >
              <span className="text-sm font-medium text-text">Platform Configuration Register 0</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="currentColor"
                className={`text-text-tertiary transition-transform duration-200 ${pcrExpanded ? "rotate-180" : ""}`}
              >
                <path d="M3 5.5l4 4 4-4" />
              </svg>
            </button>

            {pcrExpanded && (
              <div className="space-y-6">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-2">
                    Build-time measurement (from EIF image)
                  </div>
                  <code className="block text-xs font-mono text-emerald-400/90 leading-relaxed break-all bg-bg-subtle/50 rounded-lg p-4">
                    {ENCLAVE_MEASUREMENT}
                  </code>
                </div>

                {keyInfo.measurement && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-2">
                      Live measurement (from running enclave)
                    </div>
                    <code className="block text-xs font-mono text-emerald-400/90 leading-relaxed break-all bg-bg-subtle/50 rounded-lg p-4">
                      {keyInfo.measurement}
                    </code>
                    <div className="mt-2 flex items-center gap-2">
                      {keyInfo.measurement === ENCLAVE_MEASUREMENT ? (
                        <>
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-xs text-emerald-400">
                            Match confirmed — running enclave matches published measurement
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="text-xs text-red-400">
                            Mismatch — enclave measurement differs from published value
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t border-border-subtle pt-4">
                  <p className="text-xs text-text-tertiary leading-relaxed mb-3">
                    PCR0 is a SHA-384 hash of the Enclave Image File (EIF). It uniquely
                    identifies the exact code, dependencies, and configuration running inside
                    the enclave. This value is embedded in every AWS Nitro attestation report,
                    creating a verifiable chain from proof → attestation → enclave code.
                  </p>
                  <p className="text-xs text-text-tertiary leading-relaxed">
                    If the enclave code changes for any reason — a dependency update, a bug fix,
                    a configuration change — the PCR0 value changes. Any proof signed by a different
                    measurement can be detected and flagged.
                  </p>
                </div>
              </div>
            )}
          </InfoCard>
        </div>
      </section>

      {/* API Endpoints */}
      <section className="pb-16">
        <div className="mx-auto max-w-5xl px-6">
          <InfoCard title="Enclave API Endpoints">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left text-xs uppercase tracking-wider text-text-tertiary font-medium pb-3 pr-4">Endpoint</th>
                    <th className="text-left text-xs uppercase tracking-wider text-text-tertiary font-medium pb-3 pr-4">Method</th>
                    <th className="text-left text-xs uppercase tracking-wider text-text-tertiary font-medium pb-3 pr-4">Auth</th>
                    <th className="text-left text-xs uppercase tracking-wider text-text-tertiary font-medium pb-3">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { endpoint: "/commit", method: "POST", auth: "API Key", purpose: "Submit artifact digest(s), receive signed OCC proof with attestation" },
                    { endpoint: "/allocate-slot", method: "POST", auth: "Public", purpose: "Pre-allocate a causal slot (nonce-first 2-RTT protocol)" },
                    { endpoint: "/challenge", method: "POST", auth: "Public", purpose: "Request fresh enclave nonce for WebAuthn/passkey authorization" },
                    { endpoint: "/key", method: "GET", auth: "Public", purpose: "Get current public key, measurement, enforcement mode, epoch ID" },
                    { endpoint: "/verify", method: "POST", auth: "Public", purpose: "Verify a proof signature against the enclave policy" },
                    { endpoint: "/health", method: "GET", auth: "Public", purpose: "Health check — returns status, counter, measurement" },
                  ].map((row) => (
                    <tr key={row.endpoint} className="border-b border-border-subtle last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs text-emerald-400/90">{row.endpoint}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-text-secondary">{row.method}</td>
                      <td className="py-3 pr-4 text-xs text-text-secondary">{row.auth}</td>
                      <td className="py-3 text-xs text-text-tertiary">{row.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </InfoCard>
        </div>
      </section>

      {/* Security Architecture */}
      <section className="pb-16">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Isolation */}
            <InfoCard title="Isolation Guarantees">
              <div className="space-y-4">
                {[
                  {
                    title: "No persistent storage",
                    desc: "Enclave has no disk. All state (keys, counters, pending slots) exists only in memory. Reboot = new identity.",
                  },
                  {
                    title: "No network access",
                    desc: "Enclave cannot make outbound connections. All communication goes through a vsock channel to the parent EC2 instance.",
                  },
                  {
                    title: "No interactive access",
                    desc: "No SSH, no console, no debugger. The only interface is the vsock API. Even the host operator cannot inspect enclave memory.",
                  },
                  {
                    title: "No key extraction",
                    desc: "The Ed25519 private key is generated inside the enclave and never serialized, exported, or transmitted. It exists only as bytes in enclave RAM.",
                  },
                  {
                    title: "Measured boot",
                    desc: "The enclave image is hashed at load time by the Nitro hypervisor. The resulting PCR0 measurement is included in every attestation report.",
                  },
                ].map((item) => (
                  <div key={item.title}>
                    <div className="text-sm font-medium text-text mb-1">{item.title}</div>
                    <p className="text-xs text-text-tertiary leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </InfoCard>

            {/* Proof Chain */}
            <InfoCard title="Proof Chain Architecture">
              <div className="space-y-4">
                {[
                  {
                    title: "Monotonic counter",
                    desc: "Each proof increments a counter that never decreases within an epoch. Gaps or decrements indicate tampering or enclave restart.",
                  },
                  {
                    title: "Hash chain (prevB64)",
                    desc: "Each proof includes the SHA-256 hash of the previous proof's canonical form. Fork-detectable: any chain branching creates conflicting prevB64 values.",
                  },
                  {
                    title: "Epoch identity",
                    desc: "Derived from SHA-256(publicKey + bootNonce). Uniquely identifies one enclave lifecycle. Changes on every restart, making epoch boundaries explicit.",
                  },
                  {
                    title: "Causal slot allocation",
                    desc: "Two-round-trip protocol: allocate a slot (gets nonce + counter), then commit with slot binding. Proves the slot existed before the commit.",
                  },
                  {
                    title: "Attestation binding",
                    desc: "The SHA-256 hash of the signed proof body is passed as user_data to the NSM attestation request, binding the attestation to the specific proof.",
                  },
                ].map((item) => (
                  <div key={item.title}>
                    <div className="text-sm font-medium text-text mb-1">{item.title}</div>
                    <p className="text-xs text-text-tertiary leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </InfoCard>
          </div>
        </div>
      </section>

      {/* Agency / Passkey */}
      <section className="pb-16">
        <div className="mx-auto max-w-5xl px-6">
          <InfoCard title="Agency Authorization (WebAuthn / Passkey)">
            <p className="text-sm text-text-secondary leading-relaxed mb-6">
              ProofStudio supports binding proofs to a specific human identity via
              WebAuthn passkeys. The enclave issues a challenge, the user signs it
              with their device biometric, and the authorization is embedded in the proof.
            </p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1">
              <DataRow label="Authorization Protocol" value="occ/commit-authorize/v1" mono />
              <DataRow label="Signature Algorithm" value="ES256 (P-256)" />
              <DataRow label="WebAuthn Format" value="Standard assertion" />
              <DataRow label="Challenge TTL" value="60 seconds" />
              <DataRow label="Key ID Derivation" value="SHA-256(SPKI DER pubkey)" mono />
              <DataRow label="Required Flags" value="UP + UV (user present + verified)" />
            </div>
          </InfoCard>
        </div>
      </section>

      {/* Build & Deploy */}
      <section className="pb-16">
        <div className="mx-auto max-w-5xl px-6">
          <InfoCard title="Build & Deployment">
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1">
              <DataRow label="Base Image" value="node:20-alpine" mono />
              <DataRow label="Build" value="Multi-stage Docker → EIF" />
              <DataRow label="Enclave Builder" value="nitro-cli build-enclave" mono />
              <DataRow label="Runtime" value="Node.js 20 (ESM)" />
              <DataRow label="IPC" value="vsock (CID:5000) → Unix socket" />
              <DataRow label="Bridge" value="socat" mono />
              <DataRow label="Parent Server" value="HTTPS on port 8080" />
              <DataRow label="Image Processing" value="sharp (libvips)" mono />
            </div>
            <div className="mt-6 border-t border-border-subtle pt-4">
              <p className="text-xs text-text-tertiary leading-relaxed">
                The enclave image is built as a standard Docker container, then converted
                to an EIF (Enclave Image File) using the AWS Nitro CLI. The conversion
                process hashes the entire image, producing the PCR0 measurement. The parent
                EC2 instance runs the HTTPS API and bridges requests to the enclave via
                vsock. The enclave has no direct network access — all external
                communication (timestamps, client responses) is proxied through the parent.
              </p>
            </div>
          </InfoCard>
        </div>
      </section>

      {/* Verification */}
      <section className="pb-28">
        <div className="mx-auto max-w-5xl px-6">
          <InfoCard title="How to Verify">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-text mb-1">1. Check the measurement</div>
                <p className="text-xs text-text-tertiary leading-relaxed">
                  Compare the PCR0 value in the proof&apos;s attestation report against the
                  published measurement above. If they match, the proof was signed by this
                  exact enclave image.
                </p>
              </div>
              <div>
                <div className="text-sm font-medium text-text mb-1">2. Verify the signature</div>
                <p className="text-xs text-text-tertiary leading-relaxed">
                  Extract the Ed25519 public key and signature from the proof. Reconstruct
                  the canonical signed body and verify the signature using any Ed25519 library.
                </p>
              </div>
              <div>
                <div className="text-sm font-medium text-text mb-1">3. Validate the attestation</div>
                <p className="text-xs text-text-tertiary leading-relaxed">
                  Decode the COSE Sign1 attestation document. Verify the certificate chain
                  against the AWS Nitro Enclaves root CA. Confirm the user_data matches
                  the SHA-256 hash of the proof&apos;s signed body.
                </p>
              </div>
              <div>
                <div className="text-sm font-medium text-text mb-1">4. Check the chain</div>
                <p className="text-xs text-text-tertiary leading-relaxed">
                  Verify counter monotonicity and prevB64 chain integrity across consecutive
                  proofs from the same epoch. Any gap, decrement, or hash mismatch indicates
                  tampering.
                </p>
              </div>
              <div className="pt-4 border-t border-border-subtle flex flex-wrap gap-4">
                <Link
                  href="/studio"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98]"
                >
                  Try ProofStudio
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-6 text-sm font-semibold text-text-secondary transition-all hover:text-text hover:border-text-tertiary active:scale-[0.98]"
                >
                  Read the Docs
                </Link>
              </div>
            </div>
          </InfoCard>
        </div>
      </section>
    </div>
  );
}

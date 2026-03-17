"use client";

import Link from "next/link";
import { ScrollReveal } from "@/components/scroll-reveal";
import { useState, useEffect, useCallback } from "react";

const TEE_ENDPOINT = "https://nitro.occproof.com";
const ENCLAVE_MEASUREMENT =
  "8db9ab687fd5f66d813cdcd813e09c7c88f10a9d729f012056bf9914df8975baa40f2a65009517c712241c2fc66cd19d";

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`py-28 sm:py-32 ${className}`}>
      <div className="mx-auto max-w-6xl px-6">
        {children}
      </div>
    </section>
  );
}

/* ── Use Case Icons (24x24, stroke-based) ── */
const icons = {
  sparkles: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
      <path d="M19 15l.5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5.5-2z" />
    </svg>
  ),
  terminal: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  image: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  beaker: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6v7l5 8a1 1 0 01-.9 1.5H4.9A1 1 0 014 18l5-8V3z" />
      <line x1="9" y1="3" x2="15" y2="3" />
      <path d="M7 15h10" />
    </svg>
  ),
  shield: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  arrows: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <line x1="3" y1="5" x2="21" y2="5" />
      <polyline points="7 23 3 19 7 15" />
      <line x1="21" y1="19" x2="3" y2="19" />
    </svg>
  ),
};

/* ── Enclave info row ── */
function EnclaveRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span className={`text-xs text-text ${mono ? "font-mono" : "font-medium"}`}>{value}</span>
    </div>
  );
}

/* ── Live Enclave Panel ── */
function EnclavePanel() {
  const [health, setHealth] = useState<{
    status: "checking" | "online" | "offline";
    latencyMs: number | null;
    checkedAt: Date | null;
  }>({ status: "checking", latencyMs: null, checkedAt: null });

  const [keyInfo, setKeyInfo] = useState<{
    publicKeyB64: string | null;
    epochId: string | null;
    counter: string | null;
    measurement: string | null;
  }>({ publicKeyB64: null, epochId: null, counter: null, measurement: null });

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
          epochId: data.epochId ?? null,
          counter: data.counter ?? null,
          measurement: data.measurement ?? null,
        });
      }
    } catch { /* health check covers status */ }
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

  const statusColor =
    health.status === "online"
      ? "bg-emerald-500"
      : health.status === "checking"
        ? "bg-amber-400"
        : "bg-red-500";

  const statusLabel =
    health.status === "online"
      ? "Verified Enclave"
      : health.status === "checking"
        ? "Verifying..."
        : "Enclave Unreachable";

  const measurementMatch = keyInfo.measurement === ENCLAVE_MEASUREMENT;

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated p-8">
      {/* Status header */}
      <div className="flex items-center justify-between mb-8">
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
          <span className="text-xs font-mono text-text-tertiary">{health.latencyMs}ms</span>
        )}
      </div>

      {/* Info rows — grouped */}
      <div className="space-y-6">
        {/* Infrastructure */}
        <div className="space-y-2.5">
          <EnclaveRow label="Environment" value="AWS Nitro Enclave" />
          <EnclaveRow label="Region" value="us-east-2" />
          <EnclaveRow label="Endpoint" value="nitro.occproof.com" mono />
        </div>

        <div className="border-t border-border-subtle" />

        {/* Cryptography */}
        <div className="space-y-2.5">
          <EnclaveRow label="Signing" value="Ed25519" />
          <EnclaveRow label="Hash" value="SHA-256" />
          <EnclaveRow label="Attestation" value="aws-nitro" />
          <EnclaveRow label="Enforcement" value="measured-tee" />
        </div>

        <div className="border-t border-border-subtle" />

        {/* PCR0 Measurement */}
        <div>
          <div className="text-xs text-text-tertiary mb-2">Enclave Measurement</div>
          <code className="block text-sm font-mono text-emerald-400/80 leading-relaxed break-all">
            {ENCLAVE_MEASUREMENT}
          </code>
          {keyInfo.measurement && (
            <div className="mt-2 flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${measurementMatch ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className={`text-xs ${measurementMatch ? "text-emerald-400" : "text-red-400"}`}>
                {measurementMatch ? "Matches published build hash" : "Does not match published build hash"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-5 border-t border-border-subtle flex items-center justify-between">
        <span className="text-xs text-text-tertiary">
          {health.checkedAt
            ? `Checked ${health.checkedAt.toLocaleTimeString()}`
            : "Checking..."}
        </span>
        <button
          onClick={() => { checkHealth(); fetchKeyInfo(); }}
          disabled={health.status === "checking"}
          className="text-xs font-medium text-text-tertiary hover:text-text transition-colors disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative flex items-center justify-center overflow-hidden pt-28 sm:pt-32 pb-12 sm:pb-16">
        <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
          <h1
            className="hero-animate text-[clamp(2rem,6.5vw,4.5rem)] font-bold tracking-[-0.04em] leading-[1.08] whitespace-nowrap text-text"
            style={{ animationDelay: "0ms" }}
          >
            Prove anything digital
          </h1>

          <p
            className="hero-animate mt-7 sm:mt-8 text-[clamp(1.125rem,3.2vw,2.25rem)] font-bold tracking-[-0.02em] leading-[1.3] whitespace-nowrap text-text-secondary"
            style={{ animationDelay: "120ms" }}
          >
            No blockchain. No ledgers. Just proof.
          </p>

          <div
            className="hero-animate mt-10 sm:mt-12 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
            style={{ animationDelay: "240ms" }}
          >
            <Link
              href="/studio"
              className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl bg-emerald-600 px-8 text-sm font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98]"
            >
              Try ProofStudio
            </Link>
            <Link
              href="/agent"
              className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl border border-border px-8 text-sm font-semibold text-text-secondary transition-all hover:text-text hover:border-text-tertiary active:scale-[0.98]"
            >
              OCC Agent
            </Link>
          </div>
        </div>
      </section>


      {/* ── How It Works ── */}
      <Section className="!pt-16 sm:!pt-20">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="text-base sm:text-3xl font-semibold tracking-[-0.03em] text-text-secondary max-w-3xl mx-auto sm:text-balance">
              ProofStudio creates a cryptographic{" "}
              <br className="sm:hidden" />container that holds exactly one{" "}
              <br className="sm:hidden" />digital artifact or process.
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid sm:grid-cols-3 gap-8 max-w-5xl mx-auto">

          {[
            {
              step: "01",
              title: "Drop your artifact",
              desc: "Drag any file into ProofStudio. It\u2019s hashed locally in your browser. Nothing is uploaded.",
            },
            {
              step: "02",
              title: "Commit",
              desc: "Your artifact\u2019s fingerprint is sent to a secure environment and locked to a unique, unrepeatable commit event.",
            },
            {
              step: "03",
              title: "Receive proof",
              desc: "You get back a portable proof file: signed evidence that this exact artifact existed in this exact form, at that moment.",
            },
          ].map((item, i) => (
            <ScrollReveal key={item.step} delay={i * 100}>
              <div className="relative rounded-xl border border-border-subtle bg-bg-elevated p-8">
                <div className="text-2xl font-mono font-light text-text-tertiary mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold mb-3">{item.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>


      {/* ── What You Get ── */}
      <Section>
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <ScrollReveal>
            <EnclavePanel />
          </ScrollReveal>

          <ScrollReveal delay={150}>
            <div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] mb-4">
                Every proof is independently verifiable
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed mb-6">
                Proofs are produced inside the enclave and carry the artifact
                digest, commit metadata, Ed25519 signature, and Nitro
                attestation report. Verification requires nothing beyond the
                proof itself.
              </p>
              <div className="space-y-3">
                {[
                  { title: "Content-addressed", desc: "SHA-256 digest locks the proof to specific artifact bytes." },
                  { title: "Timestamped", desc: "RFC 3161 token from an independent timestamp authority." },
                  { title: "Hardware-attested", desc: "Nitro attestation report binds the signature to a measured enclave image." },
                  { title: "Device-authorized", desc: "WebAuthn assertion ties the commit to a hardware-bound passkey." },
                  { title: "Causally ordered", desc: "Monotonic counter and hash chain make gaps, forks, and reordering detectable." },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3 items-start">
                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <div>
                      <span className="text-sm font-semibold text-text">{item.title}</span>
                      <span className="text-sm text-text-secondary ml-1">· {item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </Section>


      {/* ── Use Cases ── */}
      <Section>
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em]">
              What can you prove?
            </h2>
            <p className="mt-3 text-2xl sm:text-3xl font-semibold tracking-[-0.03em] text-text-secondary">
              Everything.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              title: "AI Outputs",
              desc: "Prove model responses, generated images, and predictions came from a specific boundary at a specific time.",
              icon: icons.sparkles,
            },
            {
              title: "Software Builds",
              desc: "Prove a build artifact was produced by a specific CI/CD pipeline inside a measured environment.",
              icon: icons.terminal,
            },
            {
              title: "Media & Journalism",
              desc: "Prove a photo or document existed in its current form at a specific moment, before edits, before distribution.",
              icon: icons.image,
            },
            {
              title: "Scientific & Medical Data",
              desc: "Prove sensor readings, laboratory results, or medical records existed at capture time with sequence integrity.",
              icon: icons.beaker,
            },
            {
              title: "Security, Compliance & Audit",
              desc: "Produce tamper-evident security logs and audit records where any modification breaks the proof chain.",
              icon: icons.shield,
            },
            {
              title: "Agent-to-Agent",
              desc: "Pass proofs between systems so each can verify data integrity without trusting the transport.",
              icon: icons.arrows,
            },
          ].map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 80}>
              <div className="card-hover group rounded-xl border border-border-subtle bg-bg-elevated p-8 hover:border-border h-full">
                <div className="mb-4 text-text-tertiary group-hover:text-text-secondary transition-colors">
                  {item.icon}
                </div>
                <h3 className="text-base font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>


      {/* ── Powered by OCC ── */}
      <Section>
        <ScrollReveal>
          <div className="max-w-2xl mx-auto text-center">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-text-tertiary mb-6">
              Powered by
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] mb-6">
              Origin Controlled Computing
            </h2>
            <p className="text-text-secondary leading-relaxed text-balance">
              ProofStudio is built on the OCC protocol. Proof is produced by
              the commit event itself. If the proof exists, the commit happened.
              If it doesn&apos;t, it didn&apos;t.
            </p>
            <div className="mt-8">
              <Link
                href="/docs"
                className="text-sm font-medium text-text-secondary hover:text-text transition-colors"
              >
                Read the protocol documentation →
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </Section>


      {/* ── CTA ── */}
      <Section className="pb-40">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em]">
              Try it now
            </h2>
            <p className="mt-4 text-text-secondary max-w-lg mx-auto text-balance text-lg">
              Drop a file, get a proof. Runs in your browser, verifiable by anyone.
            </p>
            <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/studio"
                className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl bg-emerald-600 px-8 text-sm font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98]"
              >
                Open Studio
              </Link>
              <Link
                href="/api-reference"
                className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl border border-border px-8 text-sm font-semibold text-text-secondary transition-all hover:text-text hover:border-text-tertiary active:scale-[0.98]"
              >
                API Reference
              </Link>
              <a
                href="https://github.com/mikeargento/occ"
                target="_blank"
                rel="noopener"
                className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl border border-border px-8 text-sm font-semibold text-text-secondary transition-all hover:text-text hover:border-text-tertiary active:scale-[0.98]"
              >
                GitHub
              </a>
            </div>
          </div>
        </ScrollReveal>
      </Section>
    </>
  );
}

import Link from "next/link";
import { CommitPathDiagram } from "@/components/commit-path-diagram";

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`py-24 ${className}`}>
      <div className="mx-auto max-w-7xl px-6">
        {children}
      </div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary mb-6">
      {children}
    </span>
  );
}

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <Section className="pt-32 pb-20">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <Label>Origin Controlled Computing</Label>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1]">
              Proof should be a<br />
              property of creation,<br />
              not verification.
            </h1>
            <p className="mt-8 text-lg text-text-secondary max-w-2xl leading-relaxed">
              OCC is a protocol for portable cryptographic proof. Valid proof
              exists only if specific bytes were committed through an authorized
              execution boundary during a single atomic event.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/studio"
                className="inline-flex h-11 items-center rounded-md bg-text px-6 text-sm font-semibold text-bg transition-colors hover:opacity-85"
              >
                Try the Studio
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-semibold text-text-secondary transition-colors hover:text-text hover:border-text-tertiary"
              >
                Read the Docs
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle bg-bg-elevated overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-bg-subtle/50">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
              </div>
              <span className="text-[10px] font-mono text-text-tertiary ml-2">real occ/1 proof</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-4">
              <pre className="text-[11px] leading-relaxed font-mono text-text-secondary whitespace-pre-wrap break-all">{`{
  "version": "occ/1",
  "artifact": {
    "hashAlg": "sha256",
    "digestB64": "1oXnSsD9P2u/hIBwdVHQkXolHttaTx0pz5wBpuDxGmc="
  },
  "commit": {
    "nonceB64": "bK/titNXb1Z0Aqsy5pRAbc9XO49DQD+UXKIjKlAq3Ms=",
    "counter": "285",
    "time": 1773125708468,
    "epochId": "GR2bP/Kk6WEPtr2Ue51uR1ggNz9RYd8xsWsHg3lq8ts=",
    "prevB64": "1p3cG5AV2n7KrM9MOIW255m1a32SvKZCrU2hWGOctmg="
  },
  "signer": {
    "publicKeyB64": "F2mmwvNK+CY+U8yt2YAH/uThf8jU6HaLPK2N9PNKqUY=",
    "signatureB64": "45CzIRLSGFUFhRpYJ5iiwfnrEM0pxDM54mAA6kZrsp7VvjwyO2a/TSoMDSOUBzkFUNRGDcY2m7EjsOsd2jkeDQ=="
  },
  "environment": {
    "enforcement": "measured-tee",
    "measurement": "ac813febd1ac4261eff4a6c059f78a5ecfc8c577f4f709b3025862414be8f6d6736b1ddf0c2bfaed9c9d891d3b32a996",
    "attestation": {
      "format": "aws-nitro",
      "reportB64": "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"
    }
  },
  "timestamps": {
    "artifact": {
      "authority": "freetsa.org",
      "time": "2026-03-10T06:55:08Z",
      "tokenB64": "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",
      "digestAlg": "sha256",
      "digestB64": "1oXnSsD9P2u/hIBwdVHQkXolHttaTx0pz5wBpuDxGmc="
    },
    "proof": {
      "authority": "freetsa.org",
      "time": "2026-03-10T06:55:09Z",
      "tokenB64": "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",
      "digestAlg": "sha256",
      "digestB64": "s4OxY3zQ/4DhgchpAlmEC0j1AUYc2UsUDlKa/RtjpaA="
    }
  }
}`}</pre>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Problem ── */}
      <Section>
        <div className="grid lg:grid-cols-2 gap-16">
          <div>
            <Label>The Problem</Label>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-6">
              Computers create data first,<br />then try to prove it later.
            </h2>
            <p className="text-text-secondary leading-relaxed">
              Photos, documents, model outputs, logs, and files are created
              without structural proof. Only afterward do we attach signatures,
              metadata, timestamps, or registries.
            </p>
            <p className="mt-4 text-text-secondary leading-relaxed">
              By then, the artifact already exists. Proof becomes optional.
              Trust becomes something we attempt to recover after creation
              instead of something the system enforced at the moment the
              artifact came into&nbsp;being.
            </p>
          </div>
          <div className="flex items-center">
            <div className="w-full">
              <div className="rounded-md border border-border-subtle bg-bg-elevated px-5 py-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-text mb-2">Before OCC</div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Artifacts are created freely. Verification is applied later.
                  The trust model begins after the artifact already exists.
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-elevated px-5 py-4 mt-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-text mb-2">With OCC</div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Valid proof exists only because the system made it reachable
                  through a specific authorized boundary and commit path.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── The Shift ── */}
      <Section>
        <Label>The Shift</Label>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-6">
          OCC moves math to the commit path.
        </h2>
        <p className="text-text-secondary leading-relaxed max-w-2xl mb-6">
          Proof is not wrapped around an artifact after the fact. It is
          produced only when candidate bytes cross an authorized execution
          boundary and are committed through a protected path.
        </p>
        <CommitPathDiagram />
        <p className="mt-10 text-lg font-medium text-text/90 italic">
          If proof exists, the authorized commit path was traversed.
        </p>
      </Section>

      {/* ── How It Works ── */}
      <Section>
        <Label>How It Works</Label>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-12">
          One atomic event.
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Authorize",
              desc: "Candidate bytes enter a protected commit interface controlled by an authorized execution boundary.",
            },
            {
              step: "02",
              title: "Bind",
              desc: "Inside the boundary, the system computes a content-dependent hash and combines it with boundary-fresh cryptographic output.",
            },
            {
              step: "03",
              title: "Commit",
              desc: "The artifact and its proof are committed together. If the event does not occur, no valid proof can exist.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-lg border border-border-subtle bg-bg-elevated p-6"
            >
              <div className="text-xs font-mono text-text-tertiary mb-3">
                {item.step}
              </div>
              <h3 className="text-base font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Diagram */}
        <div className="mt-12 rounded-lg border border-border-subtle bg-bg-elevated p-6 sm:p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-md border border-border bg-bg px-6 py-3 text-center">
              <div className="text-xs font-medium text-text-tertiary">Input</div>
              <div className="text-sm font-medium mt-1">Candidate Bytes</div>
            </div>
            <div className="text-text-tertiary text-lg">↓</div>
            <div className="max-w-xl w-full rounded-md border border-border relative px-4 sm:px-6 py-8">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-bg-elevated px-3 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary border border-border rounded whitespace-nowrap">
                Protected Boundary
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["Authorize", "Nonce", "Bind", "Commit"].map((s) => (
                  <div key={s} className="rounded bg-bg-subtle border border-border-subtle px-3 py-2 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider">{s}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-text-tertiary text-lg">↓</div>
            <div className="rounded-md border border-border bg-bg px-6 py-3 text-center">
              <div className="text-xs font-medium text-text-tertiary">Output</div>
              <div className="text-sm font-medium mt-1">Artifact + Proof</div>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-sm font-medium text-text-tertiary">
          Proof is caused, not added.
        </p>
      </Section>

      {/* ── What OCC Is Not ── */}
      <Section>
        <Label>Distinctions</Label>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-8">
          What OCC is not.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { title: "Not a blockchain", desc: "No distributed consensus, no global ledger, no tokens. OCC constrains a single execution boundary." },
            { title: "Not a watermark", desc: "OCC does not embed anything in the artifact. It produces a separate, portable proof object." },
            { title: "Not DRM", desc: "OCC does not prevent copying. It prevents the authoritative proof lineage from being duplicated." },
            { title: "Not proof of truth", desc: "OCC proves a commit event happened, not that the content is true or accurate." },
            { title: "Not proof of authorship", desc: "OCC proves which boundary committed an artifact, not who created the underlying content." },
            { title: "Not a replacement for attestation", desc: "Attestation is evidence that OCC carries. OCC is the proof architecture attestation fits into." },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border-subtle p-5">
              <h3 className="text-sm font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Use Cases ── */}
      <Section>
        <Label>Applications</Label>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-8">
          Where proof-at-creation matters.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: "AI Outputs", desc: "Commit model responses, generated images, and predictions with proof of which model, version, and boundary produced them." },
            { title: "Software Pipelines", desc: "Prove a build artifact or deployment was produced by a specific CI/CD pipeline run inside a measured environment." },
            { title: "Journalism & Media", desc: "Prove a file was captured or committed by a specific device or system at a specific time." },
            { title: "Scientific Data", desc: "Commit sensor readings, lab results, and instrument output with proof of origin and ordering." },
            { title: "Compliance & Audit", desc: "Produce tamper-evident log chains where any modification or insertion is detectable." },
            { title: "Agent-to-Agent", desc: "Pass proofs between AI agents so each can verify data integrity without trusting the transport." },
          ].map((item) => (
            <div key={item.title} className="group rounded-lg border border-border-subtle bg-bg-elevated p-6 transition-colors hover:border-border">
              <h3 className="text-base font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Link href="/use-cases" className="text-sm text-text-secondary hover:text-text transition-colors">
            Explore all use cases →
          </Link>
        </div>
      </Section>

      {/* ── Proof Anatomy Preview ── */}
      <Section>
        <Label>Proof Structure</Label>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-8">
          Anatomy of an OCC proof.
        </h2>
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <div className="rounded-lg border border-border-subtle bg-bg-elevated p-6 overflow-x-auto">
            <pre className="text-xs leading-relaxed font-mono text-text-secondary">
{`{
  "version": "occ/1",
  "artifact": {
    "hashAlg": "sha256",
    "digestB64": "u4eMAiu6Qg..."
  },
  "commit": {
    "nonceB64": "gTME79qH3f...",
    "counter": "277",
    "time": 1741496392841,
    "epochId": "a1b2c3d4...",
    "prevB64": "0Jtvab46u7..."
  },
  "signer": {
    "publicKeyB64": "MFkwEwYH...",
    "signatureB64": "MEUCIQD..."
  },
  "environment": {
    "enforcement": "measured-tee",
    "measurement": "ac813febd1ac...",
    "attestation": {
      "format": "aws-nitro",
      "reportB64": "..."
    }
  },
  "timestamps": { ... }
}`}
            </pre>
          </div>
          <div className="space-y-4">
            {[
              { field: "artifact", desc: "SHA-256 digest of the original bytes. The core binding between proof and content." },
              { field: "commit", desc: "Boundary-fresh nonce, monotonic counter, epoch identity, and chain link. The ordered commit event." },
              { field: "signer", desc: "Ed25519 public key and signature covering the canonical signed body." },
              { field: "environment", desc: "Enforcement tier, platform measurement (PCR0), and hardware attestation report." },
              { field: "timestamps", desc: "RFC 3161 TSA timestamps from an independent time authority. Advisory, not signed." },
            ].map((item) => (
              <div key={item.field} className="rounded-lg border border-border-subtle p-4">
                <code className="text-xs font-mono font-semibold text-accent">{item.field}</code>
                <p className="text-sm text-text-secondary leading-relaxed mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── CTA ── */}
      <Section border className="pb-32">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
            Try it now.
          </h2>
          <p className="text-text-secondary mb-8 max-w-lg mx-auto">
            Drop a file in the Studio. Your browser hashes it locally, an AWS
            Nitro Enclave signs it, and you get a real proof back in seconds.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/studio"
              className="inline-flex h-11 items-center rounded-md bg-text px-6 text-sm font-semibold text-bg transition-colors hover:opacity-85"
            >
              Open Studio
            </Link>
            <Link
              href="/api-reference"
              className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-semibold text-text-secondary transition-colors hover:text-text hover:border-text-tertiary"
            >
              API Reference
            </Link>
            <a
              href="https://github.com/mikeargento/occ"
              target="_blank"
              rel="noopener"
              className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-semibold text-text-secondary transition-colors hover:text-text hover:border-text-tertiary"
            >
              GitHub
            </a>
          </div>
        </div>
      </Section>
    </>
  );
}

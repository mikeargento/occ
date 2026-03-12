import Link from "next/link";

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

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <Section className="pt-32 pb-20">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-[clamp(1.75rem,3.8vw,3.5rem)] font-semibold tracking-tight leading-[1.15] whitespace-nowrap">
            Cryptographic proof for digital artifacts
          </h1>
          <p className="mt-6 text-[clamp(1.75rem,3.8vw,3.5rem)] font-semibold tracking-tight text-text-secondary leading-[1.2]">
            No blockchain. No ledgers. Just proof.
          </p>
          <p className="mt-4 text-lg text-text-tertiary tracking-tight text-balance">
            Establish provable control over any digital artifact: photos, videos, songs, documents, medical records, datasets, AI outputs, code, designs, and more.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/studio"
              className="inline-flex h-11 items-center rounded-md bg-text px-6 text-sm font-semibold text-bg transition-colors hover:opacity-85"
            >
              Try ProofStudio
            </Link>
            <Link
              href="/docs"
              className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-semibold text-text-secondary transition-colors hover:text-text hover:border-text-tertiary"
            >
              Documentation
            </Link>
          </div>
        </div>
      </Section>

      {/* ── How It Works ── */}
      <Section>
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
            How it works
          </h2>
          <p className="text-text-secondary max-w-xl mx-auto text-balance">
            Three steps, one proof. Your file never leaves your device.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            {
              step: "01",
              title: "Drop your artifact",
              desc: "Drag any file into ProofStudio. It's hashed locally in your browser. Nothing is uploaded.",
            },
            {
              step: "02",
              title: "Commit",
              desc: "Your artifact's fingerprint is sent to a secure environment and locked to a unique, unrepeatable commit event.",
            },
            {
              step: "03",
              title: "Receive proof",
              desc: "You get back a portable proof file: signed evidence that this exact artifact existed in this exact form, in your possession, at that moment.",
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
      </Section>

      {/* ── What You Get ── */}
      <Section>
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-6">
              Portable, verifiable proof
            </h2>
            <p className="text-text-secondary leading-relaxed">
              Every proof is a self-contained JSON object. It includes a content
              hash, commit metadata, a cryptographic signature, and an optional
              hardware attestation report. Anyone can verify it independently.
            </p>
            <div className="mt-8 space-y-4">
              {[
                { title: "Content-addressed", desc: "SHA-256 hash binds the proof to specific bytes." },
                { title: "Timestamped", desc: "Independent RFC 3161 timestamps from trusted authorities." },
                { title: "Hardware-attested", desc: "AWS Nitro Enclave attestation proves the execution environment." },
                { title: "Device-authorized", desc: "Optional biometric authorization ties proof to a specific device key." },
              ].map((item) => (
                <div key={item.title} className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-text-tertiary shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-text">{item.title}</span>
                    <span className="text-sm text-text-secondary ml-1">- {item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
    "epochId": "a1b2c3d4..."
  },
  "signer": {
    "publicKeyB64": "MFkwEwYH...",
    "signatureB64": "MEUCIQD..."
  },
  "environment": {
    "enforcement": "measured-tee",
    "attestation": {
      "format": "aws-nitro"
    }
  }
}`}
            </pre>
          </div>
        </div>
      </Section>

      {/* ── Use Cases ── */}
      <Section>
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
            Prove anything
          </h2>
          <p className="text-text-secondary max-w-xl mx-auto text-balance">
            Any file or computation result that needs verifiable proof of existence and integrity.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: "AI Outputs", desc: "Prove model responses, generated images, and predictions came from a specific boundary at a specific time." },
            { title: "Software Builds", desc: "Prove a build artifact was produced by a specific CI/CD pipeline inside a measured environment." },
            { title: "Media & Journalism", desc: "Prove a photo or document existed in its current form at a specific moment, before edits, before distribution." },
            { title: "Scientific Data", desc: "Prove sensor readings and instrument output existed at capture time with sequence integrity." },
            { title: "Compliance & Audit", desc: "Produce tamper-evident records where any modification breaks the proof chain." },
            { title: "Agent-to-Agent", desc: "Pass proofs between systems so each can verify data integrity without trusting the transport." },
          ].map((item) => (
            <div key={item.title} className="group rounded-lg border border-border-subtle bg-bg-elevated p-6 transition-colors hover:border-border">
              <h3 className="text-base font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Powered by OCC ── */}
      <Section>
        <div className="rounded-lg border border-border-subtle bg-bg-elevated p-8 sm:p-12 text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary mb-4">
            Powered by
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-4">
            OCC: Origin Controlled Computing
          </h2>
          <p className="text-text-secondary max-w-2xl mx-auto leading-relaxed mb-6 text-balance">
            ProofStudio is built on the OCC protocol, a cryptographic proof system
            where proof is produced by the commit event itself. If the proof exists,
            the commit happened. If it doesn&apos;t, it didn&apos;t.
          </p>
          <Link
            href="/docs"
            className="text-sm font-medium text-text hover:text-text/70 transition-colors"
          >
            Read the protocol documentation →
          </Link>
        </div>
      </Section>

      {/* ── CTA ── */}
      <Section className="pb-32">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
            Try it now
          </h2>
          <p className="text-text-secondary mb-8 max-w-lg mx-auto text-balance">
            Drop a file, get a proof. Runs in your browser, verifiable by anyone.
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

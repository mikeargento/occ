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
        <div className="max-w-5xl">
          <Label>Origin Controlled Computing</Label>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.08]">
            Proof should be a property<br />
            of <em>creation,</em> not verification.
          </h1>
          <p className="mt-8 text-lg text-text-secondary max-w-3xl leading-relaxed">
            OCC is a protocol that produces portable cryptographic proof
            when bytes are committed through an authorized boundary.
            If the proof exists, the commit happened. If it doesn&apos;t, it didn&apos;t.
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
      </Section>

      {/* ── Problem ── */}
      <Section>
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <Label>The Problem</Label>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-6">
              Data exists first.<br />Proof comes later, if at all.
            </h2>
            <p className="text-text-secondary leading-relaxed">
              Photos, documents, model outputs, logs, and files exist
              without structural proof of where they came from or when.
              Signatures, metadata, timestamps, and registries are
              attached after the fact.
            </p>
            <p className="mt-4 text-text-secondary leading-relaxed">
              By then, the artifact already exists independently of any
              proof. Trust becomes something we try to recover instead of
              something the system enforced at the moment of&nbsp;commitment.
            </p>
          </div>
          <div className="lg:mt-6">
            <div className="w-full">
              <div className="rounded-md border border-border-subtle bg-bg-elevated px-5 py-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-text mb-2">Before OCC</div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Artifacts exist freely. Verification is applied after the fact.
                  The trust model starts after the data already exists.
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-bg-elevated px-5 py-4 mt-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-text mb-2">With OCC</div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Valid proof exists only because the artifact was committed
                  through a specific authorized boundary.
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
          Proof is produced when an agent commits a digital state.<br />
          That agent may be a person, a system, or an AI.
        </h2>
        <p className="text-text-secondary leading-relaxed max-w-2xl">
          An OCC proof can only exist if the artifact was committed through
          a protected boundary. The proof is a consequence of the commit
          event — not a wrapper applied afterward.
        </p>
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
              desc: "Bytes enter a protected boundary — a hardware enclave that controls the only path to a valid proof.",
            },
            {
              step: "02",
              title: "Bind",
              desc: "Inside the boundary, a content hash is combined with a fresh nonce, a monotonic counter, and a signature.",
            },
            {
              step: "03",
              title: "Commit",
              desc: "The artifact and its proof are produced together. If the commit doesn\u2019t happen, no valid proof exists.",
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
            { title: "Not a blockchain", desc: "No consensus, no ledger, no tokens. OCC constrains a single execution boundary." },
            { title: "Not a watermark", desc: "Nothing is embedded in the artifact. The proof is a separate, portable JSON object." },
            { title: "Not DRM", desc: "Bytes are freely copyable. Only the proof lineage is non-duplicable." },
            { title: "Not proof of truth", desc: "OCC proves a commit event happened, not that the content is true or accurate." },
            { title: "Not proof of authorship", desc: "A base proof attests which boundary committed, not who created the content. Actor-bound proofs can additionally attest a specific person or device." },
            { title: "Not attestation", desc: "Attestation is evidence OCC carries. OCC is the proof architecture that attestation fits into." },
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
          Where it applies.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: "AI Outputs", desc: "Commit model responses, generated images, and predictions with proof of which boundary and environment produced them." },
            { title: "Software Pipelines", desc: "Prove a build artifact was produced by a specific CI/CD environment inside a measured boundary." },
            { title: "Journalism & Media", desc: "Commit a file at capture time with proof of which device or system committed it and when." },
            { title: "Scientific Data", desc: "Commit sensor readings and instrument output with proof of origin, ordering, and sequence integrity." },
            { title: "Compliance & Audit", desc: "Produce tamper-evident log chains where any modification or insertion breaks the proof chain." },
            { title: "Agent-to-Agent", desc: "Pass proofs between AI systems so each can verify data integrity without trusting the transport." },
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
              { field: "artifact", desc: "SHA-256 digest of the committed bytes. Binds the proof to specific content." },
              { field: "commit", desc: "Fresh nonce, monotonic counter, epoch, and chain link. The ordered commit event." },
              { field: "signer", desc: "Ed25519 public key and signature over the canonical signed body." },
              { field: "environment", desc: "Enforcement tier, platform measurement, and hardware attestation report." },
              { field: "timestamps", desc: "Independent RFC 3161 timestamps. Advisory, not signed." },
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
      <Section className="pb-32">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
            Try it now.
          </h2>
          <p className="text-text-secondary mb-8 max-w-lg mx-auto">
            Drop a file in the Studio. Your browser hashes it locally, a
            Nitro Enclave commits it, and you get a real proof back in seconds.
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

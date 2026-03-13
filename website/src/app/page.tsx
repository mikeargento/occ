import Link from "next/link";
import { TerminalWindow } from "@/components/terminal-window";

/* ── Syntax-highlighted JSON helpers ── */
const K = ({ children }: { children: string }) => (
  <span className="text-syntax-key">{`"${children}"`}</span>
);
const S = ({ children }: { children: string }) => (
  <span className="text-syntax-string">{`"${children}"`}</span>
);
const N = ({ children }: { children: string | number }) => (
  <span className="text-syntax-number">{children}</span>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <span className="text-text-tertiary">{children}</span>
);

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
              className="inline-flex h-11 items-center rounded-md bg-emerald-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
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
            ProofStudio lets you prove anything digital.
          </h2>
          <p className="text-text-secondary max-w-xl mx-auto text-balance">
            It works by creating a cryptographic container that holds exactly one digital artifact or process.
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
          <TerminalWindow title="Actual occ/1 generated proof">
            <pre className="text-[10px] sm:text-[11px] leading-snug font-mono whitespace-pre-wrap break-all max-h-[600px] overflow-y-auto">
              <P>{"{"}</P>{"\n"}
              {"  "}<K>version</K><P>: </P><S>occ/1</S><P>,</P>{"\n"}
              {"  "}<K>artifact</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>hashAlg</K><P>: </P><S>sha256</S><P>,</P>{"\n"}
              {"    "}<K>digestB64</K><P>: </P><S>VmSUR4azmbQ9WmWeajc10XLvcGMfHutn5Ikkx9fewHI=</S>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>commit</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>nonceB64</K><P>: </P><S>MFsVZDsJxC9LS0yTqiaU8QflQ97d9DcKuF8UVfD46S0=</S><P>,</P>{"\n"}
              {"    "}<K>counter</K><P>: </P><S>98</S><P>,</P>{"\n"}
              {"    "}<K>slotCounter</K><P>: </P><S>97</S><P>,</P>{"\n"}
              {"    "}<K>slotHashB64</K><P>: </P><S>fu6nrfIuf/G/TDoFMGheS5eSleYsCQadNSezBdHzB48=</S><P>,</P>{"\n"}
              {"    "}<K>time</K><P>: </P><N>1773368713218</N><P>,</P>{"\n"}
              {"    "}<K>epochId</K><P>: </P><S>/qXZiO+PUKMAvVcoth+czcaid7wyoyU+AWjGWRHD4yo=</S><P>,</P>{"\n"}
              {"    "}<K>prevB64</K><P>: </P><S>73KJVymGT7I/EJWf5giBblJpdPGwVtXMW1jamUKWMWM=</S>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>signer</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>publicKeyB64</K><P>: </P><S>QQeecy4yv6dhExeBMVyevBpG2LOUpD6DS0wiEMa9EWE=</S><P>,</P>{"\n"}
              {"    "}<K>signatureB64</K><P>: </P><S>p74Jjzk9B5ieSTqlf1DcCLKnBt/6jBkwVGTJCJ3Z4+PFusMmeu9uqiUCTgHqKwFRidd4A/cHlS5dZpx2camyBw==</S>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>environment</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>enforcement</K><P>: </P><S>measured-tee</S><P>,</P>{"\n"}
              {"    "}<K>measurement</K><P>: </P><S>8db9ab687fd5f66d813cdcd813e09c7c88f10a9d729f012056bf9914df8975baa40f2a65009517c712241c2fc66cd19d</S><P>,</P>{"\n"}
              {"    "}<K>attestation</K><P>: {"{"}</P>{"\n"}
              {"      "}<K>format</K><P>: </P><S>aws-nitro</S><P>,</P>{"\n"}
              {"      "}<K>reportB64</K><P>: </P><S>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</S>{"\n"}
              {"    "}<P>{"}"}</P>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>timestamps</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>artifact</K><P>: {"{"}</P>{"\n"}
              {"      "}<K>authority</K><P>: </P><S>freetsa.org</S><P>,</P>{"\n"}
              {"      "}<K>time</K><P>: </P><S>2026-03-13T02:25:13Z</S><P>,</P>{"\n"}
              {"      "}<K>tokenB64</K><P>: </P><S>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</S><P>,</P>{"\n"}
              {"      "}<K>digestAlg</K><P>: </P><S>sha256</S><P>,</P>{"\n"}
              {"      "}<K>digestB64</K><P>: </P><S>VmSUR4azmbQ9WmWeajc10XLvcGMfHutn5Ikkx9fewHI=</S>{"\n"}
              {"    "}<P>{"}"}</P>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>agency</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>actor</K><P>: {"{"}</P>{"\n"}
              {"      "}<K>keyId</K><P>: </P><S>d57ae324e90879fa2a7f3a9232d29afb71cd7abb2cfe9a32d569fad7a692cede</S><P>,</P>{"\n"}
              {"      "}<K>publicKeyB64</K><P>: </P><S>MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0wXI/CC6P8WBRHbC2EFZsKdswKVSRKuPhcgDZYNx19VmVGSuYSMPmgpOCN7n31o9R95KU78c3tBgtSrklqeEaw==</S><P>,</P>{"\n"}
              {"      "}<K>algorithm</K><P>: </P><S>ES256</S><P>,</P>{"\n"}
              {"      "}<K>provider</K><P>: </P><S>passkey</S>{"\n"}
              {"    "}<P>{"}"}</P><P>,</P>{"\n"}
              {"    "}<K>authorization</K><P>: {"{"}</P>{"\n"}
              {"      "}<K>purpose</K><P>: </P><S>occ/commit-authorize/v1</S><P>,</P>{"\n"}
              {"      "}<K>format</K><P>: </P><S>webauthn</S><P>,</P>{"\n"}
              {"      "}<K>actorKeyId</K><P>: </P><S>d57ae324e90879fa2a7f3a9232d29afb71cd7abb2cfe9a32d569fad7a692cede</S><P>,</P>{"\n"}
              {"      "}<K>artifactHash</K><P>: </P><S>VmSUR4azmbQ9WmWeajc10XLvcGMfHutn5Ikkx9fewHI=</S><P>,</P>{"\n"}
              {"      "}<K>challenge</K><P>: </P><S>27zYq8ZSMVZoG8T/rqBGIVncQxNlueQKMrGflS/WbXw=</S><P>,</P>{"\n"}
              {"      "}<K>timestamp</K><P>: </P><N>1773368713181</N><P>,</P>{"\n"}
              {"      "}<K>authenticatorDataB64</K><P>: </P><S>glywon7VgYyGWZLep08T6qs5Np3Qjyzjz8OY0BIlNuAdAAAAAA==</S><P>,</P>{"\n"}
              {"      "}<K>clientDataJSON</K><P>: </P><S>{`{"type":"webauthn.get","challenge":"27zYq8ZSMVZoG8T_rqBGIVncQxNlueQKMrGflS_WbXw","origin":"https://www.proofstudio.xyz","crossOrigin":false}`}</S><P>,</P>{"\n"}
              {"      "}<K>signatureB64</K><P>: </P><S>MEQCIBxCsBR63kvCGkYSZk6ohyBxzri89klvudKjHF/mQyNEAiB8PJ4Ocqq3zdDnOlBxuKyyxteVq9LMBByVUKWS1RmN7A==</S>{"\n"}
              {"    "}<P>{"}"}</P>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>attribution</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>name</K><P>: </P><S>Mike Argento</S><P>,</P>{"\n"}
              {"    "}<K>title</K><P>: </P><S>Photo taken with the Ricoh GR IIIx</S><P>,</P>{"\n"}
              {"    "}<K>message</K><P>: </P><S>ProofStudio made this proof.</S>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>slotAllocation</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>version</K><P>: </P><S>occ/slot/1</S><P>,</P>{"\n"}
              {"    "}<K>nonceB64</K><P>: </P><S>MFsVZDsJxC9LS0yTqiaU8QflQ97d9DcKuF8UVfD46S0=</S><P>,</P>{"\n"}
              {"    "}<K>counter</K><P>: </P><S>97</S><P>,</P>{"\n"}
              {"    "}<K>time</K><P>: </P><N>1773368713211</N><P>,</P>{"\n"}
              {"    "}<K>epochId</K><P>: </P><S>/qXZiO+PUKMAvVcoth+czcaid7wyoyU+AWjGWRHD4yo=</S><P>,</P>{"\n"}
              {"    "}<K>publicKeyB64</K><P>: </P><S>QQeecy4yv6dhExeBMVyevBpG2LOUpD6DS0wiEMa9EWE=</S><P>,</P>{"\n"}
              {"    "}<K>signatureB64</K><P>: </P><S>Nm01JmEJM6HO6ikVvRUXC9kjEREfPCtg4c2ydCv5+xS73WBL/1MOhYDJAChXYClsB2oUJMDyT6XBRMZyIfFmAQ==</S>{"\n"}
              {"  "}<P>{"}"}</P>{"\n"}
              <P>{"}"}</P>
            </pre>
          </TerminalWindow>
        </div>
      </Section>

      {/* ── Use Cases ── */}
      <Section>
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
            What can you prove?
          </h2>
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-secondary">
            Everything.
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
              className="inline-flex h-11 items-center rounded-md bg-emerald-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
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

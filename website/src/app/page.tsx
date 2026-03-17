import Link from "next/link";
import { TerminalWindow } from "@/components/terminal-window";
import { ScrollReveal } from "@/components/scroll-reveal";

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
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <ScrollReveal>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] mb-6">
                Portable, verifiable proof
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <p className="text-text-secondary leading-relaxed text-lg">
                Every proof is a self-contained JSON object. Content hash,
                commit metadata, cryptographic signature, and hardware
                attestation. Anyone can verify it independently.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <div className="mt-10 space-y-5">
                {[
                  { title: "Content-addressed", desc: "SHA-256 hash binds the proof to specific bytes." },
                  { title: "Timestamped", desc: "Independent RFC 3161 timestamps from trusted authorities." },
                  { title: "Hardware-attested", desc: "AWS Nitro Enclave attestation proves the execution environment." },
                  { title: "Device-authorized", desc: "Biometric authorization ties proof to a specific device key." },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4 items-start">
                    <div className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <div>
                      <span className="text-sm font-semibold text-text">{item.title}</span>
                      <span className="text-sm text-text-secondary ml-1.5">
                        - {item.desc}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          </div>

          <ScrollReveal delay={150}>
            <div className="terminal-glow">
              <TerminalWindow title="Actual occ/1 generated proof">
                <pre className="text-[10px] sm:text-[11px] leading-snug font-mono whitespace-pre-wrap break-all max-h-[600px] overflow-y-auto">
              <P>{"{"}</P>{"\n"}
              {"  "}<K>version</K><P>: </P><S>occ/1</S><P>,</P>{"\n"}
              {"  "}<K>artifact</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>hashAlg</K><P>: </P><S>sha256</S><P>,</P>{"\n"}
              {"    "}<K>digestB64</K><P>: </P><S>gJzb/IOJxQSOcMHTuVQOeuWir5qVUxusmm//TYPhfhw=</S>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>commit</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>nonceB64</K><P>: </P><S>uOubfUo73V0NI0XRtftc4PBXEiJR7elrimsyliwR1Fo=</S><P>,</P>{"\n"}
              {"    "}<K>counter</K><P>: </P><S>571</S><P>,</P>{"\n"}
              {"    "}<K>slotCounter</K><P>: </P><S>570</S><P>,</P>{"\n"}
              {"    "}<K>slotHashB64</K><P>: </P><S>wN7+7StkGTb8COhBvbXsCARvYtWqYMv4uardhiEzzo0=</S><P>,</P>{"\n"}
              {"    "}<K>time</K><P>: </P><N>1773709206988</N><P>,</P>{"\n"}
              {"    "}<K>epochId</K><P>: </P><S>/qXZiO+PUKMAvVcoth+czcaid7wyoyU+AWjGWRHD4yo=</S><P>,</P>{"\n"}
              {"    "}<K>prevB64</K><P>: </P><S>sKCR/xeVqicBnt/wg/TUK+2eyyA2C5I718q1OejL+a0=</S>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>signer</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>publicKeyB64</K><P>: </P><S>QQeecy4yv6dhExeBMVyevBpG2LOUpD6DS0wiEMa9EWE=</S><P>,</P>{"\n"}
              {"    "}<K>signatureB64</K><P>: </P><S>NvAe7Ubr3rZxONX7N6/+qfLz/L+B/yp/F6y9F4Tjpv...==</S>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>environment</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>enforcement</K><P>: </P><S>measured-tee</S><P>,</P>{"\n"}
              {"    "}<K>measurement</K><P>: </P><S>8db9ab687fd5f66d...c66cd19d</S><P>,</P>{"\n"}
              {"    "}<K>attestation</K><P>: {"{"}</P>{"\n"}
              {"      "}<K>format</K><P>: </P><S>aws-nitro</S><P>,</P>{"\n"}
              {"      "}<K>reportB64</K><P>: </P><S>hEShATgioFkRIL9p...dkG9Aw==</S>{"\n"}
              {"    "}<P>{"}"}</P>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>timestamps</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>artifact</K><P>: {"{"}</P>{"\n"}
              {"      "}<K>authority</K><P>: </P><S>freetsa.org</S><P>,</P>{"\n"}
              {"      "}<K>time</K><P>: </P><S>2026-03-17T01:00:09Z</S>{"\n"}
              {"    "}<P>{"}"}</P>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>agency</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>actor</K><P>: {"{"}</P>{"\n"}
              {"      "}<K>algorithm</K><P>: </P><S>ES256</S><P>,</P>{"\n"}
              {"      "}<K>provider</K><P>: </P><S>passkey</S>{"\n"}
              {"    "}<P>{"}"}</P><P>,</P>{"\n"}
              {"    "}<K>authorization</K><P>: {"{"}</P>{"\n"}
              {"      "}<K>purpose</K><P>: </P><S>occ/commit-authorize/v1</S><P>,</P>{"\n"}
              {"      "}<K>format</K><P>: </P><S>webauthn</S>{"\n"}
              {"    "}<P>{"}"}</P>{"\n"}
              {"  "}<P>{"}"}</P><P>,</P>{"\n"}
              {"  "}<K>attribution</K><P>: {"{"}</P>{"\n"}
              {"    "}<K>name</K><P>: </P><S>Mike Argento</S>{"\n"}
              {"  "}<P>{"}"}</P>{"\n"}
              <P>{"}"}</P>
                </pre>
              </TerminalWindow>
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

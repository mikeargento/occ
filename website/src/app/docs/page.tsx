import type { Metadata } from "next";
import Link from "next/link";
import { ScrollReveal } from "@/components/scroll-reveal";

export const metadata: Metadata = {
  title: "Documentation",
  description: "OCC Protocol documentation: proof format, verification, trust model, integration guide.",
};

const pages = [
  { href: "/docs/what-is-occ", title: "What is OCC", desc: "Core concepts: what the protocol does, what you get, and how proof is caused by system structure." },
  { href: "/docs/proof-format", title: "Proof Format (occ/1)", desc: "Wire specification for the occ/1 proof schema: fields, types, signed body, canonical serialization." },
  { href: "/docs/verification", title: "Verification", desc: "Five-step verification algorithm: digest check, signature verification, policy enforcement." },
  { href: "/docs/trust-model", title: "Trust Model", desc: "Assumptions, threat model, enforcement tiers, and trust anchor hierarchy." },
  { href: "/docs/integration", title: "Integration Guide", desc: "Commit artifacts, verify proofs, and integrate OCC into your application." },
  { href: "/docs/what-occ-is-not", title: "What OCC is Not", desc: "Precise distinctions: not a blockchain, not a watermark, not DRM, not proof of truth or authorship." },
  { href: "/docs/faq", title: "FAQ", desc: "Common questions about the protocol, security model, and practical usage." },
];

export default function DocsPage() {
  return (
    <div>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] mb-5">Documentation</h1>
      <p className="text-text-secondary text-lg leading-relaxed mb-14 max-w-xl">
        Technical documentation for the OCC Protocol. Start with the concepts
        or jump directly to integration.
      </p>

      <div className="space-y-5">
        {pages.map((p, i) => (
          <ScrollReveal key={p.href} delay={i * 60}>
            <Link
              href={p.href}
              className="group block rounded-xl border border-border-subtle bg-bg-elevated p-8 card-hover hover:border-border relative"
            >
              <div className="flex items-start gap-5">
                <span className="text-xs font-mono text-text-tertiary mt-1 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2 className="text-lg font-semibold mb-2">{p.title}</h2>
                  <p className="text-sm text-text-secondary leading-relaxed">{p.desc}</p>
                </div>
              </div>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}

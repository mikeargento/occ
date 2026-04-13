import type { Metadata } from "next";
import Link from "next/link";
import { ScrollReveal } from "@/components/scroll-reveal";

export const metadata: Metadata = {
  title: "Documentation",
  description: "OCC Protocol documentation: proof format, verification, trust model, integration guide.",
};

const pages = [
  { href: "/docs/what-is-occ", title: "What is OCC", desc: "Core concepts: what the protocol does, what you get, and how proof is caused by system structure." },
  { href: "/docs/whitepaper", title: "Whitepaper", desc: "The full OCC protocol specification. Architecture, threat model, proof semantics, and formal properties." },
  { href: "/docs/proof-format", title: "Proof Format (occ/1)", desc: "Wire specification for the occ/1 proof schema: fields, types, signed body, canonical serialization." },
  { href: "/docs/verification", title: "Verification", desc: "Five-step verification algorithm: digest check, signature verification, policy enforcement." },
  { href: "/docs/trust-model", title: "Trust Model", desc: "Assumptions, threat model, enforcement tiers, and trust anchor hierarchy." },
  { href: "/docs/self-host-tee", title: "Self-Host TEE", desc: "Run your own Trusted Execution Environment. Full blueprint for AWS Nitro enclave deployment." },
  { href: "/docs/integration", title: "Integration Guide", desc: "Commit artifacts, verify proofs, and integrate OCC into your application." },
  { href: "/docs/what-occ-is-not", title: "What OCC is Not", desc: "Precise distinctions: not a blockchain, not a watermark, not DRM, not proof of truth or authorship." },
  { href: "/docs/faq", title: "FAQ", desc: "Common questions about the protocol, security model, and practical usage." },
];

export default function DocsPage() {
  return (
    <div>
      <style>{`
        .doc-card { border: 1px solid #e5e7eb; background: #fff; padding: 32px; border-radius: 12px; text-decoration: none; display: block; transition: border-color 0.15s, box-shadow 0.15s; }
        .doc-card:hover { border-color: #9ca3af; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
      `}</style>
      <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 20, color: "#111827" }}>
        OCC Documentation
      </h1>
      <p style={{ color: "#4b5563", fontSize: 18, lineHeight: 1.6, marginBottom: 56, maxWidth: 560 }}>
        Technical documentation for the OCC Protocol. Start with the concepts
        or jump directly to integration.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {pages.map((p, i) => (
          <ScrollReveal key={p.href} delay={i * 60}>
            <Link href={p.href} className="doc-card">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
                <span style={{ fontSize: 12, fontFamily: "monospace", color: "#6b7280", marginTop: 4, flexShrink: 0 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "#111827" }}>{p.title}</h2>
                  <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6, margin: 0 }}>{p.desc}</p>
                </div>
              </div>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}

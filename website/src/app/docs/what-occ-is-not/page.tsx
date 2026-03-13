import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What OCC is Not",
  description: "Precise distinctions between OCC and other systems.",
};

export default function WhatOCCIsNotPage() {
  return (
    <article className="prose-doc">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] mb-6">What OCC is Not</h1>
      <p className="text-text-secondary mb-10">
        Precise distinctions matter for a protocol that makes specific
        cryptographic claims. Here is what OCC does not claim and does not do.
      </p>

      <div className="space-y-6">
        {[
          {
            title: "OCC is not a blockchain",
            body: "OCC does not use distributed consensus, a global ledger, or tokens. It constrains a single execution boundary. There is no mining, no gas, no network of validators. Proof chaining (prevB64) creates a local hash chain within one boundary, not a distributed data structure.",
          },
          {
            title: "OCC is not a watermark",
            body: "OCC does not embed anything in the artifact bytes. The artifact is hashed, not modified. The proof is a separate JSON object that travels alongside the artifact. Removing the proof does not change the artifact; it only removes the evidence of the commit event.",
          },
          {
            title: "OCC is not DRM",
            body: "OCC does not prevent copying, sharing, or redistribution of artifact bytes. It prevents the authoritative proof lineage from being duplicated within a policy domain. The artifact itself is freely copyable, but only the original proof will verify against it.",
          },
          {
            title: "OCC is not proof of truth",
            body: "OCC proves that specific bytes were committed through an authorized boundary. The content of those bytes may be factually wrong, misleading, or fabricated. An LLM committed through OCC is still an LLM. It can hallucinate. OCC proves the commit event, not the content semantics.",
          },
          {
            title: "OCC is not proof of authorship",
            body: "A base proof attests which boundary committed an artifact, not who created the underlying content. Actor-bound proofs can additionally attest that a specific person or device authorized the commitment, but this is actor-binding, not authorship attribution.",
          },
          {
            title: "OCC is not proof of first creation",
            body: "OCC does not prove that these bytes never existed before this commit. The same content could have been created elsewhere earlier. OCC proves that this specific boundary committed these bytes at this point in its counter sequence. Nothing more.",
          },
          {
            title: "OCC is not attestation",
            body: "Attestation is evidence that OCC carries, not what OCC is. A TEE attestation report (e.g., AWS Nitro) proves that specific code is running inside a specific hardware boundary. OCC is the proof architecture that attestation fits into, the framework for atomic commit events where attestation provides environmental evidence.",
          },
          {
            title: "OCC is not notarization",
            body: "Traditional notarization involves a trusted third party witnessing a signing event. OCC is a self-contained proof system. The proof is verifiable offline using only the public key and the original bytes. No trusted third party is required for core verification. TSA timestamps are optional, advisory evidence.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-border-subtle border-l-2 border-l-text-tertiary p-6">
            <h2 className="text-base font-semibold mb-3">{item.title}</h2>
            <p className="text-sm text-text-secondary leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

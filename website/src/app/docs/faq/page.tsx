import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about the OCC Protocol.",
};

const faqs = [
  {
    q: "Does OCC upload my file?",
    a: "No. Your file is hashed locally in your browser or application. Only the SHA-256 digest (32 bytes) is sent to the enclave. The actual file bytes never leave your machine.",
  },
  {
    q: "Can I verify a proof without an internet connection?",
    a: "Yes. Core verification (digest match + Ed25519 signature) is fully offline. You need the original bytes, the proof JSON, and a verifier implementation. No API calls required.",
  },
  {
    q: "What happens if the enclave restarts?",
    a: "A new epoch begins — new Ed25519 keypair, new epochId, counter potentially resets. The first proof of the new epoch has no prevB64 (chain link). Cross-epoch counter continuity can be maintained via a DynamoDB anchor.",
  },
  {
    q: "Is this a blockchain?",
    a: "No. OCC has no distributed consensus, no global ledger, no tokens. It constrains a single execution boundary. Proof chaining (prevB64) is a local hash chain, not a distributed data structure.",
  },
  {
    q: "Does OCC prove who created the content?",
    a: "A base proof attests which execution boundary committed specific bytes — not who created them. Actor-bound proofs (using device-bound biometric keys) can additionally attest that a specific person or device authorized the commitment.",
  },
  {
    q: "What if someone modifies the proof JSON?",
    a: "The Ed25519 signature covers the canonical signed body. Any modification to signed fields (artifact, commit, signer identity, environment) invalidates the signature. Unsigned fields (timestamps, metadata) are advisory and should not be trusted for security decisions.",
  },
  {
    q: "What is the measurement field?",
    a: "For AWS Nitro Enclaves, it is the PCR0 value — a SHA-384 hash of the enclave image. It uniquely identifies the exact code running inside the boundary. Verifiers should pin allowedMeasurements to known-good values.",
  },
  {
    q: "Are timestamps signed?",
    a: "No. RFC 3161 timestamps are added post-signature by the parent server via an external Time Stamping Authority. They are independently verifiable (via the TSA certificate) but are not covered by the Ed25519 signature. Use them as advisory evidence, not as primary trust.",
  },
  {
    q: "Can the same file produce different proofs?",
    a: "Yes. Each commit generates a fresh nonce, increments the counter, and produces a new signature. The artifact digest will be the same (same file = same SHA-256), but the commit context differs. This is correct behavior — each is a distinct commit event.",
  },
  {
    q: "What is prevB64?",
    a: "The SHA-256 hash of the previous complete proof in the chain. It creates a linked sequence within an epoch. If any proof in the chain is modified, deleted, or reordered, the hash chain breaks. The first proof of an epoch has no prevB64.",
  },
  {
    q: "How is this different from just signing a file?",
    a: "A standard digital signature proves someone with the private key signed the bytes. OCC additionally provides: a measured execution boundary (PCR0), a monotonic counter (ordering), a fresh nonce (non-replayability), proof chaining (sequence integrity), and hardware attestation (boundary evidence). The key never leaves the enclave.",
  },
  {
    q: "What libraries does OCC use?",
    a: "The core library uses @noble/ed25519 for signatures and @noble/hashes for SHA-256 — both audited, pure TypeScript, zero-dependency libraries. No Node.js native bindings.",
  },
];

export default function FAQPage() {
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight mb-4">FAQ</h1>
      <p className="text-text-secondary mb-8">
        Common questions about the OCC Protocol.
      </p>

      <div className="space-y-6">
        {faqs.map((faq) => (
          <div key={faq.q} className="border-b border-border-subtle pb-6">
            <h2 className="text-base font-semibold mb-2">{faq.q}</h2>
            <p className="text-sm text-text-secondary leading-relaxed">{faq.a}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

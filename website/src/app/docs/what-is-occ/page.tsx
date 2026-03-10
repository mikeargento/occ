import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What is OCC",
  description: "OCC is a protocol for portable cryptographic proof caused by system structure.",
};

export default function WhatIsOCCPage() {
  return (
    <article className="prose-doc">
      <h1 className="text-3xl font-semibold tracking-tight mb-8">What is OCC</h1>

      <p className="text-text-secondary leading-relaxed mb-6">
        OCC — Origin Controlled Computing — is a protocol for producing portable
        cryptographic proof that specific bytes were committed through an
        authorized execution boundary during a single atomic event.
      </p>

      <h2 className="text-xl font-semibold mt-12 mb-4">The core idea</h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        Most digital systems create artifacts first and try to prove things
        about them later. Photos, documents, model outputs, and logs are
        produced freely — then we attach signatures, metadata, timestamps, or
        register them in ledgers after the fact.
      </p>
      <p className="text-text-secondary leading-relaxed mb-4">
        OCC inverts this relationship. Under OCC, valid proof can only exist
        if the artifact was committed through a protected path. The proof is
        not added to the artifact — it is caused by the act of committing
        through the authorized boundary.
      </p>

      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-6 my-8">
        <p className="text-sm text-text italic">
          If proof exists, the authorized commit path was traversed.
        </p>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">How it works</h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        OCC binds authorization, cryptographic binding, and commit into a single
        indivisible operation:
      </p>
      <ol className="space-y-3 mb-6">
        <li className="text-text-secondary leading-relaxed">
          <strong className="text-text">1. Authorize</strong> — Candidate bytes enter a
          protected commit interface controlled by an authorized execution
          boundary (e.g., an AWS Nitro Enclave).
        </li>
        <li className="text-text-secondary leading-relaxed">
          <strong className="text-text">2. Bind</strong> — Inside the boundary, the system
          computes a content-dependent hash (SHA-256) and combines it with
          boundary-fresh cryptographic output (nonce, counter, signature).
        </li>
        <li className="text-text-secondary leading-relaxed">
          <strong className="text-text">3. Commit</strong> — The artifact and its proof are
          committed together. The operation is fail-closed: if any step fails,
          nothing is produced.
        </li>
      </ol>

      <h2 className="text-xl font-semibold mt-12 mb-4">What you get</h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        An OCC proof is a JSON object (schema version <code className="text-xs font-mono bg-bg-subtle px-1.5 py-0.5 rounded">occ/1</code>) containing:
      </p>
      <ul className="space-y-2 mb-6">
        <li className="text-text-secondary"><strong className="text-text">artifact</strong> — SHA-256 digest of the committed bytes</li>
        <li className="text-text-secondary"><strong className="text-text">commit</strong> — fresh nonce, monotonic counter, epoch identity, optional chain link</li>
        <li className="text-text-secondary"><strong className="text-text">signer</strong> — Ed25519 public key and signature over the canonical signed body</li>
        <li className="text-text-secondary"><strong className="text-text">environment</strong> — enforcement tier, platform measurement (PCR0), hardware attestation</li>
        <li className="text-text-secondary"><strong className="text-text">timestamps</strong> — optional RFC 3161 TSA timestamps from an independent time authority</li>
      </ul>

      <h2 className="text-xl font-semibold mt-12 mb-4">Key properties</h2>
      <div className="space-y-4">
        {[
          { title: "Portable", desc: "A proof is a self-contained JSON object. Any verifier can check it offline with only the public key and the original bytes." },
          { title: "Atomic", desc: "The commit is fail-closed. Either a complete, valid proof is produced, or nothing is. No partial proofs." },
          { title: "Ordered", desc: "Each proof carries a monotonic counter within its epoch. Counter + epoch + chain link establish ordering." },
          { title: "Measured", desc: "The proof binds to a specific execution environment via measurement (PCR0 on Nitro, MRENCLAVE on SGX)." },
          { title: "Verifiable", desc: "Ed25519 signature, SHA-256 digest, and canonical serialization — all checkable with standard cryptographic primitives." },
        ].map((item) => (
          <div key={item.title} className="rounded-lg border border-border-subtle p-4">
            <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
            <p className="text-sm text-text-secondary">{item.desc}</p>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Enforcement tiers</h2>
      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-text-tertiary">Tier</th>
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-text-tertiary">Key Location</th>
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-text-tertiary">Boundary</th>
              <th className="text-left py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Use Case</th>
            </tr>
          </thead>
          <tbody className="text-text-secondary">
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4"><code className="text-xs font-mono">stub</code></td>
              <td className="py-2 pr-4">Process memory</td>
              <td className="py-2 pr-4">Software</td>
              <td className="py-2">Development, testing</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4"><code className="text-xs font-mono">hw-key</code></td>
              <td className="py-2 pr-4">HSM / Secure Enclave</td>
              <td className="py-2 pr-4">Software</td>
              <td className="py-2">Key custody</td>
            </tr>
            <tr>
              <td className="py-2 pr-4"><code className="text-xs font-mono">measured-tee</code></td>
              <td className="py-2 pr-4">TEE memory</td>
              <td className="py-2 pr-4">Hardware enclave</td>
              <td className="py-2">Production, highest assurance</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

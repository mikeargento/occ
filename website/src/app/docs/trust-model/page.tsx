import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trust Model",
  description: "OCC trust model: assumptions, threat model, enforcement tiers, non-goals.",
};

export default function TrustModelPage() {
  return (
    <article className="prose-doc">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] mb-6">Trust Model</h1>

      <div className="border-l-2 border-l-text-tertiary pl-6 mb-8">
        <p className="text-sm text-text italic leading-relaxed">
          OCC guarantees single-successor semantics within the verifier-accepted
          measurement and monotonicity domain of the enforcing boundary.
        </p>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Assumptions</h2>
      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-text-tertiary">Assumption</th>
              <th className="text-left py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">If it fails</th>
            </tr>
          </thead>
          <tbody className="text-text-secondary">
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4">Boundary isolation - TEE prevents external key access</td>
              <td className="py-2">All guarantees collapse</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4">Key secrecy - Ed25519 private key never leaves boundary</td>
              <td className="py-2">Proof forgery becomes possible</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4">Nonce freshness - ≥128 bits, never reused</td>
              <td className="py-2">Replay within a session</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4">Honest measurement - hardware correctly measures enclave</td>
              <td className="py-2">Delegated to TEE vendor</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4">Monotonic counter durability - survives restarts</td>
              <td className="py-2">Anti-rollback degrades to single session</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4">Causal slot integrity - slot allocated before artifact hash known</td>
              <td className="py-2">Without pre-allocation, commit order could be forged</td>
            </tr>
            <tr>
              <td className="py-2 pr-4">Strict verifier policy - caller pins measurements + counters</td>
              <td className="py-2">Weak policy accepts more than intended</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Threat model</h2>
      <h3 className="text-base font-semibold mt-6 mb-3">In-scope threats</h3>
      <div className="space-y-3 mb-8">
        {[
          { threat: "Proof replay", mitigation: "minCounter in policy rejects old proofs" },
          { threat: "Measurement substitution", mitigation: "allowedMeasurements pins exact values" },
          { threat: "Signature forgery", mitigation: "Ed25519 unforgeability" },
          { threat: "Downgrade attack", mitigation: "Enforcement tier is signed; requireEnforcement rejects weaker tiers" },
          { threat: "Chain gap insertion", mitigation: "prevB64 chaining: any removed link breaks hash continuity" },
          { threat: "Counter position forgery", mitigation: "Causal slot pre-allocation: slotHashB64 binding + slotCounter < counter ordering proves pre-allocation" },
          { threat: "Agency replay across batches", mitigation: "Single-use challenge consumed on first validation; batch context scoped to declared digests" },
        ].map((t) => (
          <div key={t.threat} className="flex gap-4 border-l-2 border-l-text-tertiary pl-4 py-1">
            <div className="text-sm font-medium text-text shrink-0 w-44">{t.threat}</div>
            <div className="text-sm text-text-secondary">{t.mitigation}</div>
          </div>
        ))}
      </div>

      <h3 className="text-base font-semibold mt-6 mb-3">Out-of-scope threats</h3>
      <ul className="space-y-2 mb-8 text-sm text-text-secondary">
        <li>• Signing key exfiltration - assumes boundary is secure</li>
        <li>• TEE firmware vulnerability - delegated to hardware vendor</li>
        <li>• Weak verifier policy - caller responsibility</li>
        <li>• Physical access to enclave host - outside threat model</li>
      </ul>

      <h2 className="text-xl font-semibold mt-12 mb-4">Non-goals</h2>
      <ul className="space-y-2 mb-8 text-sm text-text-secondary">
        <li>• <strong className="text-text">Global ordering</strong> - no total ordering across independent boundaries</li>
        <li>• <strong className="text-text">Cross-boundary double-spend</strong> - same artifact can be submitted to separate boundaries</li>
        <li>• <strong className="text-text">Copy prevention</strong> - OCC does not prevent raw byte copying</li>
        <li>• <strong className="text-text">Consensus replacement</strong> - OCC constrains a single boundary, not distributed parties</li>
        <li>• <strong className="text-text">Metadata integrity</strong> - the metadata field is advisory and unsigned</li>
      </ul>
    </article>
  );
}

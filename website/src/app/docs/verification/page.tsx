import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verification",
  description: "OCC five-step verification algorithm: structural validation, digest check, signature verification, policy enforcement.",
};

export default function VerificationPage() {
  return (
    <article className="prose-doc">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] mb-6">Verification</h1>
      <p className="text-[#374151] mb-10">
        OCC verification is deterministic and runs offline. No network calls, no API keys, no accounts.
      </p>

      <h2 className="text-xl font-semibold mt-12 mb-4">Five-step algorithm</h2>
      <p className="text-[#374151] mb-6">
        Input: a proof (<code className="text-xs font-mono bg-[#f3f4f6] px-1">OCCProof</code>), the original bytes (<code className="text-xs font-mono bg-[#f3f4f6] px-1">Uint8Array</code>), and an optional verification policy.
      </p>

      <div className="space-y-6 mb-12">
        {[
          {
            step: "1",
            title: "Structural validation",
            desc: "Check that all required fields are present with correct types. version must be \"occ/1\", hashAlg must be \"sha256\", enforcement must be one of the valid tiers, all base64 fields must decode correctly.",
          },
          {
            step: "2",
            title: "Artifact digest verification",
            desc: "Compute SHA-256 of the provided bytes. Compare against proof.artifact.digestB64 using constant-time comparison. If they don't match, the proof does not apply to these bytes.",
          },
          {
            step: "3",
            title: "Signed body reconstruction",
            desc: "Build the SignedBody object from the proof fields (including actor identity from agency, attribution, and attestation format when present). Canonicalize to sorted-key JSON, encode as UTF-8 bytes. This is what the Ed25519 signature covers.",
          },
          {
            step: "4",
            title: "Ed25519 signature verification",
            desc: "Decode publicKeyB64 (must be 32 bytes) and signatureB64 (must be 64 bytes). Verify the Ed25519 signature against the canonical bytes. If invalid, the proof has been tampered with.",
          },
          {
            step: "5",
            title: "Policy checks",
            desc: "If a VerificationPolicy is provided, enforce its constraints: enforcement tier, allowed measurements, allowed public keys, attestation requirements, counter range, time range, epoch requirements.",
          },
        ].map((item) => (
          <div key={item.step} className="border-l-2 border-l-[#d0d5dd] pl-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="inline-flex w-7 h-7 items-center justify-center bg-[#f3f4f6] text-[#111827] text-xs font-mono font-semibold">
                {item.step}
              </span>
              <h3 className="text-base font-semibold">{item.title}</h3>
            </div>
            <p className="text-sm text-[#374151] leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Verification policy</h2>
      <div className="code-block mb-6">
        <div className="code-block-header"><span>VerificationPolicy</span></div>
        <pre className="text-[#374151]">{`interface VerificationPolicy {
  requireEnforcement?: "stub" | "hw-key" | "measured-tee";
  allowedMeasurements?: string[];     // exact match
  allowedPublicKeys?: string[];       // exact match
  requireAttestation?: boolean;
  requireAttestationFormat?: string[];
  minCounter?: string;                // BigInt-safe
  maxCounter?: string;
  minTime?: number;                   // Unix ms
  maxTime?: number;
  requireEpochId?: boolean;

  // Actor-bound proof policy
  requireActor?: boolean;             // reject proofs without agency
  allowedActorKeyIds?: string[];      // exact match
  allowedActorProviders?: string[];   // e.g. ["apple-secure-enclave"]
}`}</pre>
      </div>

      <h3 className="text-lg font-semibold mt-8 mb-4">Trust anchor hierarchy</h3>
      <div className="space-y-3 mb-8">
        <div className="border-l-2 border-l-[#d0d5dd] pl-4 py-1">
          <code className="text-xs font-mono text-[#d97706]">requireEnforcement</code>
          <span className="text-sm text-[#374151] ml-2">alone - prevents in-transit downgrade only</span>
        </div>
        <div className="border-l-2 border-l-[#d0d5dd] pl-4 py-1">
          <code className="text-xs font-mono text-[#1A73E8]">requireEnforcement + allowedMeasurements</code>
          <span className="text-sm text-[#374151] ml-2">- pins to specific enclave image</span>
        </div>
        <div className="border-l-2 border-l-[#d0d5dd] pl-4 py-1">
          <code className="text-xs font-mono text-[#059669]">+ requireAttestation</code>
          <span className="text-sm text-[#374151] ml-2">- full trust (vendor-attested hardware boundary)</span>
        </div>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">What the verifier does NOT check</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb]">
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-[#9ca3af]">Item</th>
              <th className="text-left py-2 text-xs font-medium uppercase tracking-wider text-[#9ca3af]">Why</th>
            </tr>
          </thead>
          <tbody className="text-[#374151]">
            <tr className="border-b border-[#e5e7eb]">
              <td className="py-2 pr-4">Attestation report content</td>
              <td className="py-2">Vendor-signed; platform-specific verification is caller responsibility</td>
            </tr>
            <tr className="border-b border-[#e5e7eb]">
              <td className="py-2 pr-4">prevB64 chain integrity</td>
              <td className="py-2">Chain traversal is application-layer logic</td>
            </tr>
            <tr className="border-b border-[#e5e7eb]">
              <td className="py-2 pr-4">Counter continuity</td>
              <td className="py-2">Gap detection is application-layer logic</td>
            </tr>
            <tr className="border-b border-[#e5e7eb]">
              <td className="py-2 pr-4">Slot allocation validity</td>
              <td className="py-2">Slot signature and hash binding are structural checks; application can verify slotHashB64 matches canonicalized slot body</td>
            </tr>
            <tr className="border-b border-[#e5e7eb]">
              <td className="py-2 pr-4">Key provenance</td>
              <td className="py-2">Requires attestation verification</td>
            </tr>
            <tr className="border-b border-[#e5e7eb]">
              <td className="py-2 pr-4">Batch context completeness</td>
              <td className="py-2">Verifying all proofs in a batch is application-layer logic</td>
            </tr>
            <tr>
              <td className="py-2 pr-4">Timestamp validity</td>
              <td className="py-2">TSA token parsing is out of scope</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

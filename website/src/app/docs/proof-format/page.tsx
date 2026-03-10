import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Proof Format (occ/1)",
  description: "Wire format specification for the occ/1 proof schema.",
};

export default function ProofFormatPage() {
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight mb-4">Proof Format — occ/1</h1>
      <p className="text-text-secondary mb-8">
        Normative specification for the <code className="text-xs font-mono bg-bg-subtle px-1.5 py-0.5 rounded">occ/1</code> proof format. Derived from the reference implementation.
      </p>

      <h2 className="text-xl font-semibold mt-12 mb-4">Proof JSON schema</h2>
      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4 overflow-x-auto mb-8">
        <pre className="text-xs font-mono leading-relaxed text-text-secondary">{`{
  "version": "occ/1",                // REQUIRED — exact value
  "artifact": {
    "hashAlg": "sha256",             // REQUIRED — "sha256" only in v1
    "digestB64": "<base64>"          // REQUIRED — SHA-256, 32 decoded bytes
  },
  "commit": {
    "nonceB64": "<base64>",          // REQUIRED — ≥16 decoded bytes
    "counter":  "42",                // OPTIONAL — decimal string, monotonic
    "time":     1700000000000,       // OPTIONAL — Unix ms
    "prevB64":  "<base64>",          // OPTIONAL — chain link, 32 bytes
    "epochId":  "<hex>"              // OPTIONAL — SHA-256 hex
  },
  "signer": {
    "publicKeyB64":  "<base64>",     // REQUIRED — Ed25519, 32 bytes
    "signatureB64":  "<base64>"      // REQUIRED — Ed25519, 64 bytes
  },
  "environment": {
    "enforcement": "measured-tee",   // REQUIRED — "stub"|"hw-key"|"measured-tee"
    "measurement": "<opaque>",       // REQUIRED — non-empty string
    "attestation": {                 // OPTIONAL
      "format":    "aws-nitro",      // REQUIRED when parent present
      "reportB64": "<base64>"        // REQUIRED when parent present
    }
  },
  "timestamps": {                    // OPTIONAL — external timestamps
    "artifact": { TsaToken },
    "proof":    { TsaToken }
  },
  "metadata": { }                    // OPTIONAL — NOT signed, advisory
}`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Signed body</h2>
      <p className="text-text-secondary mb-4">
        The Ed25519 signature covers the canonical serialization of a <code className="text-xs font-mono bg-bg-subtle px-1.5 py-0.5 rounded">SignedBody</code> object:
      </p>
      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4 overflow-x-auto mb-4">
        <pre className="text-xs font-mono leading-relaxed text-text-secondary">{`{
  version:           proof.version,
  artifact:          proof.artifact,
  commit:            proof.commit,              // ALL fields verbatim
  publicKeyB64:      proof.signer.publicKeyB64,
  enforcement:       proof.environment.enforcement,
  measurement:       proof.environment.measurement,
  attestationFormat: proof.environment.attestation?.format  // when present
}`}</pre>
      </div>

      <h3 className="text-lg font-semibold mt-8 mb-4">What is NOT signed</h3>
      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-text-tertiary">Field</th>
              <th className="text-left py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Reason</th>
            </tr>
          </thead>
          <tbody className="text-text-secondary">
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4"><code className="text-xs font-mono">signatureB64</code></td>
              <td className="py-2">The seal — cannot sign itself</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4"><code className="text-xs font-mono">attestation.reportB64</code></td>
              <td className="py-2">Vendor-signed, self-authenticating separately</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4"><code className="text-xs font-mono">timestamps</code></td>
              <td className="py-2">Added post-signature by external TSA</td>
            </tr>
            <tr>
              <td className="py-2 pr-4"><code className="text-xs font-mono">metadata</code></td>
              <td className="py-2">Advisory, not trusted</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Canonical serialization</h2>
      <p className="text-text-secondary mb-4">
        The signed body is serialized to bytes using a deterministic algorithm:
      </p>
      <ol className="space-y-2 mb-6 text-sm text-text-secondary">
        <li>1. Recursively sort all object keys in Unicode code-point order</li>
        <li>2. Serialize with <code className="text-xs font-mono bg-bg-subtle px-1 rounded">JSON.stringify()</code> — no whitespace</li>
        <li>3. Encode the resulting string as UTF-8 (no BOM)</li>
      </ol>
      <p className="text-text-secondary mb-4">Top-level key order after sort:</p>
      <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4 mb-8">
        <code className="text-xs font-mono text-text-secondary">
          artifact → attestationFormat? → commit → enforcement → measurement → publicKeyB64 → version
        </code>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Field classification</h2>
      <h3 className="text-base font-semibold mt-6 mb-3">Signed (security-critical)</h3>
      <p className="text-sm text-text-secondary mb-2">
        These fields are in the SignedBody. Tampering invalidates the signature:
      </p>
      <div className="text-sm text-text-secondary mb-6">
        <code className="font-mono text-xs">version</code>, <code className="font-mono text-xs">artifact.*</code>, <code className="font-mono text-xs">commit.*</code>, <code className="font-mono text-xs">signer.publicKeyB64</code>, <code className="font-mono text-xs">environment.enforcement</code>, <code className="font-mono text-xs">environment.measurement</code>, <code className="font-mono text-xs">attestation.format</code>
      </div>

      <h3 className="text-base font-semibold mt-6 mb-3">Self-authenticating</h3>
      <p className="text-sm text-text-secondary mb-2">
        Not in the signed body, but independently verifiable:
      </p>
      <div className="text-sm text-text-secondary mb-6">
        <code className="font-mono text-xs">signatureB64</code> (Ed25519), <code className="font-mono text-xs">attestation.reportB64</code> (vendor-signed)
      </div>

      <h3 className="text-base font-semibold mt-6 mb-3">Advisory (unsigned)</h3>
      <p className="text-sm text-text-secondary mb-6">
        Not signed. Must not be used for security decisions: <code className="font-mono text-xs">timestamps</code>, <code className="font-mono text-xs">metadata</code>, <code className="font-mono text-xs">claims</code>.
      </p>

      <h2 className="text-xl font-semibold mt-12 mb-4">Algorithms</h2>
      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-text-tertiary">Purpose</th>
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-text-tertiary">Algorithm</th>
              <th className="text-left py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Details</th>
            </tr>
          </thead>
          <tbody className="text-text-secondary">
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4">Signature</td>
              <td className="py-2 pr-4">Ed25519 (RFC 8032)</td>
              <td className="py-2">32-byte key, 64-byte signature</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4">Hash</td>
              <td className="py-2 pr-4">SHA-256 (FIPS 180-4)</td>
              <td className="py-2">32 bytes, Base64 encoded</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="py-2 pr-4">Encoding</td>
              <td className="py-2 pr-4">Base64 (RFC 4648 §4)</td>
              <td className="py-2">Standard, with = padding</td>
            </tr>
            <tr>
              <td className="py-2 pr-4">Counter</td>
              <td className="py-2 pr-4">Decimal string</td>
              <td className="py-2">BigInt-safe, no leading zeros</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

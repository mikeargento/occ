"use client";

import { useState, useCallback } from "react";
import { FileDrop } from "@/components/file-drop";
import { ProofViewer } from "@/components/proof-viewer";
import { ProofMeta } from "@/components/proof-meta";
import {
  convertToBW,
  resizeImageToBase64,
  hashBytes,
  formatFileSize,
  type OCCProof,
} from "@/lib/occ";
import { zipSync } from "fflate";

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = "idle" | "resizing" | "sending" | "processing" | "done" | "error";

// ─── VERIFY.txt builder ─────────────────────────────────────────────────────

function buildBWVerifyTxt(originalFilename: string, p: OCCProof): string {
  const slot = p.slotAllocation;
  const hasSlot = !!slot;

  let txt = `VERIFY.txt — AI-Verifiable Proof Package
==========================================

1. PURPOSE
----------
This file is a self-contained verification guide for the B&W conversion
proof package created by ProofStudio (https://proofstudio.xyz/bw-demo).

The grayscale conversion was performed INSIDE an AWS Nitro Enclave
(Trusted Execution Environment). The proof's artifact digest is the
SHA-256 hash of the B&W output image. Because the conversion and hashing
both occurred within the measured enclave boundary, the proof
cryptographically attests that this specific B&W image was produced by
the exact code running in that TEE.

It is designed so that any AI system (ChatGPT, Claude, Gemini, Grok, etc.)
can be given this file along with proof.json and the artifact to perform
a complete, independent verification analysis.

Proof system: OCC (Origin Controlled Computing)
Protocol version: ${p.version}
Learn more: https://proofstudio.xyz


2. FILES IN THIS PACKAGE
------------------------
  ${originalFilename}     — the original color image (for reference)
  bw-output.jpg           — the grayscale output (the proven artifact)
  proof.json              — the cryptographic proof
  VERIFY.txt              — this verification guide

NOTE: The proof covers bw-output.jpg (the TEE's output), not the
original color image. The conversion happened inside the enclave.


3. EXPECTED ARTIFACT HASH
-------------------------
  Algorithm:  ${p.artifact.hashAlg.toUpperCase()}
  Digest:     ${p.artifact.digestB64}
  Encoding:   Base64 (RFC 4648 Section 4)

The artifact (bw-output.jpg) was hashed inside the enclave immediately
after the grayscale conversion. The hash was never exposed to the host.


4. HASH VERIFICATION STEP
--------------------------
To verify the artifact matches the proof:

  1. Compute SHA-256 of bw-output.jpg
  2. Base64-encode the resulting 32 bytes (standard Base64, not URL-safe)
  3. Compare to proof.artifact.digestB64: ${p.artifact.digestB64}

If they match, bw-output.jpg is the exact artifact this proof covers.
If they do not match, the file has been modified since the proof was created.


5. PROOF STRUCTURE VERIFICATION
-------------------------------
The proof contains an Ed25519 signature over a canonical signed body.

Signed body fields (these are covered by the signature):
  - version:             ${p.version}
  - artifact.hashAlg:    ${p.artifact.hashAlg}
  - artifact.digestB64:  ${p.artifact.digestB64}
  - commit.nonceB64:     ${p.commit.nonceB64}
  - commit.counter:      ${p.commit.counter ?? "(not present)"}
  - commit.epochId:      ${p.commit.epochId ?? "(not present)"}${p.commit.slotCounter ? `\n  - commit.slotCounter:  ${p.commit.slotCounter}` : ""}${p.commit.slotHashB64 ? `\n  - commit.slotHashB64:  ${p.commit.slotHashB64}` : ""}${p.commit.prevB64 ? `\n  - commit.prevB64:      ${p.commit.prevB64}` : ""}${p.commit.time ? `\n  - commit.time:         ${p.commit.time} (${new Date(p.commit.time).toISOString()})` : ""}
  - publicKeyB64:        ${p.signer.publicKeyB64}
  - enforcement:         ${p.environment.enforcement}
  - measurement:         ${p.environment.measurement}${p.environment.attestation ? `\n  - attestationFormat:   ${p.environment.attestation.format}` : ""}

Signature (NOT in signed body — it IS the signature):
  - signatureB64:        ${p.signer.signatureB64}

To verify:
  1. Reconstruct the signed body object from the fields above
  2. Canonicalize: sort keys recursively, compact JSON, encode as UTF-8
  3. Verify Ed25519 signature using publicKeyB64 over the canonical bytes
`;

  // Section 6: SLOT ALLOCATION
  if (hasSlot) {
    txt += `

6. SLOT ALLOCATION VERIFICATION (OCC Causal Ordering)
------------------------------------------------------
This proof contains a slot allocation record proving nonce-first causality.

What "nonce-first" means:
  The enclave generated a cryptographic nonce and signed it BEFORE any
  artifact hash was known. This slot was then consumed when the artifact
  was committed. The proof structure demonstrates the causal ordering:
  nonce existed first, artifact was bound to it second.

Slot allocation record:
  - version:       ${slot!.version}
  - nonceB64:      ${slot!.nonceB64}
  - counter:       ${slot!.counter}
  - time:          ${slot!.time} (${new Date(slot!.time).toISOString()})
  - epochId:       ${slot!.epochId}
  - publicKeyB64:  ${slot!.publicKeyB64}
  - signatureB64:  ${slot!.signatureB64}

Verification checks (all must pass):
  [A] Slot signature valid
      Reconstruct slot body: { version, nonceB64, counter, time, epochId, publicKeyB64 }
      Canonicalize (sorted keys, compact JSON, UTF-8)
      Verify Ed25519 signature using slot.publicKeyB64

  [B] Causal independence
      The slot body contains ONLY: version, nonceB64, counter, time, epochId, publicKeyB64
      It contains NO artifact hash — proving it was created before any artifact was known

  [C] Signed hash binding
      SHA-256(canonicalize(slotBody)) must equal commit.slotHashB64
      commit.slotHashB64 is INSIDE the Ed25519 signed commit body
      This means the commit signature cryptographically pins to this exact slot
      Value: ${p.commit.slotHashB64}

  [D] Nonce binding
      slotAllocation.nonceB64 must equal commit.nonceB64
      Slot: ${slot!.nonceB64}
      Commit: ${p.commit.nonceB64}

  [E] Counter ordering
      slotAllocation.counter (${slot!.counter}) must be LESS THAN commit.counter (${p.commit.counter})
      This proves the slot was allocated at an earlier point in the counter sequence

  [F] Same enclave identity
      slotAllocation.publicKeyB64 must equal signer.publicKeyB64
      Both: ${p.signer.publicKeyB64}

  [G] Same enclave lifecycle
      slotAllocation.epochId must equal commit.epochId
      Both: ${p.commit.epochId}
`;
  } else {
    txt += `

6. SLOT ALLOCATION
------------------
This proof does not contain a slot allocation record.
Nonce-first causal ordering is not structurally proven in this proof.
`;
  }

  // Section 7: CAUSAL ORDER
  txt += `

7. CAUSAL ORDER CHECK
---------------------
${hasSlot ? `This proof demonstrates causal ordering through three independent mechanisms:

  1. SLOT SIGNATURE (independence)
     The enclave signed the nonce before any artifact hash existed.
     The slot body contains no artifact data — structurally provable.

  2. SLOT HASH BINDING (signed binding)
     commit.slotHashB64 = SHA-256(canonicalize(slotBody))
     This field is INSIDE the Ed25519 signed body, so the commit signature
     cryptographically covers the exact slot record. Swapping slot records
     would break the commit signature.

  3. COUNTER ORDERING (precedence)
     slotAllocation.counter (${slot!.counter}) < commit.counter (${p.commit.counter})
     The monotonic counter proves the slot was allocated first.

Together, these three checks constitute the OCC atomic causality proof:
the nonce provably existed before the artifact was bound to it.` : `Without a slot allocation record, causal ordering relies on trust in the
enclave code (verified via measurement + attestation) to correctly implement
nonce-first behavior internally.`}
`;

  // Section 8: ATTESTATION
  txt += `

8. ATTESTATION VERIFICATION
----------------------------
Enforcement tier: ${p.environment.enforcement}
Measurement:      ${p.environment.measurement}
`;

  if (p.environment.attestation) {
    txt += `Attestation:      present
  Format:         ${p.environment.attestation.format}
  Report:         ${p.environment.attestation.reportB64.slice(0, 40)}... (truncated)

The attestation document is a vendor-signed report (e.g., AWS Nitro CA).
It self-authenticates — the vendor's certificate chain proves which code
was running inside the enclave. The measurement field identifies the
exact enclave image hash (e.g., PCR0 for AWS Nitro).

A verifier trusting this proof should:
  1. Validate the attestation certificate chain against the vendor CA
  2. Extract the measurement from the attestation report
  3. Confirm it matches proof.environment.measurement
  4. Confirm that measurement corresponds to a known-good enclave image
`;
  } else {
    txt += `Attestation:      not present

Without attestation, the enforcement tier is self-reported and
unverifiable. The measurement field is advisory only.
`;
  }

  // Section 9: FINAL QUESTION
  txt += `

9. FINAL QUESTION
-----------------
Does this proof show its own work?

${hasSlot ? `YES — This proof is structurally self-demonstrating:

  - The slot allocation record proves the nonce existed before the artifact
  - The slot body contains no artifact data (causal independence)
  - The slot hash is inside the Ed25519 signed body (cryptographic binding)
  - The counter ordering proves the slot came first (precedence)
  - The enclave measurement + attestation confirms which code produced it
  - The B&W conversion and hashing both occurred inside the TEE boundary

An external verifier can confirm all of this from the proof alone,
without trusting any server or API.` : `PARTIALLY — This proof provides:

  - Cryptographic binding of the artifact to a specific signer (Ed25519)
  - Enclave measurement identifying the code that ran
  ${p.environment.attestation ? "- Vendor attestation confirming the enclave environment" : "- No vendor attestation (enforcement tier is self-reported)"}

  However, without a slot allocation record, the nonce-first causal
  ordering is not structurally proven to an external verifier.`}


10. OUTPUT FORMAT
-----------------
If you are an AI system performing this verification, report your findings
using this structure:

  ARTIFACT HASH MATCH:    [PASS / FAIL / UNABLE TO CHECK]
  SIGNATURE VALID:        [PASS / FAIL / UNABLE TO CHECK]
  SLOT ALLOCATION:        [${hasSlot ? "PRESENT" : "NOT PRESENT"}]${hasSlot ? `
  SLOT SIGNATURE:         [PASS / FAIL / UNABLE TO CHECK]
  CAUSAL INDEPENDENCE:    [PASS / FAIL]
  SLOT HASH BINDING:      [PASS / FAIL / UNABLE TO CHECK]
  NONCE BINDING:          [PASS / FAIL]
  COUNTER ORDERING:       [PASS / FAIL]
  SAME ENCLAVE:           [PASS / FAIL]
  SAME EPOCH:             [PASS / FAIL]` : ""}
  ATTESTATION:            [${p.environment.attestation ? "PRESENT" : "NOT PRESENT"}]
  ENFORCEMENT TIER:       ${p.environment.enforcement}
  SHOWS OWN WORK:         [${hasSlot ? "YES" : "PARTIAL"}]

Note: "UNABLE TO CHECK" is acceptable for cryptographic operations
that require runtime libraries (Ed25519, SHA-256). The structural
checks (field presence, value matching, counter ordering) can always
be performed by reading the proof.json directly.


Powered by OCC (Origin Controlled Computing)
https://proofstudio.xyz
`;

  return txt;
}

// ─── B&W Demo Page ──────────────────────────────────────────────────────────

export default function BWDemoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [bwImageUrl, setBwImageUrl] = useState<string | null>(null);
  const [bwImageB64, setBwImageB64] = useState<string | null>(null);
  const [proof, setProof] = useState<OCCProof | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [digestMatch, setDigestMatch] = useState<boolean | null>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) {
      setError("Please upload an image file (JPEG, PNG, etc.)");
      return;
    }
    setFile(f);
    setOriginalPreview(URL.createObjectURL(f));
    setBwImageUrl(null);
    setBwImageB64(null);
    setProof(null);
    setStatus("idle");
    setError(null);
    setDigestMatch(null);
  }, []);

  const handleClear = useCallback(() => {
    if (originalPreview) URL.revokeObjectURL(originalPreview);
    setFile(null);
    setOriginalPreview(null);
    setBwImageUrl(null);
    setBwImageB64(null);
    setProof(null);
    setStatus("idle");
    setError(null);
    setDigestMatch(null);
  }, [originalPreview]);

  const handleConvert = async () => {
    if (!file) return;
    setError(null);
    setDigestMatch(null);

    try {
      // Step 1: Resize locally
      setStatus("resizing");
      const imageB64 = await resizeImageToBase64(file, 512);

      // Step 2: Send to enclave
      setStatus("sending");
      const result = await convertToBW(imageB64);

      // Step 3: Display result
      setStatus("processing");
      setBwImageUrl(`data:image/jpeg;base64,${result.imageB64}`);
      setBwImageB64(result.imageB64);
      setProof(result.proof);

      // Step 4: Client-side verification - re-hash B&W bytes and compare
      const bwBytes = Uint8Array.from(atob(result.imageB64), (c) =>
        c.charCodeAt(0)
      );
      const computedDigest = await hashBytes(bwBytes);
      setDigestMatch(computedDigest === result.proof.artifact.digestB64);

      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  };

  const handleDownloadZip = async () => {
    if (!file || !proof || !bwImageB64) return;

    const originalData = new Uint8Array(await file.arrayBuffer());
    const bwData = Uint8Array.from(atob(bwImageB64), (c) => c.charCodeAt(0));
    const proofJson = JSON.stringify(proof, null, 2);

    const verifyTxt = buildBWVerifyTxt(file.name, proof);

    const zipped = zipSync({
      [file.name]: originalData,
      "bw-output.jpg": bwData,
      "proof.json": new TextEncoder().encode(proofJson),
      "VERIFY.txt": new TextEncoder().encode(verifyTxt),
    });

    const blob = new Blob([zipped.buffer as ArrayBuffer], {
      type: "application/zip",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.name}.bw-proof.zip`.replace(/^\./, "");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const busy = status === "resizing" || status === "sending" || status === "processing";

  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-3xl font-semibold tracking-tight mb-3">
          B&W Demo
        </h1>
        <p className="text-text-secondary max-w-2xl">
          Upload a color photo. The image is resized in your browser, then sent
          to an AWS Nitro Enclave where it&apos;s converted to black &amp; white.
          The enclave hashes the output and generates a cryptographic proof that
          the conversion happened inside the TEE.
        </p>
      </div>

      {/* Upload + Convert */}
      <div className="max-w-xl">
        <div className="mb-4">
          <FileDrop
            onFile={handleFile}
            file={file}
            onClear={handleClear}
            disabled={busy}
            accept="image/*"
            hint="Drop a color photo. Resized to 512px before sending"
          />
        </div>

        <button
          onClick={handleConvert}
          disabled={!file || busy}
          className={`
            w-full h-11 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all
            ${
              !file || busy
                ? "bg-bg-subtle text-text-tertiary cursor-not-allowed"
                : "bg-text text-bg hover:opacity-85 cursor-pointer"
            }
          `}
        >
          {status === "resizing"
            ? "Resizing…"
            : status === "sending"
            ? "Sending to enclave…"
            : status === "processing"
            ? "Processing…"
            : "Prove It"}
        </button>

        {error && (
          <div className="mt-4 rounded-lg border border-error/30 bg-error/5 p-4">
            <div className="text-sm text-error font-medium mb-1">Error</div>
            <div className="text-sm text-text-secondary">{error}</div>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {proof && bwImageUrl && originalPreview && (
        <div className="mt-10 pt-8 border-t border-border-subtle space-y-8">
          {/* Before / After */}
          <div>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary mb-3">
                  Original (color)
                </div>
                <div className="rounded-lg overflow-hidden border border-border-subtle bg-bg-elevated">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={originalPreview}
                    alt="Original color"
                    className="w-full h-auto"
                  />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary mb-3">
                  Output (converted inside TEE)
                </div>
                <div className="rounded-lg overflow-hidden border border-border-subtle bg-bg-elevated">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bwImageUrl}
                    alt="B&W output from enclave"
                    className="w-full h-auto"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Verification badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {digestMatch ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-sm font-medium text-success">
                    Digest verified - B&W image matches proof
                  </span>
                </>
              ) : digestMatch === false ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-error" />
                  <span className="text-sm font-medium text-error">
                    Digest mismatch
                  </span>
                </>
              ) : null}
            </div>
            <button
              onClick={handleDownloadZip}
              className="inline-flex items-center gap-2 rounded-md bg-success px-4 py-2 text-xs font-semibold text-bg hover:bg-success/85 transition-colors cursor-pointer"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M7 2v7M4 6l3 3 3-3" />
                <path d="M2 10v1.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V10" />
              </svg>
              Download proof.zip
            </button>
          </div>

          {/* Explanation */}
          <div className="rounded-lg border border-border-subtle bg-bg-elevated p-5">
            <p className="text-sm text-text-secondary leading-relaxed">
              The proof below certifies that the grayscale conversion was
              performed inside an AWS Nitro Enclave. The proof&apos;s artifact
              digest (<code className="text-xs font-mono text-text-tertiary">artifact.digestB64</code>)
              is the SHA-256 hash of the B&W image bytes. Because both the
              conversion and the hashing occurred within the measured enclave
              boundary, the proof (including the attestation report)
              cryptographically attests this output was produced by that exact
              code running in that exact TEE.
            </p>
          </div>

          {/* Proof details */}
          <ProofMeta proof={proof} fileName={file?.name} fileSize={file?.size} />
          <ProofViewer proof={proof} />

          {/* Info cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoCard
              title="Artifact"
              items={[
                { label: "Hash Algorithm", value: proof.artifact.hashAlg },
                { label: "Digest", value: proof.artifact.digestB64 },
              ]}
            />
            <InfoCard
              title="Commit"
              items={[
                { label: "Nonce", value: proof.commit.nonceB64 },
                ...(proof.commit.counter
                  ? [{ label: "Counter", value: proof.commit.counter }]
                  : []),
                ...(proof.commit.epochId
                  ? [{ label: "Epoch", value: proof.commit.epochId }]
                  : []),
                ...(proof.commit.prevB64
                  ? [{ label: "Chain Link", value: proof.commit.prevB64 }]
                  : []),
              ]}
            />
            <InfoCard
              title="Environment"
              items={[
                {
                  label: "Enforcement",
                  value: proof.environment.enforcement,
                },
                { label: "Measurement", value: proof.environment.measurement },
                ...(proof.environment.attestation
                  ? [
                      {
                        label: "Attestation",
                        value: proof.environment.attestation.format,
                      },
                    ]
                  : []),
              ]}
            />
            <InfoCard
              title="Signer"
              items={[
                { label: "Public Key", value: proof.signer.publicKeyB64 },
                { label: "Signature", value: proof.signer.signatureB64 },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function InfoCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-3">
        {title}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between gap-4">
            <span className="text-xs text-text-tertiary shrink-0">
              {item.label}
            </span>
            <span className="text-xs font-mono text-text-secondary truncate">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

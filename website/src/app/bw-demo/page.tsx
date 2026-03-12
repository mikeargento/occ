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

    const verifyTxt = `VERIFICATION INSTRUCTIONS
========================

This proof.zip was created by the OCC B&W Demo (https://www.occ.wtf/bw-demo).

It contains:
  - ${file.name}          (the original color image)
  - bw-output.jpg         (the grayscale output)
  - proof.json            (the cryptographic proof)
  - VERIFY.txt            (this file)

What this proves:
  The grayscale conversion was performed INSIDE an AWS Nitro Enclave
  (Trusted Execution Environment). The proof's artifact digest is the
  SHA-256 hash of the B&W output image. Because the conversion and
  hashing both occurred within the measured enclave boundary, the proof
  cryptographically attests that this specific B&W image was produced
  by the exact code running in that TEE.

Proof details:
  Version:     ${proof.version}
  Digest:      ${proof.artifact.digestB64}
  Algorithm:   ${proof.artifact.hashAlg}
  Enforcement: ${proof.environment.enforcement}
  Public Key:  ${proof.signer.publicKeyB64}

To verify:
  1. SHA-256 hash bw-output.jpg
  2. Compare the hash to proof.artifact.digestB64
  3. Verify the Ed25519 signature using the proof's public key

Learn more: https://www.occ.wtf
`;

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

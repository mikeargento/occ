"use client";

import { useState, useRef, useCallback } from "react";
import {
  hashFile,
  commitDigest,
  commitBatch,
  formatFileSize,
  type OCCProof,
} from "@/lib/occ";
import { zipSync } from "fflate";

/* ── Types ───────────────────────────────────────────────────────────── */

type Step = "drop" | "hashing" | "signing" | "done" | "error";

interface Progress {
  current: number;
  total: number;
  fileName: string;
}

/* ── VERIFY.txt builder ──────────────────────────────────────────────── */

function buildVerifyTxt(filename: string, p: OCCProof): string {
  return `VERIFY.txt — OCC Proof Package
===================================

FILE:       ${filename}
DIGEST:     ${p.artifact.digestB64}
ALGORITHM:  ${p.artifact.hashAlg.toUpperCase()}
COUNTER:    #${p.commit.counter ?? "—"}
TIME:       ${p.commit.time ? new Date(p.commit.time).toISOString() : "—"}
ENFORCEMENT: ${p.environment?.enforcement === "measured-tee" ? "Hardware Enclave (AWS Nitro)" : "Software"}
SIGNER:     ${p.signer.publicKeyB64}

HOW TO VERIFY
-------------
1. Compute SHA-256 of the original file
2. Base64-encode the result (standard, not URL-safe)
3. Compare to the DIGEST above
4. If they match, proof.json covers this exact file

The proof was signed inside an AWS Nitro Enclave using Ed25519.
The private key was generated inside the enclave and has never left it.

Learn more: https://occ.wtf/docs
`;
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function Home() {
  const [step, setStep] = useState<Step>("drop");
  const [files, setFiles] = useState<File[]>([]);
  const [digest, setDigest] = useState("");
  const [proofs, setProofs] = useState<OCCProof[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [copied, setCopied] = useState(false);

  const browseRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  /* ── Handlers ── */

  const handleFiles = useCallback(async (incoming: File[]) => {
    setFiles(incoming);
    setStep("hashing");
    setError("");
    setProofs([]);
    setCopied(false);

    try {
      if (incoming.length === 1) {
        const f = incoming[0];
        setProgress({ current: 1, total: 1, fileName: f.name });
        const d = await hashFile(f);
        setDigest(d);
        setStep("signing");
        const p = await commitDigest(d);
        setProofs([p]);
        setStep("done");
      } else {
        const digests: Array<{ digestB64: string; hashAlg: "sha256" }> = [];
        for (let i = 0; i < incoming.length; i++) {
          setProgress({ current: i + 1, total: incoming.length, fileName: incoming[i].name });
          const d = await hashFile(incoming[i]);
          digests.push({ digestB64: d, hashAlg: "sha256" });
        }
        setDigest(digests[0].digestB64);
        setStep("signing");
        setProgress({ current: 0, total: incoming.length, fileName: "" });
        const ps = await commitBatch(digests);
        setProofs(ps);
        setStep("done");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  }, []);

  function reset() {
    setFiles([]);
    setStep("drop");
    setDigest("");
    setProofs([]);
    setError("");
    setProgress(null);
    setCopied(false);
  }

  async function downloadZip() {
    if (!proofs.length || !files.length) return;
    const zipFiles: Record<string, Uint8Array> = {};

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const p = proofs[i] || proofs[0];
      zipFiles[f.name] = new Uint8Array(await f.arrayBuffer());
      const proofName = files.length > 1 ? `proof-${i + 1}.json` : "proof.json";
      zipFiles[proofName] = new TextEncoder().encode(JSON.stringify(p, null, 2));
      if (i === 0) {
        zipFiles["VERIFY.txt"] = new TextEncoder().encode(buildVerifyTxt(f.name, p));
      }
    }

    const zipped = zipSync(zipFiles);
    const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = files.length === 1
      ? `${files[0].name.replace(/\.[^.]+$/, "")}-occ-proof.zip`
      : "occ-proof-batch.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyDigest() {
    navigator.clipboard.writeText(digest);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* ── Drag / drop on the whole hero ── */

  const [dragover, setDragover] = useState(false);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragover(false);
    if (step !== "drop") return;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) handleFiles(dropped);
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    handleFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  /* ── Derived values ── */

  const firstProof = proofs[0];
  const counter = firstProof?.commit?.counter;
  const wallTime = firstProof?.commit?.time
    ? new Date(firstProof.commit.time).toLocaleString()
    : null;

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div style={s.page}>
      {/* ── Nav ── */}
      <nav style={s.nav}>
        <a href="/" style={s.navBrand}>OCC</a>
        <div style={s.navLinks}>
          <a href="/chain" style={s.navLink}>Chain</a>
          <a href="/docs" style={s.navLink}>Docs</a>
          <a href="https://github.com/mikeargento/occ" style={s.navLink} target="_blank" rel="noopener">GitHub</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <main
        style={s.hero}
        onDragOver={(e) => { e.preventDefault(); if (step === "drop") setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={onDrop}
      >
        <div style={s.content}>
          <div style={s.title}>OCC</div>
          <div style={s.subtitle}>Drop a file. Prove it exists.</div>

          {/* Hidden inputs */}
          <input ref={browseRef} type="file" multiple accept="*/*" style={{ display: "none" }} onChange={onFileInput} />
          <input ref={captureRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onFileInput} />

          {/* ── Drop state ── */}
          {step === "drop" && (
            <div
              style={{
                ...s.dropZone,
                borderColor: dragover ? "var(--c-accent)" : "var(--c-border)",
                background: dragover ? "rgba(59,130,246,0.04)" : "transparent",
              }}
              onClick={() => browseRef.current?.click()}
            >
              <div style={s.dropIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 4v12M8 8l4-4 4 4" />
                  <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
                </svg>
              </div>
              <div style={s.dropText}>Drop files here</div>
              <div style={s.dropActions}>
                or{" "}
                <span style={s.dropLink} onClick={(e) => { e.stopPropagation(); browseRef.current?.click(); }}>browse</span>
                {" "}&middot;{" "}
                <span style={s.dropLink} onClick={(e) => { e.stopPropagation(); captureRef.current?.click(); }}>take photo</span>
              </div>
              <div style={s.dropPrivacy}>Nothing leaves your browser.</div>
            </div>
          )}

          {/* ── Hashing state ── */}
          {step === "hashing" && progress && (
            <div style={s.stateBox}>
              <div style={s.spinner} />
              <div style={s.stateLabel}>
                {progress.total === 1
                  ? `Hashing ${progress.fileName}...`
                  : `Hashing ${progress.current} of ${progress.total} files...`}
              </div>
              {progress.total > 1 && (
                <div style={s.stateSub}>{progress.fileName}</div>
              )}
            </div>
          )}

          {/* ── Signing state ── */}
          {step === "signing" && (
            <div style={s.stateBox}>
              <div style={s.spinner} />
              <div style={s.stateLabel}>Signing in hardware enclave...</div>
              <div style={s.digestMono}>{digest.slice(0, 24)}...</div>
            </div>
          )}

          {/* ── Done state ── */}
          {step === "done" && firstProof && (
            <div style={s.doneBox}>
              <div style={s.checkmark}>&#10003;</div>
              <div style={s.proven}>Proven.</div>

              <div style={s.doneFile}>
                {files.length === 1
                  ? `${files[0].name} (${formatFileSize(files[0].size)})`
                  : `${files.length} files`}
              </div>

              {counter != null && (
                <div style={s.counter}>#{counter}</div>
              )}

              <div style={s.digestRow} onClick={copyDigest} title="Click to copy">
                <span style={s.digestFull}>{digest}</span>
                <span style={s.copyHint}>{copied ? "Copied" : "Copy"}</span>
              </div>

              {wallTime && <div style={s.wallTime}>{wallTime}</div>}

              <div style={s.doneButtons}>
                <button style={s.btnPrimary} onClick={downloadZip}>Download proof</button>
                <button style={s.btnSecondary} onClick={reset}>Prove another</button>
              </div>

              <a href="/chain" style={s.chainLink}>View on chain &rarr;</a>
            </div>
          )}

          {/* ── Error state ── */}
          {step === "error" && (
            <div style={s.stateBox}>
              <div style={s.errorText}>{error}</div>
              <button style={s.btnSecondary} onClick={reset}>Try again</button>
            </div>
          )}
        </div>
      </main>

      {/* Spinner keyframes */}
      <style>{`
        @keyframes occ-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */

const mono = "ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace";
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg, #0f0f0f)",
    color: "var(--c-text, #ededed)",
    fontFamily: sans,
  },

  /* Nav */
  nav: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    borderBottom: "1px solid var(--c-border, #2a2a2a)",
    background: "var(--bg, #0f0f0f)",
  },
  navBrand: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--c-text, #ededed)",
    textDecoration: "none",
    letterSpacing: "0.04em",
  },
  navLinks: {
    display: "flex",
    gap: 24,
  },
  navLink: {
    fontSize: 14,
    color: "var(--c-text-secondary, #a3a3a3)",
    textDecoration: "none",
  },

  /* Hero */
  hero: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "calc(100vh - 56px)",
    padding: "24px 16px",
  },
  content: {
    width: "100%",
    maxWidth: 520,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: "var(--c-text, #ededed)",
    textAlign: "center" as const,
    marginBottom: 8,
    letterSpacing: "0.04em",
  },
  subtitle: {
    fontSize: 18,
    color: "var(--c-text-secondary, #a3a3a3)",
    textAlign: "center" as const,
    marginBottom: 32,
  },

  /* Drop zone */
  dropZone: {
    width: "100%",
    border: "2px dashed var(--c-border, #2e2e2e)",
    borderRadius: 16,
    padding: "48px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    cursor: "pointer",
    transition: "border-color 0.2s, background 0.2s",
  },
  dropIcon: {
    color: "var(--c-text-tertiary, #737373)",
    marginBottom: 16,
  },
  dropText: {
    fontSize: 16,
    color: "var(--c-text-secondary, #a3a3a3)",
    marginBottom: 6,
  },
  dropActions: {
    fontSize: 14,
    color: "var(--c-text-tertiary, #737373)",
    marginBottom: 20,
  },
  dropLink: {
    color: "var(--c-text, #ededed)",
    fontWeight: 500,
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
  dropPrivacy: {
    fontSize: 13,
    color: "var(--c-text-tertiary, #737373)",
  },

  /* State boxes (hashing, signing, error) */
  stateBox: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "48px 24px",
    border: "1px solid var(--c-border, #2e2e2e)",
    borderRadius: 16,
  },
  spinner: {
    width: 28,
    height: 28,
    border: "2px solid var(--c-border, #2e2e2e)",
    borderTopColor: "var(--c-accent, #3b82f6)",
    borderRadius: "50%",
    animation: "occ-spin 0.8s linear infinite",
    marginBottom: 16,
  },
  stateLabel: {
    fontSize: 15,
    color: "var(--c-text-secondary, #a3a3a3)",
  },
  stateSub: {
    fontSize: 13,
    color: "var(--c-text-tertiary, #737373)",
    marginTop: 4,
    fontFamily: mono,
  },
  digestMono: {
    fontSize: 13,
    color: "var(--c-text-tertiary, #737373)",
    fontFamily: mono,
    marginTop: 8,
  },

  /* Done state */
  doneBox: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "40px 24px",
    border: "1px solid var(--c-border, #2e2e2e)",
    borderRadius: 16,
  },
  checkmark: {
    fontSize: 48,
    fontWeight: 700,
    color: "#34d399",
    lineHeight: 1,
    marginBottom: 8,
  },
  proven: {
    fontSize: 24,
    fontWeight: 700,
    color: "#34d399",
    marginBottom: 16,
  },
  doneFile: {
    fontSize: 14,
    color: "var(--c-text-secondary, #a3a3a3)",
    marginBottom: 8,
  },
  counter: {
    fontSize: 28,
    fontWeight: 700,
    fontFamily: mono,
    color: "var(--c-accent, #3b82f6)",
    marginBottom: 16,
  },
  digestRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    cursor: "pointer",
    marginBottom: 8,
  },
  digestFull: {
    fontSize: 11,
    fontFamily: mono,
    color: "var(--c-text-tertiary, #737373)",
    wordBreak: "break-all" as const,
    flex: 1,
  },
  copyHint: {
    fontSize: 11,
    color: "var(--c-text-tertiary, #737373)",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  wallTime: {
    fontSize: 13,
    color: "var(--c-text-tertiary, #737373)",
    marginBottom: 24,
  },
  doneButtons: {
    display: "flex",
    gap: 12,
    width: "100%",
    marginBottom: 16,
  },
  btnPrimary: {
    flex: 1,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    background: "var(--c-accent, #3b82f6)",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  btnSecondary: {
    flex: 1,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--c-text-secondary, #a3a3a3)",
    background: "transparent",
    border: "1px solid var(--c-border, #2e2e2e)",
    borderRadius: 8,
    cursor: "pointer",
  },
  chainLink: {
    fontSize: 13,
    color: "var(--c-text-tertiary, #737373)",
    textDecoration: "none",
  },

  /* Error */
  errorText: {
    fontSize: 15,
    color: "#ef4444",
    marginBottom: 16,
    textAlign: "center" as const,
  },
};

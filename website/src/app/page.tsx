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

type Step = "idle" | "hashing" | "signing" | "done" | "error";

interface Progress {
  current: number;
  total: number;
  fileName: string;
}

/* ── VERIFY.txt builder ──────────────────────────────────────────────── */

function buildVerifyTxt(filename: string, p: OCCProof): string {
  return `OCC Proof
=========

File:        ${filename}
Digest:      ${p.artifact.digestB64}
Algorithm:   ${p.artifact.hashAlg.toUpperCase()}
Counter:     #${p.commit.counter ?? "—"}
Time:        ${p.commit.time ? new Date(p.commit.time).toISOString() : "—"}
Enforcement: ${p.environment?.enforcement === "measured-tee" ? "Hardware Enclave (AWS Nitro)" : "Software"}
Signer:      ${p.signer.publicKeyB64}

Verify: https://occ.wtf/docs/verification
`;
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function Home() {
  const [step, setStep] = useState<Step>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [digest, setDigest] = useState("");
  const [proofs, setProofs] = useState<OCCProof[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragover, setDragover] = useState(false);

  const browseRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

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
          setProgress({
            current: i + 1,
            total: incoming.length,
            fileName: incoming[i].name,
          });
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
    setStep("idle");
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
      const proofName =
        files.length > 1 ? `proof-${i + 1}.json` : "proof.json";
      zipFiles[proofName] = new TextEncoder().encode(
        JSON.stringify(p, null, 2)
      );
      if (i === 0) {
        zipFiles["VERIFY.txt"] = new TextEncoder().encode(
          buildVerifyTxt(f.name, p)
        );
      }
    }
    const zipped = zipSync(zipFiles);
    const blob = new Blob([zipped.buffer as ArrayBuffer], {
      type: "application/zip",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      files.length === 1
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

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragover(false);
    if (step !== "idle") return;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) handleFiles(dropped);
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    handleFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  const firstProof = proofs[0];
  const counter = firstProof?.commit?.counter;
  const wallTime = firstProof?.commit?.time
    ? new Date(Number(firstProof.commit.time)).toLocaleString()
    : null;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #09090b;
          --surface: #18181b;
          --border: #27272a;
          --text: #fafafa;
          --text-2: #a1a1aa;
          --text-3: #71717a;
          --accent: #3b82f6;
          --accent-hover: #2563eb;
          --green: #22c55e;
          --red: #ef4444;
          --mono: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
          --sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
        }

        html, body { background: var(--bg); color: var(--text); font-family: var(--sans); }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Nav ── */}
        <nav
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <a
            href="/"
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text)",
              textDecoration: "none",
              letterSpacing: "0.08em",
              fontFamily: "var(--mono)",
            }}
          >
            OCC
          </a>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <a href="/docs" style={linkStyle}>
              Docs
            </a>
            <a
              href="https://github.com/mikeargento/occ"
              target="_blank"
              rel="noopener"
              style={linkStyle}
            >
              GitHub
            </a>
          </div>
        </nav>

        {/* ── Main ── */}
        <main
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 20px",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (step === "idle") setDragover(true);
          }}
          onDragLeave={() => setDragover(false)}
          onDrop={onDrop}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              animation: "fadeIn 0.4s ease-out",
            }}
          >
            {/* ── IDLE: Drop zone ── */}
            {step === "idle" && (
              <div style={{ textAlign: "center" }}>
                <h1
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: "var(--text)",
                    marginBottom: 8,
                    lineHeight: 1.2,
                  }}
                >
                  Prove it.
                </h1>
                <p
                  style={{
                    fontSize: 16,
                    color: "var(--text-2)",
                    marginBottom: 40,
                    lineHeight: 1.5,
                  }}
                >
                  Drop a file. Get a cryptographic proof
                  <br />
                  signed inside a hardware enclave.
                </p>

                {/* Hidden inputs */}
                <input
                  ref={browseRef}
                  type="file"
                  multiple
                  accept="*/*"
                  style={{ display: "none" }}
                  onChange={onFileInput}
                />
                <input
                  ref={captureRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={onFileInput}
                />

                <div
                  onClick={() => browseRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragover ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 12,
                    padding: "56px 24px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    background: dragover
                      ? "rgba(59, 130, 246, 0.04)"
                      : "transparent",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 20px",
                    }}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-3)"
                      strokeWidth="1.5"
                    >
                      <path d="M12 4v12M8 8l4-4 4 4" />
                      <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
                    </svg>
                  </div>

                  <div
                    style={{
                      fontSize: 15,
                      color: "var(--text-2)",
                      marginBottom: 8,
                    }}
                  >
                    Drop files here
                  </div>

                  <div
                    style={{
                      fontSize: 14,
                      color: "var(--text-3)",
                    }}
                  >
                    or{" "}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        browseRef.current?.click();
                      }}
                      style={inlineLink}
                    >
                      browse
                    </span>
                    {" · "}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        captureRef.current?.click();
                      }}
                      style={inlineLink}
                    >
                      take photo
                    </span>
                  </div>
                </div>

                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-3)",
                    marginTop: 16,
                  }}
                >
                  Files are hashed in your browser. Nothing is uploaded.
                </p>
              </div>
            )}

            {/* ── HASHING ── */}
            {step === "hashing" && progress && (
              <div style={card}>
                <div style={spinner} />
                <div
                  style={{
                    fontSize: 15,
                    color: "var(--text)",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {progress.total === 1
                    ? "Hashing file..."
                    : `Hashing ${progress.current} of ${progress.total}...`}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-3)",
                    fontFamily: "var(--mono)",
                  }}
                >
                  {progress.fileName}
                </div>
                {progress.total > 1 && (
                  <div
                    style={{
                      width: "100%",
                      height: 3,
                      background: "var(--border)",
                      borderRadius: 2,
                      marginTop: 16,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${(progress.current / progress.total) * 100}%`,
                        background: "var(--accent)",
                        borderRadius: 2,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── SIGNING ── */}
            {step === "signing" && (
              <div style={card}>
                <div style={spinner} />
                <div
                  style={{
                    fontSize: 15,
                    color: "var(--text)",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  Signing in hardware enclave...
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-3)",
                    fontFamily: "var(--mono)",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                >
                  {digest.slice(0, 32)}...
                </div>
              </div>
            )}

            {/* ── DONE ── */}
            {step === "done" && firstProof && (
              <div
                style={{
                  ...card,
                  animation: "scaleIn 0.3s ease-out",
                }}
              >
                {/* Success indicator */}
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "rgba(34, 197, 94, 0.1)",
                    border: "2px solid var(--green)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                  }}
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--green)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>

                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--text)",
                    marginBottom: 4,
                  }}
                >
                  Proven
                </div>

                {/* File info */}
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--text-2)",
                    marginBottom: 20,
                  }}
                >
                  {files.length === 1
                    ? `${files[0].name} · ${formatFileSize(files[0].size)}`
                    : `${files.length} files`}
                </div>

                {/* Proof details */}
                <div
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 20,
                  }}
                >
                  {counter != null && (
                    <div style={detailRow}>
                      <span style={detailLabel}>Proof</span>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 14,
                          color: "var(--accent)",
                          fontWeight: 600,
                        }}
                      >
                        #{counter}
                      </span>
                    </div>
                  )}
                  {wallTime && (
                    <div style={detailRow}>
                      <span style={detailLabel}>Time</span>
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--text-2)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {wallTime}
                      </span>
                    </div>
                  )}
                  <div style={detailRow}>
                    <span style={detailLabel}>Enforcement</span>
                    <span style={{ fontSize: 13, color: "var(--green)" }}>
                      Hardware Enclave
                    </span>
                  </div>
                  <div
                    style={{
                      ...detailRow,
                      borderBottom: "none",
                      paddingBottom: 0,
                      cursor: "pointer",
                    }}
                    onClick={copyDigest}
                  >
                    <span style={detailLabel}>Digest</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-3)",
                        fontFamily: "var(--mono)",
                        wordBreak: "break-all" as const,
                        textAlign: "right" as const,
                        maxWidth: "70%",
                      }}
                    >
                      {digest}
                      <span
                        style={{
                          display: "inline-block",
                          marginLeft: 6,
                          fontSize: 10,
                          color: copied ? "var(--green)" : "var(--text-3)",
                          transition: "color 0.2s",
                        }}
                      >
                        {copied ? "Copied" : "Copy"}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    width: "100%",
                    marginBottom: 16,
                  }}
                >
                  <button onClick={downloadZip} style={btnPrimary}>
                    Download .zip
                  </button>
                  <button onClick={reset} style={btnGhost}>
                    New proof
                  </button>
                </div>
              </div>
            )}

            {/* ── ERROR ── */}
            {step === "error" && (
              <div style={card}>
                <div
                  style={{
                    fontSize: 15,
                    color: "var(--red)",
                    marginBottom: 16,
                    textAlign: "center" as const,
                  }}
                >
                  {error}
                </div>
                <button onClick={reset} style={btnGhost}>
                  Try again
                </button>
              </div>
            )}
          </div>
        </main>

        {/* ── Footer ── */}
        <footer
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: "var(--text-3)",
          }}
        >
          <span>Signed by AWS Nitro Enclave</span>
          <span>Anchored to Ethereum every 10 min</span>
        </footer>
      </div>
    </>
  );
}

/* ── Shared styles ────────────────────────────────────────────────────── */

const linkStyle: React.CSSProperties = {
  fontSize: 14,
  color: "var(--text-3)",
  textDecoration: "none",
};

const inlineLink: React.CSSProperties = {
  color: "var(--text)",
  fontWeight: 500,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  textDecorationColor: "var(--text-3)",
};

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "40px 28px",
  border: "1px solid var(--border)",
  borderRadius: 12,
  background: "var(--surface)",
  textAlign: "center" as const,
};

const spinner: React.CSSProperties = {
  width: 24,
  height: 24,
  border: "2px solid var(--border)",
  borderTopColor: "var(--accent)",
  borderRadius: "50%",
  animation: "spin 0.7s linear infinite",
  marginBottom: 16,
};

const detailRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 0",
  borderBottom: "1px solid var(--border)",
};

const detailLabel: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-3)",
  flexShrink: 0,
};

const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: "12px 0",
  fontSize: 14,
  fontWeight: 600,
  color: "#fff",
  background: "var(--accent)",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  flex: 1,
  padding: "12px 0",
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text-2)",
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 8,
  cursor: "pointer",
};

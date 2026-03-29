"use client";

import { useState } from "react";
import { FileDrop } from "@/components/file-drop";
import { hashFile, commitDigest, formatFileSize, type OCCProof } from "@/lib/occ";
import Link from "next/link";

type Step = "drop" | "hashing" | "signing" | "done" | "error";

export default function MakerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("drop");
  const [digest, setDigest] = useState<string>("");
  const [proof, setProof] = useState<OCCProof | null>(null);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);

  async function handleFile(f: File) {
    setFile(f);
    setStep("hashing");
    setError("");
    try {
      const d = await hashFile(f);
      setDigest(d);
      setStep("signing");
      const p = await commitDigest(d);
      setProof(p);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  }

  function reset() {
    setFile(null);
    setStep("drop");
    setDigest("");
    setProof(null);
    setError("");
  }

  function copyProof() {
    if (!proof) return;
    navigator.clipboard.writeText(JSON.stringify(proof, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--c-text)",
    }}>
      {/* Nav */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        borderBottom: "1px solid var(--c-border-subtle)",
        background: "var(--bg)",
      }}>
        <div style={{
          maxWidth: 960, margin: "0 auto", padding: "0 24px",
          height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <Link href="/" style={{
            fontSize: 18, fontWeight: 700, textDecoration: "none",
            color: "var(--c-text)", letterSpacing: "-0.03em",
          }}>OCC</Link>
          <div style={{ display: "flex", gap: 24, fontSize: 14, color: "var(--c-text-secondary)" }}>
            <Link href="/docs" style={{ textDecoration: "none", color: "inherit" }}>Docs</Link>
            <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener"
              style={{ textDecoration: "none", color: "inherit" }}>GitHub</a>
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={{
        maxWidth: 640, margin: "0 auto", padding: "80px 24px",
      }}>
        <h1 style={{
          fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em",
          marginBottom: 8,
        }}>Maker</h1>
        <p style={{
          fontSize: 16, color: "var(--c-text-secondary)",
          marginBottom: 40, lineHeight: 1.5,
        }}>
          Drop a file. Get a cryptographic proof signed inside a hardware enclave.
        </p>

        {step === "drop" && (
          <FileDrop onFile={handleFile} file={null} hint="Any file. Hashed locally in your browser — nothing uploaded." />
        )}

        {step === "hashing" && (
          <div style={{
            border: "1px solid var(--c-border-subtle)",
            padding: "48px 24px", textAlign: "center",
            background: "var(--bg-elevated)",
          }}>
            <div style={{ fontSize: 14, color: "var(--c-text-secondary)" }}>
              Hashing {file?.name}...
            </div>
          </div>
        )}

        {step === "signing" && (
          <div style={{
            border: "1px solid var(--c-border-subtle)",
            padding: "48px 24px", textAlign: "center",
            background: "var(--bg-elevated)",
          }}>
            <div style={{ fontSize: 14, color: "var(--c-text-secondary)", marginBottom: 8 }}>
              Signing in hardware enclave...
            </div>
            <div style={{ fontSize: 12, color: "var(--c-text-tertiary)", fontFamily: "monospace" }}>
              {digest.slice(0, 32)}...
            </div>
          </div>
        )}

        {step === "error" && (
          <div style={{
            border: "1px solid #ff453a",
            padding: "32px 24px", textAlign: "center",
            background: "var(--bg-elevated)",
          }}>
            <div style={{ fontSize: 14, color: "#ff453a", marginBottom: 16 }}>{error}</div>
            <button onClick={reset} style={{
              fontSize: 14, fontWeight: 500, padding: "8px 20px",
              border: "1px solid var(--c-border)", borderRadius: 8,
              background: "transparent", color: "var(--c-text)", cursor: "pointer",
            }}>Try again</button>
          </div>
        )}

        {step === "done" && proof && (
          <div>
            {/* Success header */}
            <div style={{
              border: "1px solid var(--c-border-subtle)",
              padding: "32px 24px",
              background: "var(--bg-elevated)",
              marginBottom: 16,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
              }}>
                <span style={{ color: "#30d158", fontSize: 20 }}>●</span>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Proof created</span>
              </div>

              <div style={{ fontSize: 13, color: "var(--c-text-secondary)", marginBottom: 4 }}>
                {file?.name} · {file ? formatFileSize(file.size) : ""}
              </div>

              <div style={{
                fontSize: 12, fontFamily: "monospace", color: "#30d158",
                wordBreak: "break-all", lineHeight: 1.6, marginBottom: 16,
              }}>
                {proof.artifact.digestB64}
              </div>

              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--c-text-tertiary)" }}>
                <span>Counter #{proof.commit.counter}</span>
                <span>·</span>
                <span>{proof.environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"}</span>
                <span>·</span>
                <span>{proof.commit.time ? new Date(proof.commit.time).toLocaleString() : ""}</span>
              </div>
            </div>

            {/* Proof JSON */}
            <div style={{
              border: "1px solid var(--c-border-subtle)",
              padding: "20px 24px",
              background: "var(--bg-elevated)",
              position: "relative",
              marginBottom: 16,
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 12,
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Proof JSON
                </span>
                <button onClick={copyProof} style={{
                  fontSize: 12, fontWeight: 500, padding: "4px 12px",
                  border: "1px solid var(--c-border)", borderRadius: 6,
                  background: "transparent", color: copied ? "#30d158" : "var(--c-text-secondary)",
                  cursor: "pointer",
                }}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre style={{
                fontSize: 11, fontFamily: "monospace", lineHeight: 1.5,
                color: "#30d158", background: "#0a0a0a",
                padding: 16, borderRadius: 6, overflow: "auto",
                maxHeight: 400,
              }}>
                {JSON.stringify(proof, null, 2)}
              </pre>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={reset} style={{
                flex: 1, height: 48, fontSize: 15, fontWeight: 500,
                border: "1px solid var(--c-border)", borderRadius: 10,
                background: "transparent", color: "var(--c-text)", cursor: "pointer",
              }}>
                Create another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

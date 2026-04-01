"use client";

import { useState } from "react";
import { FileDrop } from "@/components/file-drop";
import { Nav } from "@/components/nav";
import {
  hashFile,
  commitDigest,
  commitBatch,
  formatFileSize,
  isOCCProof,
  verifyProofSignature,
  type OCCProof,
  type ProofVerifyResult,
} from "@/lib/occ";
import { toUrlSafeB64 } from "@/lib/explorer";
import { zipSync } from "fflate";

type Mode = "prove" | "verify";
type ProveStep = "drop" | "hashing" | "signing" | "done" | "error";
type VerifyStep = "drop" | "checking" | "result";

interface VerifyItem {
  file: File;
  proof: OCCProof | null;
  result: ProofVerifyResult | null;
  found: boolean;
}

/* ── VERIFY.txt ── */

function buildVerifyTxt(filename: string, p: OCCProof): string {
  return `OCC Proof — ${filename}
Digest:      ${p.artifact.digestB64}
Algorithm:   ${p.artifact.hashAlg.toUpperCase()}
Counter:     #${p.commit.counter ?? "—"}
Enforcement: ${p.environment?.enforcement === "measured-tee" ? "Hardware Enclave (AWS Nitro)" : "Software"}
Signer:      ${p.signer.publicKeyB64}

https://occ.wtf/docs
`;
}

/* ══════════════════════════════════════════════════════════════════════════ */

export default function OCCPage() {
  const [mode, setMode] = useState<Mode>("prove");

  // Prove state
  const [proveStep, setProveStep] = useState<ProveStep>("drop");
  const [proveFiles, setProveFiles] = useState<File[]>([]);
  const [proveDigest, setProveDigest] = useState("");
  const [proveProofs, setProveProofs] = useState<OCCProof[]>([]);
  const [proveError, setProveError] = useState("");
  const [proveProgress, setProveProgress] = useState({ current: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [attribution, setAttribution] = useState("");

  // Verify state
  const [verifyStep, setVerifyStep] = useState<VerifyStep>("drop");
  const [verifyItems, setVerifyItems] = useState<VerifyItem[]>([]);

  /* ── Prove ── */

  async function handleProveFiles(files: File[]) {
    setProveFiles(files);
    setProveStep("hashing");
    setProveError("");
    try {
      if (files.length === 1) {
        const d = await hashFile(files[0]);
        setProveDigest(d);
        setProveStep("signing");
        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;
        const p = await commitDigest(d, undefined, undefined, attr);
        setProveProofs([p]);
        setProveStep("done");
      } else {
        const digests: Array<{ digestB64: string; hashAlg: "sha256" }> = [];
        for (let i = 0; i < files.length; i++) {
          setProveProgress({ current: i + 1, total: files.length });
          const d = await hashFile(files[i]);
          digests.push({ digestB64: d, hashAlg: "sha256" });
        }
        setProveDigest(digests[0].digestB64);
        setProveStep("signing");
        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;
        const proofs = await commitBatch(digests, undefined, undefined, attr);
        setProveProofs(proofs);
        setProveStep("done");
      }
    } catch (err) {
      setProveError(err instanceof Error ? err.message : "Something went wrong");
      setProveStep("error");
    }
  }

  function resetProve() {
    setProveFiles([]); setProveStep("drop"); setProveDigest(""); setProveProofs([]); setProveError("");
  }

  function copyProofs() {
    const json = proveProofs.length === 1 ? JSON.stringify(proveProofs[0], null, 2) : JSON.stringify(proveProofs, null, 2);
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadProveZip() {
    if (!proveProofs.length || !proveFiles.length) return;
    const z: Record<string, Uint8Array> = {};
    for (let i = 0; i < proveFiles.length; i++) {
      const f = proveFiles[i], p = proveProofs[i] || proveProofs[0];
      const base = f.name.replace(/\.[^.]+$/, "");
      if (proveFiles.length > 1) {
        z[`${base}/${f.name}`] = new Uint8Array(await f.arrayBuffer());
        z[`${base}/proof.json`] = new TextEncoder().encode(JSON.stringify(p, null, 2));
        z[`${base}/VERIFY.txt`] = new TextEncoder().encode(buildVerifyTxt(f.name, p));
      } else {
        z[f.name] = new Uint8Array(await f.arrayBuffer());
        z["proof.json"] = new TextEncoder().encode(JSON.stringify(p, null, 2));
        z["VERIFY.txt"] = new TextEncoder().encode(buildVerifyTxt(f.name, p));
      }
    }
    const blob = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = proveFiles.length === 1 ? `${proveFiles[0].name.replace(/\.[^.]+$/, "")}-occ.zip` : "occ-proof-batch.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Verify (file = key to your proof) ── */

  async function handleVerifyFiles(files: File[]) {
    setVerifyStep("checking");
    setVerifyItems([]);
    const items: VerifyItem[] = [];

    for (const f of files) {
      try {
        const text = await f.text();
        const proof = isOCCProof(text);
        if (proof) {
          // It's a proof.json — verify signature
          const result = await verifyProofSignature(proof);
          items.push({ file: f, proof, result, found: true });
        } else {
          // Regular file — look up by hash
          const d = await hashFile(f);
          const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(d))}`);
          if (resp.ok) {
            const data = await resp.json();
            if (data.proofs?.length > 0) {
              const p = data.proofs[0].proof as OCCProof;
              const result = await verifyProofSignature(p);
              items.push({ file: f, proof: p, result, found: true });
            } else {
              items.push({ file: f, proof: null, result: null, found: false });
            }
          } else {
            items.push({ file: f, proof: null, result: null, found: false });
          }
        }
      } catch {
        items.push({ file: f, proof: null, result: null, found: false });
      }
    }

    setVerifyItems(items);
    setVerifyStep("result");
  }

  async function downloadVerifyZip() {
    const withProofs = verifyItems.filter(i => i.proof);
    if (!withProofs.length) return;
    const z: Record<string, Uint8Array> = {};
    for (const item of withProofs) {
      const base = item.file.name.replace(/\.[^.]+$/, "");
      if (withProofs.length > 1) {
        z[`${base}/${item.file.name}`] = new Uint8Array(await item.file.arrayBuffer());
        z[`${base}/proof.json`] = new TextEncoder().encode(JSON.stringify(item.proof, null, 2));
      } else {
        z[item.file.name] = new Uint8Array(await item.file.arrayBuffer());
        z["proof.json"] = new TextEncoder().encode(JSON.stringify(item.proof, null, 2));
      }
    }
    const blob = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = withProofs.length === 1 ? `${withProofs[0].file.name.replace(/\.[^.]+$/, "")}-occ.zip` : "occ-verified-batch.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetVerify() {
    setVerifyStep("drop"); setVerifyItems([]);
  }

  /* ── Styles ── */

  const card: React.CSSProperties = {
    border: "1px solid var(--c-border-subtle)", padding: "24px 20px",
    background: "var(--bg-elevated)", marginBottom: 16,
  };
  const btnFill: React.CSSProperties = {
    height: 48, fontSize: 15, fontWeight: 500, border: "none", borderRadius: 10,
    background: "var(--c-text)", color: "var(--bg)", cursor: "pointer", flex: 1,
  };
  const btnOut: React.CSSProperties = {
    height: 48, fontSize: 15, fontWeight: 500, borderRadius: 10, cursor: "pointer", flex: 1,
    border: "1px solid var(--c-border)", background: "transparent", color: "var(--c-text)",
  };

  /* ── Render ── */

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--c-text)" }}>
      <style>{`
        .occ-wrap { width: 90%; max-width: 600px; margin: 0 auto; padding: 40px 0 80px; }
        @media (min-width: 900px) { .occ-wrap { max-width: 640px; } }
      `}</style>
      <Nav />

      <div className="occ-wrap">

        {/* ── Mode toggle ── */}
        <div style={{
          display: "flex", gap: 0, marginBottom: 32,
          border: "1px solid var(--c-border)", borderRadius: 10, overflow: "hidden",
        }}>
          {(["prove", "verify"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); if (m === "prove") resetProve(); else resetVerify(); }} style={{
              flex: 1, height: 44, fontSize: 14, fontWeight: 600,
              border: "none", cursor: "pointer",
              background: mode === m ? "var(--c-text)" : "transparent",
              color: mode === m ? "var(--bg)" : "var(--c-text-secondary)",
              letterSpacing: "0.02em",
            }}>
              {m === "prove" ? "Prove" : "Verify"}
            </button>
          ))}
        </div>

        {/* ═══ PROVE ═══ */}
        {mode === "prove" && (
          <>
            {proveStep === "drop" && (
              <>
                <FileDrop
                  multiple
                  onFile={(f) => handleProveFiles([f])}
                  onFiles={handleProveFiles}
                  hint="Drop file(s). Hashed locally — nothing uploaded."
                />
                <div style={{
                  marginTop: 16, padding: "12px 16px",
                  border: "1px solid var(--c-border-subtle)", background: "var(--bg-elevated)",
                }}>
                  <input
                    type="text" value={attribution} onChange={(e) => setAttribution(e.target.value)}
                    placeholder="Author name (optional)"
                    style={{
                      width: "100%", height: 32, padding: "0 10px", fontSize: 13,
                      border: "1px solid var(--c-border)", borderRadius: 6,
                      background: "transparent", color: "var(--c-text)",
                    }}
                  />
                </div>
              </>
            )}

            {proveStep === "hashing" && (
              <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 14, color: "var(--c-text-secondary)" }}>
                  Hashing {proveFiles.length > 1 ? `${proveProgress.current} / ${proveProgress.total}` : ""}...
                </div>
              </div>
            )}

            {proveStep === "signing" && (
              <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 14, color: "var(--c-text-secondary)", marginBottom: 8 }}>
                  Signing {proveFiles.length > 1 ? `${proveFiles.length} files` : ""} in hardware enclave...
                </div>
                <div style={{ fontSize: 12, color: "var(--c-text-tertiary)", fontFamily: "monospace" }}>
                  {proveDigest.slice(0, 32)}...
                </div>
              </div>
            )}

            {proveStep === "error" && (
              <div style={{ ...card, textAlign: "center", borderColor: "#ff453a" }}>
                <div style={{ fontSize: 14, color: "#ff453a", marginBottom: 16 }}>{proveError}</div>
                <button onClick={resetProve} style={btnOut}>Try again</button>
              </div>
            )}

            {proveStep === "done" && proveProofs.length > 0 && (
              <div>
                <div style={card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ color: "#30d158", fontSize: 20 }}>●</span>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>
                      {proveProofs.length === 1 ? "Proved" : `${proveProofs.length} proved`}
                    </span>
                  </div>
                  {proveFiles.map((f, i) => (
                    <div key={f.name + i} style={{ marginBottom: i < proveFiles.length - 1 ? 12 : 0 }}>
                      <div style={{ fontSize: 13, color: "var(--c-text-secondary)", marginBottom: 2 }}>
                        {f.name} · {formatFileSize(f.size)}
                      </div>
                      <div style={{ fontSize: 12, fontFamily: "monospace", color: "#30d158", wordBreak: "break-all", lineHeight: 1.5 }}>
                        {proveProofs[i]?.artifact.digestB64}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--c-text-tertiary)", marginTop: 16 }}>
                    <span>#{proveProofs[0].commit.counter}{proveProofs.length > 1 ? `–${proveProofs[proveProofs.length - 1].commit.counter}` : ""}</span>
                    <span>·</span>
                    <span>{proveProofs[0].environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"}</span>
                  </div>
                </div>

                <details style={card}>
                  <summary style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Proof JSON</span>
                    <button onClick={(e) => { e.preventDefault(); copyProofs(); }} style={{
                      fontSize: 12, fontWeight: 500, padding: "4px 12px",
                      border: "1px solid var(--c-border)", borderRadius: 6,
                      background: "transparent", color: copied ? "#30d158" : "var(--c-text-secondary)", cursor: "pointer",
                    }}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </summary>
                  <pre style={{
                    fontSize: 11, fontFamily: "monospace", lineHeight: 1.5,
                    color: "#30d158", background: "#0a0a0a",
                    padding: 16, borderRadius: 6, overflow: "auto", maxHeight: 400, marginTop: 12,
                  }}>
                    {proveProofs.length === 1 ? JSON.stringify(proveProofs[0], null, 2) : JSON.stringify(proveProofs, null, 2)}
                  </pre>
                </details>

                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={downloadProveZip} style={btnFill}>Download .zip</button>
                  <button onClick={resetProve} style={btnOut}>Prove more</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ VERIFY — your file is the key ═══ */}
        {mode === "verify" && (
          <>
            {verifyStep === "drop" && (
              <FileDrop
                multiple
                onFile={(f) => handleVerifyFiles([f])}
                onFiles={handleVerifyFiles}
                hint="Drop your files to find their proofs. Your file is the key."
              />
            )}

            {verifyStep === "checking" && (
              <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 14, color: "var(--c-text-secondary)" }}>Looking up proofs...</div>
              </div>
            )}

            {verifyStep === "result" && verifyItems.length > 0 && (
              <div>
                <div style={card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ color: verifyItems.some(i => i.found) ? "#30d158" : "#ff453a", fontSize: 20 }}>●</span>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>
                      {verifyItems.filter(i => i.found).length} of {verifyItems.length} found
                    </span>
                  </div>

                  {verifyItems.map((item, i) => (
                    <div key={item.file.name + i} style={{
                      padding: "12px 0", borderTop: i > 0 ? "1px solid var(--c-border-subtle)" : "none",
                      display: "flex", alignItems: "flex-start", gap: 10,
                    }}>
                      <span style={{
                        color: item.found ? (item.result?.valid ? "#30d158" : "#ff6b35") : "#ff453a",
                        fontFamily: "monospace", fontSize: 14, marginTop: 1, flexShrink: 0,
                      }}>
                        {item.found ? (item.result?.valid ? "✓" : "!") : "✗"}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.file.name}
                          <span style={{ fontWeight: 400, color: "var(--c-text-tertiary)", marginLeft: 8 }}>{formatFileSize(item.file.size)}</span>
                        </div>
                        {item.proof && (
                          <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--c-text-tertiary)", marginTop: 4 }}>
                            #{item.proof.commit.counter} · {item.proof.artifact.digestB64.slice(0, 24)}...
                          </div>
                        )}
                        {item.result && (
                          <div style={{ fontSize: 11, color: item.result.valid ? "#30d158" : "#ff453a", marginTop: 2 }}>
                            Signature {item.result.valid ? "valid" : "invalid"}
                          </div>
                        )}
                        {!item.found && (
                          <div style={{ fontSize: 11, color: "var(--c-text-tertiary)", marginTop: 2 }}>No proof on ledger</div>
                        )}
                      </div>
                      {item.proof && (
                        <a href={`/proof/${encodeURIComponent(toUrlSafeB64(item.proof.artifact.digestB64))}`}
                          style={{ fontSize: 11, color: "var(--c-accent)", textDecoration: "none", flexShrink: 0, marginTop: 2 }}>
                          View →
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  {verifyItems.some(i => i.proof) && (
                    <button onClick={downloadVerifyZip} style={btnFill}>Export .zip</button>
                  )}
                  <button onClick={resetVerify} style={btnOut}>Check more</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

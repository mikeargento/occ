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

interface ProveResult { file: File; proof: OCCProof; existing: boolean; }
interface VerifyItem { file: File; proof: OCCProof | null; result: ProofVerifyResult | null; found: boolean; }

function buildVerifyTxt(filename: string, p: OCCProof): string {
  return `OCC Proof — ${filename}\nDigest:      ${p.artifact.digestB64}\nAlgorithm:   ${p.artifact.hashAlg.toUpperCase()}\nCounter:     #${p.commit.counter ?? "—"}\nEnforcement: ${p.environment?.enforcement === "measured-tee" ? "Hardware Enclave (AWS Nitro)" : "Software"}\nSigner:      ${p.signer.publicKeyB64}\n\nhttps://occ.wtf/docs\n`;
}

/** Look up existing proof by digest. Returns null if not found. */
async function findExistingProof(digestB64: string): Promise<OCCProof | null> {
  try {
    const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(digestB64))}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.proofs?.length > 0) return data.proofs[0].proof as OCCProof;
    return null;
  } catch { return null; }
}

/** Fetch the front anchor (next ETH anchor after this proof). */
async function fetchFrontAnchor(proof: OCCProof): Promise<OCCProof | null> {
  try {
    const epochId = proof.commit.epochId;
    const counter = proof.commit.counter;
    if (!epochId || !counter) return null;
    const digestB64 = proof.artifact.digestB64;
    const resp = await fetch(`/api/proofs/digest/${encodeURIComponent(toUrlSafeB64(digestB64))}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.causalWindow?.anchorAfter?.counter) {
      // Look up the anchor proof by searching for the Ethereum anchor at that counter
      // The causalWindow gives us the anchor counter — we need the actual proof
      // For now, include the causal window data in the export
      return null; // We'll include causal window metadata instead
    }
    return null;
  } catch { return null; }
}

export default function OCCPage() {
  const [mode, setMode] = useState<Mode>("prove");
  const [proveStep, setProveStep] = useState<ProveStep>("drop");
  const [proveFiles, setProveFiles] = useState<File[]>([]);
  const [proveResults, setProveResults] = useState<ProveResult[]>([]);
  const [proveError, setProveError] = useState("");
  const [proveProgress, setProveProgress] = useState({ current: 0, total: 0, label: "" });
  const [copied, setCopied] = useState(false);
  const [attribution, setAttribution] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [verifyStep, setVerifyStep] = useState<VerifyStep>("drop");
  const [verifyItems, setVerifyItems] = useState<VerifyItem[]>([]);

  /* ── Prove (dedup: check existing first) ── */

  async function handleProveFiles(files: File[]) {
    setProveFiles(files);
    setProveStep("hashing");
    setProveError("");
    const results: ProveResult[] = [];

    try {
      // Hash all files and check for existing proofs
      const fileDigests: Array<{ file: File; digestB64: string; existing: OCCProof | null }> = [];
      for (let i = 0; i < files.length; i++) {
        setProveProgress({ current: i + 1, total: files.length, label: `Hashing ${files[i].name}` });
        const d = await hashFile(files[i]);
        const existing = await findExistingProof(d);
        fileDigests.push({ file: files[i], digestB64: d, existing });
      }

      // Separate new (need proving) from existing (already proven)
      const needProving = fileDigests.filter(fd => !fd.existing);
      const alreadyProven = fileDigests.filter(fd => fd.existing);

      // Add existing proofs to results
      for (const fd of alreadyProven) {
        results.push({ file: fd.file, proof: fd.existing!, existing: true });
      }

      // Commit only new digests
      if (needProving.length > 0) {
        setProveStep("signing");
        setProveProgress({ current: 0, total: needProving.length, label: "Signing in hardware enclave" });
        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;

        if (needProving.length === 1) {
          const p = await commitDigest(needProving[0].digestB64, undefined, undefined, attr);
          results.push({ file: needProving[0].file, proof: p, existing: false });
        } else {
          const digests = needProving.map(fd => ({ digestB64: fd.digestB64, hashAlg: "sha256" as const }));
          const proofs = await commitBatch(digests, undefined, undefined, attr);
          for (let i = 0; i < needProving.length; i++) {
            results.push({ file: needProving[i].file, proof: proofs[i], existing: false });
          }
        }
      }

      // Sort results to match original file order
      const ordered = files.map(f => results.find(r => r.file === f)!).filter(Boolean);
      setProveResults(ordered);
      setProveStep("done");
    } catch (err) {
      setProveError(err instanceof Error ? err.message : "Something went wrong");
      setProveStep("error");
    }
  }

  function resetProve() {
    setProveFiles([]); setProveStep("drop"); setProveResults([]); setProveError("");
  }

  function copyProofs() {
    const proofs = proveResults.map(r => r.proof);
    const json = proofs.length === 1 ? JSON.stringify(proofs[0], null, 2) : JSON.stringify(proofs, null, 2);
    navigator.clipboard.writeText(json);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function downloadProveZip() {
    if (!proveResults.length) return;
    setExporting(true);
    setExportProgress({ current: 0, total: proveResults.length + 1 });
    const z: Record<string, Uint8Array> = {};
    const multi = proveResults.length > 1;

    for (let i = 0; i < proveResults.length; i++) {
      setExportProgress({ current: i + 1, total: proveResults.length + 1 });
      const { file: f, proof: p } = proveResults[i];
      const base = f.name.replace(/\.[^.]+$/, "");
      const prefix = multi ? `${base}/` : "";
      z[`${prefix}${f.name}`] = new Uint8Array(await f.arrayBuffer());
      z[`${prefix}proof.json`] = new TextEncoder().encode(JSON.stringify(p, null, 2));
      z[`${prefix}VERIFY.txt`] = new TextEncoder().encode(buildVerifyTxt(f.name, p));
    }

    // Fetch and include front anchor if available
    setExportProgress({ current: proveResults.length, total: proveResults.length + 1 });
    try {
      const lastProof = proveResults[proveResults.length - 1].proof;
      const digestB64 = lastProof.artifact.digestB64;
      const resp = await fetch(`/api/proofs/digest/${encodeURIComponent(toUrlSafeB64(digestB64))}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.causalWindow) {
          z["causal-window.json"] = new TextEncoder().encode(JSON.stringify(data.causalWindow, null, 2));
        }
        // If anchor after exists, find and include the actual anchor proof
        if (data.causalWindow?.anchorAfter) {
          const anchorCounter = data.causalWindow.anchorAfter.counter;
          const anchorName = data.causalWindow.anchorAfter.attrName;
          z["anchor.json"] = new TextEncoder().encode(JSON.stringify({
            type: "ethereum-front-anchor",
            counter: anchorCounter,
            name: anchorName,
            blockNumber: data.causalWindow.anchorAfter.blockNumber,
            blockHash: data.causalWindow.anchorAfter.blockHash,
            etherscanUrl: data.causalWindow.anchorAfter.etherscanUrl,
            note: "This Ethereum anchor seals all proofs before it. Everything with a counter less than this anchor provably existed before this Ethereum block was mined.",
          }, null, 2));
        }
      }
    } catch { /* non-critical */ }

    setExportProgress({ current: proveResults.length + 1, total: proveResults.length + 1 });
    const blob = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = proveResults.length === 1 ? `${proveResults[0].file.name.replace(/\.[^.]+$/, "")}-occ.zip` : "occ-proof-batch.zip";
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  /* ── Verify ── */

  async function handleVerifyFiles(files: File[]) {
    setVerifyStep("checking");
    setVerifyItems([]);
    const items: VerifyItem[] = [];
    for (const f of files) {
      try {
        const text = await f.text();
        const proof = isOCCProof(text);
        if (proof) {
          items.push({ file: f, proof, result: await verifyProofSignature(proof), found: true });
        } else {
          const d = await hashFile(f);
          const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(d))}`);
          if (resp.ok) {
            const data = await resp.json();
            if (data.proofs?.length > 0) {
              const p = data.proofs[0].proof as OCCProof;
              items.push({ file: f, proof: p, result: await verifyProofSignature(p), found: true });
            } else items.push({ file: f, proof: null, result: null, found: false });
          } else items.push({ file: f, proof: null, result: null, found: false });
        }
      } catch { items.push({ file: f, proof: null, result: null, found: false }); }
    }
    setVerifyItems(items);
    setVerifyStep("result");
  }

  async function downloadVerifyZip() {
    const withProofs = verifyItems.filter(i => i.proof);
    if (!withProofs.length) return;
    setExporting(true);
    setExportProgress({ current: 0, total: withProofs.length + 1 });
    const z: Record<string, Uint8Array> = {};
    const multi = withProofs.length > 1;

    for (let i = 0; i < withProofs.length; i++) {
      setExportProgress({ current: i + 1, total: withProofs.length + 1 });
      const item = withProofs[i];
      const base = item.file.name.replace(/\.[^.]+$/, "");
      const prefix = multi ? `${base}/` : "";
      z[`${prefix}${item.file.name}`] = new Uint8Array(await item.file.arrayBuffer());
      z[`${prefix}proof.json`] = new TextEncoder().encode(JSON.stringify(item.proof, null, 2));
    }

    // Include front anchor
    setExportProgress({ current: withProofs.length, total: withProofs.length + 1 });
    try {
      const lastProof = withProofs[withProofs.length - 1].proof!;
      const resp = await fetch(`/api/proofs/digest/${encodeURIComponent(toUrlSafeB64(lastProof.artifact.digestB64))}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.causalWindow?.anchorAfter) {
          z["anchor.json"] = new TextEncoder().encode(JSON.stringify({
            type: "ethereum-front-anchor",
            counter: data.causalWindow.anchorAfter.counter,
            name: data.causalWindow.anchorAfter.attrName,
            blockNumber: data.causalWindow.anchorAfter.blockNumber,
            blockHash: data.causalWindow.anchorAfter.blockHash,
            etherscanUrl: data.causalWindow.anchorAfter.etherscanUrl,
            note: "This Ethereum anchor seals all proofs before it.",
          }, null, 2));
        }
      }
    } catch {}

    setExportProgress({ current: withProofs.length + 1, total: withProofs.length + 1 });
    const blob = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = withProofs.length === 1 ? `${withProofs[0].file.name.replace(/\.[^.]+$/, "")}-occ.zip` : "occ-verified-batch.zip";
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  function resetVerify() { setVerifyStep("drop"); setVerifyItems([]); }

  /* ── Styles ── */
  const card: React.CSSProperties = { border: "1px solid var(--c-border-subtle)", padding: "24px 20px", background: "var(--bg-elevated)", marginBottom: 16 };
  const btnFill: React.CSSProperties = { height: 48, fontSize: 15, fontWeight: 500, border: "none", borderRadius: 10, background: "var(--c-text)", color: "var(--bg)", cursor: "pointer", flex: 1 };
  const btnOut: React.CSSProperties = { height: 48, fontSize: 15, fontWeight: 500, borderRadius: 10, cursor: "pointer", flex: 1, border: "1px solid var(--c-border)", background: "transparent", color: "var(--c-text)" };

  const newCount = proveResults.filter(r => !r.existing).length;
  const existCount = proveResults.filter(r => r.existing).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--c-text)" }}>
      <style>{`.occ-wrap { width: 90%; max-width: 640px; margin: 0 auto; padding: 40px 0 80px; }`}</style>
      <Nav />
      <div className="occ-wrap">

        {/* Toggle */}
        <div style={{ display: "flex", gap: 0, marginBottom: 32, border: "1px solid var(--c-border)", borderRadius: 10, overflow: "hidden" }}>
          {(["prove", "verify"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); if (m === "prove") resetProve(); else resetVerify(); }} style={{
              flex: 1, height: 44, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
              background: mode === m ? "var(--c-text)" : "transparent",
              color: mode === m ? "var(--bg)" : "var(--c-text-secondary)",
            }}>{m === "prove" ? "Prove" : "Verify"}</button>
          ))}
        </div>

        {/* ═══ PROVE ═══ */}
        {mode === "prove" && (
          <>
            {proveStep === "drop" && (
              <>
                <FileDrop multiple onFile={(f) => handleProveFiles([f])} onFiles={handleProveFiles} hint="Drop file(s). Hashed locally — nothing uploaded." />
                <div style={{ marginTop: 16, padding: "12px 16px", border: "1px solid var(--c-border-subtle)", background: "var(--bg-elevated)" }}>
                  <input type="text" value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="Author name (optional)"
                    style={{ width: "100%", height: 32, padding: "0 10px", fontSize: 13, border: "1px solid var(--c-border)", borderRadius: 6, background: "transparent", color: "var(--c-text)" }} />
                </div>
              </>
            )}

            {(proveStep === "hashing" || proveStep === "signing") && (
              <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 14, color: "var(--c-text-secondary)", marginBottom: 12 }}>{proveProgress.label || "Processing"}...</div>
                {proveProgress.total > 1 && (
                  <div style={{ width: "100%", height: 4, borderRadius: 2, background: "var(--c-border)", overflow: "hidden" }}>
                    <div style={{ width: `${(proveProgress.current / proveProgress.total) * 100}%`, height: "100%", background: "#34d399", transition: "width 0.2s" }} />
                  </div>
                )}
              </div>
            )}

            {proveStep === "error" && (
              <div style={{ ...card, textAlign: "center", borderColor: "#ff453a" }}>
                <div style={{ fontSize: 14, color: "#ff453a", marginBottom: 16 }}>{proveError}</div>
                <button onClick={resetProve} style={btnOut}>Try again</button>
              </div>
            )}

            {proveStep === "done" && proveResults.length > 0 && (
              <div>
                <div style={card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ color: "#30d158", fontSize: 20 }}>●</span>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>
                      {newCount > 0 && existCount > 0
                        ? `${newCount} proved, ${existCount} already proven`
                        : existCount > 0 && newCount === 0
                        ? `${existCount} already proven`
                        : `${newCount} proved`}
                    </span>
                  </div>
                  {proveResults.map((r, i) => (
                    <div key={r.file.name + i} style={{ marginBottom: i < proveResults.length - 1 ? 12 : 0 }}>
                      <div style={{ fontSize: 13, color: "var(--c-text-secondary)", marginBottom: 2 }}>
                        {r.file.name} · {formatFileSize(r.file.size)}
                        {r.existing && <span style={{ color: "var(--c-text-tertiary)", marginLeft: 8, fontSize: 11 }}>(existing)</span>}
                      </div>
                      <div style={{ fontSize: 12, fontFamily: "monospace", color: "#30d158", wordBreak: "break-all", lineHeight: 1.5 }}>
                        {r.proof.artifact.digestB64}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--c-text-tertiary)", marginTop: 16 }}>
                    <span>#{proveResults.filter(r => !r.existing).map(r => r.proof.commit.counter).join(", #") || proveResults[0].proof.commit.counter}</span>
                    <span>·</span>
                    <span>{proveResults[0].proof.environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"}</span>
                  </div>
                </div>

                <details style={card}>
                  <summary style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Proof JSON</span>
                    <button onClick={(e) => { e.preventDefault(); copyProofs(); }} style={{ fontSize: 12, fontWeight: 500, padding: "4px 12px", border: "1px solid var(--c-border)", borderRadius: 6, background: "transparent", color: copied ? "#30d158" : "var(--c-text-secondary)", cursor: "pointer" }}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </summary>
                  <pre style={{ fontSize: 11, fontFamily: "monospace", lineHeight: 1.5, color: "#30d158", background: "#0a0a0a", padding: 16, borderRadius: 6, overflow: "auto", maxHeight: 400, marginTop: 12 }}>
                    {proveResults.length === 1 ? JSON.stringify(proveResults[0].proof, null, 2) : JSON.stringify(proveResults.map(r => r.proof), null, 2)}
                  </pre>
                </details>

                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={downloadProveZip} disabled={exporting} style={{ ...btnFill, opacity: exporting ? 0.6 : 1 }}>
                    {exporting ? "Exporting..." : "Download .zip"}
                  </button>
                  <button onClick={resetProve} style={btnOut}>Prove more</button>
                </div>
                {exporting && exportProgress.total > 0 && (
                  <div style={{ marginTop: 8, width: "100%", height: 4, borderRadius: 2, background: "var(--c-border)", overflow: "hidden" }}>
                    <div style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%`, height: "100%", background: "#34d399", transition: "width 0.15s" }} />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══ VERIFY ═══ */}
        {mode === "verify" && (
          <>
            {verifyStep === "drop" && (
              <FileDrop multiple onFile={(f) => handleVerifyFiles([f])} onFiles={handleVerifyFiles} hint="Drop your files to find their proofs. Your file is the key." />
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
                    <div key={item.file.name + i} style={{ padding: "12px 0", borderTop: i > 0 ? "1px solid var(--c-border-subtle)" : "none", display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ color: item.found ? (item.result?.valid ? "#30d158" : "#ff6b35") : "#ff453a", fontFamily: "monospace", fontSize: 14, marginTop: 1, flexShrink: 0 }}>
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
                        {!item.found && <div style={{ fontSize: 11, color: "var(--c-text-tertiary)", marginTop: 2 }}>No proof on ledger</div>}
                      </div>
                      {item.proof && (
                        <a href={`/proof/${encodeURIComponent(toUrlSafeB64(item.proof.artifact.digestB64))}`}
                          style={{ fontSize: 11, color: "var(--c-accent)", textDecoration: "none", flexShrink: 0, marginTop: 2 }}>View →</a>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  {verifyItems.some(i => i.proof) && (
                    <button onClick={downloadVerifyZip} disabled={exporting} style={{ ...btnFill, opacity: exporting ? 0.6 : 1 }}>
                      {exporting ? "Exporting..." : "Export .zip"}
                    </button>
                  )}
                  <button onClick={resetVerify} style={btnOut}>Check more</button>
                </div>
                {exporting && exportProgress.total > 0 && (
                  <div style={{ marginTop: 8, width: "100%", height: 4, borderRadius: 2, background: "var(--c-border)", overflow: "hidden" }}>
                    <div style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%`, height: "100%", background: "#34d399", transition: "width 0.15s" }} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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
} from "@/lib/occ";
import { toUrlSafeB64 } from "@/lib/explorer";
import { zipSync } from "fflate";

type Step = "drop" | "scanning" | "results" | "proving" | "exporting";

interface FileItem {
  file: File;
  digestB64: string;
  proof: OCCProof | null;
  valid: boolean | null;
  status: "found" | "new" | "proving" | "proved" | "error";
}

function buildVerifyTxt(filename: string, p: OCCProof): string {
  return `OCC Proof — ${filename}\nDigest: ${p.artifact.digestB64}\nCounter: #${p.commit.counter ?? "—"}\nSigner: ${p.signer.publicKeyB64}\nhttps://occ.wtf/docs\n`;
}

export default function OCCPage() {
  const [step, setStep] = useState<Step>("drop");
  const [items, setItems] = useState<FileItem[]>([]);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [animCount, setAnimCount] = useState(0);

  const found = items.filter(i => i.status === "found" || i.status === "proved");
  const unproven = items.filter(i => i.status === "new");
  const allDone = items.length > 0 && items.every(i => i.status === "found" || i.status === "proved");

  /* ── Drop → Scan ── */

  async function handleFiles(files: File[]) {
    setStep("scanning");
    setScanProgress({ current: 0, total: files.length });
    const results: FileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      setScanProgress({ current: i + 1, total: files.length });
      const f = files[i];
      try {
        // Check if it's a proof.json
        const text = await f.text();
        const proofJson = isOCCProof(text);
        if (proofJson) {
          const result = await verifyProofSignature(proofJson);
          results.push({ file: f, digestB64: proofJson.artifact.digestB64, proof: proofJson, valid: result.valid, status: "found" });
          continue;
        }

        // Regular file — hash and look up
        const d = await hashFile(f);
        const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(d))}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.proofs?.length > 0) {
            const p = data.proofs[0].proof as OCCProof;
            const result = await verifyProofSignature(p);
            results.push({ file: f, digestB64: d, proof: p, valid: result.valid, status: "found" });
          } else {
            results.push({ file: f, digestB64: d, proof: null, valid: null, status: "new" });
          }
        } else {
          results.push({ file: f, digestB64: d, proof: null, valid: null, status: "new" });
        }
      } catch {
        const d = await hashFile(f).catch(() => "");
        results.push({ file: f, digestB64: d, proof: null, valid: null, status: "new" });
      }
    }

    setItems(results);
    setStep("results");

    // Animate the count
    const total = results.filter(r => r.status === "found").length;
    if (total > 0) {
      let c = 0;
      const interval = setInterval(() => {
        c++;
        setAnimCount(c);
        if (c >= total) clearInterval(interval);
      }, Math.min(150, 600 / total));
    }
  }

  /* ── Prove unproven files ── */

  async function proveRemaining() {
    const toProve = items.filter(i => i.status === "new");
    if (!toProve.length) return;

    setStep("proving");
    // Update items to show "proving" status
    setItems(prev => prev.map(i => i.status === "new" ? { ...i, status: "proving" as const } : i));

    try {
      if (toProve.length === 1) {
        const p = await commitDigest(toProve[0].digestB64);
        setItems(prev => prev.map(i =>
          i.digestB64 === toProve[0].digestB64 ? { ...i, proof: p, valid: true, status: "proved" as const } : i
        ));
      } else {
        const digests = toProve.map(i => ({ digestB64: i.digestB64, hashAlg: "sha256" as const }));
        const proofs = await commitBatch(digests);
        setItems(prev => prev.map(i => {
          const idx = toProve.findIndex(t => t.digestB64 === i.digestB64);
          if (idx >= 0 && proofs[idx]) {
            return { ...i, proof: proofs[idx], valid: true, status: "proved" as const };
          }
          return i;
        }));
      }
    } catch {
      setItems(prev => prev.map(i => i.status === "proving" ? { ...i, status: "error" as const } : i));
    }

    setStep("results");

    // Animate new count
    const newTotal = items.filter(i => i.status === "found").length + toProve.length;
    let c = items.filter(i => i.status === "found").length;
    const interval = setInterval(() => {
      c++;
      setAnimCount(c);
      if (c >= newTotal) clearInterval(interval);
    }, Math.min(150, 600 / toProve.length));
  }

  /* ── Export zip with ETH anchors ── */

  async function downloadZip() {
    const withProofs = items.filter(i => i.proof);
    if (!withProofs.length) return;

    setStep("exporting");
    setExportProgress({ current: 0, total: withProofs.length + 1 });
    const z: Record<string, Uint8Array> = {};
    const multi = withProofs.length > 1;

    for (let i = 0; i < withProofs.length; i++) {
      setExportProgress({ current: i + 1, total: withProofs.length + 1 });
      const { file: f, proof: p } = withProofs[i];
      const base = f.name.replace(/\.[^.]+$/, "");
      const prefix = multi ? `${base}/` : "";
      z[`${prefix}${f.name}`] = new Uint8Array(await f.arrayBuffer());
      z[`${prefix}proof.json`] = new TextEncoder().encode(JSON.stringify(p, null, 2));
      z[`${prefix}VERIFY.txt`] = new TextEncoder().encode(buildVerifyTxt(f.name, p!));
    }

    // Fetch all ETH anchors after the earliest proof
    setExportProgress({ current: withProofs.length, total: withProofs.length + 1 });
    try {
      const earliest = withProofs[0];
      const resp = await fetch(`/api/proofs/anchors?digest=${encodeURIComponent(earliest.digestB64)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.anchors?.length > 0) {
          const anchorsDir = multi ? "ethereum-anchors/" : "ethereum-anchors/";
          for (let i = 0; i < data.anchors.length; i++) {
            const a = data.anchors[i];
            z[`${anchorsDir}anchor-${a.blockNumber || i}.json`] = new TextEncoder().encode(JSON.stringify(a.proofJson, null, 2));
          }
        }
      }
    } catch { /* non-critical */ }

    setExportProgress({ current: withProofs.length + 1, total: withProofs.length + 1 });
    const blob = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = withProofs.length === 1 ? `${withProofs[0].file.name.replace(/\.[^.]+$/, "")}-occ.zip` : "occ-proof-batch.zip";
    a.click();
    URL.revokeObjectURL(url);
    setStep("results");
  }

  function reset() { setStep("drop"); setItems([]); setAnimCount(0); }

  /* ── Styles ── */
  const card: React.CSSProperties = { border: "1px solid var(--c-border-subtle)", padding: "24px 20px", background: "var(--bg-elevated)", marginBottom: 16 };
  const btnFill: React.CSSProperties = { height: 48, fontSize: 15, fontWeight: 500, border: "none", borderRadius: 10, background: "var(--c-text)", color: "var(--bg)", cursor: "pointer", flex: 1 };
  const btnOut: React.CSSProperties = { height: 48, fontSize: 15, fontWeight: 500, borderRadius: 10, cursor: "pointer", flex: 1, border: "1px solid var(--c-border)", background: "transparent", color: "var(--c-text)" };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--c-text)" }}>
      <style>{`
        .occ-wrap { width: 90%; max-width: 640px; margin: 0 auto; padding: 40px 0 80px; }
        @keyframes countPop { 0% { transform: scale(0.5); opacity: 0 } 50% { transform: scale(1.1) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
      `}</style>
      <Nav />

      <div className="occ-wrap">

        {/* ── Drop zone ── */}
        {step === "drop" && (
          <div style={{ animation: "slideIn 0.3s ease-out" }}>
            <FileDrop
              multiple
              onFile={(f) => handleFiles([f])}
              onFiles={handleFiles}
              hint="Drop files to prove or verify. Your file is the key to your proof."
            />
          </div>
        )}

        {/* ── Scanning ── */}
        {step === "scanning" && (
          <div style={{ ...card, textAlign: "center", padding: "64px 24px" }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: "var(--c-text)", marginBottom: 8, fontFamily: "monospace", animation: "pulse 1s ease-in-out infinite" }}>
              {scanProgress.current} / {scanProgress.total}
            </div>
            <div style={{ fontSize: 14, color: "var(--c-text-secondary)" }}>Scanning files...</div>
            <div style={{ width: "60%", height: 4, borderRadius: 2, background: "var(--c-border)", overflow: "hidden", margin: "16px auto 0" }}>
              <div style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%`, height: "100%", background: "#34d399", transition: "width 0.2s" }} />
            </div>
          </div>
        )}

        {/* ── Proving ── */}
        {step === "proving" && (
          <div style={{ ...card, textAlign: "center", padding: "64px 24px" }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: "#34d399", marginBottom: 8, fontFamily: "monospace", animation: "pulse 1s ease-in-out infinite" }}>
              {unproven.length}
            </div>
            <div style={{ fontSize: 14, color: "var(--c-text-secondary)" }}>Signing in hardware enclave...</div>
          </div>
        )}

        {/* ── Exporting ── */}
        {step === "exporting" && (
          <div style={{ ...card, textAlign: "center", padding: "64px 24px" }}>
            <div style={{ fontSize: 14, color: "var(--c-text-secondary)", marginBottom: 12 }}>Packaging proof bundle...</div>
            <div style={{ width: "60%", height: 4, borderRadius: 2, background: "var(--c-border)", overflow: "hidden", margin: "0 auto" }}>
              <div style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%`, height: "100%", background: "#34d399", transition: "width 0.15s" }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--c-text-tertiary)", marginTop: 8 }}>
              {exportProgress.current} / {exportProgress.total}
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {step === "results" && items.length > 0 && (
          <div style={{ animation: "slideIn 0.3s ease-out" }}>

            {/* Big animated counter */}
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{
                fontSize: 72, fontWeight: 800, color: allDone ? "#30d158" : "var(--c-text)",
                fontFamily: "monospace", lineHeight: 1, animation: "countPop 0.4s ease-out",
              }}>
                {animCount}
              </div>
              <div style={{ fontSize: 17, color: "var(--c-text-secondary)", marginTop: 8 }}>
                {allDone
                  ? `of ${items.length} proven`
                  : `of ${items.length} found`}
              </div>
            </div>

            {/* File list */}
            <div style={card}>
              {items.map((item, i) => (
                <div key={item.file.name + i} style={{
                  padding: "12px 0", borderTop: i > 0 ? "1px solid var(--c-border-subtle)" : "none",
                  display: "flex", alignItems: "flex-start", gap: 10,
                  animation: `slideIn 0.2s ease-out ${i * 0.05}s both`,
                }}>
                  <span style={{
                    fontSize: 16, marginTop: 1, flexShrink: 0, width: 20, textAlign: "center",
                    color: item.status === "found" || item.status === "proved" ? "#30d158"
                      : item.status === "proving" ? "#fbbf24"
                      : item.status === "error" ? "#ff453a"
                      : "var(--c-text-tertiary)",
                    fontFamily: "monospace",
                  }}>
                    {item.status === "found" || item.status === "proved" ? "✓"
                      : item.status === "proving" ? "~"
                      : item.status === "error" ? "!"
                      : "○"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.file.name}
                      <span style={{ fontWeight: 400, color: "var(--c-text-tertiary)", marginLeft: 8 }}>{formatFileSize(item.file.size)}</span>
                    </div>
                    {item.proof && (
                      <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--c-text-tertiary)", marginTop: 3 }}>
                        #{item.proof.commit.counter} · {item.digestB64.slice(0, 20)}...
                      </div>
                    )}
                    {item.status === "found" && item.valid && (
                      <div style={{ fontSize: 11, color: "#30d158", marginTop: 2 }}>Signature valid</div>
                    )}
                    {item.status === "proved" && (
                      <div style={{ fontSize: 11, color: "#34d399", marginTop: 2 }}>Just proved</div>
                    )}
                    {item.status === "new" && (
                      <div style={{ fontSize: 11, color: "var(--c-text-tertiary)", marginTop: 2 }}>Not yet proven</div>
                    )}
                  </div>
                  {item.proof && (
                    <a href={`/proof/${encodeURIComponent(toUrlSafeB64(item.digestB64))}`}
                      style={{
                        fontSize: 13, fontWeight: 500, color: "var(--c-accent)", textDecoration: "none",
                        flexShrink: 0, padding: "6px 14px", borderRadius: 6,
                        border: "1px solid var(--c-accent)", marginTop: 0,
                      }}>
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12 }}>
              {unproven.length > 0 && (
                <button onClick={proveRemaining} style={{ ...btnFill, background: "#34d399", color: "#000" }}>
                  Prove {unproven.length} remaining
                </button>
              )}
              {found.length > 0 && (
                <button onClick={downloadZip} style={allDone ? btnFill : btnOut}>
                  Download .zip
                </button>
              )}
              <button onClick={reset} style={btnOut}>
                {allDone ? "New" : "Start over"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

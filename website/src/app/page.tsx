"use client";

import { useState } from "react";
import { FileDrop } from "@/components/file-drop";
import { Nav, Footer } from "@/components/nav";
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
    }

    // Fetch ETH anchors that bound these proofs (within the proof window + 12s)
    setExportProgress({ current: withProofs.length, total: withProofs.length + 1 });
    try {
      const earliest = withProofs[0];
      const resp = await fetch(`/api/proofs/anchors?digest=${encodeURIComponent(earliest.digestB64)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.anchors?.length > 0) {
          // Only include the first anchor after the proofs (the sealing anchor)
          // plus one before if available — that's the causal window
          const firstAnchor = data.anchors[0];
          z["ethereum-anchors/anchor.json"] = new TextEncoder().encode(JSON.stringify(firstAnchor, null, 2));
          // Include a second one if it exists (belt and suspenders)
          if (data.anchors[1]) {
            z["ethereum-anchors/anchor-2.json"] = new TextEncoder().encode(JSON.stringify(data.anchors[1], null, 2));
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
  const card: React.CSSProperties = { border: "1px solid rgba(52,211,153,0.08)", padding: "24px 20px", background: "rgba(52,211,153,0.02)", borderRadius: 16, marginBottom: 16 };
  const btnFill: React.CSSProperties = { height: 52, fontSize: 15, fontWeight: 600, border: "none", borderRadius: 12, background: "#34d399", color: "#000", cursor: "pointer", flex: 1, letterSpacing: "-0.01em" };
  const btnOut: React.CSSProperties = { height: 52, fontSize: 15, fontWeight: 500, borderRadius: 12, cursor: "pointer", flex: 1, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#fff" };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--c-text)" }}>
      <style>{`
        .occ-wrap { width: 90%; max-width: 640px; margin: 0 auto; padding: 48px 0 80px; }
        @keyframes countPop { 0% { transform: scale(0.5); opacity: 0 } 50% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes glow { 0%, 100% { box-shadow: 0 0 20px rgba(52,211,153,0.1) } 50% { box-shadow: 0 0 40px rgba(52,211,153,0.2) } }
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
              hint={"Files never leave your device.\nOnly the hash is sent."}
            />
          </div>
        )}

        {/* ── Scanning ── */}
        {step === "scanning" && (
          <div style={{ textAlign: "center", padding: "80px 24px", animation: "slideIn 0.3s ease-out" }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: "#fff", marginBottom: 8, fontFamily: "monospace", animation: "pulse 1s ease-in-out infinite", letterSpacing: "-0.04em" }}>
              {scanProgress.current}<span style={{ color: "rgba(255,255,255,0.2)" }}>/{scanProgress.total}</span>
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>Scanning</div>
            <div style={{ width: "40%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.06)", overflow: "hidden", margin: "20px auto 0" }}>
              <div style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%`, height: "100%", background: "#34d399", transition: "width 0.2s", boxShadow: "0 0 12px rgba(52,211,153,0.5)" }} />
            </div>
          </div>
        )}

        {/* ── Proving ── */}
        {step === "proving" && (
          <div style={{ textAlign: "center", padding: "80px 24px", animation: "slideIn 0.3s ease-out" }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: "#34d399", marginBottom: 8, fontFamily: "monospace", animation: "pulse 1s ease-in-out infinite", textShadow: "0 0 40px rgba(52,211,153,0.4)", letterSpacing: "-0.04em" }}>
              {unproven.length}
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>Signing in enclave</div>
          </div>
        )}

        {/* ── Exporting ── */}
        {step === "exporting" && (
          <div style={{ textAlign: "center", padding: "80px 24px", animation: "slideIn 0.3s ease-out" }}>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", marginBottom: 16, fontWeight: 500 }}>Packaging</div>
            <div style={{ width: "40%", height: 2, borderRadius: 1, background: "rgba(255,255,255,0.06)", overflow: "hidden", margin: "0 auto" }}>
              <div style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%`, height: "100%", background: "#34d399", transition: "width 0.15s", boxShadow: "0 0 12px rgba(52,211,153,0.5)" }} />
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {step === "results" && items.length > 0 && (
          <div style={{ animation: "slideIn 0.3s ease-out" }}>

            {/* Big animated counter */}
            <div style={{ textAlign: "center", marginBottom: 40, paddingTop: 16 }}>
              <div style={{
                fontSize: 96, fontWeight: 800, letterSpacing: "-0.06em",
                color: allDone ? "#34d399" : "#fff",
                fontFamily: "monospace", lineHeight: 1, animation: "countPop 0.4s ease-out",
                textShadow: allDone ? "0 0 60px rgba(52,211,153,0.4)" : "none",
              }}>
                {animCount}
              </div>
              <div style={{ fontSize: 16, color: "rgba(255,255,255,0.35)", marginTop: 12, fontWeight: 500, letterSpacing: "0.02em" }}>
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
                    fontSize: 22, marginTop: -2, flexShrink: 0, width: 28, textAlign: "center",
                    color: item.status === "found" || item.status === "proved" ? "#34d399"
                      : item.status === "proving" ? "#fbbf24"
                      : item.status === "error" ? "#ff453a"
                      : "var(--c-text-tertiary)",
                    fontWeight: 700,
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
                    <a href={`/proof/${encodeURIComponent(toUrlSafeB64(item.digestB64))}`} target="_blank" rel="noopener"
                      style={{
                        fontSize: 15, fontWeight: 600, color: "#000", textDecoration: "none",
                        flexShrink: 0, padding: "8px 24px", borderRadius: 980,
                        background: "#34d399",
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
        <Footer />
      </div>
    </div>
  );
}

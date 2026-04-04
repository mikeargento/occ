"use client";

import { useState, useEffect, useRef } from "react";
import { FileDrop } from "@/components/file-drop";
// Footer is in root layout
import { Chat } from "@/components/chat";
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
import { zip } from "fflate";

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
  const [chatOpen, setChatOpen] = useState(false);
  const [anchorCountdown, setAnchorCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start 12s countdown when proofs finish (waiting for next ETH anchor)
  const endTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const startAnchorCountdown = () => {
    endTimeRef.current = Date.now() + 12000;
    setAnchorCountdown(12);
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const remaining = Math.ceil((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        setAnchorCountdown(0);
      } else {
        setAnchorCountdown(remaining);
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (step !== "drop") window.scrollTo(0, 0);
  }, [step]);

  // Cleanup rAF on unmount only
  useEffect(() => {
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

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
    startAnchorCountdown();

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
    const totalSteps = withProofs.length + 2; // files + anchors + zip
    setExportProgress({ current: 0, total: totalSteps });
    const z: Record<string, Uint8Array> = {};
    const multi = withProofs.length > 1;

    for (let i = 0; i < withProofs.length; i++) {
      setExportProgress({ current: i + 1, total: totalSteps });
      const { file: f, proof: p } = withProofs[i];
      const base = f.name.replace(/\.[^.]+$/, "");
      const prefix = multi ? `${base}/` : "";
      z[`${prefix}${f.name}`] = new Uint8Array(await f.arrayBuffer());
      z[`${prefix}proof.json`] = new TextEncoder().encode(JSON.stringify(p, null, 2));
    }

    // Fetch ETH anchors AFTER the last proof in the batch (highest counter = future boundary)
    setExportProgress({ current: withProofs.length + 1, total: totalSteps });
    try {
      const last = withProofs.reduce((a, b) => {
        const ac = parseInt(a.proof?.commit?.counter || "0", 10);
        const bc = parseInt(b.proof?.commit?.counter || "0", 10);
        return bc > ac ? b : a;
      });
      const lastCounter = last.proof?.commit?.counter || "0";
      const lastEpoch = last.proof?.commit?.epochId || "";
      if (!lastEpoch) throw new Error("no epochId");
      const url = `/api/proofs/anchors?counter=${lastCounter}&epoch=${encodeURIComponent(lastEpoch)}`;
      console.log("[occ] anchor lookup:", url);
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.anchors?.length > 0) {
          z["ethereum-anchor.json"] = new TextEncoder().encode(JSON.stringify(data.anchors[0], null, 2));
        }
      }
    } catch { /* non-critical */ }

    setExportProgress({ current: totalSteps - 1, total: totalSteps });
    const zipData = await new Promise<Uint8Array>((resolve, reject) => {
      zip(z, { level: 0 }, (err, data) => err ? reject(err) : resolve(data));
    });
    setExportProgress({ current: totalSteps, total: totalSteps });
    const blob = new Blob([zipData.buffer as ArrayBuffer], { type: "application/zip" });
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
  const card: React.CSSProperties = { border: "1px solid #d0d5dd", padding: "24px 20px", background: "#fff", borderRadius: 16, marginBottom: 16 };
  const btnFill: React.CSSProperties = { height: 52, fontSize: 15, fontWeight: 600, border: "none", borderRadius: 12, background: "#1A73E8", color: "#ffffff", cursor: "pointer", flex: 1, letterSpacing: "-0.01em" };
  const btnOut: React.CSSProperties = { height: 52, fontSize: 15, fontWeight: 500, borderRadius: 12, cursor: "pointer", flex: 1, border: "1px solid #d1d5db", background: "#fff", color: "#111827" };

  return (
    <div style={{ background: "var(--bg)", color: "var(--c-text)", display: "flex", flexDirection: "column" }}>
      <style>{`
        .occ-wrap { width: 90%; max-width: 640px; margin: 0 auto; padding: 0; display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 24px; min-height: calc(100dvh - 57px); }
        .occ-wrap.occ-results { justify-content: flex-start; padding-top: 20vh; }
        .occ-wrap .file-drop-container { height: 360px; }
        @media (max-width: 640px) { .occ-wrap .file-drop-container { height: 280px; } }
        @keyframes countPop { 0% { transform: scale(0.5); opacity: 0 } 50% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes glow { 0%, 100% { box-shadow: none } 50% { box-shadow: none } }
      `}</style>
      {/* Nav is in root layout */}

      <div className={`occ-wrap${step !== "drop" ? " occ-results" : ""}`}>

        {/* ── Drop zone or Chat ── */}
        {step === "drop" && !chatOpen && (
          <>
            <div style={{ textAlign: "center", marginBottom: 32, animation: "slideIn 0.3s ease-out" }}>
              <p style={{ fontSize: 26, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>
                Prove the provenance of{" "}<span style={{ display: "inline-block", width: "4.5em", textAlign: "left" }}><RotatingWord /></span>
              </p>
            </div>
            <div className="file-drop-container" style={{ animation: "slideIn 0.3s ease-out" }}>
              <FileDrop
                multiple
                onFile={(f) => handleFiles([f])}
                onFiles={handleFiles}
                hint=""
              />
            </div>
            <Chat onOpenChange={setChatOpen} />
          </>
        )}
        {step === "drop" && chatOpen && (
          <Chat defaultOpen onOpenChange={setChatOpen} />
        )}

        {/* ── Scanning ── */}
        {step === "scanning" && (
          <div style={{ textAlign: "center", padding: "80px 24px", animation: "slideIn 0.3s ease-out" }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: "var(--c-text)", marginBottom: 8, fontFamily: "monospace", animation: "pulse 1s ease-in-out infinite", letterSpacing: "-0.04em" }}>
              {scanProgress.current}<span style={{ color: "#9ca3af" }}>/{scanProgress.total}</span>
            </div>
            <div style={{ fontSize: 15, color: "#9ca3af", fontWeight: 500 }}>Scanning</div>
            <div style={{ width: "40%", height: 2, borderRadius: 1, background: "var(--c-border-subtle)", overflow: "hidden", margin: "20px auto 0" }}>
              <div style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%`, height: "100%", background: "#1A73E8", transition: "width 0.2s", boxShadow: "none" }} />
            </div>
          </div>
        )}

        {/* ── Proving ── */}
        {step === "proving" && (
          <div style={{ textAlign: "center", padding: "80px 24px", animation: "slideIn 0.3s ease-out" }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: "#1A73E8", marginBottom: 8, fontFamily: "monospace", animation: "pulse 1s ease-in-out infinite", textShadow: "none", letterSpacing: "-0.04em" }}>
              {unproven.length}
            </div>
            <div style={{ fontSize: 15, color: "#9ca3af", fontWeight: 500 }}>Signing in enclave</div>
          </div>
        )}

        {/* ── Exporting ── */}
        {step === "exporting" && (
          <div style={{ textAlign: "center", padding: "80px 24px", animation: "slideIn 0.3s ease-out" }}>
            <div style={{ fontSize: 15, color: "var(--c-text-secondary)", marginBottom: 16, fontWeight: 500 }}>Packaging</div>
            <div style={{ width: "40%", height: 2, borderRadius: 1, background: "var(--c-border-subtle)", overflow: "hidden", margin: "0 auto" }}>
              <div style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%`, height: "100%", background: "#1A73E8", transition: "width 0.15s", boxShadow: "none" }} />
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {step === "results" && items.length > 0 && (
          <div style={{ animation: "slideIn 0.3s ease-out" }}>

            {/* Big animated counter */}
            <div style={{ textAlign: "center", marginBottom: 40, marginTop: -18 }}>
              <div style={{
                fontSize: 96, fontWeight: 800, letterSpacing: "-0.06em",
                color: allDone ? "#1A73E8" : "var(--c-text)",
                fontFamily: "monospace", lineHeight: 1, animation: "countPop 0.4s ease-out",
                textShadow: "none",
              }}>
                {animCount}
              </div>
              <div style={{ fontSize: 16, color: "#111827", marginTop: 12, fontWeight: 500, letterSpacing: "0.02em" }}>
                {allDone
                  ? `of ${items.length} proven`
                  : `of ${items.length} found`}
              </div>
            </div>

            {/* Actions — above list so they're always visible */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              {unproven.length > 0 && (
                <button onClick={proveRemaining} style={{ ...btnFill, background: "var(--c-accent)", color: "#ffffff" }}>
                  Prove {unproven.length} remaining
                </button>
              )}
              {found.length > 0 && (
                <button
                  onClick={anchorCountdown > 0 ? undefined : downloadZip}
                  style={{
                    ...(anchorCountdown > 0 ? { ...btnOut, opacity: 0.5, cursor: "default" } : allDone ? btnFill : btnOut),
                  }}
                >
                  {anchorCountdown > 0 ? <span style={{ fontSize: 13 }}>{`Sealing with Ethereum... ${anchorCountdown}s`}</span> : "Download .zip"}
                </button>
              )}
              <button onClick={reset} style={btnOut}>
                {allDone ? "New" : "Start over"}
              </button>
            </div>

            {/* File list */}
            <div style={card}>
              {items.map((item, i) => (
                <div key={item.file.name + i} style={{
                  padding: "12px 0", borderTop: i > 0 ? "1px solid #d0d5dd" : "none",
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  animation: `slideIn 0.2s ease-out ${i * 0.05}s both`,
                }}>
                  <span style={{
                    fontSize: 22, marginTop: -2, flexShrink: 0, width: 28, textAlign: "center",
                    color: item.status === "found" || item.status === "proved" ? "#1A73E8"
                      : item.status === "proving" ? "#f0c060"
                      : item.status === "error" ? "#f87171"
                      : "#9ca3af",
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
                      <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 8 }}>{formatFileSize(item.file.size)}</span>
                    </div>
                    {item.proof && (
                      <div style={{ fontSize: 11, fontFamily: "monospace", color: "#9ca3af", marginTop: 3 }}>
                        #{item.proof.commit.counter} · {item.digestB64.slice(0, 20)}...
                      </div>
                    )}
                    {item.status === "found" && item.valid && (
                      <div style={{ fontSize: 11, color: "#1A73E8", marginTop: 2 }}>Signature valid</div>
                    )}
                    {item.status === "proved" && (
                      <div style={{ fontSize: 11, color: "#1A73E8", marginTop: 2 }}>Just proved</div>
                    )}
                    {item.status === "new" && (
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Not yet proven</div>
                    )}
                  </div>
                  {item.proof && (
                    <button
                      onClick={() => {
                        // Open immediately (synchronous) so mobile browsers don't block the popup
                        // Use the proof's digest (from TEE) for the URL, not the browser-computed hash
                        const proofDigest = item.proof!.artifact.digestB64;
                        window.open(`/proof/${encodeURIComponent(toUrlSafeB64(proofDigest))}`, "_blank");
                        // Cache file to IndexedDB in the background
                        (async () => {
                          try {
                            const buf = await item.file.arrayBuffer();
                            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                              const req = indexedDB.open("occ-files", 1);
                              req.onupgradeneeded = () => req.result.createObjectStore("files");
                              req.onsuccess = () => resolve(req.result);
                              req.onerror = () => reject(req.error);
                            });
                            const tx = db.transaction("files", "readwrite");
                            tx.objectStore("files").put({ name: item.file.name, data: buf }, proofDigest);
                            await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
                            db.close();
                          } catch (e) { console.error("[occ] cache error:", e); }
                        })();
                      }}
                      style={{
                        fontSize: 15, fontWeight: 600, color: "#ffffff", textDecoration: "none",
                        flexShrink: 0, padding: "12px 28px", borderRadius: 980,
                        background: "#1A73E8", border: "none", cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}>
                      View Details
                    </button>
                  )}
                </div>
              ))}
            </div>

          </div>
        )}
        {/* Footer is in root layout */}
      </div>
    </div>
  );
}

const ROTATING_WORDS = ["photos.", "videos.", "music.", "PDFs.", "code.", "data.", "files."];

function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % ROTATING_WORDS.length);
        setFade(true);
      }, 200);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  return (
    <span style={{
      display: "inline-block",
      color: "var(--c-accent)",
      opacity: fade ? 1 : 0,
      transform: fade ? "translateY(0)" : "translateY(4px)",
      transition: "opacity 0.2s, transform 0.2s",
    }}>
      {ROTATING_WORDS[index]}
    </span>
  );
}

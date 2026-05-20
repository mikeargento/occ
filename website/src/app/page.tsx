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
  isBitGraphProof,
  verifyProofSignature,
  type BitGraphProof,
} from "@/lib/bitgraph";
import { toUrlSafeB64 } from "@/lib/explorer";
import { Zip, ZipPassThrough } from "fflate";

type Step = "drop" | "scanning" | "results" | "proving" | "exporting";

interface FileItem {
  file: File;
  digestB64: string;
  proof: BitGraphProof | null;
  valid: boolean | null;
  status: "found" | "new" | "proving" | "proved" | "error";
}


export default function BitGraphPage() {
  const [step, setStep] = useState<Step>("drop");
  const [items, setItems] = useState<FileItem[]>([]);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [animCount, setAnimCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [anchorCountdown, setAnchorCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start 15s countdown when proofs finish (waiting for next ETH anchor)
  const endTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const startAnchorCountdown = () => {
    endTimeRef.current = Date.now() + 15000;
    setAnchorCountdown(15);
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
        // Only read as text if the file could plausibly be a proof JSON.
        // Reading a multi-MB photo as text allocates a UTF-16 copy of its bytes
        // and crashes iOS Safari after ~15 files.
        const couldBeProof =
          f.size <= 1_000_000 &&
          (f.type === "application/json" || /\.(json|proof)$/i.test(f.name));
        const proofJson = couldBeProof ? isBitGraphProof(await f.text()) : null;
        if (proofJson) {
          const result = await verifyProofSignature(proofJson);
          results.push({ file: f, digestB64: proofJson.artifact.digestB64, proof: proofJson, valid: result.valid, status: "found" });
          continue;
        }

        // Regular file: hash and look up
        const d = await hashFile(f);
        const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(d))}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.proofs?.length > 0) {
            const p = data.proofs[0].proof as BitGraphProof;
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

      // Yield so iOS Safari can reclaim the previous file's buffer before the next iteration.
      if (i < files.length - 1) await new Promise((r) => setTimeout(r, 0));
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
    const multi = withProofs.length > 1;

    // Streaming zip: chunks accumulate as each file is added
    const chunks: Uint8Array[] = [];
    let zipDone = false;
    let zipError: Error | null = null;
    const z = new Zip((err, chunk, final) => {
      if (err) { zipError = err; return; }
      if (chunk) chunks.push(chunk);
      if (final) zipDone = true;
    });

    // Helper: yield to event loop so React can repaint progress
    const tick = () => new Promise(r => setTimeout(r, 0));

    // Add files one at a time, updating progress between each
    for (let i = 0; i < withProofs.length; i++) {
      setExportProgress({ current: i + 1, total: totalSteps });
      await tick();
      const { file: f, proof: p } = withProofs[i];
      const base = f.name.replace(/\.[^.]+$/, "");
      const prefix = multi ? `${base}/` : "";

      // File entry
      const fileBytes = new Uint8Array(await f.arrayBuffer());
      const fileEntry = new ZipPassThrough(`${prefix}${f.name}`);
      z.add(fileEntry);
      fileEntry.push(fileBytes, true);

      // Proof entry
      const proofBytes = new TextEncoder().encode(JSON.stringify(p, null, 2));
      const proofEntry = new ZipPassThrough(`${prefix}proof.json`);
      z.add(proofEntry);
      proofEntry.push(proofBytes, true);
    }

    // Fetch ETH anchors AFTER the last proof in the batch (highest counter = future boundary)
    setExportProgress({ current: withProofs.length + 1, total: totalSteps });
    await tick();
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
      console.log("[bitgraph] anchor lookup:", url);
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.anchors?.length > 0) {
          const anchorEntry = new ZipPassThrough("ethereum-anchor.json");
          z.add(anchorEntry);
          anchorEntry.push(new TextEncoder().encode(JSON.stringify(data.anchors[0], null, 2)), true);
        }
      }
    } catch { /* non-critical */ }
    setExportProgress({ current: totalSteps - 1, total: totalSteps });
    await tick();
    z.end();
    // Wait for streaming zip to finish (it's synchronous internally but need to drain)
    while (!zipDone && !zipError) await tick();
    if (zipError) throw zipError;

    setExportProgress({ current: totalSteps, total: totalSteps });
    const totalSize = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(totalSize);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.length; }
    const blob = new Blob([merged.buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = withProofs.length === 1 ? `${withProofs[0].file.name.replace(/\.[^.]+$/, "")}-bitgraph.zip` : "bitgraph-proof-batch.zip";
    a.click();
    URL.revokeObjectURL(url);
    setStep("results");
  }

  function reset() { setStep("drop"); setItems([]); setAnimCount(0); }

  /* ── Styles ── */
  const card: React.CSSProperties = { border: "1px solid #d0d5dd", padding: "24px 20px", background: "#fff", borderRadius: 0, marginBottom: 16 };
  const btnFill: React.CSSProperties = { height: 68, fontSize: 16, fontWeight: 600, border: "none", borderRadius: 0, background: "#0065A4", color: "#ffffff", cursor: "pointer", letterSpacing: "-0.01em" };
  const btnOut: React.CSSProperties = { height: 68, fontSize: 16, fontWeight: 500, borderRadius: 0, cursor: "pointer", border: "1px solid #d1d5db", background: "#fff", color: "#111827" };

  return (
    <div style={{ background: "var(--bg)", color: "var(--c-text)", display: "flex", flexDirection: "column" }}>
      <style>{`
        .bitgraph-wrap { width: 90%; max-width: 640px; margin: 0 auto; padding: 0; display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 24px; min-height: calc(100dvh - 57px); }
        .bitgraph-wrap.bitgraph-results { justify-content: flex-start; padding-top: 32px; min-height: 0; max-width: 800px; }
        .bitgraph-wrap .file-drop-container { height: 360px; }
        @media (max-width: 640px) { .bitgraph-wrap .file-drop-container { height: 280px; } }
        .bitgraph-actions { display: flex; flex-direction: column; gap: 12px; padding: 0 0 20px; }
        @keyframes countPop { 0% { transform: scale(0.5); opacity: 0 } 50% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes popIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes glow { 0%, 100% { box-shadow: none } 50% { box-shadow: none } }
      `}</style>
      {/* Nav is in root layout */}

      <div className={`bitgraph-wrap${step !== "drop" ? " bitgraph-results" : ""}`}>

        {/* ── Drop zone + What is BitGraph button ── */}
        {step === "drop" && (
          <>
            <div className="file-drop-container" style={{ animation: "slideIn 0.3s ease-out" }}>
              <FileDrop
                multiple
                onFile={(f) => handleFiles([f])}
                onFiles={handleFiles}
                hint=""
              />
            </div>
            <div style={{ position: "relative", display: "flex", justifyContent: "center", animation: "slideIn 0.3s ease-out" }}>
              <button
                type="button"
                onClick={() => setInfoOpen((v) => !v)}
                aria-label="About BitGraph"
                aria-expanded={infoOpen}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "transparent",
                  border: "1px solid #d0d5dd",
                  borderRadius: 0,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#374151",
                  cursor: "pointer",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#0065A4";
                  (e.currentTarget as HTMLButtonElement).style.color = "#0065A4";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#d0d5dd";
                  (e.currentTarget as HTMLButtonElement).style.color = "#374151";
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: "1.25px solid currentColor",
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: "Georgia, serif",
                    fontStyle: "italic",
                    lineHeight: 1,
                  }}
                >
                  i
                </span>
                What is a BitGraph?
              </button>
              {infoOpen && (
                <>
                  <div
                    onClick={() => setInfoOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 40 }}
                    aria-hidden="true"
                  />
                  <div
                    role="dialog"
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 10px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      zIndex: 50,
                      width: "min(480px, calc(100vw - 32px))",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 0,
                      boxShadow: "0 10px 32px rgba(0,0,0,0.10)",
                      padding: "18px 20px",
                      animation: "popIn 0.18s ease-out",
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        bottom: -6,
                        left: "50%",
                        marginLeft: -6,
                        transform: "rotate(45deg)",
                        width: 12,
                        height: 12,
                        background: "#ffffff",
                        borderRight: "1px solid #e5e7eb",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    />
                    <p
                      style={{
                        margin: 0,
                        fontSize: 16,
                        fontWeight: 400,
                        color: "#111827",
                        lineHeight: 1.65,
                      }}
                    >
                      <strong>BitGraphs</strong> are not labels or metadata added after the fact. They are new computations created when your file&apos;s hash <em>fills</em> a pre-existing cryptographic slot, constraining the commitment so it cannot be retroactively constructed. This occurs entirely off-chain and produces a proof file permanently bound to the original.
                    </p>
                    <p
                      style={{
                        margin: "12px 0 0 0",
                        fontSize: 16,
                        fontWeight: 400,
                        color: "#111827",
                        lineHeight: 1.65,
                      }}
                    >
                      Just as a photograph captures photons through the constraint of a single frame of film, a BitGraph captures bits through the constraint of a single mathematical slot.
                    </p>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Floating chat bubble: matches the docs layout */}
        {step === "drop" && (
          chatOpen ? (
            <div className="docs-chat-container" style={{
              position: "fixed", bottom: 24, right: 24, zIndex: 100,
              width: 400, maxWidth: "calc(100vw - 48px)",
              maxHeight: "calc(100vh - 120px)",
              borderRadius: 0, overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
            }}>
              <style>{`
                @media (max-width: 640px) {
                  .docs-chat-container {
                    position: fixed !important;
                    inset: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    max-height: 100% !important;
                    border-radius: 0 !important;
                    bottom: 0 !important;
                    right: 0 !important;
                  }
                }
              `}</style>
              <Chat defaultOpen onOpenChange={setChatOpen} />
            </div>
          ) : (
            <button
              onClick={() => setChatOpen(true)}
              aria-label="Open chat"
              style={{
                position: "fixed", bottom: 24, right: 24, zIndex: 100,
                width: 52, height: 52, borderRadius: 0,
                background: "#0065A4", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 12px rgba(0,101,164,0.3)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,101,164,0.4)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,101,164,0.3)"; }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          )
        )}

        {/* ── Scanning ── */}
        {step === "scanning" && (
          <div style={{ textAlign: "center", padding: "80px 24px", animation: "slideIn 0.3s ease-out" }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: "var(--c-text)", marginBottom: 8, fontFamily: "monospace", animation: "pulse 1s ease-in-out infinite", letterSpacing: "-0.04em" }}>
              {scanProgress.current}<span style={{ color: "#6b7280" }}>/{scanProgress.total}</span>
            </div>
            <div style={{ fontSize: 15, color: "#6b7280", fontWeight: 500 }}>Scanning</div>
            <div style={{ width: "40%", height: 2, borderRadius: 1, background: "var(--c-border-subtle)", overflow: "hidden", margin: "20px auto 0" }}>
              <div style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%`, height: "100%", background: "#0065A4", transition: "width 0.2s", boxShadow: "none" }} />
            </div>
          </div>
        )}

        {/* ── Proving ── */}
        {step === "proving" && (
          <div style={{ textAlign: "center", padding: "80px 24px", animation: "slideIn 0.3s ease-out" }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: "#0065A4", marginBottom: 8, fontFamily: "monospace", animation: "pulse 1s ease-in-out infinite", textShadow: "none", letterSpacing: "-0.04em" }}>
              {unproven.length}
            </div>
            <div style={{ fontSize: 15, color: "#6b7280", fontWeight: 500 }}>Signing in enclave</div>
          </div>
        )}

        {/* ── Exporting ── */}
        {step === "exporting" && (
          <div style={{ textAlign: "center", padding: "80px 24px", animation: "slideIn 0.3s ease-out" }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: "var(--c-text)", marginBottom: 8, fontFamily: "monospace", animation: "pulse 1s ease-in-out infinite", letterSpacing: "-0.04em" }}>
              {exportProgress.current}<span style={{ color: "#6b7280" }}>/{exportProgress.total}</span>
            </div>
            <div style={{ fontSize: 15, color: "#6b7280", fontWeight: 500 }}>Packaging</div>
            <div style={{ width: "40%", height: 2, borderRadius: 1, background: "var(--c-border-subtle)", overflow: "hidden", margin: "20px auto 0" }}>
              <div style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%`, height: "100%", background: "#0065A4", transition: "width 0.15s", boxShadow: "none" }} />
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {step === "results" && items.length > 0 && (
          <div style={{ animation: "slideIn 0.3s ease-out" }}>

            <div style={card}>
              {/* Counter as a single line. min() font-size scales down on
                  narrow viewports so even "10000 of 10000 BitGraphed" stays
                  on one line; whiteSpace nowrap is the belt to that
                  suspenders. */}
              <div style={{ textAlign: "center", padding: "56px 0 56px" }}>
                <div style={{
                  fontSize: "min(36px, 5.5vw)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: allDone ? "#0065A4" : "#111827",
                  whiteSpace: "nowrap",
                  lineHeight: 1.2,
                  animation: "countPop 0.4s ease-out",
                }}>
                  {animCount} of {items.length} {allDone ? "BitGraphed" : "found"}
                </div>
              </div>

              {/* Actions — stacked */}
              <div className="bitgraph-actions">
                {unproven.length > 0 && (
                  <button onClick={proveRemaining} style={{ ...btnFill, background: "var(--c-accent)", color: "#ffffff" }}>
                    BitGraph {unproven.length} remaining
                  </button>
                )}
                {found.length > 0 && (
                  <button
                    onClick={anchorCountdown > 0 ? undefined : downloadZip}
                    style={{
                      ...(anchorCountdown > 0 ? { ...btnOut, opacity: 0.5, cursor: "default" } : allDone ? btnFill : btnOut),
                    }}
                  >
                    {anchorCountdown > 0 ? <span style={{ fontSize: 14 }}>{`Anchoring to Ethereum... ${anchorCountdown}s`}</span> : "Download .zip"}
                  </button>
                )}
                <button onClick={reset} style={btnOut}>
                  {allDone ? "Choose new files" : "Start over"}
                </button>
              </div>

              {/* File list — whole row tappable when there's a proof */}
              <div>
              {items.map((item, i) => {
                const clickable = !!item.proof;
                const openProof = () => {
                  if (!item.proof) return;
                  // Open immediately (synchronous) so mobile browsers don't block the popup.
                  // Use the proof's digest (from TEE) for the URL, not the browser-computed hash.
                  const proofDigest = item.proof.artifact.digestB64;
                  window.open(`/proof/${encodeURIComponent(toUrlSafeB64(proofDigest))}`, "_blank");
                  // Cache file (and any embedded C2PA manifest) to IndexedDB in the background
                  // so the proof page can show them. C2PA parsing is best-effort and must
                  // never block caching of the file itself.
                  (async () => {
                    try {
                      const buf = await item.file.arrayBuffer();
                      let c2pa = null;
                      try {
                        const { readC2PA } = await import("@/lib/c2pa-reader");
                        c2pa = await readC2PA(item.file);
                      } catch (e) {
                        console.warn("[bitgraph] c2pa read failed:", e);
                      }
                      const db = await new Promise<IDBDatabase>((resolve, reject) => {
                        const req = indexedDB.open("bitgraph-files", 1);
                        req.onupgradeneeded = () => req.result.createObjectStore("files");
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => reject(req.error);
                      });
                      const tx = db.transaction("files", "readwrite");
                      tx.objectStore("files").put(
                        { name: item.file.name, data: buf, c2pa },
                        proofDigest
                      );
                      await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
                      db.close();
                    } catch (e) { console.error("[bitgraph] cache error:", e); }
                  })();
                };
                return (
                  <div
                    key={item.file.name + i}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? openProof : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProof(); } } : undefined}
                    style={{
                      height: 68,
                      padding: "0 12px",
                      margin: i > 0 ? "8px -12px 0 -12px" : "0 -12px",
                      display: "flex", alignItems: "center", gap: 12,
                      animation: `slideIn 0.2s ease-out ${i * 0.05}s both`,
                      cursor: clickable ? "pointer" : "default",
                      transition: "background 0.15s",
                      background: clickable ? "#dbeafe" : "transparent",
                    }}
                    onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = "#bfdbfe"; }}
                    onMouseLeave={(e) => { if (clickable) e.currentTarget.style.background = "#dbeafe"; }}
                  >
                    <span style={{
                      fontSize: 20, flexShrink: 0, width: 22, textAlign: "center",
                      color: item.status === "found" || item.status === "proved" ? "#0065A4"
                        : item.status === "proving" ? "#f0c060"
                        : item.status === "error" ? "#f87171"
                        : "#9ca3af",
                      fontWeight: 700, lineHeight: 1,
                    }}>
                      {item.status === "found" || item.status === "proved" ? "✓"
                        : item.status === "proving" ? "~"
                        : item.status === "error" ? "!"
                        : "○"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.file.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                        {formatFileSize(item.file.size)}
                        {item.status === "found" && item.valid && <><span style={{ margin: "0 6px", color: "#d0d5dd" }}>·</span><span style={{ color: "#0065A4" }}>Signature valid</span></>}
                        {item.status === "proved" && <><span style={{ margin: "0 6px", color: "#d0d5dd" }}>·</span><span style={{ color: "#0065A4" }}>Just BitGraphed</span></>}
                        {item.status === "new" && <><span style={{ margin: "0 6px", color: "#d0d5dd" }}>·</span>Not yet BitGraphed</>}
                        {item.status === "proving" && <><span style={{ margin: "0 6px", color: "#d0d5dd" }}>·</span>BitGraphing…</>}
                        {item.status === "error" && <><span style={{ margin: "0 6px", color: "#d0d5dd" }}>·</span><span style={{ color: "#dc2626" }}>Error</span></>}
                      </div>
                    </div>
                    {clickable && (
                      <span aria-hidden="true" style={{ color: "#0065A4", fontSize: 26, flexShrink: 0, paddingRight: 4, lineHeight: 1, fontWeight: 600 }}>
                        ›
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            </div>

          </div>
        )}
        {/* Footer is in root layout */}
      </div>
    </div>
  );
}

/* trigger */

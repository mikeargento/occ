"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { toUrlSafeB64, relativeTime } from "@/lib/explorer";
import { zipSync } from "fflate";

/* ── Types ───────────────────────────────────────────────────────────── */

type Step = "idle" | "hashing" | "signing" | "done" | "error" | "verifying" | "verified" | "checking" | "found" | "notfound";

interface ProofEntry {
  globalId: number;
  digest: string;
  counter?: string;
  enforcement: string;
  time?: number;
  attribution?: string;
  signer: string;
  epochId?: string;
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function Home() {
  const [step, setStep] = useState<Step>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [digest, setDigest] = useState("");
  const [proofs, setProofs] = useState<OCCProof[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [mode, setMode] = useState<"prove" | "verify">("prove");
  const [verifyResult, setVerifyResult] = useState<ProofVerifyResult | null>(null);
  const [verifiedProof, setVerifiedProof] = useState<OCCProof | null>(null);
  const [chainMatch, setChainMatch] = useState<OCCProof | null>(null);
  const browseRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  const [ledger, setLedger] = useState<ProofEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedProof, setExpandedProof] = useState<OCCProof | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const PER_PAGE = 20;

  const fetchLedger = useCallback(async (page: number) => {
    try {
      const resp = await fetch(`/api/proofs?page=${page}&limit=${PER_PAGE}`);
      if (!resp.ok) return;
      const data = await resp.json();
      const entries: ProofEntry[] = (data.proofs || []).map((p: Record<string, unknown>) => ({
        globalId: (p.id as number) || 0,
        digest: (p.digestB64 as string) || "—",
        counter: (p.counter as string) || undefined,
        enforcement: (p.enforcement as string) === "measured-tee" ? "Hardware Enclave" : "Software",
        time: p.commitTime ? Number(p.commitTime) : undefined,
        attribution: (p.attrName as string) || undefined,
        signer: ((p.signerPub as string) || "").slice(0, 12) || "—",
      }));
      setLedger(entries);
      setLedgerTotal(data.total || 0);
      setLedgerPage(page);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchLedger(1);
    const interval = setInterval(() => fetchLedger(1), 15000);
    return () => clearInterval(interval);
  }, [fetchLedger]);

  const handleFiles = useCallback(async (incoming: File[], forceMode?: "prove" | "verify") => {
    const activeMode = forceMode || mode;
    setFiles(incoming);
    setError("");
    setProofs([]);
    setCopied(false);
    setVerifyResult(null);
    setVerifiedProof(null);
    setChainMatch(null);

    try {
      if (incoming.length === 1) {
        const f = incoming[0];

        // Auto-detect proof.json regardless of mode
        if (f.name.endsWith(".json") && f.size < 500_000) {
          const text = await f.text();
          const proof = isOCCProof(text);
          if (proof) {
            setStep("verifying");
            setVerifiedProof(proof);
            const result = await verifyProofSignature(proof);
            setVerifyResult(result);
            setDigest(proof.artifact.digestB64);
            setStep("verified");
            return;
          }
        }

        // Hash the file
        setStep("hashing");
        setProgress({ current: 1, total: 1, fileName: f.name });
        const d = await hashFile(f);
        setDigest(d);

        if (activeMode === "verify") {
          // Verify mode: just check the chain, never create a proof
          setStep("checking");
          try {
            const resp = await fetch(`/api/proofs/digest/${encodeURIComponent(toUrlSafeB64(d))}`);
            if (resp.ok) {
              const data = await resp.json();
              if (data.proofs?.length > 0 && data.proofs[0].proof) {
                setChainMatch(data.proofs[0].proof as OCCProof);
                setStep("found");
                return;
              }
            }
          } catch { /* not found */ }
          setStep("notfound");
        } else {
          // Prove mode: create a new proof
          setStep("signing");
          const p = await commitDigest(d);
          setProofs([p]);
          setStep("done");
          setTimeout(() => fetchLedger(1), 1500);
        }
      } else {
        // Batch — always prove
        setStep("hashing");
        const digests: Array<{ digestB64: string; hashAlg: "sha256" }> = [];
        for (let i = 0; i < incoming.length; i++) {
          setProgress({ current: i + 1, total: incoming.length, fileName: incoming[i].name });
          digests.push({ digestB64: await hashFile(incoming[i]), hashAlg: "sha256" });
        }
        setDigest(digests[0].digestB64);
        setStep("signing");
        const ps = await commitBatch(digests);
        setProofs(ps);
        setStep("done");
        setTimeout(() => fetchLedger(1), 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  }, [fetchLedger, mode]);

  function reset() {
    setFiles([]); setStep("idle"); setDigest(""); setProofs([]);
    setError(""); setProgress(null); setCopied(false);
    setVerifyResult(null); setVerifiedProof(null); setChainMatch(null); setMode("prove");
  }

  async function proveAnyway() {
    if (!files.length) return;
    setChainMatch(null);
    setStep("signing");
    try {
      const p = await commitDigest(digest);
      setProofs([p]);
      setStep("done");
      setTimeout(() => fetchLedger(1), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  }

  async function downloadZip() {
    if (!proofs.length || !files.length) return;
    const z: Record<string, Uint8Array> = {};
    for (let i = 0; i < files.length; i++) {
      const f = files[i], p = proofs[i] || proofs[0];
      z[f.name] = new Uint8Array(await f.arrayBuffer());
      z[files.length > 1 ? `proof-${i + 1}.json` : "proof.json"] = new TextEncoder().encode(JSON.stringify(p, null, 2));
      if (i === 0) z["VERIFY.txt"] = new TextEncoder().encode(
        `OCC Proof\n=========\nFile: ${f.name}\nDigest: ${p.artifact.digestB64}\nCounter: #${p.commit.counter ?? "—"}\nTime: ${p.commit.time ? new Date(p.commit.time).toISOString() : "—"}\nSigner: ${p.signer.publicKeyB64}\nVerify: https://occ.wtf/docs/verification\n`
      );
    }
    const blob = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = files.length === 1 ? `${files[0].name.replace(/\.[^.]+$/, "")}-occ-proof.zip` : "occ-proof-batch.zip";
    a.click(); URL.revokeObjectURL(url);
  }

  async function toggleRow(entry: ProofEntry) {
    if (expandedId === entry.globalId) { setExpandedId(null); setExpandedProof(null); return; }
    setExpandedId(entry.globalId); setExpandedProof(null);
    if (entry.digest === "—") return;
    setLoadingProof(true);
    try {
      const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(entry.digest))}`);
      if (resp.ok) { const d = await resp.json(); if (d.proofs?.[0]?.proof) setExpandedProof(d.proofs[0].proof as OCCProof); }
    } catch { /* silent */ }
    setLoadingProof(false);
  }

  const firstProof = proofs[0];
  const counter = firstProof?.commit?.counter;
  const wallTime = firstProof?.commit?.time ? new Date(Number(firstProof.commit.time)).toLocaleString() : null;
  const totalPages = Math.ceil(ledgerTotal / PER_PAGE);
  const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n) + "\u2026" : s;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #08080a; --surface: #111113; --surface-2: #19191d;
          --border: #232328; --border-subtle: #1a1a1f;
          --text: #e8e8ed; --text-2: #8f8f9d; --text-3: #5a5a6a;
          --commit: #e8e8ed; --slot: #06b6d4; --anchor: #3b82f6;
          --epoch: #f59e0b; --verified: #22c55e; --error: #ef4444;
          --mono: var(--font-mono), 'SF Mono', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
          --sans: acumin-pro, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
        }
        html, body { background: var(--bg); color: var(--text); font-family: var(--sans); -webkit-font-smoothing: antialiased; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 0 0 rgba(6,182,212,0) } 50% { box-shadow: 0 0 12px 2px rgba(6,182,212,.15) } }

        @media (max-width: 640px) {
          .proof-grid { grid-template-columns: 48px 1fr 80px !important; }
          .proof-grid .digest-col { display: none !important; }
          .proof-header .digest-col { display: none !important; }
          .detail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Nav */}
        <nav style={{
          height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", borderBottom: "1px solid var(--border)",
        }}>
          <a href="/" style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textDecoration: "none", letterSpacing: ".1em", fontFamily: "var(--mono)" }}>OCC</a>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="/docs" style={{ fontSize: 12, color: "var(--text-3)", textDecoration: "none" }}>Docs</a>
            <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 12, color: "var(--text-3)", textDecoration: "none" }}>GitHub</a>
          </div>
        </nav>

        {/* ── Capture Zone ── */}
        <section
          style={{ padding: "20px 16px 24px", maxWidth: 520, width: "100%", margin: "0 auto" }}
          onDragOver={(e) => { e.preventDefault(); if (step === "idle") setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={(e) => { e.preventDefault(); setDragover(false); if (step !== "idle") return; const f = Array.from(e.dataTransfer.files); if (f.length) handleFiles(f); }}
        >
          <input ref={browseRef} type="file" multiple accept="*/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) { handleFiles(Array.from(e.target.files)); e.target.value = ""; } }} />
          <input ref={captureRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) { handleFiles(Array.from(e.target.files)); e.target.value = ""; } }} />

          {step === "idle" && (
            <>
              {/* Prove / Verify toggle */}
              <div style={{ display: "flex", marginBottom: 12, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <button
                  onClick={() => setMode("prove")}
                  style={{
                    flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                    background: mode === "prove" ? "var(--anchor)" : "transparent",
                    color: mode === "prove" ? "#fff" : "var(--text-3)",
                    transition: "all .15s",
                  }}
                >Prove</button>
                <button
                  onClick={() => setMode("verify")}
                  style={{
                    flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                    borderLeft: "1px solid var(--border)",
                    background: mode === "verify" ? "var(--verified)" : "transparent",
                    color: mode === "verify" ? "#fff" : "var(--text-3)",
                    transition: "all .15s",
                  }}
                >Verify</button>
              </div>

              {/* Take Photo — primary action */}
              <button
                onClick={() => captureRef.current?.click()}
                style={{
                  width: "100%", padding: "16px 0", fontSize: 15, fontWeight: 600,
                  color: "#fff", background: mode === "verify" ? "var(--verified)" : "var(--anchor)",
                  border: "none", borderRadius: 10, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  marginBottom: 10, transition: "background .15s",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                {mode === "prove" ? "Take Photo" : "Check Photo"}
              </button>

              {/* Drop zone — secondary */}
              <div
                onClick={() => browseRef.current?.click()}
                style={{
                  border: `2px dashed ${dragover ? (mode === "verify" ? "var(--verified)" : "var(--anchor)") : "var(--border)"}`,
                  borderRadius: 12, padding: "36px 24px", textAlign: "center", cursor: "pointer",
                  transition: "all .2s",
                  background: dragover ? (mode === "verify" ? "rgba(34,197,94,.04)" : "rgba(59,130,246,.04)") : "var(--surface)",
                }}
              >
                <div style={{ fontSize: 15, color: "var(--text)", fontWeight: 500, marginBottom: 6 }}>
                  {mode === "prove" ? "Drop a photo or file" : "Drop a photo or file to check"}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                  or{" "}
                  <span onClick={(e) => { e.stopPropagation(); browseRef.current?.click(); }} style={{ color: "var(--text)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "3px", textDecorationColor: "var(--text-3)", cursor: "pointer" }}>browse</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 12 }}>Hashed in your browser. Nothing is uploaded.</div>
              </div>
            </>
          )}

          {step === "hashing" && progress && (
            <div style={card}>
              <div style={spinnerStyle} />
              <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>
                {progress.total === 1 ? "Hashing..." : `Hashing ${progress.current}/${progress.total}`}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--mono)", marginTop: 4 }}>{progress.fileName}</div>
              {progress.total > 1 && (
                <div style={{ width: "100%", height: 2, background: "var(--border)", borderRadius: 1, marginTop: 12, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(progress.current / progress.total) * 100}%`, background: "var(--slot)", transition: "width .3s" }} />
                </div>
              )}
            </div>
          )}

          {step === "signing" && (
            <div style={card}>
              <div style={{ ...spinnerStyle, borderTopColor: "var(--slot)", animation: "spin .7s linear infinite, glow 2s ease-in-out infinite" }} />
              <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>Signing in enclave</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)", marginTop: 6, animation: "pulse 1.5s ease-in-out infinite" }}>{digest.slice(0, 28)}</div>
            </div>
          )}

          {step === "done" && firstProof && (
            <div style={{ ...card, animation: "fadeUp .3s ease-out", borderColor: "var(--verified)", borderWidth: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(34,197,94,.12)", border: "1.5px solid var(--verified)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--verified)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Proven</span>
                {counter != null && <span style={{ fontSize: 13, color: "var(--slot)", fontFamily: "var(--mono)", fontWeight: 600 }}>#{counter}</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10 }}>
                {files.length === 1 ? `${files[0].name} \u00b7 ${formatFileSize(files[0].size)}` : `${files.length} files`}
              </div>
              <div
                onClick={() => { navigator.clipboard.writeText(digest); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ width: "100%", padding: "7px 10px", background: "rgba(255,255,255,.02)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}
              >
                <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", wordBreak: "break-all" as const, lineHeight: 1.4 }}>{digest}</span>
                <span style={{ fontSize: 9, color: copied ? "var(--verified)" : "var(--text-3)", flexShrink: 0, marginLeft: 8, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>{copied ? "Copied" : "Copy"}</span>
              </div>
              {wallTime && <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 14 }}>{wallTime}</div>}
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <button onClick={downloadZip} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--anchor)", border: "none", borderRadius: 6, cursor: "pointer" }}>Download .zip</button>
                <button onClick={reset} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, color: "var(--text-2)", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>New</button>
              </div>
            </div>
          )}

          {step === "error" && (
            <div style={card}>
              <div style={{ fontSize: 13, color: "var(--error)", marginBottom: 12 }}>{error}</div>
              <button onClick={reset} style={{ padding: "10px 24px", fontSize: 13, fontWeight: 600, color: "var(--text-2)", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>Try again</button>
            </div>
          )}

          {/* Verifying a proof.json */}
          {step === "verifying" && (
            <div style={card}>
              <div style={spinnerStyle} />
              <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>Verifying proof signature...</div>
            </div>
          )}

          {/* Verification result */}
          {step === "verified" && verifyResult && verifiedProof && (
            <div style={{ ...card, animation: "fadeUp .3s ease-out", borderColor: verifyResult.valid ? "var(--verified)" : "var(--error)", borderWidth: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                {verifyResult.valid ? (
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(34,197,94,.12)", border: "1.5px solid var(--verified)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--verified)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                ) : (
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(239,68,68,.12)", border: "1.5px solid var(--error)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </div>
                )}
                <span style={{ fontSize: 16, fontWeight: 600, color: verifyResult.valid ? "var(--verified)" : "var(--error)" }}>
                  {verifyResult.valid ? "Valid Proof" : "Invalid Proof"}
                </span>
              </div>

              {/* Checks */}
              <div style={{ width: "100%", marginBottom: 12 }}>
                {verifyResult.checks.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                    <span style={{ color: c.status === "pass" ? "var(--verified)" : "var(--error)" }}>{c.status === "pass" ? "\u2713" : "\u2717"}</span>
                    <span style={{ color: "var(--text-2)" }}>{c.label}</span>
                  </div>
                ))}
              </div>

              {/* Proof details */}
              <div style={{ width: "100%", padding: "10px", background: "rgba(255,255,255,.02)", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>Counter</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--anchor)", fontFamily: "var(--mono)" }}>#{verifiedProof.commit.counter}</div>
              </div>

              <CopyableText text={digest} style={{ width: "100%", fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", wordBreak: "break-all" as const, padding: "6px 10px", background: "rgba(255,255,255,.02)", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8 }} />

              {/* Full JSON */}
              <details style={{ width: "100%", marginBottom: 12 }}>
                <summary style={{ fontSize: 12, color: "var(--text-3)", cursor: "pointer", padding: "6px 0" }}>Full proof JSON</summary>
                <CopyableText
                  text={JSON.stringify(verifiedProof, null, 2)}
                  style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", whiteSpace: "pre-wrap" as const, wordBreak: "break-all" as const, padding: "10px", background: "rgba(255,255,255,.02)", border: "1px solid var(--border)", borderRadius: 6, marginTop: 6, maxHeight: 300, overflow: "auto", textAlign: "left" as const }}
                />
              </details>

              <button onClick={reset} style={{ width: "100%", padding: "10px 0", fontSize: 13, fontWeight: 600, color: "var(--text-2)", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>Done</button>
            </div>
          )}

          {/* Checking chain for existing proof */}
          {step === "checking" && (
            <div style={card}>
              <div style={spinnerStyle} />
              <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>Checking chain...</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)", marginTop: 6 }}>{digest.slice(0, 28)}</div>
            </div>
          )}

          {/* File already on chain */}
          {step === "found" && chainMatch && (
            <div style={{ ...card, animation: "fadeUp .3s ease-out", borderColor: "var(--verified)", borderWidth: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(34,197,94,.12)", border: "1.5px solid var(--verified)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--verified)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <span style={{ fontSize: 16, fontWeight: 600, color: "var(--verified)" }}>Already on chain</span>
                <span style={{ fontSize: 13, color: "var(--anchor)", fontFamily: "var(--mono)", fontWeight: 600 }}>#{chainMatch.commit.counter}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10 }}>
                {files[0]?.name} was proven at {chainMatch.commit.time ? new Date(Number(chainMatch.commit.time)).toLocaleString() : "unknown time"}
              </div>
              <CopyableText text={digest} style={{ width: "100%", fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", wordBreak: "break-all" as const, padding: "6px 10px", background: "rgba(255,255,255,.02)", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 12 }} />
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <button onClick={proveAnyway} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--anchor)", border: "none", borderRadius: 6, cursor: "pointer" }}>Prove again</button>
                <button onClick={reset} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, color: "var(--text-2)", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>Done</button>
              </div>
            </div>
          )}

          {/* File not found on chain */}
          {step === "notfound" && (
            <div style={{ ...card, animation: "fadeUp .3s ease-out" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(113,113,122,.12)", border: "1.5px solid var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </div>
                <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-2)" }}>Not on chain</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>
                {files[0]?.name} has not been proven yet.
              </div>
              <CopyableText text={digest} style={{ width: "100%", fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", wordBreak: "break-all" as const, padding: "6px 10px", background: "rgba(255,255,255,.02)", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 12 }} />
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <button onClick={() => { setChainMatch(null); handleFiles(files, "prove"); }} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--anchor)", border: "none", borderRadius: 6, cursor: "pointer" }}>Prove it now</button>
                <button onClick={reset} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, color: "var(--text-2)", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>Done</button>
              </div>
            </div>
          )}
        </section>

        {/* ── Causal Chain ── */}
        <section style={{ flex: 1, padding: "0 16px 32px", maxWidth: 720, width: "100%", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, padding: "0 2px" }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase" as const, letterSpacing: ".08em", fontWeight: 600 }}>Causal Chain</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>{ledgerTotal} proofs</div>
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--surface)" }}>
            {/* Header */}
            <div className="proof-grid proof-header" style={{
              display: "grid", gridTemplateColumns: "56px 1fr 1fr 80px",
              padding: "8px 12px", fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" as const,
              letterSpacing: ".06em", borderBottom: "1px solid var(--border)", fontWeight: 600,
            }}>
              <span>#</span>
              <span>Event</span>
              <span className="digest-col">Digest</span>
              <span style={{ textAlign: "right" as const }}>Time</span>
            </div>

            {ledger.length === 0 ? (
              <div style={{ padding: "40px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 4 }}>No proofs yet</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>Take a photo or drop a file to create the first proof.</div>
              </div>
            ) : (
              ledger.map((entry, i) => {
                const isExpanded = expandedId === entry.globalId;
                const c = entry.counter || String(entry.globalId);
                const name = entry.attribution || "commit";
                const isEth = name.startsWith("Ethereum");
                const isSlot = name.includes("slot");

                // Semantic color for the event type
                const eventColor = isEth ? "var(--anchor)" : isSlot ? "var(--slot)" : "var(--text-2)";

                return (
                  <div key={entry.globalId} style={{ borderBottom: i < ledger.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                    <div
                      className="proof-grid"
                      onClick={() => toggleRow(entry)}
                      style={{
                        display: "grid", gridTemplateColumns: "56px 1fr 1fr 80px",
                        padding: "10px 12px", alignItems: "center", cursor: "pointer",
                        fontSize: 12, transition: "background .15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {/* Counter */}
                      <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: 12, color: isEth ? "var(--anchor)" : "var(--commit)" }}>{c}</span>

                      {/* Event type */}
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {/* Causal dot */}
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                          background: isEth ? "var(--anchor)" : "var(--commit)",
                          boxShadow: isEth ? "0 0 6px rgba(59,130,246,.4)" : "none",
                        }} />
                        <span style={{
                          fontSize: 11, color: eventColor, fontWeight: isEth ? 600 : 400,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                        }}>{name}</span>
                      </span>

                      {/* Digest */}
                      <span className="digest-col" style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{trunc(entry.digest, 24)}</span>

                      {/* Time */}
                      <span style={{ textAlign: "right" as const, fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                        {entry.time ? relativeTime(entry.time) : "\u2014"}
                      </span>
                    </div>

                    {/* Expanded proof detail */}
                    {isExpanded && (
                      <div style={{ padding: "12px", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                        {loadingProof && <div style={{ fontSize: 11, color: "var(--text-3)", padding: "8px 0" }}>Loading proof...</div>}
                        {expandedProof && <ProofDetail proof={expandedProof} />}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 12 }}>
              <button onClick={() => fetchLedger(ledgerPage - 1)} disabled={ledgerPage <= 1} style={{ ...ghostBtn, width: 64, opacity: ledgerPage <= 1 ? 0.3 : 1 }}>Prev</button>
              <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>{ledgerPage}/{totalPages}</span>
              <button onClick={() => fetchLedger(ledgerPage + 1)} disabled={ledgerPage >= totalPages} style={{ ...ghostBtn, width: 64, opacity: ledgerPage >= totalPages ? 0.3 : 1 }}>Next</button>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer style={{
          padding: "10px 16px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "var(--text-3)",
          fontFamily: "var(--mono)", letterSpacing: ".02em",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--verified)", display: "inline-block" }} />
            AWS Nitro TEE
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--anchor)", display: "inline-block" }} />
            ETH anchored
          </span>
        </footer>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Proof Flowchart — each proof is a visual story of what happened
   ══════════════════════════════════════════════════════════════════════ */

function ProofDetail({ proof }: { proof: OCCProof }) {
  const commit = proof.commit;
  const attr = proof.attribution as { name?: string; title?: string; message?: string } | undefined;
  const slot = (proof as unknown as Record<string, unknown>).slotAllocation as Record<string, unknown> | undefined;
  const isEth = attr?.name?.startsWith("Ethereum");
  const isTee = proof.environment?.enforcement === "measured-tee";

  // Build the causal flow steps — show FULL values, not truncated
  const steps: Array<{ label: string; values: Array<{ label: string; value: string; accent?: boolean }>; color: string; link?: string }> = [];

  // Step 1: Slot allocated (if present)
  if (slot) {
    const vals: Array<{ label: string; value: string; accent?: boolean }> = [
      { label: "Counter", value: `#${slot.counter}`, accent: true },
    ];
    if (slot.nonceB64) vals.push({ label: "Nonce", value: String(slot.nonceB64) });
    if (slot.signatureB64) vals.push({ label: "Signature", value: String(slot.signatureB64) });
    steps.push({ label: "Slot Allocated", values: vals, color: "var(--slot)" });
  }

  // Step 2: Artifact hashed
  steps.push({
    label: "Artifact Hashed",
    values: [
      { label: "Algorithm", value: proof.artifact.hashAlg.toUpperCase() },
      { label: "Digest", value: proof.artifact.digestB64 },
    ],
    color: "var(--text-2)",
  });

  // Step 3: Committed to chain
  const commitVals: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: "Counter", value: `#${commit.counter}`, accent: true },
  ];
  if (commit.time) commitVals.push({ label: "Time", value: new Date(Number(commit.time)).toLocaleString() });
  if (commit.epochId) commitVals.push({ label: "Epoch", value: String(commit.epochId) });
  if (commit.nonceB64) commitVals.push({ label: "Nonce", value: commit.nonceB64 });
  if (commit.slotCounter != null) commitVals.push({ label: "Slot Counter", value: `#${commit.slotCounter}` });
  if (commit.slotHashB64) commitVals.push({ label: "Slot Hash", value: commit.slotHashB64 });
  steps.push({ label: "Committed", values: commitVals, color: "var(--commit)" });

  // Step 4: Signed by TEE
  steps.push({
    label: isTee ? "Signed by Hardware Enclave" : "Signed",
    values: [
      { label: "Public Key", value: proof.signer.publicKeyB64 },
      { label: "Signature", value: proof.signer.signatureB64 },
      ...(proof.environment?.measurement ? [{ label: "PCR0", value: proof.environment.measurement }] : []),
    ],
    color: "var(--verified)",
  });

  // Step 5: ETH anchor (if applicable)
  if (isEth && attr) {
    const ethVals: Array<{ label: string; value: string }> = [];
    if (attr.name) ethVals.push({ label: "Block", value: attr.name });
    if (attr.message) ethVals.push({ label: "Tx Hash", value: attr.message });
    steps.push({ label: "Ethereum Anchor", values: ethVals, color: "var(--anchor)", link: attr.title });
  }

  return (
    <div style={{ padding: "4px 0" }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", gap: 12 }}>
          {/* Timeline line + dot */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%", flexShrink: 0, marginTop: 4,
              background: step.color, boxShadow: `0 0 8px ${step.color}40`,
            }} />
            {i < steps.length - 1 && (
              <div style={{ width: 1, flex: 1, background: "var(--border)", marginTop: 2 }} />
            )}
          </div>

          {/* Content */}
          <div style={{ paddingBottom: i < steps.length - 1 ? 14 : 0, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: step.color, lineHeight: 1.3, marginBottom: 6 }}>
              {step.label}
              {step.link ? (
                <a href={step.link} target="_blank" rel="noopener" style={{ marginLeft: 8, fontSize: 11, color: "var(--anchor)", textDecoration: "none", fontWeight: 400 }}>View &rarr;</a>
              ) : null}
            </div>
            {step.values.map((v, j) => (
              <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>{v.label}</span>
                <CopyableText
                  text={v.value}
                  style={{
                    fontSize: v.accent ? 13 : 11, fontFamily: "var(--mono)",
                    color: v.accent ? step.color : "var(--text-2)",
                    fontWeight: v.accent ? 700 : 400,
                    wordBreak: "break-all" as const, textAlign: "right" as const, lineHeight: 1.4,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Chain link (prevB64) */}
      {commit.prevB64 ? (
        <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(255,255,255,.02)", borderRadius: 6, border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          <CopyableText text={commit.prevB64} style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)", wordBreak: "break-all" as const }} />
        </div>
      ) : null}

      {/* Full JSON */}
      <details style={{ marginTop: 10 }}>
        <summary style={{ fontSize: 11, color: "var(--text-3)", cursor: "pointer", padding: "4px 0" }}>Full proof JSON</summary>
        <CopyableText
          text={JSON.stringify(proof, null, 2)}
          style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text-3)", whiteSpace: "pre-wrap" as const, wordBreak: "break-all" as const, padding: "10px", background: "rgba(255,255,255,.02)", border: "1px solid var(--border)", borderRadius: 6, marginTop: 6, maxHeight: 400, overflow: "auto", textAlign: "left" as const }}
        />
      </details>
    </div>
  );
}

/* Clickable text that copies on click */
function CopyableText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ ...style, cursor: "pointer", transition: "color .2s", color: copied ? "var(--verified)" : style?.color }}
      title="Click to copy"
    >
      {text}
    </div>
  );
}

/* ── Shared styles ── */

const card: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" as const,
  padding: "28px 16px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)",
};

const spinnerStyle: React.CSSProperties = {
  width: 20, height: 20, border: "2px solid var(--border)", borderTopColor: "var(--anchor)",
  borderRadius: "50%", animation: "spin .7s linear infinite", marginBottom: 12,
};

const ghostBtn: React.CSSProperties = {
  padding: "8px 0", fontSize: 11, fontWeight: 600, color: "var(--text-3)",
  background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer",
};

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  hashFile,
  commitDigest,
  commitBatch,
  formatFileSize,
  type OCCProof,
} from "@/lib/occ";
import { relativeTime } from "@/lib/explorer";
import { zipSync } from "fflate";

/* ── Types ── */

type Step = "idle" | "hashing" | "signing" | "done" | "error";

interface ProofEntry {
  globalId: number;
  digest: string;
  counter?: string;
  time?: number;
  attribution?: string;
}

/* ── Page ── */

export default function Home() {
  const [step, setStep] = useState<Step>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [digest, setDigest] = useState("");
  const [proofs, setProofs] = useState<OCCProof[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [dragover, setDragover] = useState(false);
  const [copied, setCopied] = useState(false);
  const browseRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  const [feed, setFeed] = useState<ProofEntry[]>([]);
  const [feedTotal, setFeedTotal] = useState(0);
  const [feedPage, setFeedPage] = useState(1);
  const PER_PAGE = 20;

  const fetchFeed = useCallback(async (page: number) => {
    try {
      const resp = await fetch(`/api/proofs?page=${page}&limit=${PER_PAGE}`);
      if (!resp.ok) return;
      const data = await resp.json();
      setFeed((data.proofs || []).map((p: Record<string, unknown>) => ({
        globalId: (p.id as number) || 0,
        digest: (p.digestB64 as string) || "",
        counter: (p.counter as string) || undefined,
        time: p.commitTime ? Number(p.commitTime) : undefined,
        attribution: (p.attrName as string) || undefined,
      })));
      setFeedTotal(data.total || 0);
      setFeedPage(page);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchFeed(1);
    const iv = setInterval(() => fetchFeed(1), 15000);
    return () => clearInterval(iv);
  }, [fetchFeed]);

  const handleFiles = useCallback(async (incoming: File[]) => {
    setFiles(incoming);
    setStep("hashing");
    setError("");
    setProofs([]);
    setCopied(false);
    try {
      if (incoming.length === 1) {
        setProgress({ current: 1, total: 1, fileName: incoming[0].name });
        const d = await hashFile(incoming[0]);
        setDigest(d);
        setStep("signing");
        const p = await commitDigest(d);
        setProofs([p]);
        setStep("done");
      } else {
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
      }
      setTimeout(() => fetchFeed(1), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  }, [fetchFeed]);

  function reset() {
    setFiles([]); setStep("idle"); setDigest(""); setProofs([]);
    setError(""); setProgress(null); setCopied(false);
  }

  async function downloadZip() {
    if (!proofs.length || !files.length) return;
    const z: Record<string, Uint8Array> = {};
    for (let i = 0; i < files.length; i++) {
      const f = files[i], p = proofs[i] || proofs[0];
      z[f.name] = new Uint8Array(await f.arrayBuffer());
      z[files.length > 1 ? `proof-${i + 1}.json` : "proof.json"] = new TextEncoder().encode(JSON.stringify(p, null, 2));
    }
    const blob = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = files.length === 1 ? `${files[0].name.replace(/\.[^.]+$/, "")}-occ-proof.zip` : "occ-proof-batch.zip";
    a.click(); URL.revokeObjectURL(url);
  }

  const firstProof = proofs[0];
  const counter = firstProof?.commit?.counter;
  const wallTime = firstProof?.commit?.time ? new Date(Number(firstProof.commit.time)).toLocaleString() : null;
  const totalPages = Math.ceil(feedTotal / PER_PAGE);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #000; --surface: #0a0a0a; --border: #1e1e1e;
          --text: #f5f5f5; --text2: #a0a0a0; --text3: #666;
          --blue: #0095f6; --green: #00c853; --red: #ed4956;
          --font: acumin-pro, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          --mono: var(--font-mono), 'SF Mono', 'JetBrains Mono', Consolas, monospace;
        }
        html, body { background: var(--bg); color: var(--text); font-family: var(--font); -webkit-font-smoothing: antialiased; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <nav style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>OCC</span>
          <div style={{ display: "flex", gap: 20 }}>
            <a href="/docs" style={{ fontSize: 14, color: "var(--text2)", textDecoration: "none" }}>Docs</a>
            <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 14, color: "var(--text2)", textDecoration: "none" }}>GitHub</a>
          </div>
        </nav>

        {/* ── Drop Zone ── */}
        <section style={{ padding: "24px 20px", maxWidth: 640, width: "100%", margin: "0 auto" }}>
          <input ref={browseRef} type="file" multiple accept="*/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) { handleFiles(Array.from(e.target.files)); e.target.value = ""; } }} />
          <input ref={captureRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) { handleFiles(Array.from(e.target.files)); e.target.value = ""; } }} />

          {step === "idle" && (
            <div
              onClick={() => browseRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => { e.preventDefault(); setDragover(false); const f = Array.from(e.dataTransfer.files); if (f.length) handleFiles(f); }}
              style={{
                border: `2px dashed ${dragover ? "var(--blue)" : "var(--border)"}`,
                borderRadius: 16,
                padding: "80px 32px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all .2s",
                background: dragover ? "rgba(0,149,246,.03)" : "var(--surface)",
                minHeight: 260,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 20 }}>
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <div style={{ fontSize: 18, fontWeight: 500, color: "var(--text)", marginBottom: 8 }}>
                Drop a photo to prove it
              </div>
              <div style={{ fontSize: 15, color: "var(--text3)", lineHeight: 1.5 }}>
                <span onClick={(e) => { e.stopPropagation(); browseRef.current?.click(); }} style={{ color: "var(--blue)", cursor: "pointer" }}>Browse</span>
                {" or "}
                <span onClick={(e) => { e.stopPropagation(); captureRef.current?.click(); }} style={{ color: "var(--blue)", cursor: "pointer" }}>take a photo</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 16 }}>
                Your file never leaves your browser.
              </div>
            </div>
          )}

          {step === "hashing" && progress && (
            <div style={statusBox}>
              <div style={spinner} />
              <div style={{ fontSize: 15, color: "var(--text)" }}>
                {progress.total === 1 ? `Hashing...` : `Hashing ${progress.current} of ${progress.total}`}
              </div>
              <div style={{ fontSize: 13, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 4 }}>{progress.fileName}</div>
              {progress.total > 1 && (
                <div style={{ width: "100%", height: 3, background: "var(--border)", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(progress.current / progress.total) * 100}%`, background: "var(--blue)", transition: "width .3s" }} />
                </div>
              )}
            </div>
          )}

          {step === "signing" && (
            <div style={statusBox}>
              <div style={spinner} />
              <div style={{ fontSize: 15, color: "var(--text)" }}>Signing in hardware enclave...</div>
            </div>
          )}

          {step === "done" && firstProof && (
            <div style={{ ...statusBox, animation: "fadeIn .3s ease-out", borderColor: "var(--green)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                <span style={{ fontSize: 17, fontWeight: 600 }}>Proven</span>
                {counter != null && <span style={{ fontSize: 15, color: "var(--blue)", fontFamily: "var(--mono)", fontWeight: 700 }}>#{counter}</span>}
              </div>
              <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 12 }}>
                {files.length === 1 ? `${files[0].name} \u00b7 ${formatFileSize(files[0].size)}` : `${files.length} files`}
              </div>
              <div
                onClick={() => { navigator.clipboard.writeText(digest); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ width: "100%", fontSize: 11, fontFamily: "var(--mono)", color: copied ? "var(--green)" : "var(--text3)", wordBreak: "break-all" as const, padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", lineHeight: 1.5, transition: "color .2s" }}
              >
                {copied ? "Copied!" : digest}
              </div>
              {wallTime && <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 8 }}>{wallTime}</div>}
              <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 16 }}>
                <button onClick={downloadZip} style={btnPrimary}>Export .zip</button>
                <button onClick={() => { if (firstProof) { const b = new Blob([JSON.stringify(firstProof, null, 2)], { type: "application/json" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `occ-proof-${counter}.json`; a.click(); URL.revokeObjectURL(u); }}} style={btnOutline}>Export .json</button>
                <button onClick={reset} style={btnOutline}>New</button>
              </div>
            </div>
          )}

          {step === "error" && (
            <div style={statusBox}>
              <div style={{ fontSize: 15, color: "var(--red)", marginBottom: 12 }}>{error}</div>
              <button onClick={reset} style={btnOutline}>Try again</button>
            </div>
          )}
        </section>

        {/* ── Proof Chain ── */}
        <section style={{ flex: 1, padding: "0 20px 32px", maxWidth: 640, width: "100%", margin: "0 auto" }}>
          <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 10 }}>
            {feedTotal} proof{feedTotal !== 1 ? "s" : ""} on chain
          </div>

          {feed.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text3)", fontSize: 14 }}>
              No proofs yet. Drop a photo to create the first one.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {feed.map((entry) => {
                const c = entry.counter || String(entry.globalId);
                const name = entry.attribution || "proof";
                const isEth = name.startsWith("Ethereum");
                const digestSafe = encodeURIComponent(entry.digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));

                return (
                  <a
                    key={entry.globalId}
                    href={`/proof/${digestSafe}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 16px", borderRadius: 12,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      textDecoration: "none", color: "var(--text)",
                      transition: "border-color .15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--text3)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  >
                    {/* Counter */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: isEth ? "rgba(0,149,246,.08)" : "rgba(255,255,255,.03)",
                      border: `1px solid ${isEth ? "rgba(0,149,246,.2)" : "var(--border)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 700, fontFamily: "var(--mono)",
                      color: isEth ? "var(--blue)" : "var(--text)",
                    }}>
                      {c}
                    </div>

                    {/* Name + time */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                        {entry.time ? relativeTime(entry.time) : ""}
                      </div>
                    </div>

                    {/* Arrow */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </a>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 16 }}>
              <button onClick={() => fetchFeed(feedPage - 1)} disabled={feedPage <= 1} style={{ ...btnOutline, opacity: feedPage <= 1 ? 0.3 : 1 }}>Prev</button>
              <span style={{ fontSize: 13, color: "var(--text3)", fontFamily: "var(--mono)" }}>{feedPage}/{totalPages}</span>
              <button onClick={() => fetchFeed(feedPage + 1)} disabled={feedPage >= totalPages} style={{ ...btnOutline, opacity: feedPage >= totalPages ? 0.3 : 1 }}>Next</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/* ── Styles ── */

const statusBox: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
  padding: "40px 24px", border: "1px solid var(--border)", borderRadius: 16, background: "var(--surface)",
};

const spinner: React.CSSProperties = {
  width: 22, height: 22, border: "2px solid var(--border)", borderTopColor: "var(--blue)",
  borderRadius: "50%", animation: "spin .7s linear infinite", marginBottom: 14,
};

const btnPrimary: React.CSSProperties = {
  flex: 1, padding: "12px 0", fontSize: 14, fontWeight: 600, color: "#fff",
  background: "var(--blue)", border: "none", borderRadius: 10, cursor: "pointer",
};

const btnOutline: React.CSSProperties = {
  flex: 1, padding: "12px 0", fontSize: 14, fontWeight: 600, color: "var(--text2)",
  background: "transparent", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer",
};

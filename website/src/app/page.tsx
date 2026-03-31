"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  hashFile,
  commitDigest,
  commitBatch,
  formatFileSize,
  type OCCProof,
} from "@/lib/occ";
import { toUrlSafeB64, relativeTime } from "@/lib/explorer";
import { zipSync } from "fflate";

/* ── Types ───────────────────────────────────────────────────────────── */

type Step = "idle" | "hashing" | "signing" | "done" | "error";

interface ProofEntry {
  globalId: number;
  digest: string;
  counter?: string;
  enforcement: string;
  time?: number;
  attribution?: string;
  signer: string;
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function Home() {
  /* ── Prover state ── */
  const [step, setStep] = useState<Step>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [digest, setDigest] = useState("");
  const [proofs, setProofs] = useState<OCCProof[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragover, setDragover] = useState(false);
  const browseRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  /* ── Ledger state ── */
  const [ledger, setLedger] = useState<ProofEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedProof, setExpandedProof] = useState<OCCProof | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const PER_PAGE = 20;

  /* ── Fetch ledger ── */
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

  /* ── Prove files ── */
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
          setProgress({ current: i + 1, total: incoming.length, fileName: incoming[i].name });
          const d = await hashFile(incoming[i]);
          digests.push({ digestB64: d, hashAlg: "sha256" });
        }
        setDigest(digests[0].digestB64);
        setStep("signing");
        const ps = await commitBatch(digests);
        setProofs(ps);
        setStep("done");
      }
      setTimeout(() => fetchLedger(1), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  }, [fetchLedger]);

  function reset() {
    setFiles([]); setStep("idle"); setDigest(""); setProofs([]);
    setError(""); setProgress(null); setCopied(false);
  }

  async function downloadZip() {
    if (!proofs.length || !files.length) return;
    const zipFiles: Record<string, Uint8Array> = {};
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const p = proofs[i] || proofs[0];
      zipFiles[f.name] = new Uint8Array(await f.arrayBuffer());
      zipFiles[files.length > 1 ? `proof-${i + 1}.json` : "proof.json"] =
        new TextEncoder().encode(JSON.stringify(p, null, 2));
      if (i === 0) {
        zipFiles["VERIFY.txt"] = new TextEncoder().encode(
          `OCC Proof\n=========\nFile: ${f.name}\nDigest: ${p.artifact.digestB64}\nCounter: #${p.commit.counter ?? "—"}\nTime: ${p.commit.time ? new Date(p.commit.time).toISOString() : "—"}\nEnforcement: ${p.environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"}\nSigner: ${p.signer.publicKeyB64}\n\nVerify: https://occ.wtf/docs/verification\n`
        );
      }
    }
    const zipped = zipSync(zipFiles);
    const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = files.length === 1
      ? `${files[0].name.replace(/\.[^.]+$/, "")}-occ-proof.zip`
      : "occ-proof-batch.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Expand a ledger row ── */
  async function toggleRow(entry: ProofEntry) {
    if (expandedId === entry.globalId) {
      setExpandedId(null);
      setExpandedProof(null);
      return;
    }
    setExpandedId(entry.globalId);
    setExpandedProof(null);
    if (entry.digest === "—") return;
    setLoadingProof(true);
    try {
      const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(entry.digest))}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.proofs?.[0]?.proof) setExpandedProof(data.proofs[0].proof as OCCProof);
      }
    } catch { /* silent */ }
    setLoadingProof(false);
  }

  /* ── Derived ── */
  const firstProof = proofs[0];
  const counter = firstProof?.commit?.counter;
  const wallTime = firstProof?.commit?.time
    ? new Date(Number(firstProof.commit.time)).toLocaleString()
    : null;
  const totalPages = Math.ceil(ledgerTotal / PER_PAGE);
  const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n) + "..." : s;

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #09090b; --surface: #18181b; --border: #27272a; --border-subtle: #1f1f23;
          --text: #fafafa; --text-2: #a1a1aa; --text-3: #71717a;
          --accent: #3b82f6; --green: #22c55e; --red: #ef4444;
          --mono: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
          --sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
        }
        html, body { background: var(--bg); color: var(--text); font-family: var(--sans); -webkit-font-smoothing: antialiased; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.5 } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* ── Nav ── */}
        <nav style={{
          height: 52, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", borderBottom: "1px solid var(--border)",
        }}>
          <a href="/" style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", textDecoration: "none", letterSpacing: ".08em", fontFamily: "var(--mono)" }}>OCC</a>
          <div style={{ display: "flex", gap: 20 }}>
            <a href="/docs" style={linkStyle}>Docs</a>
            <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={linkStyle}>GitHub</a>
          </div>
        </nav>

        {/* ── Prover ── */}
        <section
          style={{ padding: "32px 20px", maxWidth: 640, width: "100%", margin: "0 auto" }}
          onDragOver={(e) => { e.preventDefault(); if (step === "idle") setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={(e) => { e.preventDefault(); setDragover(false); if (step !== "idle") return; const f = Array.from(e.dataTransfer.files); if (f.length) handleFiles(f); }}
        >
          {/* Hidden inputs */}
          <input ref={browseRef} type="file" multiple accept="*/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) { handleFiles(Array.from(e.target.files)); e.target.value = ""; } }} />
          <input ref={captureRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) { handleFiles(Array.from(e.target.files)); e.target.value = ""; } }} />

          {step === "idle" && (
            <div
              onClick={() => browseRef.current?.click()}
              style={{
                border: `2px dashed ${dragover ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 10, padding: "40px 20px", textAlign: "center", cursor: "pointer",
                transition: "border-color .2s, background .2s",
                background: dragover ? "rgba(59,130,246,.04)" : "transparent",
              }}
            >
              <div style={{ fontSize: 15, color: "var(--text-2)", marginBottom: 6 }}>Drop files here</div>
              <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                or{" "}
                <span onClick={(e) => { e.stopPropagation(); browseRef.current?.click(); }} style={inlineLink}>browse</span>
                {" · "}
                <span onClick={(e) => { e.stopPropagation(); captureRef.current?.click(); }} style={inlineLink}>take photo</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 12 }}>Hashed in your browser. Nothing uploaded.</div>
            </div>
          )}

          {step === "hashing" && progress && (
            <div style={stateCard}>
              <div style={spinner} />
              <div style={{ fontSize: 14, color: "var(--text)" }}>
                {progress.total === 1 ? `Hashing ${progress.fileName}...` : `Hashing ${progress.current} of ${progress.total}...`}
              </div>
              {progress.total > 1 && (
                <div style={{ width: "100%", height: 3, background: "var(--border)", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(progress.current / progress.total) * 100}%`, background: "var(--accent)", borderRadius: 2, transition: "width .3s" }} />
                </div>
              )}
            </div>
          )}

          {step === "signing" && (
            <div style={stateCard}>
              <div style={spinner} />
              <div style={{ fontSize: 14, color: "var(--text)" }}>Signing in hardware enclave...</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--mono)", marginTop: 6, animation: "pulse 1.5s ease-in-out infinite" }}>{digest.slice(0, 32)}...</div>
            </div>
          )}

          {step === "done" && firstProof && (
            <div style={{ ...stateCard, animation: "fadeIn .3s ease-out" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Proven</span>
                {counter != null && <span style={{ fontSize: 14, color: "var(--accent)", fontFamily: "var(--mono)", fontWeight: 600 }}>#{counter}</span>}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 12 }}>
                {files.length === 1 ? `${files[0].name} · ${formatFileSize(files[0].size)}` : `${files.length} files`}
              </div>
              <div
                onClick={() => { navigator.clipboard.writeText(digest); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,.02)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}
              >
                <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-3)", wordBreak: "break-all" as const }}>{digest}</span>
                <span style={{ fontSize: 10, color: copied ? "var(--green)" : "var(--text-3)", flexShrink: 0, marginLeft: 8 }}>{copied ? "Copied" : "Copy"}</span>
              </div>
              {wallTime && <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>{wallTime}</div>}
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <button onClick={downloadZip} style={btnPrimary}>Download .zip</button>
                <button onClick={reset} style={btnGhost}>New</button>
              </div>
            </div>
          )}

          {step === "error" && (
            <div style={stateCard}>
              <div style={{ fontSize: 14, color: "var(--red)", marginBottom: 12 }}>{error}</div>
              <button onClick={reset} style={btnGhost}>Try again</button>
            </div>
          )}
        </section>

        {/* ── Proof Chain ── */}
        <section style={{ flex: 1, padding: "0 20px 32px", maxWidth: 960, width: "100%", margin: "0 auto" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 12, padding: "0 4px",
          }}>
            <div style={{ fontSize: 13, color: "var(--text-3)" }}>
              {ledgerTotal} proof{ledgerTotal !== 1 ? "s" : ""}
            </div>
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: "60px 1fr 1fr 100px",
              padding: "10px 16px", fontSize: 11, color: "var(--text-3)", textTransform: "uppercase" as const,
              letterSpacing: ".05em", borderBottom: "1px solid var(--border)", background: "var(--surface)",
            }}>
              <span>#</span>
              <span>Type</span>
              <span>Digest</span>
              <span style={{ textAlign: "right" as const }}>Age</span>
            </div>

            {/* Rows */}
            {ledger.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>
                No proofs yet. Drop a file above to create the first one.
              </div>
            ) : (
              ledger.map((entry, i) => {
                const isExpanded = expandedId === entry.globalId;
                const c = entry.counter || String(entry.globalId);
                const toolName = entry.attribution || "proof";
                const isEth = toolName.startsWith("Ethereum");

                return (
                  <div key={entry.globalId} style={{ borderBottom: i < ledger.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                    {/* Row */}
                    <div
                      onClick={() => toggleRow(entry)}
                      style={{
                        display: "grid", gridTemplateColumns: "60px 1fr 1fr 100px",
                        padding: "12px 16px", alignItems: "center", cursor: "pointer",
                        fontSize: 13, transition: "background .1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.02)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ fontWeight: 600, color: "var(--accent)", fontFamily: "var(--mono)" }}>{c}</span>
                      <span>
                        <span style={{
                          display: "inline-block", fontSize: 11, padding: "2px 7px", borderRadius: 4,
                          border: "1px solid var(--border)", color: isEth ? "var(--accent)" : "var(--text-2)",
                          background: isEth ? "rgba(59,130,246,.06)" : "transparent",
                          maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                        }}>{toolName}</span>
                      </span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-3)" }}>{trunc(entry.digest, 20)}</span>
                      <span style={{ textAlign: "right" as const, fontSize: 12, color: "var(--text-3)" }}>
                        {entry.time ? relativeTime(entry.time) : "—"}
                      </span>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ padding: "16px", borderTop: "1px solid var(--border-subtle)", background: "rgba(255,255,255,.01)" }}>
                        {loadingProof && <div style={{ fontSize: 12, color: "var(--text-3)" }}>Loading...</div>}
                        {expandedProof && (() => {
                          const p = expandedProof;
                          const commit = p.commit;
                          const attr = p.attribution as { name?: string; title?: string; message?: string } | undefined;
                          const slot = (p as unknown as Record<string, unknown>).slotAllocation as Record<string, unknown> | undefined;
                          return (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, fontSize: 12 }}>
                              {/* Artifact */}
                              <div>
                                <div style={sectionTitle}>Artifact</div>
                                <Field label="Digest" value={p.artifact.digestB64} mono />
                                <Field label="Algorithm" value={p.artifact.hashAlg.toUpperCase()} />
                              </div>
                              {/* Commit */}
                              <div>
                                <div style={sectionTitle}>Commit</div>
                                {commit.time != null && <Field label="Time" value={new Date(Number(commit.time)).toLocaleString()} />}
                                <Field label="Counter" value={`#${commit.counter}`} />
                                {commit.epochId && <Field label="Epoch" value={String(commit.epochId)} mono />}
                                {commit.prevB64 && <Field label="Prev" value={commit.prevB64} mono />}
                                {commit.nonceB64 && <Field label="Nonce" value={commit.nonceB64} mono />}
                                {commit.slotCounter != null && <Field label="Slot #" value={String(commit.slotCounter)} />}
                              </div>
                              {/* Signer */}
                              <div>
                                <div style={sectionTitle}>Signer</div>
                                <Field label="Key" value={p.signer.publicKeyB64} mono />
                                <Field label="Sig" value={p.signer.signatureB64} mono />
                              </div>
                              {/* Environment */}
                              <div>
                                <div style={sectionTitle}>Environment</div>
                                <Field label="Enforcement" value={p.environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"} />
                                {p.environment?.measurement && <Field label="PCR0" value={p.environment.measurement} mono />}
                              </div>
                              {/* Slot */}
                              {slot && (
                                <div>
                                  <div style={sectionTitle}>Causal Slot</div>
                                  <Field label="Counter" value={String(slot.counter || "")} />
                                  {slot.nonceB64 ? <Field label="Nonce" value={String(slot.nonceB64)} mono /> : null}
                                  {slot.signatureB64 ? <Field label="Sig" value={String(slot.signatureB64)} mono /> : null}
                                </div>
                              )}
                              {/* Attribution */}
                              {attr && (
                                <div>
                                  <div style={sectionTitle}>Attribution</div>
                                  {attr.name && <Field label="Name" value={attr.name} />}
                                  {attr.title && (
                                    <div style={fieldRow}>
                                      <span style={fieldLabel}>Link</span>
                                      <a href={attr.title} target="_blank" rel="noopener" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 12 }}>Etherscan →</a>
                                    </div>
                                  )}
                                  {attr.message && <Field label="Tx" value={attr.message} mono />}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 16 }}>
              <button onClick={() => fetchLedger(ledgerPage - 1)} disabled={ledgerPage <= 1} style={{ ...btnGhost, width: 72, opacity: ledgerPage <= 1 ? 0.3 : 1 }}>Prev</button>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>{ledgerPage} / {totalPages}</span>
              <button onClick={() => fetchLedger(ledgerPage + 1)} disabled={ledgerPage >= totalPages} style={{ ...btnGhost, width: 72, opacity: ledgerPage >= totalPages ? 0.3 : 1 }}>Next</button>
            </div>
          )}
        </section>

        {/* ── Footer ── */}
        <footer style={{
          padding: "12px 24px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)",
        }}>
          <span>Signed by AWS Nitro Enclave</span>
          <span>Anchored to Ethereum every 10 min</span>
        </footer>
      </div>
    </>
  );
}

/* ── Field component for expanded proof ── */

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      style={fieldRow}
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      <span style={fieldLabel}>{label}</span>
      <span style={{
        color: copied ? "var(--green)" : "var(--text-2)",
        fontFamily: mono ? "var(--mono)" : "inherit",
        fontSize: mono ? 11 : 12,
        wordBreak: "break-all" as const,
        cursor: "pointer",
        transition: "color .2s",
      }}>
        {value}
      </span>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */

const linkStyle: React.CSSProperties = { fontSize: 13, color: "var(--text-3)", textDecoration: "none" };

const inlineLink: React.CSSProperties = {
  color: "var(--text)", fontWeight: 500, cursor: "pointer",
  textDecoration: "underline", textUnderlineOffset: "3px", textDecorationColor: "var(--text-3)",
};

const stateCard: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" as const,
  padding: "32px 20px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)",
};

const spinner: React.CSSProperties = {
  width: 20, height: 20, border: "2px solid var(--border)", borderTopColor: "var(--accent)",
  borderRadius: "50%", animation: "spin .7s linear infinite", marginBottom: 12,
};

const btnPrimary: React.CSSProperties = {
  flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, color: "#fff",
  background: "var(--accent)", border: "none", borderRadius: 6, cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, color: "var(--text-2)",
  background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" as const,
  letterSpacing: ".05em", marginBottom: 8,
};

const fieldRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", lineHeight: 1.5,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 12, color: "var(--text-3)", flexShrink: 0, minWidth: 50,
};

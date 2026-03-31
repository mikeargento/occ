"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  hashFile,
  commitDigest,
  formatFileSize,
  isOCCProof,
  verifyProofSignature,
  type OCCProof,
} from "@/lib/occ";
import { toUrlSafeB64, relativeTime } from "@/lib/explorer";
import { zipSync } from "fflate";

/* ── Types ── */

interface ProofEntry {
  globalId: number;
  digest: string;
  counter?: string;
  enforcement: string;
  time?: number;
  attribution?: string;
  signer: string;
}

/* ── Page ── */

export default function Home() {
  /* Composer */
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postStep, setPostStep] = useState("");
  const [posted, setPosted] = useState<OCCProof | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  /* Feed */
  const [feed, setFeed] = useState<ProofEntry[]>([]);
  const [feedTotal, setFeedTotal] = useState(0);
  const [feedPage, setFeedPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedProof, setExpandedProof] = useState<OCCProof | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  /* Theme */
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const PER_PAGE = 20;
  const t = dark ? themes.dark : themes.light;

  /* ── Fetch feed ── */
  const fetchFeed = useCallback(async (page: number) => {
    try {
      const resp = await fetch(`/api/proofs?page=${page}&limit=${PER_PAGE}`);
      if (!resp.ok) return;
      const data = await resp.json();
      setFeed((data.proofs || []).map((p: Record<string, unknown>) => ({
        globalId: (p.id as number) || 0,
        digest: (p.digestB64 as string) || "",
        counter: (p.counter as string) || undefined,
        enforcement: (p.enforcement as string) || "",
        time: p.commitTime ? Number(p.commitTime) : undefined,
        attribution: (p.attrName as string) || undefined,
        signer: ((p.signerPub as string) || "").slice(0, 16) || "",
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

  /* ── Attach file ── */
  function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPosted(null);
    setError("");
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
    e.target.value = "";
  }

  function clearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setPosted(null);
    setError("");
  }

  /* ── Post (prove) ── */
  async function handlePost() {
    if (!file || posting) return;
    setPosting(true);
    setError("");
    setPosted(null);

    try {
      // Check if it's a proof.json to verify
      if (file.name.endsWith(".json") && file.size < 500_000) {
        const text = await file.text();
        const proof = isOCCProof(text);
        if (proof) {
          setPostStep("Verifying signature...");
          const result = await verifyProofSignature(proof);
          setPosted(proof);
          setPostStep(result.valid ? "Valid proof" : "Invalid proof");
          setPosting(false);
          return;
        }
      }

      setPostStep("Hashing...");
      const digest = await hashFile(file);

      setPostStep("Signing in enclave...");
      const proof = await commitDigest(digest);

      setPosted(proof);
      setPostStep("");
      setTimeout(() => fetchFeed(1), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post");
    }
    setPosting(false);
  }

  /* ── Export zip ── */
  async function exportZip(f: File, proof: OCCProof) {
    const z: Record<string, Uint8Array> = {};
    z[f.name] = new Uint8Array(await f.arrayBuffer());
    z["proof.json"] = new TextEncoder().encode(JSON.stringify(proof, null, 2));
    z["VERIFY.txt"] = new TextEncoder().encode(
      `OCC Proof\n=========\nFile: ${f.name}\nDigest: ${proof.artifact.digestB64}\nCounter: #${proof.commit.counter ?? "?"}\nTime: ${proof.commit.time ? new Date(proof.commit.time).toISOString() : "?"}\nSigner: ${proof.signer.publicKeyB64}\nVerify: https://occ.wtf/docs/verification\n`
    );
    const blob = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${f.name.replace(/\.[^.]+$/, "")}-occ-proof.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Expand feed row ── */
  async function toggleRow(entry: ProofEntry) {
    if (expandedId === entry.globalId) { setExpandedId(null); setExpandedProof(null); return; }
    setExpandedId(entry.globalId);
    setExpandedProof(null);
    if (!entry.digest) return;
    setLoadingProof(true);
    try {
      const resp = await fetch(`/api/proofs/digest/${encodeURIComponent(toUrlSafeB64(entry.digest))}`);
      if (resp.ok) {
        const d = await resp.json();
        if (d.proofs?.[0]?.proof) setExpandedProof(d.proofs[0].proof as OCCProof);
      }
    } catch { /* */ }
    setLoadingProof(false);
  }

  /* ── Export from feed ── */
  function downloadProofJson(proof: OCCProof) {
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `occ-proof-${proof.commit.counter || "unknown"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(feedTotal / PER_PAGE);

  /* ── Render ── */
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --font: acumin-pro, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
          --mono: var(--font-mono), 'SF Mono', 'JetBrains Mono', Consolas, monospace;
        }
        html, body {
          background: ${t.bg};
          color: ${t.text};
          font-family: var(--font);
          -webkit-font-smoothing: antialiased;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        a { color: ${t.link}; text-decoration: none; }
        a:hover { text-decoration: underline; }
        ::selection { background: ${t.link}20; }
      `}</style>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <header style={{
          height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", borderBottom: `1px solid ${t.border}`,
          position: "sticky", top: 0, background: t.bg, zIndex: 10,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: ".02em" }}>OCC</span>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <a href="/docs" style={{ fontSize: 14, color: t.text2 }}>Docs</a>
            <button
              onClick={() => setDark(!dark)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: t.text2, padding: 4 }}
              title="Toggle theme"
            >{dark ? "\u2600" : "\u263E"}</button>
          </div>
        </header>

        {/* ── Composer ── */}
        <div style={{
          maxWidth: 600, width: "100%", margin: "0 auto",
          padding: "16px 16px 0",
          borderBottom: `1px solid ${t.border}`,
        }}>
          {/* Composer box */}
          <div style={{ display: "flex", gap: 12 }}>
            {/* Avatar placeholder */}
            <div style={{
              width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
              background: t.surface, border: `1px solid ${t.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, color: t.text3, fontWeight: 600,
            }}>P</div>

            {/* Input area */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {!file && !posted ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    padding: "10px 0", fontSize: 15, color: t.text3, cursor: "pointer",
                    minHeight: 40, display: "flex", alignItems: "center",
                  }}
                >
                  Prove a photo...
                </div>
              ) : posted ? (
                /* Success state */
                <div style={{ padding: "8px 0", animation: "fadeIn .3s ease-out" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.verified} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <span style={{ fontSize: 14, fontWeight: 600, color: t.verified }}>Proven</span>
                    <span style={{ fontSize: 13, color: t.link, fontFamily: "var(--mono)", fontWeight: 600 }}>#{posted.commit.counter}</span>
                  </div>
                  {preview && (
                    <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 8, border: `1px solid ${t.border}` }}>
                      <img src={preview} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", display: "block" }} />
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: t.text2, marginBottom: 8 }}>
                    {file?.name} {file ? `\u00b7 ${formatFileSize(file.size)}` : ""}
                  </div>
                  <Copyable text={posted.artifact.digestB64} label="Digest" t={t} />
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {file && <button onClick={() => exportZip(file, posted)} style={btn(t)}>Export .zip</button>}
                    <button onClick={() => downloadProofJson(posted)} style={btn(t)}>Export .json</button>
                    <button onClick={clearFile} style={btn(t)}>New</button>
                  </div>
                </div>
              ) : file ? (
                /* File attached, ready to post */
                <div style={{ padding: "8px 0" }}>
                  {preview && (
                    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 8, border: `1px solid ${t.border}` }}>
                      <img src={preview} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", display: "block" }} />
                      <button
                        onClick={clearFile}
                        style={{
                          position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%",
                          background: "rgba(0,0,0,.7)", border: "none", color: "#fff", fontSize: 14,
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >&times;</button>
                    </div>
                  )}
                  {!preview && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 12px", borderRadius: 8, background: t.surface, border: `1px solid ${t.border}`,
                      marginBottom: 8,
                    }}>
                      <div>
                        <div style={{ fontSize: 14, color: t.text }}>{file.name}</div>
                        <div style={{ fontSize: 12, color: t.text3 }}>{formatFileSize(file.size)}</div>
                      </div>
                      <button onClick={clearFile} style={{ background: "none", border: "none", color: t.text3, cursor: "pointer", fontSize: 18 }}>&times;</button>
                    </div>
                  )}
                  {posting && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: t.text3 }}>
                      <div style={{ width: 14, height: 14, border: `2px solid ${t.border}`, borderTopColor: t.link, borderRadius: "50%", animation: "spin .6s linear infinite" }} />
                      {postStep}
                    </div>
                  )}
                  {error && <div style={{ fontSize: 13, color: t.error, padding: "4px 0" }}>{error}</div>}
                </div>
              ) : null}
            </div>
          </div>

          {/* Bottom bar: attach + post */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 0", marginLeft: 48,
          }}>
            {/* Hidden inputs */}
            <input ref={fileRef} type="file" accept="*/*" style={{ display: "none" }} onChange={onAttach} />
            <input ref={captureRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onAttach} />

            <div style={{ display: "flex", gap: 12 }}>
              {/* Attach photo */}
              <button onClick={() => fileRef.current?.click()} style={iconBtn(t)} title="Attach photo or file">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
              {/* Camera */}
              <button onClick={() => captureRef.current?.click()} style={iconBtn(t)} title="Take photo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
            </div>

            {/* Post button */}
            <button
              onClick={handlePost}
              disabled={!file || posting || !!posted}
              style={{
                padding: "8px 20px", fontSize: 14, fontWeight: 600,
                borderRadius: 20, border: "none", cursor: file && !posting && !posted ? "pointer" : "default",
                background: file && !posting && !posted ? t.link : t.surface,
                color: file && !posting && !posted ? "#fff" : t.text3,
                transition: "all .15s",
                opacity: !file || posting || posted ? 0.5 : 1,
              }}
            >
              {posting ? "Proving..." : "Post"}
            </button>
          </div>
        </div>

        {/* ── Feed ── */}
        <div style={{ maxWidth: 600, width: "100%", margin: "0 auto", flex: 1 }}>
          {feed.length === 0 ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: t.text3, fontSize: 14 }}>
              No proofs yet. Attach a photo and post to create the first one.
            </div>
          ) : (
            feed.map((entry) => {
              const isExpanded = expandedId === entry.globalId;
              const c = entry.counter || String(entry.globalId);
              const name = entry.attribution || "proof";
              const isEth = name.startsWith("Ethereum");

              return (
                <div key={entry.globalId} style={{ borderBottom: `1px solid ${t.border}`, animation: "fadeIn .3s ease-out" }}>
                  <div style={{ padding: "14px 16px" }}>
                    {/* Top: avatar + name + time */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        background: isEth ? `${t.link}18` : t.surface,
                        border: `1px solid ${isEth ? t.link + "40" : t.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, color: isEth ? t.link : t.text3, fontWeight: 700,
                      }}>{isEth ? "E" : "#"}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{name}</span>
                          {entry.enforcement === "measured-tee" && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={t.link} stroke="none"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: t.text3 }}>{entry.time ? relativeTime(entry.time) : ""}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.link, fontFamily: "var(--mono)" }}>#{c}</span>
                    </div>

                    {/* Digest */}
                    <div style={{
                      fontSize: 12, fontFamily: "var(--mono)", color: t.text3,
                      padding: "8px 10px", background: t.surface, borderRadius: 8,
                      wordBreak: "break-all" as const, lineHeight: 1.5,
                      border: `1px solid ${t.border}`,
                    }}>
                      {entry.digest}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                      <button onClick={() => toggleRow(entry)} style={feedAction(t)}>
                        {isExpanded ? "Hide" : "View"}
                      </button>
                      {isExpanded && expandedProof && (
                        <>
                          <button onClick={() => downloadProofJson(expandedProof)} style={feedAction(t)}>Export .json</button>
                          <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(expandedProof, null, 2)); }} style={feedAction(t)}>Copy JSON</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: "0 16px 14px", animation: "fadeIn .2s ease-out" }}>
                      {loadingProof && <div style={{ fontSize: 12, color: t.text3, padding: "8px 0" }}>Loading...</div>}
                      {expandedProof && <ProofCard proof={expandedProof} t={t} />}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, padding: "16px 0" }}>
              <button onClick={() => fetchFeed(feedPage - 1)} disabled={feedPage <= 1} style={{ ...btn(t), opacity: feedPage <= 1 ? 0.3 : 1 }}>Prev</button>
              <span style={{ fontSize: 13, color: t.text3, fontFamily: "var(--mono)" }}>{feedPage}/{totalPages}</span>
              <button onClick={() => fetchFeed(feedPage + 1)} disabled={feedPage >= totalPages} style={{ ...btn(t), opacity: feedPage >= totalPages ? 0.3 : 1 }}>Next</button>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer style={{
          padding: "12px 16px", borderTop: `1px solid ${t.border}`,
          display: "flex", justifyContent: "space-between", fontSize: 12, color: t.text3,
        }}>
          <span>Signed by AWS Nitro Enclave</span>
          <span>Anchored to Ethereum</span>
        </footer>
      </div>
    </>
  );
}

/* ── Proof card (expanded view) ── */

function ProofCard({ proof, t }: { proof: OCCProof; t: Theme }) {
  const commit = proof.commit;
  const attr = proof.attribution as { name?: string; title?: string; message?: string } | undefined;
  const slot = (proof as unknown as Record<string, unknown>).slotAllocation as Record<string, unknown> | undefined;
  const isEth = attr?.name?.startsWith("Ethereum");

  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, fontSize: 13 }}>
      {/* ETH link */}
      {isEth && attr?.title && (
        <a href={attr.title} target="_blank" rel="noopener" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", marginBottom: 12, borderRadius: 8,
          background: `${t.link}08`, border: `1px solid ${t.link}20`,
          fontSize: 13, color: t.link, fontWeight: 500, textDecoration: "none",
        }}>
          <span>{attr.name}</span>
          <span>Etherscan &rarr;</span>
        </a>
      )}

      <Row label="Digest" value={proof.artifact.digestB64} mono t={t} />
      <Row label="Algorithm" value={proof.artifact.hashAlg.toUpperCase()} t={t} />
      <Row label="Counter" value={`#${commit.counter}`} accent t={t} />
      {commit.time != null && <Row label="Time" value={new Date(Number(commit.time)).toLocaleString()} t={t} />}
      {commit.epochId && <Row label="Epoch" value={String(commit.epochId)} mono t={t} />}
      {commit.prevB64 && <Row label="Previous" value={commit.prevB64} mono t={t} />}
      {commit.nonceB64 && <Row label="Nonce" value={commit.nonceB64} mono t={t} />}

      {slot && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", marginTop: 12, marginBottom: 4 }}>Causal Slot</div>
          <Row label="Slot #" value={String(slot.counter || "")} accent t={t} />
          {slot.nonceB64 ? <Row label="Nonce" value={String(slot.nonceB64)} mono t={t} /> : null}
          {slot.signatureB64 ? <Row label="Signature" value={String(slot.signatureB64)} mono t={t} /> : null}
        </>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: t.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", marginTop: 12, marginBottom: 4 }}>Signer</div>
      <Row label="Public Key" value={proof.signer.publicKeyB64} mono t={t} />
      <Row label="Signature" value={proof.signer.signatureB64} mono t={t} />

      <div style={{ fontSize: 11, fontWeight: 700, color: t.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", marginTop: 12, marginBottom: 4 }}>Environment</div>
      <Row label="Enforcement" value={proof.environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"} t={t} />
      {proof.environment?.measurement ? <Row label="PCR0" value={proof.environment.measurement} mono t={t} /> : null}

      {attr && !isEth && attr.message ? <Row label="Attribution" value={attr.message} mono t={t} /> : null}
    </div>
  );
}

/* ── Row with copy ── */

function Row({ label, value, mono, accent, t }: { label: string; value: string; mono?: boolean; accent?: boolean; t: Theme }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
        padding: "5px 0", cursor: "pointer", borderBottom: `1px solid ${t.border}`,
      }}
    >
      <span style={{ fontSize: 12, color: t.text3, flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: mono ? 11 : 13,
        fontFamily: mono ? "var(--mono)" : "inherit",
        color: copied ? t.verified : accent ? t.link : t.text2,
        fontWeight: accent ? 700 : 400,
        wordBreak: "break-all" as const, textAlign: "right" as const,
        transition: "color .2s", lineHeight: 1.4,
      }}>{copied ? "Copied" : value}</span>
    </div>
  );
}

/* ── Copyable text block ── */

function Copyable({ text, label, t }: { text: string; label: string; t: Theme }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{
        fontSize: 11, fontFamily: "var(--mono)", color: copied ? t.verified : t.text3,
        wordBreak: "break-all" as const, padding: "6px 10px",
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8,
        cursor: "pointer", transition: "color .2s", lineHeight: 1.4,
      }}
      title={`Copy ${label}`}
    >
      {copied ? "Copied!" : text}
    </div>
  );
}

/* ── Theme ── */

interface Theme {
  bg: string; surface: string; border: string;
  text: string; text2: string; text3: string;
  link: string; verified: string; error: string;
}

const themes = {
  dark: {
    bg: "#000000", surface: "#0a0a0a", border: "#1e1e1e",
    text: "#f3f3f3", text2: "#a0a0a0", text3: "#6b6b6b",
    link: "#0095f6", verified: "#00c853", error: "#ed4956",
  } as Theme,
  light: {
    bg: "#ffffff", surface: "#fafafa", border: "#e0e0e0",
    text: "#000000", text2: "#555555", text3: "#999999",
    link: "#0095f6", verified: "#00c853", error: "#ed4956",
  } as Theme,
};

/* ── Shared styles ── */

function btn(t: Theme): React.CSSProperties {
  return {
    padding: "7px 14px", fontSize: 13, fontWeight: 600, color: t.text2,
    background: "transparent", border: `1px solid ${t.border}`, borderRadius: 8, cursor: "pointer",
  };
}

function iconBtn(t: Theme): React.CSSProperties {
  return {
    background: "none", border: "none", cursor: "pointer", color: t.link,
    padding: 6, display: "flex", alignItems: "center",
  };
}

function feedAction(t: Theme): React.CSSProperties {
  return {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 13, color: t.text3, padding: 0, fontWeight: 500,
  };
}

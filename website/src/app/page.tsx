"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Nav } from "@/components/nav";
import { FileDrop } from "@/components/file-drop";
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

type Tab = "explorer" | "make" | "verify";
type ViewMode = "normal" | "timeonly";

interface ProofSummary {
  id: number;
  digestB64: string;
  counter: string | null;
  commitTime: number | null;
  enforcement: string;
  signerPub: string;
  hasAgency: boolean;
  hasTsa: boolean;
  attrName: string | null;
  indexedAt: string;
}

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("explorer");
  const [viewMode, setViewMode] = useState<ViewMode>("normal");
  const [proofs, setProofs] = useState<ProofSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedProof, setExpandedProof] = useState<OCCProof | null>(null);
  const LIMIT = 25;

  const fetchProofs = useCallback(async (p: number) => {
    try {
      const res = await fetch(`/api/proofs?page=${p}&limit=${LIMIT}`);
      const data = await res.json();
      setProofs(data.proofs || []);
      setTotal(data.total || 0);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProofs(page); }, [page, fetchProofs]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(() => fetchProofs(page), 30000);
    return () => clearInterval(iv);
  }, [page, fetchProofs]);

  // Fetch full proof when expanding a row
  async function handleExpand(proof: ProofSummary) {
    if (expandedId === proof.id) { setExpandedId(null); setExpandedProof(null); return; }
    setExpandedId(proof.id);
    try {
      // The explorer DB stores full proof JSON — fetch by digest
      const res = await fetch(`/api/proofs/digest/${encodeURIComponent(proof.digestB64)}`);
      const data = await res.json();
      if (data.proofs?.[0]?.proof) setExpandedProof(data.proofs[0].proof);
      else setExpandedProof(null);
    } catch { setExpandedProof(null); }
  }

  const totalPages = Math.ceil(total / LIMIT);
  const trunc = (s: string, n: number) => s && s.length > n ? s.slice(0, n) + "…" : s || "—";

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#e5e5e5" }}>
      {/* Nav */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50, background: "#0a0a0a",
        borderBottom: "1px solid #1e1e1e", padding: "0 24px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 1200, margin: "0 auto", width: "100%",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <a href="/" style={{ fontSize: 18, fontWeight: 700, color: "#e5e5e5", textDecoration: "none", letterSpacing: "-0.02em" }}>OCC</a>
          <div style={{ display: "flex", gap: 4 }}>
            {(["explorer", "make", "verify"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "6px 14px", borderRadius: 6, border: "none",
                background: tab === t ? "#1e1e1e" : "transparent",
                color: tab === t ? "#e5e5e5" : "#737373",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
                transition: "all 0.15s", textTransform: "capitalize",
              }}>{t === "make" ? "Prove" : t === "verify" ? "Verify" : "Explorer"}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/docs" style={{ fontSize: 13, color: "#737373", textDecoration: "none" }}>Docs</a>
          <a href="https://github.com/mikeargento/occ" target="_blank" style={{ fontSize: 13, color: "#737373", textDecoration: "none" }}>GitHub</a>
          <a href="https://agent.occ.wtf" style={{
            fontSize: 13, fontWeight: 500, color: "#3b82f6", textDecoration: "none",
            padding: "6px 14px", borderRadius: 6, border: "1px solid #3b82f6",
          }}>Sign in</a>
        </div>
      </nav>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 80px" }}>
        {tab === "explorer" && (
          <div>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: "#e5e5e5" }}>Proof Explorer</h1>
                <p style={{ fontSize: 13, color: "#737373", margin: "4px 0 0" }}>{total.toLocaleString()} proofs on chain</p>
              </div>
              <div style={{ display: "flex", gap: 2, background: "#141414", borderRadius: 6, padding: 2, border: "1px solid #1e1e1e" }}>
                {(["normal", "timeonly"] as ViewMode[]).map(v => (
                  <button key={v} onClick={() => setViewMode(v)} style={{
                    padding: "5px 12px", borderRadius: 4, border: "none",
                    background: viewMode === v ? "#1e1e1e" : "transparent",
                    color: viewMode === v ? "#e5e5e5" : "#737373",
                    fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}>{v === "normal" ? "Normal" : "Time"}</button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ border: "1px solid #1e1e1e", borderRadius: 12, overflow: "hidden", background: "#141414" }}>
              {/* Header row */}
              {viewMode === "normal" && (
                <div style={{
                  display: "grid", gridTemplateColumns: "70px 120px 1fr 100px 100px",
                  padding: "10px 20px", borderBottom: "1px solid #1e1e1e",
                  fontSize: 11, fontWeight: 600, color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  <span>Proof</span>
                  <span>Type</span>
                  <span>Artifact</span>
                  <span>Age</span>
                  <span style={{ textAlign: "right" }}>Signer</span>
                </div>
              )}
              {viewMode === "timeonly" && (
                <div style={{
                  display: "grid", gridTemplateColumns: "80px 1fr",
                  padding: "10px 20px", borderBottom: "1px solid #1e1e1e",
                  fontSize: 11, fontWeight: 600, color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  <span>Proof</span>
                  <span>Time</span>
                </div>
              )}

              {/* Rows */}
              {loading ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "#525252" }}>Loading...</div>
              ) : proofs.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "#525252" }}>No proofs yet.</div>
              ) : proofs.map(p => (
                <div key={p.id}>
                  {viewMode === "timeonly" ? (
                    <div style={{
                      display: "grid", gridTemplateColumns: "80px 1fr",
                      padding: "12px 20px", borderBottom: "1px solid #1a1a1a",
                      fontSize: 14, alignItems: "center",
                    }}>
                      <span style={{ fontWeight: 600, color: "#3b82f6", fontFamily: "monospace" }}>{p.counter || "—"}</span>
                      <span style={{ color: "#737373", fontFamily: "monospace", fontSize: 13 }}>
                        {p.commitTime ? new Date(Number(p.commitTime)).toLocaleString() : "—"}
                      </span>
                    </div>
                  ) : (
                    <div onClick={() => handleExpand(p)} style={{
                      display: "grid", gridTemplateColumns: "70px 120px 1fr 100px 100px",
                      padding: "12px 20px", borderBottom: "1px solid #1a1a1a",
                      fontSize: 14, alignItems: "center", cursor: "pointer",
                      background: expandedId === p.id ? "#1a1a1a" : "transparent",
                      transition: "background 0.1s",
                    }}>
                      <span style={{ fontWeight: 600, color: "#3b82f6", fontFamily: "monospace" }}>{p.counter || "—"}</span>
                      <span>
                        <span style={{
                          display: "inline-block", fontSize: 11, fontWeight: 500,
                          padding: "2px 8px", borderRadius: 4,
                          border: "1px solid #1e1e1e", background: "#0a0a0a",
                          color: "#737373", maxWidth: 110, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{p.attrName || "proof"}</span>
                      </span>
                      <span style={{ fontFamily: "monospace", fontSize: 13, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {trunc(p.digestB64, 24)}
                      </span>
                      <span style={{ fontSize: 13, color: "#525252" }}>
                        {p.commitTime ? relativeTime(Number(p.commitTime)) : "—"}
                      </span>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#525252", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {trunc(p.signerPub, 8)}
                      </span>
                    </div>
                  )}

                  {/* Expanded Detail — Etherscan style */}
                  {expandedId === p.id && viewMode === "normal" && (
                    <div style={{ padding: "20px", background: "#0f0f0f", borderBottom: "1px solid #1e1e1e" }}>
                      {/* Summary Card */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
                          Proof #{p.counter}
                          {p.attrName && <span style={{ fontWeight: 400, color: "#737373", marginLeft: 8 }}>— {p.attrName}</span>}
                        </div>

                        {/* Key fields — Etherscan transaction overview style */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid #1e1e1e", borderRadius: 8, overflow: "hidden" }}>
                          <DetailRow label="Artifact Hash" value={p.digestB64} mono />
                          <DetailRow label="Counter" value={`#${p.counter || "—"}`} />
                          <DetailRow label="Timestamp" value={p.commitTime ? new Date(Number(p.commitTime)).toLocaleString() : "—"} />
                          <DetailRow label="Enforcement" value={p.enforcement === "measured-tee" ? "Hardware Enclave (AWS Nitro)" : p.enforcement} valueColor="#22c55e" />
                          <DetailRow label="Signer" value={p.signerPub} mono />
                          {p.hasTsa && <DetailRow label="RFC 3161 TSA" value="Yes — freetsa.org" valueColor="#22c55e" />}
                        </div>
                      </div>

                      {/* More Details (full proof) */}
                      {expandedProof && <FullProofDetail proof={expandedProof} />}
                      {!expandedProof && <div style={{ fontSize: 12, color: "#525252" }}>Loading full proof...</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid #1e1e1e",
                  background: "#141414", color: page <= 1 ? "#333" : "#737373",
                  cursor: page <= 1 ? "default" : "pointer", fontSize: 13,
                }}>← Prev</button>
                <span style={{ padding: "6px 14px", fontSize: 13, color: "#525252" }}>Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid #1e1e1e",
                  background: "#141414", color: page >= totalPages ? "#333" : "#737373",
                  cursor: page >= totalPages ? "default" : "pointer", fontSize: 13,
                }}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* Make tab — moved from /maker */}
        {tab === "make" && (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Create a Proof</h1>
            <p style={{ fontSize: 13, color: "#737373", marginBottom: 24 }}>Drop a file to hash it locally and commit to the OCC chain. Nothing is uploaded.</p>
            {/* Reuse the existing FileDrop + make flow from maker/page.tsx */}
            <div style={{ border: "1px solid #1e1e1e", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "#525252" }}>
              <p>File drop and proof creation — coming soon in unified view.</p>
              <p style={{ marginTop: 8 }}>For now, use <a href="/maker" style={{ color: "#3b82f6" }}>the maker page</a>.</p>
            </div>
          </div>
        )}

        {tab === "verify" && (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Verify a Proof</h1>
            <p style={{ fontSize: 13, color: "#737373", marginBottom: 24 }}>Drop a proof.json or any file to verify its signature or check if it exists on the chain.</p>
            <div style={{ border: "1px solid #1e1e1e", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "#525252" }}>
              <p>Verification — coming soon in unified view.</p>
              <p style={{ marginTop: 8 }}>For now, use <a href="/maker" style={{ color: "#3b82f6" }}>the maker page</a>.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* -- Detail Row (Etherscan-style key-value) -- */
function DetailRow({ label, value, mono, valueColor }: { label: string; value: string; mono?: boolean; valueColor?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 16px", borderBottom: "1px solid #1e1e1e", fontSize: 13,
      gap: 16,
    }}>
      <span style={{ color: "#525252", flexShrink: 0, minWidth: 120 }}>{label}</span>
      <span
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        style={{
          color: copied ? "#22c55e" : (valueColor || (mono ? "#94a3b8" : "#e5e5e5")),
          fontFamily: mono ? "'SF Mono', SFMono-Regular, monospace" : "inherit",
          fontSize: mono ? 12 : 13,
          textAlign: "right", cursor: "pointer",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: "70%",
        }}
        title={`Click to copy: ${value}`}
      >
        {copied ? "Copied!" : value}
      </span>
    </div>
  );
}

/* -- Full Proof Detail (hidden by default, "More Details" toggle) -- */
function FullProofDetail({ proof: p }: { proof: OCCProof }) {
  const [showRaw, setShowRaw] = useState(false);
  const commit = p.commit;
  const signer = p.signer;
  const env = p.environment;
  const slot = p.slotAllocation;
  const attr = p.attribution;
  const ts = p.timestamps;

  return (
    <div>
      <button onClick={() => setShowRaw(!showRaw)} style={{
        fontSize: 12, fontWeight: 500, padding: "6px 14px", borderRadius: 6,
        border: "1px solid #1e1e1e", background: "#141414",
        color: "#737373", cursor: "pointer", marginBottom: showRaw ? 12 : 0,
      }}>
        {showRaw ? "Hide Details" : "More Details"}
      </button>

      {showRaw && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          {/* Commit */}
          <Section title="Commit">
            {commit.epochId && <SField label="Epoch" value={commit.epochId} mono />}
            {commit.prevB64 && <SField label="Prev Hash" value={commit.prevB64} mono />}
            {commit.nonceB64 && <SField label="Nonce" value={commit.nonceB64} mono />}
            {(commit as any).slotCounter != null && <SField label="Slot #" value={String((commit as any).slotCounter)} />}
            {(commit as any).slotHashB64 && <SField label="Slot Hash" value={String((commit as any).slotHashB64)} mono />}
          </Section>

          {/* Signer */}
          <Section title="Signer">
            <SField label="Public Key" value={signer.publicKeyB64} mono />
            <SField label="Signature" value={signer.signatureB64} mono />
          </Section>

          {/* Environment */}
          <Section title="Environment">
            <SField label="Enforcement" value={env.enforcement} />
            <SField label="Measurement" value={env.measurement} mono />
            {env.attestation?.format && <SField label="Attestation" value={env.attestation.format} />}
          </Section>

          {/* Causal Slot */}
          {slot && (
            <Section title="Causal Slot">
              <SField label="Version" value={(slot as any).version || "occ/slot/1"} />
              <SField label="Counter" value={String((slot as any).counter)} />
              <SField label="Nonce" value={(slot as any).nonceB64} mono />
              <SField label="Signature" value={(slot as any).signatureB64} mono />
            </Section>
          )}

          {/* Attribution */}
          {attr && (
            <Section title="Attribution">
              {attr.name && <SField label="Name" value={attr.name} />}
              {attr.title && <SField label="Link" value={attr.title} />}
              {attr.message && <SField label="Data" value={attr.message} mono />}
            </Section>
          )}

          {/* Timestamps */}
          {ts && (
            <Section title="Timestamp Authority">
              {(ts as any).artifact?.authority && <SField label="Authority" value={(ts as any).artifact.authority} />}
              {(ts as any).artifact?.time && <SField label="Time" value={(ts as any).artifact.time} />}
            </Section>
          )}

          {/* Raw JSON */}
          <div style={{ gridColumn: "1 / -1" }}>
            <button onClick={() => {
              const json = JSON.stringify(p, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `occ-proof-${p.artifact.digestB64.slice(0, 12)}.json`; a.click();
              URL.revokeObjectURL(url);
            }} style={{
              fontSize: 12, fontWeight: 500, padding: "6px 14px", borderRadius: 6,
              border: "1px solid #1e1e1e", background: "#141414",
              color: "#737373", cursor: "pointer",
            }}>
              Download proof.json
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #1e1e1e", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#525252", padding: "8px 14px", background: "#0a0a0a", borderBottom: "1px solid #1e1e1e", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #1a1a1a", fontSize: 12, gap: 12 }}>
      <span style={{ color: "#525252", flexShrink: 0 }}>{label}</span>
      <span
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        style={{
          color: copied ? "#22c55e" : (mono ? "#94a3b8" : "#a3a3a3"),
          fontFamily: mono ? "'SF Mono', SFMono-Regular, monospace" : "inherit",
          fontSize: 11, textAlign: "right", cursor: "pointer",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
        title={value}
      >
        {copied ? "Copied!" : (value.length > 32 ? value.slice(0, 24) + "…" : value)}
      </span>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
// Nav is in root layout
import type { OCCProof } from "@/lib/occ";
import { zipSync, strToU8 } from "fflate";
// QR code removed — replaced with Ethereum Seal card

const mono = "var(--font-mono), 'SF Mono', SFMono-Regular, monospace";

export default function ProofPage() {
  const params = useParams();
  const digestParam = params.digest as string;
  const [proof, setProof] = useState<OCCProof | null>(null);
  const [causalWindow, setCausalWindow] = useState<{
    anchorBefore: { counter: string; attrName: string; blockNumber: number | null; blockHash: string | null; etherscanUrl: string | null; blockTime?: string | null } | null;
    anchorAfter: { counter: string; attrName: string; blockNumber: number | null; blockHash: string | null; etherscanUrl: string | null; blockTime?: string | null } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cachedFile, setCachedFile] = useState<{ name: string; data: ArrayBuffer } | null>(null);

  // Nav visible on proof pages

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`/api/proofs/digest/${digestParam}`);
        if (!resp.ok) { setError("Proof not found"); setLoading(false); return; }
        const data = await resp.json();
        if (data.proofs?.[0]?.proof) {
          setProof(data.proofs[0].proof as OCCProof);
          if (data.causalWindow) setCausalWindow(data.causalWindow);
          // Try to load cached file from IndexedDB
          try {
            let digestB64 = decodeURIComponent(digestParam).replace(/-/g, "+").replace(/_/g, "/");
            while (digestB64.length % 4 !== 0) digestB64 += "=";
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const req = indexedDB.open("occ-files", 1);
              req.onupgradeneeded = () => req.result.createObjectStore("files");
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
            const tx = db.transaction("files", "readonly");
            const file = await new Promise<{ name: string; data: ArrayBuffer } | undefined>((resolve) => {
              const req = tx.objectStore("files").get(digestB64);
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => resolve(undefined);
            });
            db.close();
            if (file) setCachedFile(file);
          } catch (_) { /* no cached file */ }
        } else setError("Proof not found");
      } catch { setError("Failed to load proof"); }
      setLoading(false);
    })();
  }, [digestParam]);

  if (loading) return <Shell><div style={{ padding: "80px 20px", textAlign: "center", color: "var(--c-text-tertiary)" }}>Loading proof...</div></Shell>;
  if (error || !proof) return (
    <Shell>
      <div style={{ padding: "80px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#f87171", marginBottom: 12 }}>{error || "Proof not found"}</div>
        <a href="/" style={{ fontSize: 14, color: "var(--c-accent)" }}>OCC</a>
      </div>
    </Shell>
  );

  const commit = proof.commit;
  const attr = proof.attribution as { name?: string; title?: string; message?: string } | undefined;
  const slot = (proof as unknown as Record<string, unknown>).slotAllocation as Record<string, unknown> | undefined;
  const isEth = attr?.name?.startsWith("Ethereum");
  const isTee = proof.environment?.enforcement === "measured-tee";
  const ts = (proof.timestamps as Record<string, Record<string, unknown>> | undefined)?.artifact;

  async function exportZip() {
    try {
    const files: Record<string, Uint8Array> = {
      "proof.json": strToU8(JSON.stringify(proof, null, 2)),
    };
    // Include the original file if cached
    if (cachedFile) {
      files[cachedFile.name] = new Uint8Array(cachedFile.data);
    }
    // Fetch bounding ETH anchors
    try {
      const counter = commit.counter;
      const epoch = commit.epochId || "";
      const resp = await fetch(`/api/proofs/anchors?counter=${counter}&epoch=${encodeURIComponent(epoch)}&limit=1`);
      if (resp.ok) {
        const data = await resp.json();
        const anchors = data.anchors || [];
        if (Array.isArray(anchors) && anchors.length > 0) {
          files["ethereum-anchor.json"] = strToU8(JSON.stringify(anchors[0], null, 2));
        }
      }
    } catch (_) { /* ignore */ }
    const zipped = zipSync(files, { level: 0 });
    const blob = new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `occ-proof-${commit.counter}.zip`; a.click();
    URL.revokeObjectURL(url);
    } catch (e) { console.error("[occ] export error:", e); alert("Export failed: " + e); }
  }

  return (
    <Shell>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        .proof-fields > div:last-child { border-bottom: none !important; }
        @media print {
        }
      `}</style>

      <div style={{ width: "90%", maxWidth: 800, margin: "0 auto", padding: "24px 0 60px", animation: "fadeIn .3s ease-out" }}>


        {/* Title + actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: "var(--c-accent)" }}>
            {isEth ? "Anchor" : "Proof"} #{commit.counter}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportZip} style={btnStyle}>Export Proof</button>
            <JsonToggle proof={proof} />
          </div>
        </div>

        {/* Causal flow diagram */}
        <div style={{
          marginBottom: 32, padding: "28px 24px", background: "#fff", borderRadius: 14, border: "1px solid #d0d5dd",
        }}>
          <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>

            {/* Step 1: Slot */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f3f4f6", border: "2px solid #d0d5dd", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 18 }}>
                🔒
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginTop: 8 }}>#{commit.slotCounter}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Slot Reserved</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Nonce generated</div>
            </div>

            {/* Arrow 1 */}
            <div style={{ display: "flex", alignItems: "center", paddingTop: 0 }}>
              <div style={{ width: 40, height: 2, background: "#d0d5dd", position: "relative" }}>
                <div style={{ position: "absolute", right: -4, top: -4, width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid #d0d5dd" }} />
              </div>
            </div>

            {/* Step 2: Commit */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#eef4ff", border: "2px solid var(--c-accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 18 }}>
                ✍️
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginTop: 8 }}>#{commit.counter}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Committed</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Signed in enclave</div>
            </div>

            {/* Arrow 2 */}
            <div style={{ display: "flex", alignItems: "center", paddingTop: 0 }}>
              <div style={{ width: 40, height: 2, background: "#d0d5dd", position: "relative", borderStyle: "dashed" }}>
                <div style={{ position: "absolute", right: -4, top: -4, width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid #d0d5dd" }} />
              </div>
            </div>

            {/* Step 3: Sealed */}
            {isEth && attr?.title ? (
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f0fdf4", border: "2px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 18 }}>
                  ⛓️
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginTop: 8 }}>#{attr.title.match(/\/block\/(\d+)/)?.[1] || "?"}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Ethereum Block</div>
                <a href={attr.title} target="_blank" rel="noopener" style={{ fontSize: 11, color: "var(--c-accent)", textDecoration: "none", marginTop: 4, display: "inline-block" }}>
                  Etherscan &rarr;
                </a>
              </div>
            ) : causalWindow?.anchorAfter ? (
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f0fdf4", border: "2px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 18 }}>
                  ⛓️
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginTop: 8 }}>#{causalWindow.anchorAfter.counter}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Sealed</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 4, flexWrap: "wrap" }}>
                  {(causalWindow.anchorAfter as { digestB64?: string | null }).digestB64 && (
                    <a href={`/proof/${encodeURIComponent(((causalWindow.anchorAfter as { digestB64?: string | null }).digestB64 || "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""))}`} target="_blank" rel="noopener" style={{ fontSize: 11, color: "var(--c-accent)", textDecoration: "none" }}>
                      Proof &rarr;
                    </a>
                  )}
                  {causalWindow.anchorAfter.etherscanUrl && (
                    <a href={causalWindow.anchorAfter.etherscanUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: "var(--c-accent)", textDecoration: "none" }}>
                      Block #{causalWindow.anchorAfter.blockNumber} &rarr;
                    </a>
                  )}
                </div>
                {causalWindow.anchorAfter.blockTime && (
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                    {new Date(causalWindow.anchorAfter.blockTime).toLocaleString()}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f9fafb", border: "2px dashed #d0d5dd", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 18 }}>
                  ⏳
                </div>
                <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 8 }}>Awaiting anchor</div>
              </div>
            )}
          </div>

          {/* Atomic bracket */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 120, height: 1, background: "#d0d5dd" }} />
              <span style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>Atomic</span>
              <div style={{ width: 120, height: 1, background: "#d0d5dd" }} />
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="proof-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>

          <Card title="Artifact">
            <Field label="Digest" value={proof.artifact.digestB64} mono />
            <Field label="Algorithm" value={proof.artifact.hashAlg.toUpperCase()} />
            {(proof as OCCProof & { proofHash?: string }).proofHash && (
              <Field label="Proof Hash" value={(proof as OCCProof & { proofHash?: string }).proofHash!} mono />
            )}
          </Card>

          <Card title="Chain">
            {commit.epochId && <Field label="Epoch" value={String(commit.epochId)} mono />}
            {commit.prevB64 && <Field label="Previous Proof" value={commit.prevB64} mono />}
            {commit.nonceB64 && <Field label="Nonce" value={commit.nonceB64} mono />}
            {commit.slotHashB64 && <Field label="Slot Hash" value={commit.slotHashB64} mono />}
          </Card>

          <Card title="Signer">
            <Field label="Public Key" value={proof.signer.publicKeyB64} mono />
            <Field label="Signature" value={proof.signer.signatureB64} mono />
          </Card>

          <Card title="Trusted Execution Environment">
            <Field label="Enforcement" value={isTee ? "Hardware Enclave (AWS Nitro)" : "Software"} />
            {proof.environment?.measurement && <Field label="Measurement (PCR0)" value={proof.environment.measurement} mono />}
            {proof.environment?.attestation?.format && <Field label="Attestation Format" value={proof.environment.attestation.format} />}
            {isTee && <Field label="Attestation Report" value={proof.environment?.attestation?.reportB64 ? "Included in proof (AWS Nitro COSE)" : "Not available"} />}
            {isTee && (
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #e2e5e9" }}>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4, fontWeight: 500 }}>Verify</div>
                <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                  The PCR0 measurement identifies the exact enclave image. The attestation report is signed by AWS Nitro hardware and can be verified independently using the{" "}
                  <a href="https://docs.aws.amazon.com/enclaves/latest/user/verify-root.html" target="_blank" rel="noopener" style={{ color: "var(--c-accent)", textDecoration: "none" }}>
                    AWS Nitro root certificate
                  </a>.
                </div>
              </div>
            )}
          </Card>

          {attr && !isEth && (
            <Card title="Attribution">
              {attr.name && <Field label="Name" value={attr.name} />}
              {attr.message && <Field label="Data" value={attr.message} mono />}
              {attr.title && <Field label="Link" value={attr.title} link />}
            </Card>
          )}

          {ts && (
            <Card title="Timestamps">
              {ts.authority ? <Field label="Authority" value={String(ts.authority)} /> : null}
              {ts.time ? <Field label="TSA Time" value={String(ts.time)} /> : null}
            </Card>
          )}
        </div>


      </div>
    </Shell>
  );
}

/* ── Shell — uses same theme as maker page ── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--c-text)" }}>
      {children}
    </div>
  );
}

/* ── Card ── */

function Card({ title, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #d0d5dd", borderRadius: 14, overflow: "hidden" }}>
      <div style={{
        fontSize: 14, fontWeight: 700, letterSpacing: "0.04em",
        color: "#1A73E8", padding: "14px 18px",
        background: "rgba(26,115,232,0.04)",
        borderBottom: "1px solid #e2e5e9",
      }}>
        {title}
      </div>
      <div className="proof-fields" style={{ padding: "4px 0" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Field with copy ── */

function Field({ label, value, mono: isMono, highlight, link }: { label: string; value: string; mono?: boolean; highlight?: boolean; link?: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16,
        padding: "10px 18px", borderBottom: "1px solid #e2e5e9", cursor: "pointer",
        minHeight: 40,
      }}
    >
      <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{
          fontSize: 13, color: "var(--c-accent)", textDecoration: "none",
          textAlign: "right", wordBreak: "break-all", minWidth: 0,
        }}>{value.replace("https://", "")}</a>
      ) : (
        <span style={{
          fontSize: isMono ? 12 : 14,
          fontFamily: isMono ? mono : "inherit",
          color: copied ? "#1A73E8" : highlight ? "var(--c-accent)" : "#111827",
          fontWeight: highlight ? 600 : 400,
          textAlign: "right", wordBreak: "break-all", minWidth: 0,
          transition: "color .2s", lineHeight: 1.4,
        }}>
          {copied ? "Copied!" : value}
        </span>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#ffffff",
  background: "#1A73E8", border: "1px solid #1A73E8", borderRadius: 10, cursor: "pointer",
};

function JsonToggle({ proof }: { proof: OCCProof }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(proof, null, 2);

  if (!open) {
    return <button onClick={() => setOpen(true)} style={btnStyle}>JSON</button>;
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={() => setOpen(false)}>
      <div style={{ width: "100%", maxWidth: 700, maxHeight: "80vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16, border: "1px solid #d0d5dd", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1A73E8" }}>Proof JSON</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={{ ...btnStyle, fontSize: 12, padding: "5px 12px" }}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => setOpen(false)} style={{ ...btnStyle, fontSize: 12, padding: "5px 12px" }}>Close</button>
          </div>
        </div>
        <pre style={{
          fontSize: 12, lineHeight: 1.6, color: "#374151", padding: 18, margin: 0, background: "#f9fafb",
          overflow: "auto", flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {json}
        </pre>
      </div>
    </div>
  );
}

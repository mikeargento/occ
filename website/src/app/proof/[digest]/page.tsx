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
    anchorBefore: { counter: string; attrName: string; blockNumber: number | null; blockHash: string | null; etherscanUrl: string | null; blockTime?: string | null; digestB64?: string | null } | null;
    anchorAfter: { counter: string; attrName: string; blockNumber: number | null; blockHash: string | null; etherscanUrl: string | null; blockTime?: string | null; digestB64?: string | null } | null;
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

  if (loading) return <Shell><div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", fontSize: 20, fontWeight: 600, color: "var(--c-text-tertiary)" }}>Loading proof...</div></Shell>;
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

      <div style={{ width: "90%", maxWidth: 640, margin: "0 auto", padding: "40px 0 80px", animation: "fadeIn .3s ease-out" }}>

        {/* Title bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-sans)' }}>
              <span style={{ color: "var(--c-accent)" }}>{isEth ? "Anchor" : "Proof"} #{commit.counter}</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportZip} style={btnStyle}>Export Proof</button>
            <JsonToggle proof={proof} />
          </div>
        </div>

        {/* No separate causal window or ethereum link — consolidated into Ethereum Seal card below */}

        {/* Cards grid */}
        <div className="proof-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>

          {/* 1. Slot — reserved first, before anything else */}
          {slot && (
            <Card title="Causal Slot">
              <Field label="Counter" value={`#${slot.counter}`} highlight />
              {slot.nonceB64 ? <Field label="Nonce" value={String(slot.nonceB64)} mono /> : null}
              {slot.signatureB64 ? <Field label="Signature" value={String(slot.signatureB64)} mono /> : null}
              {slot.epochId ? <Field label="Epoch ID" value={String(slot.epochId)} mono /> : null}
            </Card>
          )}

          {/* 2. Artifact — file hashed, digest computed */}
          <Card title="Artifact">
            <Field label="Digest" value={proof.artifact.digestB64} mono />
            <Field label="Algorithm" value={proof.artifact.hashAlg.toUpperCase()} />
            {(proof as OCCProof & { proofHash?: string }).proofHash && (
              <Field label="Proof Hash" value={(proof as OCCProof & { proofHash?: string }).proofHash!} mono highlight />
            )}
          </Card>

          {/* 3. Commit — slot consumed, proof signed atomically */}
          <Card title="Commit">
            <Field label="Counter" value={`#${commit.counter}`} highlight />
            {commit.epochId && <Field label="Epoch ID" value={String(commit.epochId)} mono />}
            {commit.prevB64 && <Field label="Previous Hash" value={commit.prevB64} mono />}
            {commit.nonceB64 && <Field label="Nonce" value={commit.nonceB64} mono />}
            {commit.slotCounter != null && <Field label="Slot Counter" value={`#${commit.slotCounter}`} />}
            {commit.slotHashB64 && <Field label="Slot Hash" value={commit.slotHashB64} mono />}
          </Card>

          {/* 4. Signer — who signed it */}
          <Card title="Signer">
            <Field label="Public Key" value={proof.signer.publicKeyB64} mono />
            <Field label="Signature" value={proof.signer.signatureB64} mono />
          </Card>

          {/* 5. Environment — where it was signed */}
          <Card title="Environment">
            <Field label="Enforcement" value={isTee ? "Hardware Enclave (AWS Nitro)" : "Software"} />
            {proof.environment?.measurement && <Field label="PCR0 Measurement" value={proof.environment.measurement} mono />}
            {proof.environment?.attestation?.format && <Field label="Attestation Format" value={proof.environment.attestation.format} />}
          </Card>

          {/* Ethereum Seal */}
          {/* Ethereum info — single card for both anchor proofs and user proofs */}
          {isEth && attr?.title ? (
            <Card title="Ethereum Block">
              <Field label="Block" value={`#${attr.title.match(/\/block\/(\d+)/)?.[1] || "?"}`} highlight />
              {attr.message && <Field label="Block Hash" value={attr.message} mono />}
              <Field label="Etherscan" value={attr.title} link />
            </Card>
          ) : causalWindow?.anchorAfter ? (
            <Card title="Sealed By">
              <Field label="Ethereum Block" value={`#${causalWindow.anchorAfter.blockNumber}`} highlight />
              {causalWindow.anchorAfter.blockTime && (
                <Field label="Time" value={new Date(causalWindow.anchorAfter.blockTime).toLocaleString()} />
              )}
              {causalWindow.anchorAfter.etherscanUrl && (
                <Field label="Etherscan" value={causalWindow.anchorAfter.etherscanUrl} link />
              )}
              {causalWindow.anchorAfter.digestB64 && (
                <div style={{ padding: "14px 24px", borderBottom: "1px solid #e2e5e9" }}>
                  <a
                    href={`/proof/${encodeURIComponent((causalWindow.anchorAfter.digestB64 || "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""))}`}
                    target="_blank" rel="noopener"
                    style={{ fontSize: 14, fontWeight: 600, color: "var(--c-accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    View Anchor Proof #{causalWindow.anchorAfter.counter} &rarr;
                  </a>
                </div>
              )}
            </Card>
          ) : (
            <Card title="Sealed By">
              <div style={{ padding: "18px 24px", fontSize: 14, color: "#9ca3af" }}>
                Awaiting next anchor...
              </div>
            </Card>
          )}

          {/* Attribution — only show for non-ETH proofs that have it */}
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
              {ts.digestAlg ? <Field label="Digest Algorithm" value={String(ts.digestAlg)} /> : null}
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
        color: "#1A73E8", padding: "18px 24px",
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
        padding: "14px 24px", borderBottom: "1px solid #e2e5e9", cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 14, color: "#374151", fontWeight: 500, flexShrink: 0, minWidth: 80 }}>{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{
          fontSize: 13, color: "var(--c-accent)", textDecoration: "none", wordBreak: "break-all", textAlign: "right",
        }}>{value}</a>
      ) : (
        <span style={{
          fontSize: isMono ? 12 : 14,
          fontFamily: isMono ? mono : "inherit",
          color: copied ? "#1A73E8" : highlight ? "var(--c-accent)" : "#1f2937",
          fontWeight: highlight ? 700 : 400,
          wordBreak: "break-all", textAlign: "right",
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

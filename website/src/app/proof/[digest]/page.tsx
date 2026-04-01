"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";
import type { OCCProof } from "@/lib/occ";

const mono = "var(--font-mono), 'SF Mono', SFMono-Regular, monospace";

export default function ProofPage() {
  const params = useParams();
  const digestParam = params.digest as string;
  const [proof, setProof] = useState<OCCProof | null>(null);
  const [causalWindow, setCausalWindow] = useState<{
    anchorBefore: { counter: string; attrName: string; blockNumber: number | null; blockHash: string | null; etherscanUrl: string | null } | null;
    anchorAfter: { counter: string; attrName: string; blockNumber: number | null; blockHash: string | null; etherscanUrl: string | null } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`/api/proofs/digest/${digestParam}`);
        if (!resp.ok) { setError("Proof not found"); setLoading(false); return; }
        const data = await resp.json();
        if (data.proofs?.[0]?.proof) {
          setProof(data.proofs[0].proof as OCCProof);
          if (data.causalWindow) setCausalWindow(data.causalWindow);
        } else setError("Proof not found");
      } catch { setError("Failed to load proof"); }
      setLoading(false);
    })();
  }, [digestParam]);

  if (loading) return <Shell><div style={{ padding: "80px 20px", textAlign: "center", color: "var(--c-text-tertiary)" }}>Loading proof...</div></Shell>;
  if (error || !proof) return (
    <Shell>
      <div style={{ padding: "80px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "#ff453a", marginBottom: 12 }}>{error || "Proof not found"}</div>
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

  function downloadJson() {
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `occ-proof-${commit.counter}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Shell>
      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }`}</style>

      <div style={{ width: "90%", maxWidth: 800, margin: "0 auto", padding: "24px 0 60px", animation: "fadeIn .3s ease-out" }}>


        {/* Title bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 700, fontFamily: mono, color: "var(--c-accent)" }}>#{commit.counter}</span>
              {isTee && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "#34d399", background: "rgba(52,211,153,.1)", border: "1px solid rgba(52,211,153,.2)", padding: "3px 10px", borderRadius: 20 }}>
                  Hardware Enclave
                </span>
              )}
              {isEth && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-accent)", background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.2)", padding: "3px 10px", borderRadius: 20 }}>
                  ETH Anchor
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, color: "var(--c-text-tertiary)", marginTop: 4 }}>
              {attr?.name || "Proof"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={downloadJson} style={btnStyle}>Export .json</button>
            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(proof, null, 2))} style={btnStyle}>Copy JSON</button>
          </div>
        </div>

        {/* Ethereum link */}
        {isEth && attr?.title && (
          <a href={attr.title} target="_blank" rel="noopener" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px", marginBottom: 20, borderRadius: 12,
            background: "rgba(59,130,246,.05)", border: "1px solid rgba(59,130,246,.15)",
            textDecoration: "none", color: "var(--c-accent)", fontSize: 14, fontWeight: 500,
          }}>
            <span>{attr.name}</span>
            <span>View on Etherscan &rarr;</span>
          </a>
        )}

        {/* Causal Window */}
        {causalWindow && (causalWindow.anchorBefore || causalWindow.anchorAfter) && (
          <div style={{
            marginBottom: 20, padding: "16px 20px", borderRadius: 12,
            background: "rgba(52,211,153,.04)", border: "1px solid rgba(52,211,153,.15)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#34d399", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 3, height: 12, borderRadius: 1, background: "#34d399" }} />
              Causal Window
            </div>
            <div style={{ fontSize: 13, color: "var(--c-text-secondary)", lineHeight: 1.7 }}>
              {causalWindow.anchorBefore && causalWindow.anchorAfter ? (
                <>Between <a href={causalWindow.anchorBefore.etherscanUrl || "#"} target="_blank" rel="noopener" style={{ color: "#34d399", textDecoration: "none", fontWeight: 600 }}>Ethereum #{causalWindow.anchorBefore.blockNumber}</a> and <a href={causalWindow.anchorAfter.etherscanUrl || "#"} target="_blank" rel="noopener" style={{ color: "#34d399", textDecoration: "none", fontWeight: 600 }}>Ethereum #{causalWindow.anchorAfter.blockNumber}</a></>
              ) : causalWindow.anchorAfter ? (
                <>Sealed by <a href={causalWindow.anchorAfter.etherscanUrl || "#"} target="_blank" rel="noopener" style={{ color: "#34d399", textDecoration: "none", fontWeight: 600 }}>Ethereum #{causalWindow.anchorAfter.blockNumber}</a></>
              ) : causalWindow.anchorBefore ? (
                <>After <a href={causalWindow.anchorBefore.etherscanUrl || "#"} target="_blank" rel="noopener" style={{ color: "#34d399", textDecoration: "none", fontWeight: 600 }}>Ethereum #{causalWindow.anchorBefore.blockNumber}</a> — awaiting next anchor</>
              ) : null}
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", fontSize: 11, fontFamily: mono }}>
              {causalWindow.anchorBefore && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />
                  <span style={{ color: "var(--c-text-tertiary)" }}>#{causalWindow.anchorBefore.counter}</span>
                </div>
              )}
              <div style={{ flex: 1, height: 1, background: "rgba(52,211,153,.25)", margin: "0 8px", position: "relative" }}>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 10, height: 10, borderRadius: "50%", background: "var(--c-accent)", border: "2px solid var(--bg-elevated)" }} />
              </div>
              {causalWindow.anchorAfter ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--c-text-tertiary)" }}>#{causalWindow.anchorAfter.counter}</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />
                </div>
              ) : (
                <span style={{ color: "var(--c-text-tertiary)" }}>pending</span>
              )}
            </div>
          </div>
        )}

        {/* Cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>

          <Card title="Artifact">
            <Field label="Digest" value={proof.artifact.digestB64} mono />
            <Field label="Algorithm" value={proof.artifact.hashAlg.toUpperCase()} />
          </Card>

          <Card title="Commit">
            <Field label="Counter" value={`#${commit.counter}`} highlight />
            {commit.epochId && <Field label="Epoch ID" value={String(commit.epochId)} mono />}
            {commit.prevB64 && <Field label="Previous Hash" value={commit.prevB64} mono />}
            {commit.nonceB64 && <Field label="Nonce" value={commit.nonceB64} mono />}
            {commit.slotCounter != null && <Field label="Slot Counter" value={`#${commit.slotCounter}`} />}
            {commit.slotHashB64 && <Field label="Slot Hash" value={commit.slotHashB64} mono />}
          </Card>

          {slot && (
            <Card title="Causal Slot" accent="#06b6d4">
              <Field label="Counter" value={`#${slot.counter}`} highlight />
              {slot.nonceB64 ? <Field label="Nonce" value={String(slot.nonceB64)} mono /> : null}
              {slot.signatureB64 ? <Field label="Signature" value={String(slot.signatureB64)} mono /> : null}
              {slot.epochId ? <Field label="Epoch ID" value={String(slot.epochId)} mono /> : null}
            </Card>
          )}

          <Card title="Signer">
            <Field label="Public Key" value={proof.signer.publicKeyB64} mono />
            <Field label="Signature" value={proof.signer.signatureB64} mono />
          </Card>

          <Card title="Environment" accent="#34d399">
            <Field label="Enforcement" value={isTee ? "Hardware Enclave (AWS Nitro)" : "Software"} />
            {proof.environment?.measurement && <Field label="PCR0 Measurement" value={proof.environment.measurement} mono />}
            {proof.environment?.attestation?.format && <Field label="Attestation Format" value={proof.environment.attestation.format} />}
          </Card>

          {attr && (
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

        {/* Raw JSON */}
        <div style={{ marginTop: 24 }}>
          <details>
            <summary style={{ fontSize: 14, color: "var(--c-text-tertiary)", cursor: "pointer", padding: "8px 0", fontWeight: 500 }}>Raw JSON</summary>
            <div style={{
              marginTop: 8, padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--c-border)",
              borderRadius: 12, fontSize: 11, fontFamily: mono, color: "var(--c-text-tertiary)",
              whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 500, overflow: "auto", lineHeight: 1.6,
            }}>
              {JSON.stringify(proof, null, 2)}
            </div>
          </details>
        </div>
      </div>
    </Shell>
  );
}

/* ── Shell — uses same theme as maker page ── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--c-text)" }}>
      <Nav />
      {children}
    </div>
  );
}

/* ── Card ── */

function Card({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--c-border-subtle)", borderRadius: 12, padding: 16, overflow: "hidden" }}>
      <div style={{
        fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em",
        color: accent || "var(--c-text-tertiary)", marginBottom: 12,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ width: 3, height: 12, borderRadius: 1, background: accent || "var(--c-text-tertiary)" }} />
        {title}
      </div>
      {children}
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
        display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
        padding: "6px 0", borderBottom: "1px solid var(--c-border-subtle)", cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--c-text-tertiary)", flexShrink: 0, minWidth: 80 }}>{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{
          fontSize: 12, color: "var(--c-accent)", textDecoration: "none", wordBreak: "break-all", textAlign: "right",
        }}>{value}</a>
      ) : (
        <span style={{
          fontSize: isMono ? 11 : 13,
          fontFamily: isMono ? mono : "inherit",
          color: copied ? "#34d399" : highlight ? "var(--c-accent)" : "var(--c-text-secondary)",
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
  padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "var(--c-text-secondary)",
  background: "transparent", border: "1px solid var(--c-border)", borderRadius: 10, cursor: "pointer",
};

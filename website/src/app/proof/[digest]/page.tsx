"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import type { OCCProof } from "@/lib/occ";

const C = {
  bg: "#F8FAFC", surface: "#FFFFFF", border: "#E2E8F0", borderLight: "#F1F5F9",
  text: "#0F172A", textSec: "#475569", textTri: "#94A3B8",
  accent: "#2563EB", green: "#16A34A", red: "#DC2626", blue: "#2563EB",
};
const mono = "'SF Mono', SFMono-Regular, 'JetBrains Mono', Consolas, monospace";

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

  if (loading) return <Shell><div style={{ padding: "80px 20px", textAlign: "center", color: C.textTri }}>Loading proof...</div></Shell>;
  if (error || !proof) return <Shell><div style={{ padding: "80px 20px", textAlign: "center" }}><div style={{ fontSize: 16, color: C.red, marginBottom: 12 }}>{error || "Proof not found"}</div><a href="/" style={{ fontSize: 14, color: C.blue }}>Back to explorer</a></div></Shell>;

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
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 20px 60px" }}>

        {/* Back link */}
        <a href="/" style={{ fontSize: 14, color: C.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to explorer
        </a>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 800, fontFamily: mono, color: C.accent }}>#{commit.counter}</span>
              {isTee && <span style={{ fontSize: 12, fontWeight: 600, color: C.green, background: "rgba(27,137,1,0.08)", padding: "3px 10px", borderRadius: 20 }}>Hardware Enclave</span>}
              {isEth && <span style={{ fontSize: 12, fontWeight: 600, color: C.blue, background: "rgba(0,115,187,0.08)", padding: "3px 10px", borderRadius: 20 }}>ETH Anchor</span>}
            </div>
            <div style={{ fontSize: 14, color: C.textTri, marginTop: 4 }}>{attr?.name || "Proof"}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={downloadJson} style={btnStyle}>Export</button>
            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(proof, null, 2))} style={btnStyle}>Copy</button>
          </div>
        </div>

        {/* Ethereum link */}
        {isEth && attr?.title && (
          <a href={attr.title} target="_blank" rel="noopener" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", marginBottom: 16, borderRadius: 10,
            background: "rgba(0,115,187,0.04)", border: `1px solid rgba(0,115,187,0.12)`,
            textDecoration: "none", color: C.blue, fontSize: 14, fontWeight: 500,
          }}>
            <span>{attr.name}</span>
            <span>Etherscan &rarr;</span>
          </a>
        )}

        {/* Causal Window */}
        {causalWindow && (causalWindow.anchorBefore || causalWindow.anchorAfter) && (
          <div style={{ marginBottom: 16, padding: "14px 18px", borderRadius: 10, background: "rgba(27,137,1,0.04)", border: "1px solid rgba(27,137,1,0.12)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: C.green, marginBottom: 10 }}>Causal Window</div>
            <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
              {causalWindow.anchorBefore && causalWindow.anchorAfter ? (
                <>Between <a href={causalWindow.anchorBefore.etherscanUrl || "#"} target="_blank" rel="noopener" style={{ color: C.green, fontWeight: 600, textDecoration: "none" }}>Ethereum #{causalWindow.anchorBefore.blockNumber}</a> and <a href={causalWindow.anchorAfter.etherscanUrl || "#"} target="_blank" rel="noopener" style={{ color: C.green, fontWeight: 600, textDecoration: "none" }}>Ethereum #{causalWindow.anchorAfter.blockNumber}</a></>
              ) : causalWindow.anchorAfter ? (
                <>Sealed by <a href={causalWindow.anchorAfter.etherscanUrl || "#"} target="_blank" rel="noopener" style={{ color: C.green, fontWeight: 600, textDecoration: "none" }}>Ethereum #{causalWindow.anchorAfter.blockNumber}</a></>
              ) : causalWindow.anchorBefore ? (
                <>After <a href={causalWindow.anchorBefore.etherscanUrl || "#"} target="_blank" rel="noopener" style={{ color: C.green, fontWeight: 600, textDecoration: "none" }}>Ethereum #{causalWindow.anchorBefore.blockNumber}</a> — awaiting next anchor</>
              ) : null}
            </div>
            {/* Timeline */}
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", fontSize: 11, fontFamily: mono, color: C.textTri }}>
              {causalWindow.anchorBefore && <><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, flexShrink: 0 }} /><span style={{ marginLeft: 4 }}>#{causalWindow.anchorBefore.counter}</span></>}
              <div style={{ flex: 1, height: 1, background: "rgba(27,137,1,0.2)", margin: "0 8px", position: "relative" }}>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 10, height: 10, borderRadius: "50%", background: C.accent, border: `2px solid ${C.surface}` }} />
              </div>
              {causalWindow.anchorAfter ? <><span>#{causalWindow.anchorAfter.counter}</span><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, flexShrink: 0, marginLeft: 4 }} /></> : <span style={{ color: C.textTri }}>pending</span>}
            </div>
          </div>
        )}

        {/* Proof sections */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>

          <Section title="Artifact">
            <Row label="Digest" value={proof.artifact.digestB64} mono />
            <Row label="Algorithm" value={proof.artifact.hashAlg.toUpperCase()} last />
          </Section>

          <Section title="Commit">
            <Row label="Counter" value={`#${commit.counter}`} accent />
            {commit.epochId && <Row label="Epoch" value={String(commit.epochId)} mono />}
            {commit.prevB64 && <Row label="Previous" value={commit.prevB64} mono />}
            {commit.nonceB64 && <Row label="Nonce" value={commit.nonceB64} mono />}
            {commit.slotCounter != null && <Row label="Slot Counter" value={`#${commit.slotCounter}`} />}
            {commit.slotHashB64 && <Row label="Slot Hash" value={commit.slotHashB64} mono last />}
          </Section>

          {slot && (
            <Section title="Causal Slot" color={C.blue}>
              <Row label="Counter" value={`#${slot.counter}`} accent />
              {slot.nonceB64 ? <Row label="Nonce" value={String(slot.nonceB64)} mono /> : null}
              {slot.signatureB64 ? <Row label="Signature" value={String(slot.signatureB64)} mono /> : null}
              {slot.epochId ? <Row label="Epoch" value={String(slot.epochId)} mono last /> : null}
            </Section>
          )}

          <Section title="Signer">
            <Row label="Public Key" value={proof.signer.publicKeyB64} mono />
            <Row label="Signature" value={proof.signer.signatureB64} mono last />
          </Section>

          <Section title="Environment" color={C.green}>
            <Row label="Enforcement" value={isTee ? "Hardware Enclave (AWS Nitro)" : "Software"} />
            {proof.environment?.measurement && <Row label="PCR0" value={proof.environment.measurement} mono />}
            {proof.environment?.attestation?.format && <Row label="Attestation" value={proof.environment.attestation.format} last />}
          </Section>

          {attr && (
            <Section title="Attribution">
              {attr.name && <Row label="Name" value={attr.name} />}
              {attr.message && <Row label="Data" value={attr.message} mono />}
              {attr.title && <Row label="Link" value={attr.title} link last />}
            </Section>
          )}

          {ts && (
            <Section title="Timestamp">
              {ts.authority ? <Row label="Authority" value={String(ts.authority)} /> : null}
              {ts.time ? <Row label="TSA Time" value={String(ts.time)} /> : null}
              {ts.digestAlg ? <Row label="Algorithm" value={String(ts.digestAlg)} last /> : null}
            </Section>
          )}
        </div>

        {/* Raw JSON */}
        <details style={{ marginTop: 16, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <summary style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600, color: C.textSec, cursor: "pointer" }}>Raw JSON</summary>
          <pre style={{ fontSize: 11, fontFamily: mono, lineHeight: 1.5, color: C.green, background: "#fafafa", padding: 16, margin: 0, overflow: "auto", maxHeight: 400, borderTop: `1px solid ${C.borderLight}`, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {JSON.stringify(proof, null, 2)}
          </pre>
        </details>
      </div>
    </Shell>
  );
}

/* ═══ Shell ═══ */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Amazon Ember', system-ui, sans-serif" }}>
      <div style={{ background: "#0F172A", padding: "0 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48 }}>
          <a href="/" style={{ fontSize: 18, fontWeight: 700, color: "#fff", textDecoration: "none" }}>OCC</a>
          <div style={{ display: "flex", gap: 20 }}>
            <a href="/docs" style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>Docs</a>
            <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>GitHub</a>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ═══ Section ═══ */

function Section({ title, color, children }: { title: string; color?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: color || C.textTri, padding: "10px 16px", background: "#fafafa", borderBottom: `1px solid ${C.borderLight}` }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/* ═══ Row ═══ */

function Row({ label, value, mono: isMono, accent, link, last }: { label: string; value: string; mono?: boolean; accent?: boolean; link?: boolean; last?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
      padding: "9px 16px", borderBottom: last ? "none" : `1px solid ${C.borderLight}`, cursor: "pointer",
    }}>
      <span style={{ fontSize: 13, color: C.textTri, flexShrink: 0 }}>{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: C.blue, textDecoration: "none", wordBreak: "break-all", textAlign: "right" }}>{value}</a>
      ) : (
        <span style={{
          fontSize: isMono ? 11 : 13, fontFamily: isMono ? mono : "inherit",
          color: copied ? C.green : accent ? C.accent : C.text,
          fontWeight: accent ? 700 : 400, wordBreak: "break-all", textAlign: "right", lineHeight: 1.4, transition: "color 0.2s",
        }}>
          {copied ? "Copied!" : value.length > 44 ? value.slice(0, 36) + "..." : value}
        </span>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px", fontSize: 13, fontWeight: 600, color: C.textSec,
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer",
};

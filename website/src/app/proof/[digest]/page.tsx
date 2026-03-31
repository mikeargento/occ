"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import type { OCCProof } from "@/lib/occ";

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
        } else {
          setError("Proof not found");
        }
      } catch { setError("Failed to load proof"); }
      setLoading(false);
    })();
  }, [digestParam]);

  if (loading) return (
    <Page>
      <div style={{ padding: "80px 20px", textAlign: "center", color: "var(--text3)" }}>Loading proof...</div>
    </Page>
  );

  if (error || !proof) return (
    <Page>
      <div style={{ padding: "80px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 16, color: "var(--red)", marginBottom: 12 }}>{error || "Proof not found"}</div>
        <a href="/" style={{ fontSize: 14, color: "var(--blue)" }}>&larr; Back</a>
      </div>
    </Page>
  );

  const commit = proof.commit;
  const attr = proof.attribution as { name?: string; title?: string; message?: string } | undefined;
  const slot = (proof as unknown as Record<string, unknown>).slotAllocation as Record<string, unknown> | undefined;
  const isEth = attr?.name?.startsWith("Ethereum");
  const isTee = proof.environment?.enforcement === "measured-tee";
  const wallTime = commit.time ? new Date(Number(commit.time)).toLocaleString() : null;

  function downloadJson() {
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `occ-proof-${commit.counter}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Page>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "24px 20px 48px", animation: "fadeIn .3s ease-out" }}>

        {/* Back */}
        <a href="/" style={{ fontSize: 14, color: "var(--text3)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </a>

        {/* Title bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--blue)" }}>#{commit.counter}</span>
              {isTee && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--green)", background: "rgba(0,200,83,.1)", border: "1px solid rgba(0,200,83,.2)", padding: "3px 10px", borderRadius: 20 }}>
                  Hardware Enclave
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginTop: 4 }}>
              {attr?.name || "Proof"} {wallTime ? `\u00b7 ${wallTime}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={downloadJson} style={actionBtn}>Export .json</button>
            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(proof, null, 2))} style={actionBtn}>Copy JSON</button>
          </div>
        </div>

        {/* Ethereum link */}
        {isEth && attr?.title && (
          <a href={attr.title} target="_blank" rel="noopener" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px", marginBottom: 20, borderRadius: 12,
            background: "rgba(0,149,246,.05)", border: "1px solid rgba(0,149,246,.15)",
            textDecoration: "none", color: "var(--blue)", fontSize: 14, fontWeight: 500,
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
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em",
              color: "#34d399", marginBottom: 14, display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 3, height: 12, borderRadius: 1, background: "#34d399" }} />
              Causal Window
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7 }}>
              {causalWindow.anchorBefore && causalWindow.anchorAfter ? (
                <>
                  This proof exists between{" "}
                  <a href={causalWindow.anchorBefore.etherscanUrl || "#"} target="_blank" rel="noopener"
                    style={{ color: "#34d399", textDecoration: "none", fontWeight: 600 }}>
                    Ethereum #{causalWindow.anchorBefore.blockNumber}
                  </a>
                  {" "}(proof #{causalWindow.anchorBefore.counter}) and{" "}
                  <a href={causalWindow.anchorAfter.etherscanUrl || "#"} target="_blank" rel="noopener"
                    style={{ color: "#34d399", textDecoration: "none", fontWeight: 600 }}>
                    Ethereum #{causalWindow.anchorAfter.blockNumber}
                  </a>
                  {" "}(proof #{causalWindow.anchorAfter.counter}).
                  <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "var(--text3)" }}>
                    Everything in this window provably existed before block #{causalWindow.anchorAfter.blockNumber} was mined.
                  </span>
                </>
              ) : causalWindow.anchorBefore && !causalWindow.anchorAfter ? (
                <>
                  This proof was created after{" "}
                  <a href={causalWindow.anchorBefore.etherscanUrl || "#"} target="_blank" rel="noopener"
                    style={{ color: "#34d399", textDecoration: "none", fontWeight: 600 }}>
                    Ethereum #{causalWindow.anchorBefore.blockNumber}
                  </a>
                  {" "}(proof #{causalWindow.anchorBefore.counter}).
                  <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "var(--text3)" }}>
                    Awaiting next Ethereum anchor to seal the forward boundary.
                  </span>
                </>
              ) : causalWindow.anchorAfter ? (
                <>
                  This proof is sealed by{" "}
                  <a href={causalWindow.anchorAfter.etherscanUrl || "#"} target="_blank" rel="noopener"
                    style={{ color: "#34d399", textDecoration: "none", fontWeight: 600 }}>
                    Ethereum #{causalWindow.anchorAfter.blockNumber}
                  </a>
                  {" "}(proof #{causalWindow.anchorAfter.counter}).
                  <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "var(--text3)" }}>
                    This proof provably existed before block #{causalWindow.anchorAfter.blockNumber} was mined.
                  </span>
                </>
              ) : null}
            </div>

            {/* Visual timeline */}
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 0, fontSize: 11, fontFamily: "var(--mono)" }}>
              {causalWindow.anchorBefore && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />
                  <span style={{ color: "var(--text3)" }}>#{causalWindow.anchorBefore.counter}</span>
                </div>
              )}
              <div style={{ flex: 1, height: 1, background: "rgba(52,211,153,.25)", margin: "0 8px", position: "relative" }}>
                <div style={{
                  position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                  width: 10, height: 10, borderRadius: "50%", background: "var(--blue)", border: "2px solid var(--surface)",
                }} />
              </div>
              {causalWindow.anchorAfter ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--text3)" }}>#{causalWindow.anchorAfter.counter}</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--text3)" }}>pending</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text3)", flexShrink: 0, opacity: 0.4 }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>

          {/* Artifact */}
          <Card title="Artifact">
            <Field label="Digest" value={proof.artifact.digestB64} mono />
            <Field label="Algorithm" value={proof.artifact.hashAlg.toUpperCase()} />
          </Card>

          {/* Commit */}
          <Card title="Commit">
            <Field label="Counter" value={`#${commit.counter}`} highlight />
            {wallTime && <Field label="Time" value={wallTime} />}
            {commit.epochId && <Field label="Epoch ID" value={String(commit.epochId)} mono />}
            {commit.prevB64 && <Field label="Previous Hash" value={commit.prevB64} mono />}
            {commit.nonceB64 && <Field label="Nonce" value={commit.nonceB64} mono />}
            {commit.slotCounter != null && <Field label="Slot Counter" value={`#${commit.slotCounter}`} />}
            {commit.slotHashB64 && <Field label="Slot Hash" value={commit.slotHashB64} mono />}
          </Card>

          {/* Causal Slot */}
          {slot && (
            <Card title="Causal Slot" accent="var(--slot, #06b6d4)">
              <Field label="Counter" value={`#${slot.counter}`} highlight />
              {slot.nonceB64 ? <Field label="Nonce" value={String(slot.nonceB64)} mono /> : null}
              {slot.signatureB64 ? <Field label="Signature" value={String(slot.signatureB64)} mono /> : null}
              {slot.epochId ? <Field label="Epoch ID" value={String(slot.epochId)} mono /> : null}
            </Card>
          )}

          {/* Signer */}
          <Card title="Signer">
            <Field label="Public Key" value={proof.signer.publicKeyB64} mono />
            <Field label="Signature" value={proof.signer.signatureB64} mono />
          </Card>

          {/* Environment */}
          <Card title="Environment" accent="var(--green)">
            <Field label="Enforcement" value={isTee ? "Hardware Enclave (AWS Nitro)" : "Software"} />
            {proof.environment?.measurement && <Field label="PCR0 Measurement" value={proof.environment.measurement} mono />}
            {proof.environment?.attestation?.format && <Field label="Attestation Format" value={proof.environment.attestation.format} />}
          </Card>

          {/* Attribution */}
          {attr && (
            <Card title="Attribution">
              {attr.name && <Field label="Name" value={attr.name} />}
              {attr.message && <Field label="Data" value={attr.message} mono />}
              {attr.title && <Field label="Link" value={attr.title} link />}
            </Card>
          )}

          {/* Timestamps */}
          {proof.timestamps ? (
            <Card title="Timestamps">
              {(() => {
                const ts = (proof.timestamps as Record<string, Record<string, unknown>>).artifact;
                if (!ts) return null;
                return (
                  <>
                    {ts.authority ? <Field label="Authority" value={String(ts.authority)} /> : null}
                    {ts.time ? <Field label="TSA Time" value={String(ts.time)} /> : null}
                    {ts.digestAlg ? <Field label="Digest Algorithm" value={String(ts.digestAlg)} /> : null}
                  </>
                );
              })()}
            </Card>
          ) : null}
        </div>

        {/* Raw JSON */}
        <div style={{ marginTop: 24 }}>
          <details>
            <summary style={{ fontSize: 14, color: "var(--text3)", cursor: "pointer", padding: "8px 0", fontWeight: 500 }}>Raw JSON</summary>
            <div style={{
              marginTop: 8, padding: 16, background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 12, fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)",
              whiteSpace: "pre-wrap", wordBreak: "break-all" as const, maxHeight: 500, overflow: "auto", lineHeight: 1.6,
            }}>
              {JSON.stringify(proof, null, 2)}
            </div>
          </details>
        </div>
      </div>
    </Page>
  );
}

/* ── Page wrapper ── */

function Page({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #000; --surface: #0a0a0a; --border: #1e1e1e;
          --text: #f5f5f5; --text2: #a0a0a0; --text3: #666;
          --blue: #0095f6; --green: #00c853; --red: #ed4956;
          --slot: #06b6d4;
          --font: acumin-pro, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          --mono: var(--font-mono), 'SF Mono', 'JetBrains Mono', Consolas, monospace;
        }
        html, body { background: var(--bg); color: var(--text); font-family: var(--font); -webkit-font-smoothing: antialiased; }
      `}</style>
      <div style={{ minHeight: "100vh" }}>
        <nav style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: "1px solid var(--border)" }}>
          <a href="/" style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", textDecoration: "none" }}>OCC</a>
          <div style={{ display: "flex", gap: 20 }}>
            <a href="/docs" style={{ fontSize: 14, color: "var(--text2)", textDecoration: "none" }}>Docs</a>
            <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 14, color: "var(--text2)", textDecoration: "none" }}>GitHub</a>
          </div>
        </nav>
        {children}
      </div>
    </>
  );
}

/* ── Card ── */

function Card({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, overflow: "hidden" }}>
      <div style={{
        fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em",
        color: accent || "var(--text3)", marginBottom: 12,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ width: 3, height: 12, borderRadius: 1, background: accent || "var(--text3)" }} />
        {title}
      </div>
      {children}
    </div>
  );
}

/* ── Field with copy ── */

function Field({ label, value, mono, highlight, link }: { label: string; value: string; mono?: boolean; highlight?: boolean; link?: boolean }) {
  const [copied, setCopied] = useState(false);

  function handleClick() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      onClick={handleClick}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12,
        padding: "6px 0", borderBottom: "1px solid var(--border)", cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text3)", flexShrink: 0, minWidth: 80 }}>{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{
          fontSize: 12, color: "var(--blue)", textDecoration: "none", wordBreak: "break-all" as const, textAlign: "right" as const,
        }}>{value}</a>
      ) : (
        <span style={{
          fontSize: mono ? 11 : 13,
          fontFamily: mono ? "var(--mono)" : "inherit",
          color: copied ? "var(--green)" : highlight ? "var(--blue)" : "var(--text2)",
          fontWeight: highlight ? 700 : 400,
          wordBreak: "break-all" as const, textAlign: "right" as const,
          transition: "color .2s", lineHeight: 1.4,
        }}>
          {copied ? "Copied!" : value}
        </span>
      )}
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "var(--text2)",
  background: "transparent", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer",
};

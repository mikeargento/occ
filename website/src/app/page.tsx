"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  hashFile, commitDigest, commitBatch, formatFileSize, isOCCProof, verifyProofSignature,
  type OCCProof, type AgencyEnvelope, type ActorIdentity, type ProofVerifyResult,
} from "@/lib/occ";
import { toUrlSafeB64, relativeTime } from "@/lib/explorer";
import { zipSync } from "fflate";

type Mode = "create" | "verify";
type CreateStep = "drop" | "hashing" | "signing" | "done" | "error";
type VerifyStep = "drop" | "checking" | "result";
interface ProofEntry { globalId: number; digest: string; counter?: string; enforcement: string; time?: number; attribution?: string; signer: string; }

function buildVerifyTxt(fn: string, p: OCCProof): string {
  return `VERIFY.txt — OCC Proof\n\nFILE: ${fn}\nDIGEST: ${p.artifact.digestB64}\nCOUNTER: #${p.commit.counter ?? "—"}\nSIGNER: ${p.signer.publicKeyB64}\n\nhttps://occ.wtf/docs\n`;
}

async function createBiometricAuth(digestB64: string): Promise<AgencyEnvelope | undefined> {
  if (!window.PublicKeyCredential) return undefined;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const cred = await navigator.credentials.get({ publicKey: { challenge, timeout: 60000, userVerification: "required", rpId: window.location.hostname, allowCredentials: [] } }) as PublicKeyCredential | null;
    if (!cred) return undefined;
    const r = cred.response as AuthenticatorAssertionResponse;
    return {
      actor: { keyId: cred.id, publicKeyB64: "", algorithm: "ES256", provider: "webauthn" } as ActorIdentity,
      authorization: { format: "webauthn.get", purpose: "occ/commit-authorize/v1", actorKeyId: cred.id, artifactHash: digestB64, challenge: btoa(String.fromCharCode(...challenge)), timestamp: Date.now(), signatureB64: btoa(String.fromCharCode(...new Uint8Array(r.signature))), clientDataJSON: new TextDecoder().decode(r.clientDataJSON), authenticatorDataB64: btoa(String.fromCharCode(...new Uint8Array(r.authenticatorData))) },
    };
  } catch { return undefined; }
}

/* ── Colors ── */
const C = {
  bg: "#F8FAFC", surface: "#FFFFFF", border: "#E2E8F0", borderLight: "#F1F5F9",
  text: "#0F172A", textSec: "#475569", textTri: "#94A3B8",
  accent: "#2563EB", accentHover: "#1D4ED8", accentSoft: "#DBEAFE",
  green: "#16A34A", red: "#DC2626", blue: "#2563EB",
};

export default function OCCPage() {
  const [mode, setMode] = useState<Mode>("create");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [createStep, setCreateStep] = useState<CreateStep>("drop");
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createDigest, setCreateDigest] = useState("");
  const [createProofs, setCreateProofs] = useState<OCCProof[]>([]);
  const [createError, setCreateError] = useState("");
  const [createProgress, setCreateProgress] = useState({ current: 0, total: 0, fileName: "" });
  const [copied, setCopied] = useState(false);
  const [attribution, setAttribution] = useState("");
  const [verifyStep, setVerifyStep] = useState<VerifyStep>("drop");
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyProof, setVerifyProof] = useState<OCCProof | null>(null);
  const [verifyResult, setVerifyResult] = useState<ProofVerifyResult | null>(null);
  const [fileDigestMatch, setFileDigestMatch] = useState<boolean | null>(null);
  const [ledger, setLedger] = useState<ProofEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [dragover, setDragover] = useState(false);

  const fetchLedger = useCallback(async (page: number) => {
    try {
      const resp = await fetch(`/api/proofs?page=${page}&limit=15`);
      if (!resp.ok) return;
      const data = await resp.json();
      setLedger((data.proofs || []).map((p: Record<string, unknown>) => ({
        globalId: (p.id as number) || 0, digest: (p.digestB64 as string) || "—",
        counter: (p.counter as string) || undefined,
        enforcement: (p.enforcement as string) === "measured-tee" ? "Hardware Enclave" : "Software",
        time: p.commitTime ? Number(p.commitTime) : undefined,
        attribution: (p.attrName as string) || undefined,
        signer: ((p.signerPub as string) || "").slice(0, 12) || "—",
      })));
      setLedgerTotal(data.total || 0); setLedgerPage(page);
    } catch {}
  }, []);

  useEffect(() => { fetchLedger(1); const i = setInterval(() => fetchLedger(1), 15000); return () => clearInterval(i); }, [fetchLedger]);

  function handleFiles(files: File[]) { if (mode === "create") handleCreate(files); else if (files.length === 1) handleVerify(files[0]); }

  async function handleCreate(files: File[]) {
    setCreateFiles(files); setCreateStep("hashing"); setCreateError("");
    try {
      if (files.length === 1) {
        const d = await hashFile(files[0]); setCreateDigest(d); setCreateStep("signing");
        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;
        setCreateProofs([await commitDigest(d, undefined, undefined, attr)]); setCreateStep("done");
        setTimeout(() => fetchLedger(1), 1500);
      } else {
        const digests: Array<{ digestB64: string; hashAlg: "sha256" }> = [];
        for (let i = 0; i < files.length; i++) { setCreateProgress({ current: i+1, total: files.length, fileName: files[i].name }); digests.push({ digestB64: await hashFile(files[i]), hashAlg: "sha256" }); }
        setCreateDigest(digests[0].digestB64); setCreateStep("signing");
        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;
        setCreateProofs(await commitBatch(digests, undefined, undefined, attr)); setCreateStep("done");
        setTimeout(() => fetchLedger(1), 1500);
      }
    } catch (err) { setCreateError(err instanceof Error ? err.message : "Something went wrong"); setCreateStep("error"); }
  }

  async function handleVerify(f: File) {
    setVerifyFile(f); setVerifyStep("checking"); setFileDigestMatch(null); setVerifyResult(null); setVerifyProof(null);
    try {
      const text = await f.text(); const proof = isOCCProof(text);
      if (proof) { setVerifyProof(proof); setVerifyResult(await verifyProofSignature(proof)); setVerifyStep("result"); }
      else {
        const d = await hashFile(f); const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(d))}`);
        if (resp.ok) { const data = await resp.json(); if (data.proofs?.length > 0) { const p = data.proofs[0].proof as OCCProof; setVerifyProof(p); setFileDigestMatch(true); setVerifyResult(await verifyProofSignature(p)); } else setFileDigestMatch(false); } else setFileDigestMatch(false);
        setVerifyStep("result");
      }
    } catch { setVerifyStep("result"); setFileDigestMatch(false); }
  }

  function resetCreate() { setCreateFiles([]); setCreateStep("drop"); setCreateDigest(""); setCreateProofs([]); setCreateError(""); }
  function resetVerify() { setVerifyFile(null); setVerifyStep("drop"); setVerifyProof(null); setVerifyResult(null); setFileDigestMatch(null); }
  function copyProof() { navigator.clipboard.writeText(createProofs.length === 1 ? JSON.stringify(createProofs[0], null, 2) : JSON.stringify(createProofs, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  async function downloadZip() {
    if (!createProofs.length || !createFiles.length) return;
    const z: Record<string, Uint8Array> = {};
    for (let i = 0; i < createFiles.length; i++) { const f = createFiles[i], p = createProofs[i] || createProofs[0]; z[f.name] = new Uint8Array(await f.arrayBuffer()); z[createFiles.length > 1 ? `proof-${i+1}.json` : "proof.json"] = new TextEncoder().encode(JSON.stringify(p, null, 2)); if (i === 0) z["VERIFY.txt"] = new TextEncoder().encode(buildVerifyTxt(f.name, p)); }
    const blob = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = createFiles.length === 1 ? `${createFiles[0].name.replace(/\.[^.]+$/, "")}-occ.zip` : "occ-batch.zip"; a.click(); URL.revokeObjectURL(url);
  }

  const showDrop = (mode === "create" && createStep === "drop") || (mode === "verify" && verifyStep === "drop");
  const mono = "'SF Mono', SFMono-Regular, 'JetBrains Mono', Consolas, monospace";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Amazon Ember', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        .occ-layout { display: flex; flex-direction: column; max-width: 560px; margin: 0 auto; padding: 0 20px 80px; }
        .occ-head { max-width: 560px; }
        @media (min-width: 900px) {
          .occ-layout { max-width: 1100px; flex-direction: row; gap: 48px; align-items: flex-start; }
          .occ-head { max-width: 1100px; }
          .occ-action { flex: 0 0 480px; }
          .occ-ledger { flex: 1; min-width: 0; }
        }
      `}</style>

      {/* ── Header bar ── */}
      <div style={{ background: "#0F172A", padding: "0 24px" }}>
        <div className="occ-head" style={{ margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 48 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>OCC</span>
          <div style={{ display: "flex", gap: 20 }}>
            <a href="/docs" style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>Docs</a>
            <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>GitHub</a>
          </div>
        </div>
      </div>

      <div className="occ-layout" style={{ paddingTop: 32 }}>
      <div className="occ-action">

        {/* ── Segmented Control ── */}
        <div style={{ display: "flex", padding: 3, borderRadius: 8, background: C.borderLight, marginBottom: 24 }}>
          {(["create", "verify"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); if (m === "create") resetCreate(); else resetVerify(); }} style={{
              flex: 1, height: 34, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", borderRadius: 6,
              background: mode === m ? C.surface : "transparent",
              color: mode === m ? C.text : C.textSec,
              boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.15s ease",
            }}>
              {m === "create" ? "Create" : "Verify"}
            </button>
          ))}
        </div>

        {/* ── Drop Zone (label wraps input for Brave compat) ── */}
        {showDrop && (
          <div style={{ animation: "fadeUp 0.2s ease-out" }}>
            <label
              onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => { e.preventDefault(); setDragover(false); const f = Array.from(e.dataTransfer.files); if (f.length) handleFiles(f); }}
              style={{
                display: "block", borderRadius: 12, padding: "48px 24px", textAlign: "center", cursor: "pointer",
                border: dragover ? `2px solid ${C.accent}` : `2px dashed ${C.border}`,
                background: dragover ? "rgba(255,153,0,0.04)" : C.surface,
                transition: "all 0.2s ease", marginBottom: 16,
              }}
            >
              <input ref={fileInputRef} type="file" multiple={mode === "create"} accept="*/*"
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", top: -9999 }}
                onChange={(e) => { if (!e.target.files?.length) return; handleFiles(Array.from(e.target.files)); e.target.value = ""; }}
              />
              <div style={{
                width: 52, height: 52, borderRadius: 12, margin: "0 auto 16px",
                background: C.accentSoft, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v12M7 10l5-5 5 5" /><path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
                </svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {mode === "create" ? "Drop files to prove" : "Drop file to verify"}
              </div>
              <div style={{ fontSize: 14, color: C.textTri }}>
                {mode === "create" ? "Hashed locally, signed in hardware enclave" : "Proof.json or any file to check the ledger"}
              </div>
            </label>

            {mode === "create" && (
              <input type="text" value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="Author name (optional)"
                style={{
                  width: "100%", height: 40, padding: "0 14px", fontSize: 14, borderRadius: 8,
                  border: `1px solid ${C.border}`, background: C.surface, color: C.text, outline: "none",
                  boxSizing: "border-box",
                }} />
            )}
          </div>
        )}

        {/* ── Create: Processing ── */}
        {mode === "create" && (createStep === "hashing" || createStep === "signing") && (
          <div style={{ textAlign: "center", padding: "56px 0", animation: "fadeUp 0.2s ease-out" }}>
            <div style={{ width: 28, height: 28, border: `2.5px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginTop: 20 }}>
              {createStep === "hashing" ? (createFiles.length > 1 ? `Hashing ${createProgress.current}/${createProgress.total}` : "Hashing") : "Signing in enclave"}
            </div>
          </div>
        )}

        {mode === "create" && createStep === "error" && (
          <div style={{ textAlign: "center", padding: "40px 0", animation: "fadeUp 0.2s ease-out" }}>
            <div style={{ fontSize: 15, color: C.red, marginBottom: 20 }}>{createError}</div>
            <Btn onClick={resetCreate} c={C}>Try again</Btn>
          </div>
        )}

        {/* ── Create: Done ── */}
        {mode === "create" && createStep === "done" && createProofs.length > 0 && (
          <div style={{ animation: "fadeUp 0.25s ease-out" }}>
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill={C.green}/><path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ fontSize: 16, fontWeight: 700 }}>
                  {createProofs.length === 1 ? "Proved" : `${createProofs.length} proved`}
                </span>
                <span style={{ fontSize: 14, color: C.textTri, marginLeft: "auto" }}>#{createProofs[0].commit.counter}</span>
              </div>
              {createFiles.map((f, i) => (
                <div key={f.name + i} style={{ padding: "8px 0", borderTop: i > 0 ? `1px solid ${C.borderLight}` : "none" }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{f.name} <span style={{ color: C.textTri, fontWeight: 400 }}>{formatFileSize(f.size)}</span></div>
                  <div style={{ fontSize: 12, fontFamily: mono, color: C.green, marginTop: 2, wordBreak: "break-all" }}>{createProofs[i]?.artifact.digestB64}</div>
                </div>
              ))}
            </div>

            <details style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 12 }}>
              <summary style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600, color: C.textSec, cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Proof JSON</span>
                <button onClick={(e) => { e.preventDefault(); copyProof(); }} style={{ fontSize: 13, fontWeight: 500, color: copied ? C.green : C.blue, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </summary>
              <pre style={{ fontSize: 11, fontFamily: mono, lineHeight: 1.5, color: C.green, background: "#fafafa", padding: 16, margin: 0, overflow: "auto", maxHeight: 280, borderTop: `1px solid ${C.borderLight}` }}>
                {createProofs.length === 1 ? JSON.stringify(createProofs[0], null, 2) : JSON.stringify(createProofs, null, 2)}
              </pre>
            </details>

            <div style={{ display: "flex", gap: 10 }}>
              <Btn fill onClick={downloadZip} c={C}>Download</Btn>
              <Btn onClick={resetCreate} c={C}>New</Btn>
            </div>
          </div>
        )}

        {/* ── Verify: Processing ── */}
        {mode === "verify" && verifyStep === "checking" && (
          <div style={{ textAlign: "center", padding: "56px 0", animation: "fadeUp 0.2s ease-out" }}>
            <div style={{ width: 28, height: 28, border: `2.5px solid ${C.border}`, borderTopColor: C.blue, borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginTop: 20 }}>Checking {verifyFile?.name}</div>
          </div>
        )}

        {/* ── Verify: Result ── */}
        {mode === "verify" && verifyStep === "result" && (
          <div style={{ animation: "fadeUp 0.25s ease-out" }}>
            {verifyResult && (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill={verifyResult.valid ? C.green : C.red}/>
                    {verifyResult.valid ? <path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> : <path d="M15 9l-6 6M9 9l6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>}
                  </svg>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{verifyResult.valid ? "Valid" : "Invalid"}</span>
                </div>
                {verifyResult.checks.map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: i > 0 ? `1px solid ${C.borderLight}` : "none", fontSize: 14 }}>
                    <span style={{ color: C.textSec }}>{c.label}</span>
                    <span style={{ fontWeight: 600, color: c.status === "pass" ? C.green : c.status === "fail" ? C.red : C.textTri }}>
                      {c.status === "pass" ? "Pass" : c.status === "fail" ? "Fail" : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {fileDigestMatch !== null && !verifyProof && (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 12, textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: fileDigestMatch ? C.green : C.textTri }}>{fileDigestMatch ? "Found on ledger" : "Not found"}</div>
              </div>
            )}

            {verifyProof && (
              <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px 16px", marginBottom: 12 }}>
                {[
                  ["Counter", `#${verifyProof.commit.counter}`],
                  ["Enforcement", verifyProof.environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"],
                  ...(verifyProof.attribution?.name ? [["Author", verifyProof.attribution.name]] : []),
                ].map(([k, v], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: i > 0 ? `1px solid ${C.borderLight}` : "none", fontSize: 14 }}>
                    <span style={{ color: C.textTri }}>{k}</span><span style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            <Btn onClick={resetVerify} c={C} style={{ width: "100%" }}>Done</Btn>
          </div>
        )}

      </div>{/* end occ-action */}

        {/* ── Proof Ledger ── */}
        <div className="occ-ledger">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, padding: "0 4px" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.textTri, textTransform: "uppercase", letterSpacing: "0.06em" }}>Proof Ledger</span>
            <span style={{ fontSize: 13, color: C.textTri }}>{ledgerTotal.toLocaleString()}</span>
          </div>

          {ledger.length > 0 && (
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              {ledger.map((entry, i) => (
                <LedgerItem key={entry.digest + i} entry={entry} last={i === ledger.length - 1} mono={mono} c={C} />
              ))}
            </div>
          )}

          {ledgerTotal > 15 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 14 }}>
              <button onClick={() => fetchLedger(ledgerPage - 1)} disabled={ledgerPage <= 1}
                style={{ fontSize: 14, fontWeight: 500, color: ledgerPage <= 1 ? C.textTri : C.blue, background: "none", border: "none", cursor: "pointer" }}>
                Previous
              </button>
              <span style={{ fontSize: 14, color: C.textTri }}>{ledgerPage} of {Math.ceil(ledgerTotal / 15)}</span>
              <button onClick={() => fetchLedger(ledgerPage + 1)} disabled={ledgerPage >= Math.ceil(ledgerTotal / 15)}
                style={{ fontSize: 14, fontWeight: 500, color: ledgerPage >= Math.ceil(ledgerTotal / 15) ? C.textTri : C.blue, background: "none", border: "none", cursor: "pointer" }}>
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ Components ═══ */

function Btn({ children, onClick, fill, style, c }: { children: React.ReactNode; onClick?: () => void; fill?: boolean; style?: React.CSSProperties; c: typeof C }) {
  return (
    <button onClick={onClick} style={{
      height: 44, fontSize: 15, fontWeight: 600, borderRadius: 8, border: "none", cursor: "pointer", flex: 1,
      background: fill ? c.accent : c.borderLight, color: fill ? "#fff" : c.text,
      transition: "all 0.15s", ...style,
    }}>{children}</button>
  );
}

function LedgerItem({ entry, last, mono, c }: { entry: ProofEntry; last: boolean; mono: string; c: typeof C }) {
  const counter = entry.counter || String(entry.globalId);
  const isEth = entry.attribution?.startsWith("Ethereum");
  const href = `/proof/${encodeURIComponent(toUrlSafeB64(entry.digest))}`;

  return (
    <div style={{ borderBottom: last ? "none" : `1px solid ${c.borderLight}` }}>
      <a href={href} style={{ display: "flex", alignItems: "center", padding: "11px 16px", cursor: "pointer", transition: "background 0.1s", textDecoration: "none", color: "inherit" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#fafafa"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ width: 44, fontSize: 14, fontWeight: 700, color: c.accent, fontFamily: mono }}>{counter}</span>
        <div style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.attribution || "Proof"}
          </div>
          <div style={{ fontSize: 11, fontFamily: mono, color: c.textTri, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.digest.slice(0, 28)}...
          </div>
        </div>
        {isEth && <span style={{ fontSize: 11, fontWeight: 700, color: c.blue, background: "rgba(0,115,187,0.08)", padding: "2px 7px", borderRadius: 4, marginLeft: 8, flexShrink: 0 }}>ETH</span>}
        <svg width="7" height="12" viewBox="0 0 7 12" fill="none" stroke={c.textTri} strokeWidth="1.5" strokeLinecap="round" style={{ marginLeft: 10, flexShrink: 0 }}>
          <path d="M1 1l5 5-5 5" />
        </svg>
      </a>
    </div>
  );
}

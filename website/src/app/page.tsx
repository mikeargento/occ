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
  return `OCC Proof — ${fn}\nDigest: ${p.artifact.digestB64}\nCounter: #${p.commit.counter ?? "—"}\nSigner: ${p.signer.publicKeyB64}\nhttps://occ.wtf/docs\n`;
}

async function createBiometricAuth(d: string): Promise<AgencyEnvelope | undefined> {
  if (!window.PublicKeyCredential) return undefined;
  try {
    const ch = crypto.getRandomValues(new Uint8Array(32));
    const c = await navigator.credentials.get({ publicKey: { challenge: ch, timeout: 60000, userVerification: "required", rpId: window.location.hostname, allowCredentials: [] } }) as PublicKeyCredential | null;
    if (!c) return undefined;
    const r = c.response as AuthenticatorAssertionResponse;
    return { actor: { keyId: c.id, publicKeyB64: "", algorithm: "ES256", provider: "webauthn" } as ActorIdentity, authorization: { format: "webauthn.get", purpose: "occ/commit-authorize/v1", actorKeyId: c.id, artifactHash: d, challenge: btoa(String.fromCharCode(...ch)), timestamp: Date.now(), signatureB64: btoa(String.fromCharCode(...new Uint8Array(r.signature))), clientDataJSON: new TextDecoder().decode(r.clientDataJSON), authenticatorDataB64: btoa(String.fromCharCode(...new Uint8Array(r.authenticatorData))) } };
  } catch { return undefined; }
}

const font = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const mono = "'SF Mono', SFMono-Regular, ui-monospace, Menlo, monospace";

export default function OCCPage() {
  const [mode, setMode] = useState<Mode>("create");
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<CreateStep>("drop");
  const [files, setFiles] = useState<File[]>([]);
  const [digest, setDigest] = useState("");
  const [proofs, setProofs] = useState<OCCProof[]>([]);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState({ c: 0, t: 0, n: "" });
  const [copied, setCopied] = useState(false);
  const [author, setAuthor] = useState("");
  const [vStep, setVStep] = useState<VerifyStep>("drop");
  const [vFile, setVFile] = useState<File | null>(null);
  const [vProof, setVProof] = useState<OCCProof | null>(null);
  const [vResult, setVResult] = useState<ProofVerifyResult | null>(null);
  const [vMatch, setVMatch] = useState<boolean | null>(null);
  const [ledger, setLedger] = useState<ProofEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [drag, setDrag] = useState(false);

  const fetchL = useCallback(async (p: number) => {
    try {
      const r = await fetch(`/api/proofs?page=${p}&limit=30`); if (!r.ok) return;
      const d = await r.json();
      setLedger((d.proofs || []).map((x: Record<string, unknown>) => ({ globalId: (x.id as number) || 0, digest: (x.digestB64 as string) || "—", counter: (x.counter as string) || undefined, enforcement: (x.enforcement as string) === "measured-tee" ? "Enclave" : "Software", time: x.commitTime ? Number(x.commitTime) : undefined, attribution: (x.attrName as string) || undefined, signer: ((x.signerPub as string) || "").slice(0, 12) || "—" })));
      setTotal(d.total || 0); setPage(p);
    } catch {}
  }, []);

  useEffect(() => { fetchL(1); const i = setInterval(() => fetchL(1), 15000); return () => clearInterval(i); }, [fetchL]);

  function handleF(f: File[]) { if (mode === "create") doCreate(f); else if (f.length === 1) doVerify(f[0]); }

  async function doCreate(fs: File[]) {
    setFiles(fs); setStep("hashing"); setErr("");
    try {
      if (fs.length === 1) {
        const d = await hashFile(fs[0]); setDigest(d); setStep("signing");
        const a = author.trim() ? { name: author.trim() } : undefined;
        setProofs([await commitDigest(d, undefined, undefined, a)]); setStep("done"); fetchL(1); setTimeout(() => fetchL(1), 2000);
      } else {
        const ds: Array<{ digestB64: string; hashAlg: "sha256" }> = [];
        for (let i = 0; i < fs.length; i++) { setProgress({ c: i + 1, t: fs.length, n: fs[i].name }); ds.push({ digestB64: await hashFile(fs[i]), hashAlg: "sha256" }); }
        setDigest(ds[0].digestB64); setStep("signing");
        const a = author.trim() ? { name: author.trim() } : undefined;
        setProofs(await commitBatch(ds, undefined, undefined, a)); setStep("done"); fetchL(1); setTimeout(() => fetchL(1), 2000);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setStep("error"); }
  }

  async function doVerify(f: File) {
    setVFile(f); setVStep("checking"); setVMatch(null); setVResult(null); setVProof(null);
    try {
      const t = await f.text(); const p = isOCCProof(t);
      if (p) { setVProof(p); setVResult(await verifyProofSignature(p)); setVStep("result"); }
      else {
        const d = await hashFile(f); const r = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(d))}`);
        if (r.ok) { const j = await r.json(); if (j.proofs?.length > 0) { const x = j.proofs[0].proof as OCCProof; setVProof(x); setVMatch(true); setVResult(await verifyProofSignature(x)); } else setVMatch(false); } else setVMatch(false);
        setVStep("result");
      }
    } catch { setVStep("result"); setVMatch(false); }
  }

  function reset() { setFiles([]); setStep("drop"); setDigest(""); setProofs([]); setErr(""); }
  function resetV() { setVFile(null); setVStep("drop"); setVProof(null); setVResult(null); setVMatch(null); }
  function copy() { navigator.clipboard.writeText(proofs.length === 1 ? JSON.stringify(proofs[0], null, 2) : JSON.stringify(proofs, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  async function dl() {
    if (!proofs.length || !files.length) return;
    const z: Record<string, Uint8Array> = {};
    for (let i = 0; i < files.length; i++) { const f = files[i], p = proofs[i] || proofs[0]; z[f.name] = new Uint8Array(await f.arrayBuffer()); z[files.length > 1 ? `proof-${i + 1}.json` : "proof.json"] = new TextEncoder().encode(JSON.stringify(p, null, 2)); if (i === 0) z["VERIFY.txt"] = new TextEncoder().encode(buildVerifyTxt(f.name, p)); }
    const b = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = files.length === 1 ? `${files[0].name.replace(/\.[^.]+$/, "")}-occ.zip` : "occ-batch.zip"; a.click(); URL.revokeObjectURL(u);
  }

  const showDrop = (mode === "create" && step === "drop") || (mode === "verify" && vStep === "drop");

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#1d1d1f", fontFamily: font, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        .occ-wrap { max-width: 580px; margin: 0 auto; padding: 0 24px 100px; }
        .occ-head-w { max-width: 980px; }
        @media (min-width: 980px) {
          .occ-wrap { max-width: 980px; display: flex; gap: 80px; align-items: flex-start; }
          .occ-left { flex: 0 0 420px; }
          .occ-right { flex: 1; min-width: 0; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ background: "rgba(251,251,253,0.8)", backdropFilter: "saturate(180%) blur(20px)", borderBottom: "1px solid #d2d2d7", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="occ-head-w" style={{ maxWidth: 980, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, padding: "0 22px" }}>
          <a href="/" style={{ fontSize: 21, fontWeight: 600, color: "#1d1d1f", textDecoration: "none", letterSpacing: "-0.02em" }}>OCC</a>
          <div style={{ display: "flex", gap: 28 }}>
            <a href="/docs" style={{ fontSize: 12, color: "#1d1d1f", textDecoration: "none", fontWeight: 400, opacity: 0.8 }}>Docs</a>
            <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 12, color: "#1d1d1f", textDecoration: "none", fontWeight: 400, opacity: 0.8 }}>GitHub</a>
          </div>
        </div>
      </nav>

      <div className="occ-wrap" style={{ paddingTop: 48 }}>
      <div className="occ-left">

        {/* ── Toggle ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 32 }}>
          {(["create", "verify"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); if (m === "create") reset(); else resetV(); }} style={{
              flex: 1, height: 36, fontSize: 14, fontWeight: 400, border: "none", cursor: "pointer",
              borderBottom: mode === m ? "2px solid #1d1d1f" : "2px solid transparent",
              background: "transparent", color: mode === m ? "#1d1d1f" : "#86868b",
              transition: "all 0.2s",
            }}>
              {m === "create" ? "Create" : "Verify"}
            </button>
          ))}
        </div>

        {/* ── Drop zone ── */}
        {showDrop && (
          <div style={{ animation: "fadeIn 0.3s ease-out" }}>
            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = Array.from(e.dataTransfer.files); if (f.length) handleF(f); }}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                minHeight: 240, borderRadius: 18, cursor: "pointer", marginBottom: 20,
                border: drag ? "2px solid #0071e3" : "2px dashed #d2d2d7",
                background: drag ? "rgba(0,113,227,0.02)" : "#fbfbfd",
                transition: "all 0.2s",
              }}
            >
              <input ref={fileRef} type="file" multiple={mode === "create"} accept="*/*"
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, top: -9999 }}
                onChange={(e) => { if (!e.target.files?.length) return; handleF(Array.from(e.target.files)); e.target.value = ""; }}
              />
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={drag ? "#0071e3" : "#86868b"} strokeWidth="1" strokeLinecap="round" style={{ marginBottom: 16 }}>
                <path d="M12 5v12M7 10l5-5 5 5" /><path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
              </svg>
              <div style={{ fontSize: 17, fontWeight: 600, color: "#1d1d1f", marginBottom: 4 }}>
                {mode === "create" ? "Drop files to prove" : "Drop a file to verify"}
              </div>
              <div style={{ fontSize: 14, color: "#86868b" }}>
                {mode === "create" ? "Hashed locally. Signed in hardware enclave." : "Drop proof.json or any file to check the ledger."}
              </div>
            </label>

            {mode === "create" && (
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)"
                style={{ width: "100%", height: 44, padding: "0 16px", fontSize: 14, borderRadius: 12, border: "1px solid #d2d2d7", background: "#fff", color: "#1d1d1f", outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#0071e3"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#d2d2d7"; }}
              />
            )}
          </div>
        )}

        {/* ── Processing ── */}
        {mode === "create" && (step === "hashing" || step === "signing") && (
          <div style={{ textAlign: "center", padding: "72px 0", animation: "fadeIn 0.3s ease-out" }}>
            <div style={{ width: 32, height: 32, border: "3px solid #d2d2d7", borderTopColor: "#0071e3", borderRadius: "50%", margin: "0 auto", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 17, fontWeight: 600, color: "#1d1d1f", marginTop: 24 }}>
              {step === "hashing" ? (files.length > 1 ? `Hashing ${progress.c}/${progress.t}` : "Hashing") : "Signing"}
            </div>
            <div style={{ fontSize: 14, color: "#86868b", marginTop: 4 }}>
              {step === "signing" ? "Hardware enclave" : ""}
            </div>
          </div>
        )}

        {mode === "create" && step === "error" && (
          <div style={{ textAlign: "center", padding: "48px 0", animation: "fadeIn 0.3s ease-out" }}>
            <div style={{ fontSize: 17, color: "#ff3b30", marginBottom: 24 }}>{err}</div>
            <button onClick={reset} style={linkBtn}>Try again</button>
          </div>
        )}

        {/* ── Done ── */}
        {mode === "create" && step === "done" && proofs.length > 0 && (
          <div style={{ animation: "fadeIn 0.4s ease-out" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#e8f5e8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Proved</div>
              <div style={{ fontSize: 17, color: "#86868b", marginTop: 2 }}>#{proofs[0].commit.counter}</div>
            </div>

            {files.map((f, i) => (
              <div key={f.name + i} style={{ padding: "12px 0", borderTop: i > 0 ? "1px solid #f5f5f7" : "none" }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{f.name} <span style={{ color: "#86868b", fontWeight: 400 }}>{formatFileSize(f.size)}</span></div>
                <div style={{ fontSize: 12, fontFamily: mono, color: "#34c759", marginTop: 4, wordBreak: "break-all", lineHeight: 1.5 }}>{proofs[i]?.artifact.digestB64}</div>
              </div>
            ))}

            <details style={{ marginTop: 20, borderTop: "1px solid #f5f5f7", paddingTop: 16 }}>
              <summary style={{ fontSize: 14, color: "#0071e3", cursor: "pointer", fontWeight: 500, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Proof JSON</span>
                <button onClick={(e) => { e.preventDefault(); copy(); }} style={{ fontSize: 12, color: copied ? "#34c759" : "#0071e3", background: "none", border: "none", cursor: "pointer" }}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </summary>
              <pre style={{ fontSize: 11, fontFamily: mono, lineHeight: 1.6, color: "#1d1d1f", background: "#f5f5f7", padding: 16, borderRadius: 12, overflow: "auto", maxHeight: 240, marginTop: 12 }}>
                {proofs.length === 1 ? JSON.stringify(proofs[0], null, 2) : JSON.stringify(proofs, null, 2)}
              </pre>
            </details>

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={dl} style={{ ...pillBtn, background: "#0071e3", color: "#fff" }}>Download</button>
              <button onClick={reset} style={pillBtn}>New proof</button>
            </div>
          </div>
        )}

        {/* ── Verify processing ── */}
        {mode === "verify" && vStep === "checking" && (
          <div style={{ textAlign: "center", padding: "72px 0", animation: "fadeIn 0.3s ease-out" }}>
            <div style={{ width: 32, height: 32, border: "3px solid #d2d2d7", borderTopColor: "#0071e3", borderRadius: "50%", margin: "0 auto", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 17, fontWeight: 600, color: "#1d1d1f", marginTop: 24 }}>Checking</div>
            <div style={{ fontSize: 14, color: "#86868b", marginTop: 4 }}>{vFile?.name}</div>
          </div>
        )}

        {/* ── Verify result ── */}
        {mode === "verify" && vStep === "result" && (
          <div style={{ animation: "fadeIn 0.4s ease-out" }}>
            {vResult && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: vResult.valid ? "#e8f5e8" : "#ffeaea", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    {vResult.valid
                      ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                      : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>{vResult.valid ? "Valid" : "Invalid"}</div>
                </div>
                {vResult.checks.map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: i > 0 ? "1px solid #f5f5f7" : "none", fontSize: 14 }}>
                    <span style={{ color: "#86868b" }}>{c.label}</span>
                    <span style={{ fontWeight: 500, color: c.status === "pass" ? "#34c759" : c.status === "fail" ? "#ff3b30" : "#86868b" }}>
                      {c.status === "pass" ? "Pass" : c.status === "fail" ? "Fail" : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {vMatch !== null && !vProof && (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 28, fontWeight: 600, color: vMatch ? "#34c759" : "#86868b" }}>{vMatch ? "Found" : "Not found"}</div>
                <div style={{ fontSize: 14, color: "#86868b", marginTop: 4 }}>{vMatch ? "This file has a proof on the ledger" : "No proof exists for this file"}</div>
              </div>
            )}

            {vProof && (
              <div style={{ padding: "16px 0", borderTop: "1px solid #f5f5f7" }}>
                {[["Counter", `#${vProof.commit.counter}`], ["Enforcement", vProof.environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"], ...(vProof.attribution?.name ? [["Author", vProof.attribution.name]] : [])].map(([k, v], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14 }}>
                    <span style={{ color: "#86868b" }}>{k}</span><span style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={resetV} style={{ ...linkBtn, marginTop: 16 }}>Done</button>
          </div>
        )}

      </div>{/* end left */}

      {/* ── Ledger ── */}
      <div className="occ-right">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#86868b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Proof Ledger</span>
          <span style={{ fontSize: 12, color: "#86868b" }}>{total.toLocaleString()}</span>
        </div>

        {ledger.length > 0 && (
          <div>
            {ledger.map((e, i) => {
              const c = e.counter || String(e.globalId);
              const isEth = e.attribution?.startsWith("Ethereum");
              return (
                <a key={e.digest + i} href={`/proof/${encodeURIComponent(toUrlSafeB64(e.digest))}`}
                  style={{ display: "flex", alignItems: "center", padding: "14px 0", borderTop: i > 0 ? "1px solid #f5f5f7" : "none", textDecoration: "none", color: "inherit" }}
                >
                  <span style={{ width: 48, fontSize: 17, fontWeight: 600, color: "#0071e3", fontFamily: mono }}>{c}</span>
                  <div style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: isEth ? 400 : 600, color: "#1d1d1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.attribution || "Proof"}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: mono, color: "#86868b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.digest.slice(0, 28)}...
                    </div>
                  </div>
                  {isEth && <span style={{ fontSize: 10, fontWeight: 600, color: "#0071e3", background: "rgba(0,113,227,0.06)", padding: "3px 8px", borderRadius: 4, marginLeft: 8 }}>ETH</span>}
                  <svg width="7" height="12" viewBox="0 0 7 12" fill="none" stroke="#86868b" strokeWidth="1.5" strokeLinecap="round" style={{ marginLeft: 12, flexShrink: 0 }}>
                    <path d="M1 1l5 5-5 5" />
                  </svg>
                </a>
              );
            })}
          </div>
        )}

        {total > 15 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 20 }}>
            <button onClick={() => fetchL(page - 1)} disabled={page <= 1} style={{ ...linkBtn, opacity: page <= 1 ? 0.3 : 1 }}>Previous</button>
            <span style={{ fontSize: 14, color: "#86868b" }}>{page} of {Math.ceil(total / 15)}</span>
            <button onClick={() => fetchL(page + 1)} disabled={page >= Math.ceil(total / 15)} style={{ ...linkBtn, opacity: page >= Math.ceil(total / 15) ? 0.3 : 1 }}>Next</button>
          </div>
        )}
      </div>

      </div>{/* end wrap */}
    </div>
  );
}

const linkBtn: React.CSSProperties = { fontSize: 14, fontWeight: 400, color: "#0071e3", background: "none", border: "none", cursor: "pointer", padding: 0 };
const pillBtn: React.CSSProperties = { flex: 1, height: 44, fontSize: 14, fontWeight: 400, borderRadius: 980, border: "none", cursor: "pointer", background: "#f5f5f7", color: "#1d1d1f" };

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  hashFile,
  commitDigest,
  commitBatch,
  formatFileSize,
  isOCCProof,
  verifyProofSignature,
  type OCCProof,
  type AgencyEnvelope,
  type ActorIdentity,
  type ProofVerifyResult,
} from "@/lib/occ";
import { toUrlSafeB64, relativeTime } from "@/lib/explorer";
import { zipSync } from "fflate";

type Mode = "create" | "verify";
type CreateStep = "drop" | "hashing" | "signing" | "done" | "error";
type VerifyStep = "drop" | "checking" | "result";

interface ProofEntry {
  globalId: number; digest: string; counter?: string;
  enforcement: string; time?: number; attribution?: string; signer: string;
}

function buildVerifyTxt(filename: string, p: OCCProof): string {
  return `VERIFY.txt — OCC Proof Package\n===================================\n\nFILE:       ${filename}\nDIGEST:     ${p.artifact.digestB64}\nALGORITHM:  ${p.artifact.hashAlg.toUpperCase()}\nCOUNTER:    #${p.commit.counter ?? "—"}\nENFORCEMENT: ${p.environment?.enforcement === "measured-tee" ? "Hardware Enclave (AWS Nitro)" : "Software"}\nSIGNER:     ${p.signer.publicKeyB64}\n\nLearn more: https://occ.wtf/docs\n`;
}

async function createBiometricAuthorization(digestB64: string): Promise<AgencyEnvelope | undefined> {
  if (!window.PublicKeyCredential) return undefined;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = await navigator.credentials.get({
      publicKey: { challenge, timeout: 60000, userVerification: "required", rpId: window.location.hostname, allowCredentials: [] },
    }) as PublicKeyCredential | null;
    if (!credential) return undefined;
    const response = credential.response as AuthenticatorAssertionResponse;
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(response.signature)));
    const authDataB64 = btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData)));
    const clientDataJSON = new TextDecoder().decode(response.clientDataJSON);
    const challengeB64 = btoa(String.fromCharCode(...challenge));
    return {
      actor: { keyId: credential.id, publicKeyB64: "", algorithm: "ES256", provider: "webauthn" } as ActorIdentity,
      authorization: {
        format: "webauthn.get", purpose: "occ/commit-authorize/v1", actorKeyId: credential.id,
        artifactHash: digestB64, challenge: challengeB64, timestamp: Date.now(),
        signatureB64: sigB64, clientDataJSON, authenticatorDataB64: authDataB64,
      },
    };
  } catch { return undefined; }
}

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
  const [useBiometrics, setUseBiometrics] = useState(false);
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
      setLedgerTotal(data.total || 0);
      setLedgerPage(page);
    } catch {}
  }, []);

  useEffect(() => { fetchLedger(1); const i = setInterval(() => fetchLedger(1), 15000); return () => clearInterval(i); }, [fetchLedger]);

  function handleFiles(files: File[]) {
    if (mode === "create") handleCreateFiles(files);
    else if (files.length === 1) handleVerifyFile(files[0]);
  }

  async function handleCreateFiles(files: File[]) {
    setCreateFiles(files); setCreateStep("hashing"); setCreateError("");
    try {
      if (files.length === 1) {
        const d = await hashFile(files[0]); setCreateDigest(d); setCreateStep("signing");
        let agency: AgencyEnvelope | undefined;
        if (useBiometrics) agency = await createBiometricAuthorization(d);
        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;
        const p = await commitDigest(d, undefined, agency, attr);
        setCreateProofs([p]); setCreateStep("done");
        setTimeout(() => fetchLedger(1), 1500);
      } else {
        const digests: Array<{ digestB64: string; hashAlg: "sha256" }> = [];
        for (let i = 0; i < files.length; i++) {
          setCreateProgress({ current: i + 1, total: files.length, fileName: files[i].name });
          digests.push({ digestB64: await hashFile(files[i]), hashAlg: "sha256" });
        }
        setCreateDigest(digests[0].digestB64); setCreateStep("signing");
        let agency: AgencyEnvelope | undefined;
        if (useBiometrics) agency = await createBiometricAuthorization(digests[0].digestB64);
        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;
        const proofs = await commitBatch(digests, undefined, agency, attr);
        setCreateProofs(proofs); setCreateStep("done");
        setTimeout(() => fetchLedger(1), 1500);
      }
    } catch (err) { setCreateError(err instanceof Error ? err.message : "Something went wrong"); setCreateStep("error"); }
  }

  async function handleVerifyFile(f: File) {
    setVerifyFile(f); setVerifyStep("checking"); setFileDigestMatch(null); setVerifyResult(null); setVerifyProof(null);
    try {
      const text = await f.text(); const proof = isOCCProof(text);
      if (proof) { setVerifyProof(proof); setVerifyResult(await verifyProofSignature(proof)); setVerifyStep("result"); }
      else {
        const d = await hashFile(f);
        const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(d))}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.proofs?.length > 0) {
            const p = data.proofs[0].proof as OCCProof;
            setVerifyProof(p); setFileDigestMatch(true); setVerifyResult(await verifyProofSignature(p));
          } else setFileDigestMatch(false);
        } else setFileDigestMatch(false);
        setVerifyStep("result");
      }
    } catch { setVerifyStep("result"); setFileDigestMatch(false); }
  }

  function resetCreate() { setCreateFiles([]); setCreateStep("drop"); setCreateDigest(""); setCreateProofs([]); setCreateError(""); }
  function resetVerify() { setVerifyFile(null); setVerifyStep("drop"); setVerifyProof(null); setVerifyResult(null); setFileDigestMatch(null); }

  function copyProof() {
    navigator.clipboard.writeText(createProofs.length === 1 ? JSON.stringify(createProofs[0], null, 2) : JSON.stringify(createProofs, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function downloadZip() {
    if (!createProofs.length || !createFiles.length) return;
    const z: Record<string, Uint8Array> = {};
    for (let i = 0; i < createFiles.length; i++) {
      const f = createFiles[i], p = createProofs[i] || createProofs[0];
      z[f.name] = new Uint8Array(await f.arrayBuffer());
      z[createFiles.length > 1 ? `proof-${i+1}.json` : "proof.json"] = new TextEncoder().encode(JSON.stringify(p, null, 2));
      if (i === 0) z["VERIFY.txt"] = new TextEncoder().encode(buildVerifyTxt(f.name, p));
    }
    const blob = new Blob([zipSync(z).buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = createFiles.length === 1 ? `${createFiles[0].name.replace(/\.[^.]+$/, "")}-occ-proof.zip` : "occ-proof-batch.zip";
    a.click(); URL.revokeObjectURL(url);
  }

  const showDrop = (mode === "create" && createStep === "drop") || (mode === "verify" && verifyStep === "drop");
  const mono = "'SF Mono', SFMono-Regular, 'JetBrains Mono', monospace";

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        .occ-layout { display: flex; flex-direction: column; max-width: 500px; margin: 0 auto; padding: 0 20px 80px; }
        .occ-header { max-width: 500px; }
        .occ-main { }
        .occ-ledger-section { margin-top: 40px; }
        @media (min-width: 900px) {
          .occ-layout { max-width: 1100px; flex-direction: row; gap: 40px; align-items: flex-start; }
          .occ-header { max-width: 1100px; }
          .occ-main { flex: 1; min-width: 0; max-width: 500px; }
          .occ-ledger-section { flex: 1; min-width: 0; margin-top: 0; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="occ-header" style={{ padding: "20px 20px 0", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>OCC</span>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="/docs" style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", textDecoration: "none", fontWeight: 500 }}>Docs</a>
            <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", textDecoration: "none", fontWeight: 500 }}>GitHub</a>
          </div>
        </div>
      </div>

      <div className="occ-layout">
      <div className="occ-main">

        {/* ── Segmented Control (iOS style) ── */}
        <div style={{
          display: "flex", padding: 3, borderRadius: 9, marginBottom: 28,
          background: "rgba(120,120,128,0.24)",
        }}>
          {(["create", "verify"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); if (m === "create") resetCreate(); else resetVerify(); }} style={{
              flex: 1, height: 32, fontSize: 13, fontWeight: 600,
              border: "none", cursor: "pointer", borderRadius: 7,
              background: mode === m ? "rgba(255,255,255,0.18)" : "transparent",
              color: mode === m ? "#fff" : "rgba(255,255,255,0.5)",
              transition: "all 0.15s ease", letterSpacing: "-0.01em",
            }}>
              {m === "create" ? "Create" : "Verify"}
            </button>
          ))}
        </div>

        {/* ── Drop Zone ── */}
        {showDrop && (
          <div style={{ animation: "fadeUp 0.25s ease-out" }}>
            <input ref={fileInputRef} type="file" multiple={mode === "create"} accept="*/*"
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", top: -9999 }}
              onChange={(e) => { if (!e.target.files?.length) return; handleFiles(Array.from(e.target.files)); e.target.value = ""; }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => { e.preventDefault(); setDragover(false); const f = Array.from(e.dataTransfer.files); if (f.length) handleFiles(f); }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                borderRadius: 20, padding: "52px 24px", textAlign: "center", cursor: "pointer",
                background: dragover ? "rgba(52,211,153,0.08)" : "rgba(120,120,128,0.12)",
                transition: "all 0.2s ease", marginBottom: 12,
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: 16, margin: "0 auto 20px",
                background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={dragover ? "#34d399" : "rgba(255,255,255,0.5)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v12M7 10l5-5 5 5" /><path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
                </svg>
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>
                {mode === "create" ? "Drop files to prove" : "Drop file to verify"}
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
                {mode === "create" ? "Hashed locally, signed in hardware enclave" : "Check a proof.json or find a file on the ledger"}
              </div>
            </div>

            {mode === "create" && (
              <Group>
                <Row>
                  <input type="text" value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="Author"
                    style={{ width: "100%", height: 22, fontSize: 15, background: "transparent", border: "none", color: "#fff", outline: "none" }} />
                </Row>
                <Row last>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", cursor: "pointer" }}>
                    <span style={{ fontSize: 15, color: "#fff" }}>Biometric authorship</span>
                    <input type="checkbox" checked={useBiometrics} onChange={(e) => setUseBiometrics(e.target.checked)}
                      style={{ width: 20, height: 20, accentColor: "#34d399" }} />
                  </label>
                </Row>
              </Group>
            )}
          </div>
        )}

        {/* ── Create: Processing ── */}
        {mode === "create" && (createStep === "hashing" || createStep === "signing") && (
          <div style={{ textAlign: "center", padding: "64px 0", animation: "fadeUp 0.25s ease-out" }}>
            <div style={{ width: 28, height: 28, border: "2.5px solid rgba(255,255,255,0.1)", borderTopColor: "#34d399", borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" }} />
            <div style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 20 }}>
              {createStep === "hashing"
                ? (createFiles.length > 1 ? `Hashing ${createProgress.current}/${createProgress.total}` : "Hashing")
                : "Signing"}
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
              {createStep === "signing" ? "Hardware enclave" : ""}
            </div>
          </div>
        )}

        {mode === "create" && createStep === "error" && (
          <div style={{ textAlign: "center", padding: "48px 0", animation: "fadeUp 0.25s ease-out" }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#ff453a", marginBottom: 24 }}>{createError}</div>
            <ActionBtn onClick={resetCreate}>Try again</ActionBtn>
          </div>
        )}

        {/* ── Create: Done ── */}
        {mode === "create" && createStep === "done" && createProofs.length > 0 && (
          <div style={{ animation: "fadeUp 0.3s ease-out" }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(48,209,88,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
                {createProofs.length === 1 ? "Proved" : `${createProofs.length} Proved`}
              </div>
              <div style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                #{createProofs[0].commit.counter}
              </div>
            </div>

            <Group>
              {createFiles.map((f, i) => (
                <Row key={f.name + i} last={i === createFiles.length - 1}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{f.name}</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{formatFileSize(f.size)}</div>
                  </div>
                  <div style={{ fontSize: 12, fontFamily: mono, color: "#34d399", textAlign: "right", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {createProofs[i]?.artifact.digestB64.slice(0, 16)}...
                  </div>
                </Row>
              ))}
            </Group>

            <Group>
              <Row last>
                <div style={{ width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Proof</span>
                    <button onClick={copyProof} style={{ fontSize: 13, fontWeight: 500, color: copied ? "#30d158" : "#0A84FF", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre style={{ fontSize: 11, fontFamily: mono, lineHeight: 1.5, color: "#34d399", background: "rgba(0,0,0,0.3)", padding: 12, borderRadius: 10, overflow: "auto", maxHeight: 240, margin: 0 }}>
                    {createProofs.length === 1 ? JSON.stringify(createProofs[0], null, 2) : JSON.stringify(createProofs, null, 2)}
                  </pre>
                </div>
              </Row>
            </Group>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <ActionBtn fill onClick={downloadZip}>Download</ActionBtn>
              <ActionBtn onClick={resetCreate}>New</ActionBtn>
            </div>
          </div>
        )}

        {/* ── Verify: Processing ── */}
        {mode === "verify" && verifyStep === "checking" && (
          <div style={{ textAlign: "center", padding: "64px 0", animation: "fadeUp 0.25s ease-out" }}>
            <div style={{ width: 28, height: 28, border: "2.5px solid rgba(255,255,255,0.1)", borderTopColor: "#0A84FF", borderRadius: "50%", margin: "0 auto", animation: "spin 0.7s linear infinite" }} />
            <div style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 20 }}>Checking</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>{verifyFile?.name}</div>
          </div>
        )}

        {/* ── Verify: Result ── */}
        {mode === "verify" && verifyStep === "result" && (
          <div style={{ animation: "fadeUp 0.3s ease-out" }}>
            {verifyResult && (
              <>
                <div style={{ textAlign: "center", marginBottom: 28 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
                    background: verifyResult.valid ? "rgba(48,209,88,0.15)" : "rgba(255,69,58,0.15)",
                  }}>
                    {verifyResult.valid
                      ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                      : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    }
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
                    {verifyResult.valid ? "Valid" : "Invalid"}
                  </div>
                </div>
                <Group>
                  {verifyResult.checks.map((c, i) => (
                    <Row key={i} last={i === verifyResult.checks.length - 1}>
                      <span style={{ fontSize: 15 }}>{c.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: c.status === "pass" ? "#30d158" : c.status === "fail" ? "#ff453a" : "rgba(255,255,255,0.3)" }}>
                        {c.status === "pass" ? "Pass" : c.status === "fail" ? "Fail" : "—"}
                      </span>
                    </Row>
                  ))}
                </Group>
              </>
            )}

            {fileDigestMatch !== null && !verifyProof && (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: fileDigestMatch ? "#30d158" : "rgba(255,255,255,0.5)" }}>
                  {fileDigestMatch ? "Found" : "Not found"}
                </div>
                <div style={{ fontSize: 15, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                  {fileDigestMatch ? "This file has a proof on the ledger" : "No proof exists for this file"}
                </div>
              </div>
            )}

            {verifyProof && (
              <Group>
                <Row><span style={{ color: "rgba(255,255,255,0.5)" }}>Counter</span><span style={{ fontFamily: mono }}>#{verifyProof.commit.counter}</span></Row>
                <Row><span style={{ color: "rgba(255,255,255,0.5)" }}>Enforcement</span><span>{verifyProof.environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"}</span></Row>
                {verifyProof.attribution?.name && <Row><span style={{ color: "rgba(255,255,255,0.5)" }}>Author</span><span>{verifyProof.attribution.name}</span></Row>}
                <Row last>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Digest</span>
                  <span style={{ fontFamily: mono, fontSize: 12, color: "#34d399", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{verifyProof.artifact.digestB64}</span>
                </Row>
              </Group>
            )}

            <ActionBtn onClick={resetVerify} style={{ width: "100%", marginTop: 4 }}>Done</ActionBtn>
          </div>
        )}

      </div>{/* end occ-main */}

        {/* ── Proof Ledger ── */}
        <div className="occ-ledger-section">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, padding: "0 4px" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Proof Ledger</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>{ledgerTotal.toLocaleString()}</span>
          </div>

          {ledger.length > 0 && (
            <Group>
              {ledger.map((entry, i) => (
                <LedgerItem key={entry.digest + i} entry={entry} last={i === ledger.length - 1} mono={mono} />
              ))}
            </Group>
          )}

          {ledgerTotal > 15 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 16 }}>
              <button onClick={() => fetchLedger(ledgerPage - 1)} disabled={ledgerPage <= 1}
                style={{ fontSize: 15, fontWeight: 500, color: ledgerPage <= 1 ? "rgba(255,255,255,0.15)" : "#0A84FF", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
                Previous
              </button>
              <span style={{ fontSize: 15, color: "rgba(255,255,255,0.25)", lineHeight: "28px" }}>{ledgerPage} of {Math.ceil(ledgerTotal / 15)}</span>
              <button onClick={() => fetchLedger(ledgerPage + 1)} disabled={ledgerPage >= Math.ceil(ledgerTotal / 15)}
                style={{ fontSize: 15, fontWeight: 500, color: ledgerPage >= Math.ceil(ledgerTotal / 15) ? "rgba(255,255,255,0.15)" : "#0A84FF", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ UI Primitives ═══ */

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(120,120,128,0.12)", borderRadius: 14, marginBottom: 12, overflow: "hidden" }}>
      {children}
    </div>
  );
}

function Row({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 18px", fontSize: 15,
      borderBottom: last ? "none" : "1px solid rgba(120,120,128,0.2)",
    }}>
      {children}
    </div>
  );
}

function ActionBtn({ children, onClick, fill, style }: { children: React.ReactNode; onClick?: () => void; fill?: boolean; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{
      height: 50, fontSize: 17, fontWeight: 600, borderRadius: 14,
      border: "none", cursor: "pointer", flex: 1, letterSpacing: "-0.01em",
      background: fill ? "#fff" : "rgba(120,120,128,0.24)",
      color: fill ? "#000" : "#fff",
      transition: "all 0.15s", ...style,
    }}>
      {children}
    </button>
  );
}

function LedgerItem({ entry, last, mono }: { entry: ProofEntry; last: boolean; mono: string }) {
  const [expanded, setExpanded] = useState(false);
  const [proof, setProof] = useState<OCCProof | null>(null);

  async function toggle() {
    if (!expanded && !proof && entry.digest !== "—") {
      try {
        const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(entry.digest))}`);
        if (resp.ok) { const d = await resp.json(); if (d.proofs?.[0]?.proof) setProof(d.proofs[0].proof as OCCProof); }
      } catch {}
    }
    setExpanded(e => !e);
  }

  const counter = entry.counter || String(entry.globalId);
  const isEth = entry.attribution?.startsWith("Ethereum");

  return (
    <div style={{ borderBottom: last ? "none" : "1px solid rgba(120,120,128,0.2)" }}>
      <div onClick={toggle} style={{ display: "flex", alignItems: "center", padding: "13px 18px", cursor: "pointer" }}>
        <span style={{ width: 40, fontSize: 15, fontWeight: 700, color: "#0A84FF", fontFamily: mono }}>{counter}</span>
        <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.attribution || "Proof"}
          </div>
          <div style={{ fontSize: 12, fontFamily: mono, color: "rgba(255,255,255,0.25)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.digest.slice(0, 28)}...
          </div>
        </div>
        {isEth && <span style={{ fontSize: 11, fontWeight: 600, color: "#0A84FF", background: "rgba(10,132,255,0.12)", padding: "3px 8px", borderRadius: 6, marginLeft: 8, flexShrink: 0 }}>ETH</span>}
        <svg width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 10, flexShrink: 0, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M1 1l5 5.5L1 12" />
        </svg>
      </div>
      {expanded && proof && (
        <div style={{ padding: "0 18px 14px" }}>
          <pre onClick={() => navigator.clipboard.writeText(JSON.stringify(proof, null, 2))} style={{
            fontSize: 11, fontFamily: mono, lineHeight: 1.5, color: "#34d399",
            background: "rgba(0,0,0,0.25)", padding: 14, borderRadius: 10, overflow: "auto", maxHeight: 260, margin: 0, cursor: "pointer",
          }}>
            {JSON.stringify(proof, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

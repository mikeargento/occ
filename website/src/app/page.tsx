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

/* ── Types ── */

type Mode = "create" | "verify";
type CreateStep = "drop" | "hashing" | "signing" | "done" | "error";
type VerifyStep = "drop" | "checking" | "result";

interface ProofEntry {
  globalId: number;
  digest: string;
  counter?: string;
  enforcement: string;
  time?: number;
  attribution?: string;
  signer: string;
}

/* ── VERIFY.txt builder ── */

function buildVerifyTxt(filename: string, p: OCCProof): string {
  return `VERIFY.txt — OCC Proof Package
===================================

FILE:       ${filename}
DIGEST:     ${p.artifact.digestB64}
ALGORITHM:  ${p.artifact.hashAlg.toUpperCase()}
COUNTER:    #${p.commit.counter ?? "—"}
ENFORCEMENT: ${p.environment?.enforcement === "measured-tee" ? "Hardware Enclave (AWS Nitro)" : "Software"}
SIGNER:     ${p.signer.publicKeyB64}

HOW TO VERIFY
-------------
1. Compute SHA-256 of the original file
2. Base64-encode the result (standard, not URL-safe)
3. Compare to the DIGEST above
4. If they match, proof.json covers this exact file

The proof was signed inside an AWS Nitro Enclave using Ed25519.
The private key was generated inside the enclave and has never left it.

Learn more: https://occ.wtf/docs
`;
}

/* ── WebAuthn / Biometric helpers ── */

async function createBiometricAuthorization(digestB64: string): Promise<AgencyEnvelope | undefined> {
  if (!window.PublicKeyCredential) return undefined;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge, timeout: 60000, userVerification: "required",
        rpId: window.location.hostname, allowCredentials: [],
      },
    }) as PublicKeyCredential | null;
    if (!credential) return undefined;
    const response = credential.response as AuthenticatorAssertionResponse;
    const sigBytes = new Uint8Array(response.signature);
    const sigB64 = btoa(String.fromCharCode(...sigBytes));
    const authData = new Uint8Array(response.authenticatorData);
    const authDataB64 = btoa(String.fromCharCode(...authData));
    const clientDataJSON = new TextDecoder().decode(response.clientDataJSON);
    const challengeB64 = btoa(String.fromCharCode(...challenge));
    const actor: ActorIdentity = {
      keyId: credential.id, publicKeyB64: "", algorithm: "ES256", provider: "webauthn",
    };
    return {
      actor,
      authorization: {
        format: "webauthn.get", purpose: "occ/commit-authorize/v1",
        actorKeyId: credential.id, artifactHash: digestB64,
        challenge: challengeB64, timestamp: Date.now(),
        signatureB64: sigB64, clientDataJSON, authenticatorDataB64: authDataB64,
      },
    };
  } catch { return undefined; }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Main Page                                                                */
/* ══════════════════════════════════════════════════════════════════════════ */

export default function OCCPage() {
  const [mode, setMode] = useState<Mode>("create");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create state
  const [createStep, setCreateStep] = useState<CreateStep>("drop");
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createDigest, setCreateDigest] = useState("");
  const [createProofs, setCreateProofs] = useState<OCCProof[]>([]);
  const [createError, setCreateError] = useState("");
  const [createProgress, setCreateProgress] = useState({ current: 0, total: 0, fileName: "" });
  const [copied, setCopied] = useState(false);
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [attribution, setAttribution] = useState("");

  // Verify state
  const [verifyStep, setVerifyStep] = useState<VerifyStep>("drop");
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyProof, setVerifyProof] = useState<OCCProof | null>(null);
  const [verifyResult, setVerifyResult] = useState<ProofVerifyResult | null>(null);
  const [fileDigestMatch, setFileDigestMatch] = useState<boolean | null>(null);

  // Ledger
  const [ledger, setLedger] = useState<ProofEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);

  // Drag state
  const [dragover, setDragover] = useState(false);

  const fetchLedger = useCallback(async (page: number) => {
    try {
      const resp = await fetch(`/api/proofs?page=${page}&limit=15`);
      if (!resp.ok) return;
      const data = await resp.json();
      const entries: ProofEntry[] = (data.proofs || []).map((p: Record<string, unknown>) => ({
        globalId: (p.id as number) || 0,
        digest: (p.digestB64 as string) || "—",
        counter: (p.counter as string) || undefined,
        enforcement: (p.enforcement as string) === "measured-tee" ? "Hardware Enclave" : "Software",
        time: p.commitTime ? Number(p.commitTime) : undefined,
        attribution: (p.attrName as string) || undefined,
        signer: ((p.signerPub as string) || "").slice(0, 12) || "—",
      }));
      setLedger(entries);
      setLedgerTotal(data.total || 0);
      setLedgerPage(page);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchLedger(1);
    const interval = setInterval(() => fetchLedger(1), 15000);
    return () => clearInterval(interval);
  }, [fetchLedger]);

  /* ── File handlers ── */

  function handleFiles(files: File[]) {
    if (mode === "create") handleCreateFiles(files);
    else if (files.length === 1) handleVerifyFile(files[0]);
  }

  async function handleCreateFiles(files: File[]) {
    setCreateFiles(files);
    setCreateStep("hashing");
    setCreateError("");
    try {
      if (files.length === 1) {
        const d = await hashFile(files[0]);
        setCreateDigest(d);
        setCreateStep("signing");
        let agency: AgencyEnvelope | undefined;
        if (useBiometrics) agency = await createBiometricAuthorization(d);
        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;
        const p = await commitDigest(d, undefined, agency, attr);
        setCreateProofs([p]);
        setCreateStep("done");
        setTimeout(() => fetchLedger(1), 1500);
      } else {
        const digests: Array<{ digestB64: string; hashAlg: "sha256" }> = [];
        for (let i = 0; i < files.length; i++) {
          setCreateProgress({ current: i + 1, total: files.length, fileName: files[i].name });
          const d = await hashFile(files[i]);
          digests.push({ digestB64: d, hashAlg: "sha256" });
        }
        setCreateDigest(digests[0].digestB64);
        setCreateStep("signing");
        let agency: AgencyEnvelope | undefined;
        if (useBiometrics) agency = await createBiometricAuthorization(digests[0].digestB64);
        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;
        const proofs = await commitBatch(digests, undefined, agency, attr);
        setCreateProofs(proofs);
        setCreateStep("done");
        setTimeout(() => fetchLedger(1), 1500);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Something went wrong");
      setCreateStep("error");
    }
  }

  async function handleVerifyFile(f: File) {
    setVerifyFile(f);
    setVerifyStep("checking");
    setFileDigestMatch(null);
    setVerifyResult(null);
    setVerifyProof(null);
    try {
      const text = await f.text();
      const proof = isOCCProof(text);
      if (proof) {
        setVerifyProof(proof);
        const result = await verifyProofSignature(proof);
        setVerifyResult(result);
        setVerifyStep("result");
      } else {
        const d = await hashFile(f);
        const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(d))}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.proofs?.length > 0) {
            const p = data.proofs[0].proof as OCCProof;
            setVerifyProof(p);
            setFileDigestMatch(true);
            const result = await verifyProofSignature(p);
            setVerifyResult(result);
          } else setFileDigestMatch(false);
        } else setFileDigestMatch(false);
        setVerifyStep("result");
      }
    } catch {
      setVerifyStep("result");
      setFileDigestMatch(false);
    }
  }

  function resetCreate() {
    setCreateFiles([]); setCreateStep("drop"); setCreateDigest(""); setCreateProofs([]); setCreateError("");
  }
  function resetVerify() {
    setVerifyFile(null); setVerifyStep("drop"); setVerifyProof(null); setVerifyResult(null); setFileDigestMatch(null);
  }

  function copyProof() {
    const json = createProofs.length === 1 ? JSON.stringify(createProofs[0], null, 2) : JSON.stringify(createProofs, null, 2);
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadZip() {
    if (!createProofs.length || !createFiles.length) return;
    const zipFiles: Record<string, Uint8Array> = {};
    for (let i = 0; i < createFiles.length; i++) {
      const f = createFiles[i];
      const p = createProofs[i] || createProofs[0];
      zipFiles[f.name] = new Uint8Array(await f.arrayBuffer());
      zipFiles[createFiles.length > 1 ? `proof-${i + 1}.json` : "proof.json"] = new TextEncoder().encode(JSON.stringify(p, null, 2));
      if (i === 0) zipFiles["VERIFY.txt"] = new TextEncoder().encode(buildVerifyTxt(f.name, p));
    }
    const zipped = zipSync(zipFiles);
    const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = createFiles.length === 1 ? `${createFiles[0].name.replace(/\.[^.]+$/, "")}-occ-proof.zip` : "occ-proof-batch.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  const showDrop = (mode === "create" && createStep === "drop") || (mode === "verify" && verifyStep === "drop");

  /* ── Render ── */

  return (
    <div style={{ minHeight: "100vh", background: "#000" }}>
      {/* Header */}
      <header style={{
        padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff" }}>OCC</span>
        <div style={{ display: "flex", gap: 20 }}>
          <a href="/docs" style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>Docs</a>
          <a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>GitHub</a>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px 80px" }}>

        {/* iOS Segmented Control */}
        <div style={{
          display: "flex", padding: 3, borderRadius: 10,
          background: "rgba(255,255,255,0.06)", marginBottom: 24,
        }}>
          {(["create", "verify"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); if (m === "create") resetCreate(); else resetVerify(); }} style={{
              flex: 1, height: 36, fontSize: 14, fontWeight: 500,
              border: "none", cursor: "pointer", borderRadius: 8,
              background: mode === m ? "rgba(255,255,255,0.12)" : "transparent",
              color: mode === m ? "#fff" : "rgba(255,255,255,0.45)",
              transition: "all 0.2s ease",
            }}>
              {m === "create" ? "Create" : "Verify"}
            </button>
          ))}
        </div>

        {/* Drop Zone */}
        {showDrop && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple={mode === "create"}
              accept="*/*"
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", top: -9999 }}
              onChange={(e) => {
                if (!e.target.files?.length) return;
                handleFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragover(false);
                const files = Array.from(e.dataTransfer.files);
                if (files.length) handleFiles(files);
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                borderRadius: 16, padding: "56px 24px", textAlign: "center", cursor: "pointer",
                border: dragover ? "2px solid rgba(52,211,153,0.6)" : "2px dashed rgba(255,255,255,0.12)",
                background: dragover ? "rgba(52,211,153,0.04)" : "rgba(255,255,255,0.02)",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 12, margin: "0 auto 16px",
                background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5">
                  <path d="M12 5v12M7 10l5-5 5 5" />
                  <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
                </svg>
              </div>
              <div style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                Drop {mode === "create" ? "file(s)" : "a file"} or <span style={{ color: "#34d399", fontWeight: 500 }}>browse</span>
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
                {mode === "create" ? "Hashed locally. Nothing uploaded." : "Drop proof.json to verify, or any file to check the ledger."}
              </div>
            </div>

            {mode === "create" && (
              <div style={{
                display: "flex", alignItems: "center", gap: 16, marginTop: 12, padding: "10px 14px",
                borderRadius: 12, background: "rgba(255,255,255,0.03)",
              }}>
                <input
                  type="text" value={attribution} onChange={(e) => setAttribution(e.target.value)}
                  placeholder="Author (optional)"
                  style={{
                    flex: 1, height: 32, padding: "0 10px", fontSize: 13, borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#fff", outline: "none",
                  }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.45)", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={useBiometrics} onChange={(e) => setUseBiometrics(e.target.checked)} style={{ accentColor: "#34d399" }} />
                  Biometric
                </label>
              </div>
            )}
          </>
        )}

        {/* Create: Processing */}
        {mode === "create" && createStep === "hashing" && (
          <Card><div style={{ textAlign: "center", padding: "32px 0" }}>
            <Spinner />
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 16 }}>
              Hashing {createFiles.length > 1 ? `${createProgress.current}/${createProgress.total}` : "file"}...
            </div>
          </div></Card>
        )}

        {mode === "create" && createStep === "signing" && (
          <Card><div style={{ textAlign: "center", padding: "32px 0" }}>
            <Spinner />
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 16 }}>Signing in hardware enclave...</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: "monospace", marginTop: 8 }}>{createDigest.slice(0, 32)}...</div>
          </div></Card>
        )}

        {mode === "create" && createStep === "error" && (
          <Card><div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 14, color: "#ff453a", marginBottom: 20 }}>{createError}</div>
            <Btn onClick={resetCreate}>Try again</Btn>
          </div></Card>
        )}

        {/* Create: Done */}
        {mode === "create" && createStep === "done" && createProofs.length > 0 && (
          <>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#30d158" }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
                  {createProofs.length === 1 ? "Proof created" : `${createProofs.length} proofs created`}
                </span>
              </div>
              {createFiles.map((f, i) => (
                <div key={f.name + i} style={{ marginBottom: i < createFiles.length - 1 ? 10 : 0 }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{f.name} · {formatFileSize(f.size)}</div>
                  <div style={{ fontSize: 12, fontFamily: "monospace", color: "#34d399", wordBreak: "break-all", lineHeight: 1.5 }}>
                    {createProofs[i]?.artifact.digestB64}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 14 }}>
                <span>#{createProofs[0].commit.counter}</span>
                <span>{createProofs[0].environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"}</span>
              </div>
            </Card>

            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Proof JSON</span>
                <Btn small onClick={copyProof}>{copied ? "Copied" : "Copy"}</Btn>
              </div>
              <pre style={{
                fontSize: 11, fontFamily: "monospace", lineHeight: 1.5, color: "#34d399",
                background: "rgba(0,0,0,0.4)", padding: 14, borderRadius: 10, overflow: "auto", maxHeight: 300,
              }}>
                {createProofs.length === 1 ? JSON.stringify(createProofs[0], null, 2) : JSON.stringify(createProofs, null, 2)}
              </pre>
            </Card>

            <div style={{ display: "flex", gap: 10 }}>
              <Btn fill onClick={downloadZip}>Download .zip</Btn>
              <Btn onClick={resetCreate}>New proof</Btn>
            </div>
          </>
        )}

        {/* Verify: Processing */}
        {mode === "verify" && verifyStep === "checking" && (
          <Card><div style={{ textAlign: "center", padding: "32px 0" }}>
            <Spinner />
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 16 }}>Checking {verifyFile?.name}...</div>
          </div></Card>
        )}

        {/* Verify: Result */}
        {mode === "verify" && verifyStep === "result" && (
          <>
            {verifyResult && (
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: verifyResult.valid ? "#30d158" : "#ff453a" }} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
                    {verifyResult.valid ? "Signature valid" : "Signature invalid"}
                  </span>
                </div>
                {verifyResult.checks.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, marginBottom: 5, color: "rgba(255,255,255,0.6)" }}>
                    <span style={{ color: c.status === "pass" ? "#30d158" : c.status === "fail" ? "#ff453a" : "rgba(255,255,255,0.3)", fontFamily: "monospace", fontSize: 12 }}>
                      {c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "—"}
                    </span>
                    <span>{c.label}</span>
                  </div>
                ))}
              </Card>
            )}

            {fileDigestMatch !== null && !verifyProof && (
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: fileDigestMatch ? "#30d158" : "rgba(255,255,255,0.2)" }} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
                    {fileDigestMatch ? "Found on ledger" : "No proof found"}
                  </span>
                </div>
              </Card>
            )}

            {verifyProof && (
              <Card>
                <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Proof</div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: "#34d399", wordBreak: "break-all", lineHeight: 1.5, marginBottom: 8 }}>
                  {verifyProof.artifact.digestB64}
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 12, color: "rgba(255,255,255,0.3)", flexWrap: "wrap" }}>
                  {verifyProof.commit.counter && <span>#{verifyProof.commit.counter}</span>}
                  <span>{verifyProof.environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"}</span>
                  {verifyProof.attribution?.name && <span>{verifyProof.attribution.name}</span>}
                </div>
              </Card>
            )}

            <Btn onClick={resetVerify} style={{ width: "100%" }}>Verify another</Btn>
          </>
        )}

        {/* ── Proof Ledger ── */}
        <div style={{ marginTop: 48 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>Proof Ledger</h2>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>{ledgerTotal.toLocaleString()}</span>
          </div>

          {ledger.length === 0 ? (
            <Card><div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "20px 0" }}>No proofs yet</div></Card>
          ) : (
            <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
              {ledger.map((entry, i) => (
                <LedgerRow key={entry.digest + i} entry={entry} isLast={i === ledger.length - 1} />
              ))}
            </div>
          )}

          {ledgerTotal > 15 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
              <Btn small onClick={() => fetchLedger(ledgerPage - 1)} style={{ opacity: ledgerPage <= 1 ? 0.3 : 1 }}>Prev</Btn>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: "32px" }}>
                {ledgerPage} / {Math.ceil(ledgerTotal / 15)}
              </span>
              <Btn small onClick={() => fetchLedger(ledgerPage + 1)} style={{ opacity: ledgerPage >= Math.ceil(ledgerTotal / 15) ? 0.3 : 1 }}>Next</Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Components                                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.06)", padding: "16px 18px", marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, fill, small, style }: {
  children: React.ReactNode; onClick?: () => void; fill?: boolean; small?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick} style={{
      height: small ? 32 : 44, fontSize: small ? 12 : 14, fontWeight: 500,
      padding: small ? "0 14px" : "0 20px", borderRadius: small ? 8 : 10,
      border: fill ? "none" : "1px solid rgba(255,255,255,0.12)",
      background: fill ? "#fff" : "transparent",
      color: fill ? "#000" : "rgba(255,255,255,0.7)",
      cursor: "pointer", flex: fill ? 1 : undefined, transition: "all 0.15s",
      ...style,
    }}>
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 24, height: 24, border: "2px solid rgba(255,255,255,0.1)",
      borderTopColor: "#34d399", borderRadius: "50%", margin: "0 auto",
      animation: "spin 0.8s linear infinite",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Ledger Row ── */

function LedgerRow({ entry, isLast }: { entry: ProofEntry; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [proof, setProof] = useState<OCCProof | null>(null);

  async function toggle() {
    if (!expanded && !proof && entry.digest !== "—") {
      try {
        const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(entry.digest))}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.proofs?.[0]?.proof) setProof(data.proofs[0].proof as OCCProof);
        }
      } catch { /* silent */ }
    }
    setExpanded(e => !e);
  }

  const counter = entry.counter || String(entry.globalId);
  const isEth = entry.attribution?.startsWith("Ethereum");
  const label = entry.attribution || "proof";

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
      <div onClick={toggle} style={{
        display: "flex", alignItems: "center", padding: "12px 16px",
        cursor: "pointer", transition: "background 0.1s",
      }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ width: 48, fontSize: 14, fontWeight: 600, color: "#0A84FF", fontFamily: "monospace" }}>
          {counter}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 4,
          background: isEth ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.04)",
          color: isEth ? "#60a5fa" : "rgba(255,255,255,0.45)",
          marginRight: 12, whiteSpace: "nowrap", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {label.length > 14 ? label.slice(0, 14) + "..." : label}
        </span>
        <span style={{ flex: 1, fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.digest.slice(0, 24)}...
        </span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", marginLeft: 12 }}>
          {entry.time ? relativeTime(entry.time) : ""}
        </span>
      </div>

      {expanded && proof && (
        <div style={{ padding: "8px 16px 16px", background: "rgba(255,255,255,0.01)" }}>
          <pre style={{
            fontSize: 11, fontFamily: "monospace", lineHeight: 1.5, color: "#34d399",
            background: "rgba(0,0,0,0.3)", padding: 14, borderRadius: 10, overflow: "auto", maxHeight: 300,
            cursor: "pointer",
          }} onClick={() => navigator.clipboard.writeText(JSON.stringify(proof, null, 2))}>
            {JSON.stringify(proof, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

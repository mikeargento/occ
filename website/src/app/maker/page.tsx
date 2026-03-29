"use client";

import { useState, useEffect, useCallback } from "react";
import { FileDrop } from "@/components/file-drop";
import { Nav } from "@/components/nav";
import {
  hashFile,
  hashBytes,
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

type Mode = "make" | "verify";
type MakeStep = "drop" | "hashing" | "signing" | "done" | "error";
type VerifyStep = "drop" | "checking" | "result";

interface ProofEntry {
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
TIME:       ${p.commit.time ? new Date(p.commit.time).toISOString() : "—"}
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
        challenge,
        timeout: 60000,
        userVerification: "required",
        rpId: window.location.hostname,
        allowCredentials: [],
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
      keyId: credential.id,
      publicKeyB64: "", // would need stored key
      algorithm: "ES256",
      provider: "webauthn",
    };

    return {
      actor,
      authorization: {
        format: "webauthn.get",
        purpose: "occ/commit-authorize/v1",
        actorKeyId: credential.id,
        artifactHash: digestB64,
        challenge: challengeB64,
        timestamp: Date.now(),
        signatureB64: sigB64,
        clientDataJSON,
        authenticatorDataB64: authDataB64,
      },
    };
  } catch {
    return undefined; // biometrics declined or unavailable
  }
}

/* ── Main Page ── */

export default function MakerPage() {
  const [mode, setMode] = useState<Mode>("make");

  // Make state
  const [makeStep, setMakeStep] = useState<MakeStep>("drop");
  const [makeFiles, setMakeFiles] = useState<File[]>([]);
  const [makeDigest, setMakeDigest] = useState("");
  const [makeProofs, setMakeProofs] = useState<OCCProof[]>([]);
  const [makeError, setMakeError] = useState("");
  const [copied, setCopied] = useState(false);
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [attribution, setAttribution] = useState("");

  // Verify state
  const [verifyStep, setVerifyStep] = useState<VerifyStep>("drop");
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyProof, setVerifyProof] = useState<OCCProof | null>(null);
  const [verifyResult, setVerifyResult] = useState<ProofVerifyResult | null>(null);
  const [fileDigestMatch, setFileDigestMatch] = useState<boolean | null>(null);

  // Public ledger
  const [ledger, setLedger] = useState<ProofEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);

  // Fetch public ledger
  const fetchLedger = useCallback(async (page: number) => {
    try {
      const resp = await fetch(`/api/proofs?page=${page}&limit=15`);
      if (!resp.ok) return;
      const data = await resp.json();
      const entries: ProofEntry[] = (data.proofs || []).map((p: Record<string, unknown>) => ({
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

  useEffect(() => { fetchLedger(1); }, [fetchLedger]);

  /* ── Make handlers ── */

  async function handleMakeFiles(files: File[]) {
    setMakeFiles(files);
    setMakeStep("hashing");
    setMakeError("");
    try {
      if (files.length === 1) {
        const f = files[0];
        const d = await hashFile(f);
        setMakeDigest(d);
        setMakeStep("signing");

        let agency: AgencyEnvelope | undefined;
        if (useBiometrics) {
          agency = await createBiometricAuthorization(d);
        }

        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;
        const p = await commitDigest(d, undefined, agency, attr);
        setMakeProofs([p]);
        setMakeStep("done");

        // Index in public ledger
        fetch("/api/proofs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proof: p }),
        }).then(() => fetchLedger(1)).catch(() => {});
      } else {
        // Batch mode
        const digests: Array<{ digestB64: string; hashAlg: "sha256" }> = [];
        for (const f of files) {
          const d = await hashFile(f);
          digests.push({ digestB64: d, hashAlg: "sha256" });
        }
        setMakeDigest(digests[0].digestB64);
        setMakeStep("signing");

        let agency: AgencyEnvelope | undefined;
        if (useBiometrics) {
          agency = await createBiometricAuthorization(digests[0].digestB64);
        }

        const attr = attribution.trim() ? { name: attribution.trim() } : undefined;
        const proofs = await commitBatch(digests, undefined, agency, attr);
        setMakeProofs(proofs);
        setMakeStep("done");

        // Index all in public ledger
        fetch("/api/proofs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proofs }),
        }).then(() => fetchLedger(1)).catch(() => {});
      }
    } catch (err) {
      setMakeError(err instanceof Error ? err.message : "Something went wrong");
      setMakeStep("error");
    }
  }

  function resetMake() {
    setMakeFiles([]);
    setMakeStep("drop");
    setMakeDigest("");
    setMakeProofs([]);
    setMakeError("");
  }

  function copyProof() {
    const json = makeProofs.length === 1
      ? JSON.stringify(makeProofs[0], null, 2)
      : JSON.stringify(makeProofs, null, 2);
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadZip() {
    if (!makeProofs.length || !makeFiles.length) return;
    const zipFiles: Record<string, Uint8Array> = {};

    for (let i = 0; i < makeFiles.length; i++) {
      const f = makeFiles[i];
      const p = makeProofs[i] || makeProofs[0];
      zipFiles[f.name] = new Uint8Array(await f.arrayBuffer());
      const proofName = makeFiles.length > 1 ? `proof-${i + 1}.json` : "proof.json";
      zipFiles[proofName] = new TextEncoder().encode(JSON.stringify(p, null, 2));
      if (i === 0) {
        zipFiles["VERIFY.txt"] = new TextEncoder().encode(buildVerifyTxt(f.name, p));
      }
    }

    const zipped = zipSync(zipFiles);
    const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = makeFiles.length === 1
      ? `${makeFiles[0].name.replace(/\.[^.]+$/, "")}-occ-proof.zip`
      : "occ-proof-batch.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Verify handlers ── */

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
        // User dropped a proof.json — verify the signature
        setVerifyProof(proof);
        const result = await verifyProofSignature(proof);
        setVerifyResult(result);
        setVerifyStep("result");
      } else {
        // User dropped a regular file — hash it and check against the ledger
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
          } else {
            setFileDigestMatch(false);
          }
        } else {
          setFileDigestMatch(false);
        }
        setVerifyStep("result");
      }
    } catch {
      setVerifyStep("result");
      setFileDigestMatch(false);
    }
  }

  function resetVerify() {
    setVerifyFile(null);
    setVerifyStep("drop");
    setVerifyProof(null);
    setVerifyResult(null);
    setFileDigestMatch(null);
  }

  /* ── Styles ── */

  const cardStyle: React.CSSProperties = {
    border: "1px solid var(--c-border-subtle)",
    padding: "32px 24px",
    background: "var(--bg-elevated)",
    marginBottom: 16,
  };

  const btnOutline: React.CSSProperties = {
    height: 48, fontSize: 15, fontWeight: 500,
    border: "1px solid var(--c-border)", borderRadius: 10,
    background: "transparent", color: "var(--c-text)", cursor: "pointer",
    flex: 1,
  };

  const btnSolid: React.CSSProperties = {
    ...btnOutline,
    border: "none", background: "var(--c-text)", color: "var(--bg)",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--c-text)" }}>
      <Nav />

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "60px 36px" }}>
        {/* Header */}
        <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 8 }}>
          Maker
        </h1>
        <p style={{ fontSize: 16, color: "var(--c-text-secondary)", marginBottom: 32, lineHeight: 1.5 }}>
          Create and verify cryptographic proofs signed inside a hardware enclave.
        </p>

        {/* Mode toggle */}
        <div style={{
          display: "flex", gap: 0, marginBottom: 32,
          border: "1px solid var(--c-border)", borderRadius: 10, overflow: "hidden",
        }}>
          {(["make", "verify"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, height: 44, fontSize: 14, fontWeight: 600,
              border: "none", cursor: "pointer",
              background: mode === m ? "var(--c-text)" : "transparent",
              color: mode === m ? "var(--bg)" : "var(--c-text-secondary)",
              textTransform: "capitalize", letterSpacing: "0.02em",
            }}>
              {m === "make" ? "Create proof" : "Verify proof"}
            </button>
          ))}
        </div>

        {/* ═══ MAKE MODE ═══ */}
        {mode === "make" && (
          <>
            {makeStep === "drop" && (
              <>
                <FileDrop
                  multiple
                  onFile={(f) => handleMakeFiles([f])}
                  onFiles={handleMakeFiles}
                  hint="Drop file(s). Hashed locally — nothing uploaded. Supports batch."
                />
                {/* Options below the drop zone */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 20, marginTop: 16,
                  padding: "12px 16px",
                  border: "1px solid var(--c-border-subtle)", background: "var(--bg-elevated)",
                }}>
                  <input
                    type="text"
                    value={attribution}
                    onChange={(e) => setAttribution(e.target.value)}
                    placeholder="Author name (optional)"
                    style={{
                      flex: 1, height: 32, padding: "0 10px",
                      fontSize: 13, border: "1px solid var(--c-border)", borderRadius: 6,
                      background: "transparent", color: "var(--c-text)",
                    }}
                  />
                  <label style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 13, color: "var(--c-text-secondary)", cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}>
                    <input
                      type="checkbox"
                      checked={useBiometrics}
                      onChange={(e) => setUseBiometrics(e.target.checked)}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    Biometric authorship
                  </label>
                </div>
              </>
            )}

            {makeStep === "hashing" && (
              <div style={{ ...cardStyle, textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 14, color: "var(--c-text-secondary)" }}>
                  Hashing {makeFiles.length} file{makeFiles.length !== 1 ? "s" : ""}...
                </div>
              </div>
            )}

            {makeStep === "signing" && (
              <div style={{ ...cardStyle, textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 14, color: "var(--c-text-secondary)", marginBottom: 8 }}>
                  Signing in hardware enclave...
                </div>
                <div style={{ fontSize: 12, color: "var(--c-text-tertiary)", fontFamily: "monospace" }}>
                  {makeDigest.slice(0, 32)}...
                </div>
              </div>
            )}

            {makeStep === "error" && (
              <div style={{ ...cardStyle, textAlign: "center", borderColor: "#ff453a" }}>
                <div style={{ fontSize: 14, color: "#ff453a", marginBottom: 16 }}>{makeError}</div>
                <button onClick={resetMake} style={btnOutline}>Try again</button>
              </div>
            )}

            {makeStep === "done" && makeProofs.length > 0 && (
              <div>
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ color: "#30d158", fontSize: 20 }}>●</span>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>
                      {makeProofs.length === 1 ? "Proof created" : `${makeProofs.length} proofs created`}
                    </span>
                  </div>
                  {makeFiles.map((f, i) => (
                    <div key={f.name + i} style={{ marginBottom: i < makeFiles.length - 1 ? 12 : 0 }}>
                      <div style={{ fontSize: 13, color: "var(--c-text-secondary)", marginBottom: 2 }}>
                        {f.name} · {formatFileSize(f.size)}
                      </div>
                      <div style={{
                        fontSize: 12, fontFamily: "monospace", color: "#30d158",
                        wordBreak: "break-all", lineHeight: 1.5,
                      }}>
                        {makeProofs[i]?.artifact.digestB64}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--c-text-tertiary)", marginTop: 16 }}>
                    <span>Counter #{makeProofs[0].commit.counter}</span>
                    <span>·</span>
                    <span>{makeProofs[0].environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"}</span>
                    <span>·</span>
                    <span>{makeProofs[0].commit.time ? new Date(makeProofs[0].commit.time).toLocaleString() : ""}</span>
                  </div>
                </div>

                {/* Proof JSON */}
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Proof JSON
                    </span>
                    <button onClick={copyProof} style={{
                      fontSize: 12, fontWeight: 500, padding: "4px 12px",
                      border: "1px solid var(--c-border)", borderRadius: 6,
                      background: "transparent", color: copied ? "#30d158" : "var(--c-text-secondary)", cursor: "pointer",
                    }}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre style={{
                    fontSize: 11, fontFamily: "monospace", lineHeight: 1.5,
                    color: "#30d158", background: "#0a0a0a",
                    padding: 16, borderRadius: 6, overflow: "auto", maxHeight: 400,
                  }}>
                    {makeProofs.length === 1
                      ? JSON.stringify(makeProofs[0], null, 2)
                      : JSON.stringify(makeProofs, null, 2)}
                  </pre>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={downloadZip} style={btnSolid}>Download .zip</button>
                  <button onClick={resetMake} style={btnOutline}>Create another</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ VERIFY MODE ═══ */}
        {mode === "verify" && (
          <>
            {verifyStep === "drop" && (
              <FileDrop
                onFile={handleVerifyFile}
                hint="Drop a proof.json to verify its signature, or drop any file to check if it has a proof on the ledger."
              />
            )}

            {verifyStep === "checking" && (
              <div style={{ ...cardStyle, textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 14, color: "var(--c-text-secondary)" }}>
                  Checking {verifyFile?.name}...
                </div>
              </div>
            )}

            {verifyStep === "result" && (
              <div>
                {/* Signature verification */}
                {verifyResult && (
                  <div style={cardStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <span style={{ color: verifyResult.valid ? "#30d158" : "#ff453a", fontSize: 20 }}>●</span>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>
                        {verifyResult.valid ? "Signature valid" : "Signature invalid"}
                      </span>
                    </div>
                    {verifyResult.checks.map((c, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "baseline", gap: 8,
                        fontSize: 13, marginBottom: 6, color: "var(--c-text-secondary)",
                      }}>
                        <span style={{
                          color: c.status === "pass" ? "#30d158" : c.status === "fail" ? "#ff453a" : "var(--c-text-tertiary)",
                          fontFamily: "monospace", fontSize: 12,
                        }}>
                          {c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "—"}
                        </span>
                        <span>{c.label}</span>
                        {c.detail && <span style={{ color: "var(--c-text-tertiary)", fontSize: 12 }}>{c.detail}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* File digest match */}
                {fileDigestMatch !== null && !verifyProof && (
                  <div style={cardStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: fileDigestMatch ? "#30d158" : "#ff6b35", fontSize: 20 }}>●</span>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>
                        {fileDigestMatch ? "File found on ledger" : "No proof found for this file"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Show the proof if found */}
                {verifyProof && (
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                      Proof details
                    </div>
                    <div style={{ fontSize: 12, fontFamily: "monospace", color: "#30d158", wordBreak: "break-all", lineHeight: 1.5, marginBottom: 8 }}>
                      {verifyProof.artifact.digestB64}
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--c-text-tertiary)", flexWrap: "wrap" }}>
                      {verifyProof.commit.counter && <span>Counter #{verifyProof.commit.counter}</span>}
                      <span>{verifyProof.environment?.enforcement === "measured-tee" ? "Hardware Enclave" : "Software"}</span>
                      {verifyProof.commit.time && <span>{new Date(verifyProof.commit.time).toLocaleString()}</span>}
                      {verifyProof.attribution?.name && <span>By: {verifyProof.attribution.name}</span>}
                    </div>
                  </div>
                )}

                <button onClick={resetVerify} style={{ ...btnOutline, width: "100%" }}>
                  Verify another
                </button>
              </div>
            )}
          </>
        )}

        {/* ═══ PUBLIC PROOF LEDGER ═══ */}
        <div style={{ marginTop: 64 }}>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            marginBottom: 16,
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Public proof ledger
            </h2>
            <span style={{ fontSize: 13, color: "var(--c-text-tertiary)" }}>
              {ledgerTotal.toLocaleString()} proofs
            </span>
          </div>

          {ledger.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center", color: "var(--c-text-tertiary)", fontSize: 14 }}>
              No proofs yet
            </div>
          ) : (
            <>
              <div style={{
                border: "1px solid var(--c-border-subtle)",
                background: "var(--bg-elevated)",
                overflow: "hidden",
              }}>
                {ledger.map((entry, i) => (
                  <LedgerRow key={entry.digest + i} entry={entry} isLast={i === ledger.length - 1} />
                ))}
              </div>

              {/* Pagination */}
              {ledgerTotal > 15 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 16 }}>
                  <button
                    onClick={() => fetchLedger(ledgerPage - 1)}
                    disabled={ledgerPage <= 1}
                    style={{
                      ...btnOutline, flex: "none", width: 80, height: 36, fontSize: 13,
                      opacity: ledgerPage <= 1 ? 0.3 : 1,
                    }}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: 13, color: "var(--c-text-tertiary)", lineHeight: "36px" }}>
                    Page {ledgerPage} of {Math.ceil(ledgerTotal / 15)}
                  </span>
                  <button
                    onClick={() => fetchLedger(ledgerPage + 1)}
                    disabled={ledgerPage >= Math.ceil(ledgerTotal / 15)}
                    style={{
                      ...btnOutline, flex: "none", width: 80, height: 36, fontSize: 13,
                      opacity: ledgerPage >= Math.ceil(ledgerTotal / 15) ? 0.3 : 1,
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Ledger Row — expandable, fetches full proof on first click
   ═══════════════════════════════════════════════════════════════════════════ */

function LedgerRow({ entry, isLast }: { entry: ProofEntry; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [proof, setProof] = useState<OCCProof | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!expanded && !proof && entry.digest !== "—") {
      setLoading(true);
      try {
        const resp = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(entry.digest))}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.proofs?.[0]?.proof) setProof(data.proofs[0].proof as OCCProof);
        }
      } catch { /* silent */ }
      setLoading(false);
    }
    setExpanded(e => !e);
  }

  const commit = proof?.commit;
  const signer = proof?.signer;
  const env = proof?.environment;
  const proofAny = proof as unknown as Record<string, unknown> | undefined;
  const policy = proofAny?.policy as Record<string, unknown> | undefined;
  const principal = proofAny?.principal as Record<string, unknown> | undefined;
  const timestamps = proof?.timestamps as Record<string, unknown> | undefined;

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--c-border-subtle)" }}>
      {/* Collapsed row */}
      <div onClick={toggle} style={{
        padding: "14px 20px", display: "flex", alignItems: "center", gap: 12,
        cursor: "pointer", transition: "background 0.15s",
      }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", flexShrink: 0, color: "var(--c-text-tertiary)" }}>
          <path d="M3 1.5L7 5L3 8.5" />
        </svg>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#30d158", flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 12, fontFamily: "monospace", color: "#30d158",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {entry.digest}
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--c-text-tertiary)", marginTop: 3, flexWrap: "wrap" }}>
            {entry.counter && <span>#{entry.counter}</span>}
            <span style={{
              padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: entry.enforcement === "Hardware Enclave" ? "rgba(59,130,246,0.15)" : "rgba(255,149,0,0.15)",
              color: entry.enforcement === "Hardware Enclave" ? "#3b82f6" : "#ff9500",
            }}>
              {entry.enforcement}
            </span>
            {entry.attribution && <span>{entry.attribution}</span>}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--c-text-tertiary)", whiteSpace: "nowrap" }}>
          {entry.time ? relativeTime(entry.time) : ""}
        </div>
      </div>

      {/* Expanded detail — matches dashboard explorer-expanded */}
      {expanded && (
        <div style={{
          padding: 24, background: "rgba(255,255,255,0.015)",
          borderTop: "1px solid var(--c-border-subtle)",
          animation: "slideDownFade 0.25s ease-out",
        }}>
          {/* Summary + Close — same as dashboard */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>
              <span style={{ color: "#30d158", fontWeight: 600 }}>Proof</span>
              {" "}{entry.digest.slice(0, 16)}...
              {entry.time ? ` at ${new Date(entry.time).toLocaleString()}` : ""}
            </div>
            <button onClick={(e) => { e.stopPropagation(); setExpanded(false); }} style={{
              width: 30, height: 30, borderRadius: 8,
              border: "1px solid #ff453a", background: "transparent",
              color: "#ff453a", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "all 0.2s", flexShrink: 0,
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#ff453a"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#ff453a"; }}
              title="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {loading && (
            <div style={{ fontSize: 13, color: "var(--c-text-tertiary)", padding: "8px 0" }}>Loading proof...</div>
          )}

          {proof && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>

                {/* Artifact */}
                <ProofSection title="Artifact">
                  <LedgerProofField label="Digest (SHA-256)" value={proof.artifact?.digestB64 || "—"} mono />
                  {proof.version ? <LedgerProofField label="Version" value={proof.version} last /> : null}
                </ProofSection>

                {/* Commit */}
                {commit && (
                  <ProofSection title="Commit">
                    {commit.time != null && <LedgerProofField label="Time" value={new Date(commit.time).toLocaleString()} />}
                    {commit.counter != null && <LedgerProofField label="Counter" value={`#${commit.counter}`} />}
                    {(commit as Record<string, unknown>).chainId ? <LedgerProofField label="Chain ID" value={String((commit as Record<string, unknown>).chainId)} mono /> : null}
                    {commit.epochId && <LedgerProofField label="Epoch ID" value={commit.epochId} mono />}
                    {commit.prevB64 && <LedgerProofField label="Previous Hash" value={commit.prevB64} mono />}
                    {commit.nonceB64 && <LedgerProofField label="Nonce" value={commit.nonceB64} mono />}
                    {commit.slotCounter && <LedgerProofField label="Slot Counter" value={`#${commit.slotCounter}`} />}
                    {commit.slotHashB64 && <LedgerProofField label="Slot Hash" value={commit.slotHashB64} mono />}
                  </ProofSection>
                )}

                {/* Signer */}
                {signer && (
                  <ProofSection title="Signer">
                    <LedgerProofField label="Public Key" value={signer.publicKeyB64} mono />
                    <LedgerProofField label="Signature" value={signer.signatureB64} mono />
                  </ProofSection>
                )}

                {/* Environment */}
                {env && (
                  <ProofSection title="Environment">
                    <LedgerProofField
                      label="Enforcement"
                      value={env.enforcement === "measured-tee" ? "Hardware Enclave (AWS Nitro)" : env.enforcement === "hw-key" ? "Hardware Key" : "Software"}
                      color={env.enforcement === "measured-tee" ? "#3b82f6" : undefined}
                    />
                    {env.measurement && <LedgerProofField label="Measurement" value={env.measurement} mono />}
                  </ProofSection>
                )}

                {/* Principal */}
                {principal && (
                  <ProofSection title="Principal">
                    {(principal as Record<string, unknown>).provider ? <LedgerProofField label="Provider" value={String((principal as Record<string, unknown>).provider)} /> : null}
                    {(principal as Record<string, unknown>).id ? <LedgerProofField label="ID" value={String((principal as Record<string, unknown>).id)} mono /> : null}
                  </ProofSection>
                )}

                {/* Policy */}
                {policy && (
                  <ProofSection title="Policy">
                    {policy.name ? <LedgerProofField label="Name" value={String(policy.name)} /> : null}
                    {policy.digestB64 ? <LedgerProofField label="Digest" value={String(policy.digestB64)} mono /> : null}
                  </ProofSection>
                )}

                {/* Timestamps */}
                {timestamps && (
                  <ProofSection title="Timestamps">
                    {(timestamps as Record<string, unknown>).artifact ? (
                      <>
                        {((timestamps as Record<string, unknown>).artifact as Record<string, unknown>)?.authority
                          ? <LedgerProofField label="Authority" value={String(((timestamps as Record<string, unknown>).artifact as Record<string, unknown>).authority)} />
                          : null}
                        {((timestamps as Record<string, unknown>).artifact as Record<string, unknown>)?.time
                          ? <LedgerProofField label="Time" value={String(((timestamps as Record<string, unknown>).artifact as Record<string, unknown>).time)} />
                          : null}
                      </>
                    ) : null}
                  </ProofSection>
                )}

                {/* Attribution */}
                {proof.attribution && (
                  <ProofSection title="Attribution">
                    {proof.attribution.name && <LedgerProofField label="Name" value={proof.attribution.name} />}
                  </ProofSection>
                )}

                {/* Slot Allocation */}
                {proof.slotAllocation && (
                  <ProofSection title="Slot Allocation">
                    <LedgerProofField label="Counter" value={`#${proof.slotAllocation.counter}`} />
                    <LedgerProofField label="Time" value={new Date(proof.slotAllocation.time).toLocaleString()} />
                    <LedgerProofField label="Public Key" value={proof.slotAllocation.publicKeyB64} mono />
                    <LedgerProofField label="Signature" value={proof.slotAllocation.signatureB64} mono />
                  </ProofSection>
                )}
              </div>

              {/* Full JSON */}
              <LedgerCopyableJson data={proof} />
            </>
          )}

          {!loading && !proof && (
            <div style={{ fontSize: 13, color: "var(--c-text-tertiary)" }}>Full proof not available for this entry.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Section wrapper — matches dashboard explorer-section exactly ── */
function ProofSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: "1px solid var(--c-border-subtle)", borderRadius: 12,
      overflow: "hidden", background: "var(--bg-elevated)",
      transition: "border-color 0.2s",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
        color: "var(--c-text-tertiary)", padding: "10px 16px",
        borderBottom: "1px solid var(--c-border-subtle)",
        background: "rgba(255,255,255,0.02)",
      }}>
        {title}
      </div>
      <div style={{ padding: "8px 16px" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Field with copy — matches dashboard ProofField exactly ── */
function LedgerProofField({ label, value, mono, color, last }: { label: string; value: string; mono?: boolean; color?: string; last?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 16,
      padding: "7px 0", borderBottom: last ? "none" : "1px solid var(--c-border-subtle)",
      fontSize: 12, lineHeight: 1.6,
    }}>
      <span style={{ color: "var(--c-text-tertiary)", flexShrink: 0, minWidth: 100, fontSize: 12 }}>{label}</span>
      <span style={{
        color: color || (mono ? "#30d158" : "var(--c-text)"),
        fontFamily: mono ? "var(--font-mono), 'SF Mono', Menlo, monospace" : "inherit",
        fontSize: mono ? 12 : 13,
        wordBreak: "break-all", textAlign: "left", minWidth: 0,
      }}>
        {value}
      </span>
      {value.length > 30 && (
        <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{
            border: "none", background: "transparent", cursor: "pointer", padding: 2,
            color: copied ? "#30d158" : "var(--c-text-tertiary)", flexShrink: 0,
            opacity: 0, transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; }}
          title="Copy"
        >
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          )}
        </button>
      )}
    </div>
  );
}

/* ── Copyable full JSON ── */
function LedgerCopyableJson({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(data, null, 2);
  const sizeKb = (new TextEncoder().encode(json).length / 1024).toFixed(1);

  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{
        fontSize: 12, fontWeight: 500, padding: "6px 14px", borderRadius: 6,
        border: "1px solid var(--c-border)", background: "transparent",
        color: "var(--c-text-secondary)", cursor: "pointer", marginBottom: open ? 8 : 0,
      }}>
        {open ? "Hide" : "Raw JSON"} ({sizeKb} KB)
      </button>
      {open && (
        <div style={{ position: "relative" }}>
          <pre
            onClick={() => { navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{
              fontSize: 11, fontFamily: "var(--font-mono), monospace", lineHeight: 1.5,
              color: "#30d158", background: "#0a0a0a",
              padding: 16, borderRadius: 6, overflow: "auto", maxHeight: 400,
              cursor: "pointer", transition: "box-shadow 0.2s",
            }}
          >
            {json}
          </pre>
          {copied && (
            <span style={{
              position: "absolute", top: 8, right: 12,
              fontSize: 11, fontWeight: 600, color: "#30d158",
              background: "#0a0a0a", padding: "2px 8px", borderRadius: 4,
            }}>
              Copied
            </span>
          )}
        </div>
      )}
    </div>
  );
}

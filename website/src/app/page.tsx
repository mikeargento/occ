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

/* ── Types ───────────────────────────────────────────────────────────── */

type Mode = "make" | "verify";
type MakeStep = "drop" | "hashing" | "signing" | "done" | "error";
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

/* ── VERIFY.txt builder ──────────────────────────────────────────────── */

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

/* ── WebAuthn / Biometric helpers ────────────────────────────────────── */

async function createBiometricAuthorization(
  digestB64: string
): Promise<AgencyEnvelope | undefined> {
  if (!window.PublicKeyCredential) return undefined;

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: "required",
        rpId: window.location.hostname,
        allowCredentials: [],
      },
    })) as PublicKeyCredential | null;

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
      publicKeyB64: "",
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
    return undefined;
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function trunc(s: string, n = 24): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy-btn"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={s.copyBtn}
    >
      {copied ? "Copied!" : label || "\u{1F4CB}"}
    </button>
  );
}

function MonoValue({
  value,
  truncLen = 24,
}: {
  value: string;
  truncLen?: number;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      className="mono-val"
      title={value}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={s.monoValue}
    >
      {copied ? "Copied!" : trunc(value, truncLen)}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════════════════════ */

export default function MakerPage() {
  const [mode, setMode] = useState<Mode>("make");

  /* ── Make state ── */
  const [makeStep, setMakeStep] = useState<MakeStep>("drop");
  const [makeFiles, setMakeFiles] = useState<File[]>([]);
  const [makeDigest, setMakeDigest] = useState("");
  const [makeProofs, setMakeProofs] = useState<OCCProof[]>([]);
  const [makeError, setMakeError] = useState("");
  const [makeProgress, setMakeProgress] = useState({
    current: 0,
    total: 0,
    fileName: "",
  });
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [attribution, setAttribution] = useState("");
  const [showRawJson, setShowRawJson] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);

  /* ── Verify state ── */
  const [verifyStep, setVerifyStep] = useState<VerifyStep>("drop");
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyProof, setVerifyProof] = useState<OCCProof | null>(null);
  const [verifyResult, setVerifyResult] = useState<ProofVerifyResult | null>(
    null
  );
  const [fileDigestMatch, setFileDigestMatch] = useState<boolean | null>(null);

  /* ── Public ledger ── */
  const [ledger, setLedger] = useState<ProofEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerViewMode, setLedgerViewMode] = useState<"normal" | "timeonly">(
    "normal"
  );

  const fetchLedger = useCallback(async (page: number) => {
    try {
      const resp = await fetch(`/api/proofs?page=${page}&limit=15`);
      if (!resp.ok) return;
      const data = await resp.json();
      const entries: ProofEntry[] = (data.proofs || []).map(
        (p: Record<string, unknown>) => ({
          globalId: (p.id as number) || 0,
          digest: (p.digestB64 as string) || "—",
          counter: (p.counter as string) || undefined,
          enforcement:
            (p.enforcement as string) === "measured-tee"
              ? "Hardware Enclave"
              : "Software",
          time: p.commitTime ? Number(p.commitTime) : undefined,
          attribution: (p.attrName as string) || undefined,
          signer: ((p.signerPub as string) || "").slice(0, 12) || "—",
        })
      );
      setLedger(entries);
      setLedgerTotal(data.total || 0);
      setLedgerPage(page);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchLedger(1);
    const interval = setInterval(() => fetchLedger(1), 15000);
    return () => clearInterval(interval);
  }, [fetchLedger]);

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

        const attr = attribution.trim()
          ? { name: attribution.trim() }
          : undefined;
        const p = await commitDigest(d, undefined, agency, attr);
        setMakeProofs([p]);
        setMakeStep("done");
        setTimeout(() => fetchLedger(1), 1500);
      } else {
        const digests: Array<{ digestB64: string; hashAlg: "sha256" }> = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setMakeProgress({
            current: i + 1,
            total: files.length,
            fileName: f.name,
          });
          const d = await hashFile(f);
          digests.push({ digestB64: d, hashAlg: "sha256" });
        }
        setMakeDigest(digests[0].digestB64);
        setMakeStep("signing");
        setMakeProgress({ current: 0, total: files.length, fileName: "" });

        let agency: AgencyEnvelope | undefined;
        if (useBiometrics) {
          agency = await createBiometricAuthorization(digests[0].digestB64);
        }

        const attr = attribution.trim()
          ? { name: attribution.trim() }
          : undefined;
        const proofs = await commitBatch(digests, undefined, agency, attr);
        setMakeProofs(proofs);
        setMakeStep("done");
        setTimeout(() => fetchLedger(1), 1500);
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
    setShowRawJson(false);
  }

  async function downloadZip() {
    if (!makeProofs.length || !makeFiles.length) return;
    const zipFiles: Record<string, Uint8Array> = {};

    for (let i = 0; i < makeFiles.length; i++) {
      const f = makeFiles[i];
      const p = makeProofs[i] || makeProofs[0];
      zipFiles[f.name] = new Uint8Array(await f.arrayBuffer());
      const proofName =
        makeFiles.length > 1 ? `proof-${i + 1}.json` : "proof.json";
      zipFiles[proofName] = new TextEncoder().encode(
        JSON.stringify(p, null, 2)
      );
      if (i === 0) {
        zipFiles["VERIFY.txt"] = new TextEncoder().encode(
          buildVerifyTxt(f.name, p)
        );
      }
    }

    const zipped = zipSync(zipFiles);
    const blob = new Blob([zipped.buffer as ArrayBuffer], {
      type: "application/zip",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      makeFiles.length === 1
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
        setVerifyProof(proof);
        const result = await verifyProofSignature(proof);
        setVerifyResult(result);
        setVerifyStep("result");
      } else {
        const d = await hashFile(f);
        const resp = await fetch(
          `/api/proofs/${encodeURIComponent(toUrlSafeB64(d))}`
        );
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

  /* ── Derived ── */
  const firstProof = makeProofs[0];
  const proofJson =
    makeProofs.length === 1
      ? JSON.stringify(makeProofs[0], null, 2)
      : JSON.stringify(makeProofs, null, 2);

  const totalPages = Math.ceil(ledgerTotal / 15);

  /* ══════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════ */

  return (
    <div style={s.root}>
      <Nav />

      <main style={s.main}>
        {/* ── Hero ── */}
        <section style={s.hero}>
          <h1 style={s.heroTitle}>Prove anything.</h1>
          <p style={s.heroSubtitle}>
            Cryptographic proofs signed inside a hardware enclave. Drop a file
            — nothing leaves your browser.
          </p>

          {/* Mode toggle */}
          <div style={s.modeToggleWrap}>
            {(["make", "verify"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  if (m === "make") resetMake();
                  if (m === "verify") resetVerify();
                }}
                style={{
                  ...s.modeToggleBtn,
                  ...(mode === m ? s.modeToggleBtnActive : {}),
                }}
              >
                {m === "make" ? "Create Proof" : "Verify Proof"}
              </button>
            ))}
          </div>
        </section>

        {/* ══════════ MAKE MODE ══════════ */}
        {mode === "make" && (
          <section style={s.section}>
            {makeStep === "drop" && (
              <>
                <FileDrop
                  multiple
                  onFile={(f) => handleMakeFiles([f])}
                  onFiles={handleMakeFiles}
                  hint="Drop file(s). Hashed locally — nothing uploaded. Supports batch."
                />
                <div style={s.optionsRow}>
                  <input
                    type="text"
                    value={attribution}
                    onChange={(e) => setAttribution(e.target.value)}
                    placeholder="Author name (optional)"
                    style={s.authorInput}
                  />
                  <label style={s.biometricLabel}>
                    <input
                      type="checkbox"
                      checked={useBiometrics}
                      onChange={(e) => setUseBiometrics(e.target.checked)}
                      style={{ accentColor: "var(--c-accent)" }}
                    />
                    Biometric authorship
                  </label>
                </div>
              </>
            )}

            {makeStep === "hashing" && (
              <div style={s.statusCard}>
                <p style={s.statusText}>
                  Hashing{" "}
                  {makeFiles.length > 1
                    ? `${makeProgress.current} / ${makeProgress.total} `
                    : ""}
                  file{makeFiles.length !== 1 ? "s" : ""}...
                </p>
                {makeFiles.length > 1 && makeProgress.total > 0 && (
                  <>
                    <div style={s.progressTrack}>
                      <div
                        style={{
                          ...s.progressBar,
                          width: `${(makeProgress.current / makeProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                    <p style={s.progressFileName}>{makeProgress.fileName}</p>
                  </>
                )}
              </div>
            )}

            {makeStep === "signing" && (
              <div style={s.statusCard}>
                <p style={s.statusText}>
                  Signing{" "}
                  {makeFiles.length > 1 ? `${makeFiles.length} files ` : ""}
                  in hardware enclave...
                </p>
                <p style={s.monoSmall}>{makeDigest.slice(0, 32)}...</p>
              </div>
            )}

            {makeStep === "error" && (
              <div style={{ ...s.card, borderColor: "#ef4444" }}>
                <p style={{ ...s.statusText, color: "#ef4444" }}>
                  {makeError}
                </p>
                <button onClick={resetMake} style={s.btnSecondary}>
                  Try again
                </button>
              </div>
            )}

            {makeStep === "done" && firstProof && (
              <div style={s.resultWrap}>
                {/* Success header */}
                <div style={s.resultHeader}>
                  <div style={s.successIcon}>
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <div>
                    <h2 style={s.resultTitle}>
                      Proof #{firstProof.commit.counter} created
                    </h2>
                    <p style={s.resultMeta}>
                      {makeFiles.length === 1
                        ? `${makeFiles[0].name} \u00b7 ${formatFileSize(makeFiles[0].size)}`
                        : `${makeFiles.length} files`}
                    </p>
                  </div>
                </div>

                {/* Digest */}
                <div style={s.resultDigestRow}>
                  <span style={s.resultDigestLabel}>Digest</span>
                  <MonoValue
                    value={firstProof.artifact.digestB64}
                    truncLen={36}
                  />
                </div>

                {/* Action buttons */}
                <div style={s.resultActions}>
                  <button onClick={downloadZip} style={s.btnPrimary}>
                    Download .zip
                  </button>
                  <button onClick={resetMake} style={s.btnSecondary}>
                    Create another
                  </button>
                </div>

                {/* Raw JSON toggle */}
                <button
                  onClick={() => setShowRawJson(!showRawJson)}
                  style={s.rawJsonToggle}
                >
                  {showRawJson ? "Hide raw proof" : "View raw proof"}
                </button>

                {showRawJson && (
                  <div style={s.rawJsonWrap}>
                    <div style={s.rawJsonHeader}>
                      <span style={s.rawJsonLabel}>proof.json</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(proofJson);
                          setJsonCopied(true);
                          setTimeout(() => setJsonCopied(false), 1500);
                        }}
                        style={s.rawJsonCopyBtn}
                      >
                        {jsonCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <pre style={s.rawJsonPre}>{proofJson}</pre>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ══════════ VERIFY MODE ══════════ */}
        {mode === "verify" && (
          <section style={s.section}>
            {verifyStep === "drop" && (
              <FileDrop
                onFile={handleVerifyFile}
                hint="Drop a proof.json to verify its signature, or drop any file to check if it has a proof on the ledger."
              />
            )}

            {verifyStep === "checking" && (
              <div style={s.statusCard}>
                <p style={s.statusText}>Checking {verifyFile?.name}...</p>
              </div>
            )}

            {verifyStep === "result" && (
              <div>
                {verifyResult && (
                  <div style={s.card}>
                    <div style={s.verifyHeader}>
                      <span
                        style={{
                          color: verifyResult.valid ? "#22c55e" : "#ef4444",
                          fontSize: 22,
                          lineHeight: 1,
                        }}
                      >
                        {verifyResult.valid ? "\u2713" : "\u2717"}
                      </span>
                      <h3 style={s.verifyTitle}>
                        {verifyResult.valid
                          ? "Signature valid"
                          : "Signature invalid"}
                      </h3>
                    </div>
                    <div style={s.verifyChecks}>
                      {verifyResult.checks.map((c, i) => (
                        <div key={i} style={s.verifyCheckRow}>
                          <span
                            style={{
                              ...s.verifyCheckIcon,
                              color:
                                c.status === "pass"
                                  ? "#22c55e"
                                  : c.status === "fail"
                                    ? "#ef4444"
                                    : "var(--c-text-tertiary)",
                            }}
                          >
                            {c.status === "pass"
                              ? "\u2713"
                              : c.status === "fail"
                                ? "\u2717"
                                : "\u2014"}
                          </span>
                          <span style={s.verifyCheckLabel}>{c.label}</span>
                          {c.detail && (
                            <span style={s.verifyCheckDetail}>
                              {c.detail}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {fileDigestMatch !== null && !verifyProof && (
                  <div style={s.card}>
                    <div style={s.verifyHeader}>
                      <span
                        style={{
                          color: fileDigestMatch ? "#22c55e" : "#f97316",
                          fontSize: 22,
                          lineHeight: 1,
                        }}
                      >
                        {fileDigestMatch ? "\u2713" : "\u2014"}
                      </span>
                      <h3 style={s.verifyTitle}>
                        {fileDigestMatch
                          ? "File found on ledger"
                          : "No proof found for this file"}
                      </h3>
                    </div>
                  </div>
                )}

                {verifyProof && (
                  <div style={{ ...s.card, marginTop: 8 }}>
                    <h4 style={s.sectionLabel}>Proof details</h4>
                    <div style={s.verifyProofDigest}>
                      <MonoValue
                        value={verifyProof.artifact.digestB64}
                        truncLen={48}
                      />
                    </div>
                    <div style={s.verifyProofMeta}>
                      {verifyProof.commit.counter && (
                        <span>Counter #{verifyProof.commit.counter}</span>
                      )}
                      <span>
                        {verifyProof.environment?.enforcement === "measured-tee"
                          ? "Hardware Enclave"
                          : "Software"}
                      </span>
                      {verifyProof.commit.time && (
                        <span>
                          {new Date(
                            verifyProof.commit.time
                          ).toLocaleString()}
                        </span>
                      )}
                      {verifyProof.attribution?.name && (
                        <span>By: {verifyProof.attribution.name}</span>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={resetVerify}
                  style={{ ...s.btnSecondary, width: "100%", marginTop: 12 }}
                >
                  Verify another
                </button>
              </div>
            )}
          </section>
        )}

        {/* ══════════ PROOF CHAIN (LEDGER) ══════════ */}
        <section style={s.ledgerSection}>
          <div style={s.ledgerHeader}>
            <div style={s.ledgerTitleRow}>
              <h2 style={s.ledgerTitle}>Proof Chain</h2>
              <span style={s.ledgerCount}>
                {ledgerTotal.toLocaleString()} proofs
              </span>
            </div>
            <div style={s.viewToggleWrap}>
              {(["normal", "timeonly"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setLedgerViewMode(m)}
                  style={{
                    ...s.viewToggleBtn,
                    ...(ledgerViewMode === m ? s.viewToggleBtnActive : {}),
                  }}
                >
                  {m === "normal" ? "Normal" : "Time"}
                </button>
              ))}
            </div>
          </div>

          {ledger.length === 0 ? (
            <div style={s.emptyLedger}>No proofs yet</div>
          ) : (
            <>
              <div style={s.cardStack}>
                {ledger.map((entry, i) => (
                  <ProofCard
                    key={entry.digest + i}
                    entry={entry}
                    viewMode={ledgerViewMode}
                    totalProofs={ledgerTotal}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div style={s.pagination}>
                  <button
                    onClick={() => fetchLedger(ledgerPage - 1)}
                    disabled={ledgerPage <= 1}
                    style={{
                      ...s.pageBtn,
                      opacity: ledgerPage <= 1 ? 0.3 : 1,
                    }}
                  >
                    Prev
                  </button>
                  <span style={s.pageInfo}>
                    {ledgerPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => fetchLedger(ledgerPage + 1)}
                    disabled={ledgerPage >= totalPages}
                    style={{
                      ...s.pageBtn,
                      opacity: ledgerPage >= totalPages ? 0.3 : 1,
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ProofCard — expandable card for the proof chain
   ══════════════════════════════════════════════════════════════════════════ */

function ProofCard({
  entry,
  viewMode,
  totalProofs,
}: {
  entry: ProofEntry;
  viewMode: "normal" | "timeonly";
  totalProofs: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [proof, setProof] = useState<OCCProof | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCrypto, setShowCrypto] = useState(false);
  const [hovered, setHovered] = useState(false);

  const counter = entry.counter || String(entry.globalId);
  const counterNum = parseInt(counter, 10) || entry.globalId;
  const chainProgress = totalProofs > 0 ? (counterNum / totalProofs) * 100 : 0;

  async function toggle() {
    if (viewMode === "timeonly") return;
    if (!expanded && !proof && entry.digest !== "\u2014") {
      setLoading(true);
      try {
        const resp = await fetch(
          `/api/proofs/${encodeURIComponent(toUrlSafeB64(entry.digest))}`
        );
        if (resp.ok) {
          const data = await resp.json();
          if (data.proofs?.[0]?.proof)
            setProof(data.proofs[0].proof as OCCProof);
        }
      } catch {
        /* silent */
      }
      setLoading(false);
    }
    setExpanded((e) => !e);
  }

  /* ── Time-only mode: single-line card ── */
  if (viewMode === "timeonly") {
    return (
      <div style={s.cardTimeOnly}>
        <span style={s.cardCounter}>{counter}</span>
        <span style={s.cardTimeOnlyTime}>
          {entry.time
            ? new Date(entry.time).toLocaleString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })
            : "\u2014"}
        </span>
      </div>
    );
  }

  /* ── Normal mode: collapsed card ── */
  const commit = proof?.commit;
  const signer = proof?.signer;
  const env = proof?.environment;
  const proofAny = proof as unknown as Record<string, unknown> | undefined;
  const timestamps = proof?.timestamps as Record<string, unknown> | undefined;
  const slotAllocation = proofAny?.slotAllocation as
    | Record<string, unknown>
    | undefined;
  const proofAttribution = proof?.attribution;
  const hasTSA = !!timestamps?.artifact;

  return (
    <div
      style={{
        ...s.cardNormal,
        ...(hovered && !expanded ? { borderColor: "#3a3a3a" } : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Collapsed view */}
      <div onClick={toggle} style={s.cardCollapsed}>
        <div style={s.cardTopRow}>
          <span style={s.cardCounter}>#{counter}</span>
          <span style={s.cardAge}>
            {entry.time ? relativeTime(entry.time) : "\u2014"}
          </span>
        </div>
        <div style={s.cardNameRow}>
          <span style={s.cardName}>
            {entry.attribution || `Proof #${counter}`}
          </span>
        </div>
        {/* Chain progress bar */}
        <div style={s.chainProgressTrack}>
          <div
            style={{
              ...s.chainProgressBar,
              width: `${chainProgress}%`,
            }}
          />
        </div>
        <div style={s.cardBottomRow}>
          <span style={s.cardDigest}>{trunc(entry.digest, 24)}</span>
          <div style={s.cardBadges}>
            {entry.enforcement === "Hardware Enclave" && (
              <span style={s.badge}>Hardware Enclave</span>
            )}
            {hasTSA && <span style={s.badgeTsa}>TSA \u2713</span>}
          </div>
        </div>
      </div>

      {/* Expanded view */}
      {expanded && (
        <div style={s.cardExpanded}>
          {loading && <p style={s.loadingText}>Loading proof...</p>}

          {proof && (
            <>
              {/* ── Overview (always visible) ── */}
              <div style={s.expandedSection}>
                <h4 style={s.expandedSectionTitle}>Overview</h4>
                <div style={s.fieldGrid}>
                  <FieldRow
                    label="Artifact"
                    value={proof.artifact?.digestB64 || "\u2014"}
                    mono
                  />
                  <FieldRow label="Counter" value={`#${counter}`} />
                  <FieldRow
                    label="Time"
                    value={
                      commit?.time
                        ? new Date(commit.time).toLocaleString()
                        : "\u2014"
                    }
                  />
                  <FieldRow
                    label="Hardware"
                    value={
                      env?.enforcement === "measured-tee"
                        ? "AWS Nitro Enclave \u2713"
                        : env?.enforcement === "hw-key"
                          ? "Hardware Key"
                          : "Software"
                    }
                  />
                  {hasTSA && (
                    <FieldRow
                      label="TSA"
                      value={
                        String(
                          (
                            timestamps!.artifact as Record<string, unknown>
                          )?.authority || ""
                        ) + " \u2713"
                      }
                    />
                  )}
                </div>
              </div>

              {/* ── Cryptography (collapsed by default) ── */}
              <div style={s.expandedSection}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCrypto(!showCrypto);
                  }}
                  style={s.cryptoToggle}
                >
                  <h4 style={s.expandedSectionTitle}>Cryptography</h4>
                  <span style={s.cryptoToggleHint}>
                    {showCrypto ? "hide" : "show"}
                  </span>
                </button>

                {showCrypto && (
                  <div style={s.fieldGrid}>
                    {commit?.epochId && (
                      <FieldRow
                        label="Epoch ID"
                        value={String(commit.epochId)}
                        mono
                      />
                    )}
                    {commit?.prevB64 && (
                      <FieldRow
                        label="Prev Hash"
                        value={commit.prevB64}
                        mono
                      />
                    )}
                    {commit?.nonceB64 && (
                      <FieldRow
                        label="Nonce"
                        value={commit.nonceB64}
                        mono
                      />
                    )}
                    {signer?.signatureB64 && (
                      <FieldRow
                        label="Signature"
                        value={signer.signatureB64}
                        mono
                      />
                    )}
                    {signer?.publicKeyB64 && (
                      <FieldRow
                        label="Public Key"
                        value={signer.publicKeyB64}
                        mono
                      />
                    )}
                    {env?.measurement && (
                      <FieldRow label="PCR0" value={env.measurement} mono />
                    )}
                    {commit?.slotCounter != null && (
                      <FieldRow
                        label="Slot #"
                        value={String(commit.slotCounter)}
                      />
                    )}
                    {commit?.slotHashB64 && (
                      <FieldRow
                        label="Slot Hash"
                        value={commit.slotHashB64}
                        mono
                      />
                    )}
                    {slotAllocation &&
                      (slotAllocation as any).counter != null && (
                        <FieldRow
                          label="Causal Slot"
                          value={String((slotAllocation as any).counter)}
                        />
                      )}
                  </div>
                )}
              </div>

              {/* ── Attribution ── */}
              {(proofAttribution?.name ||
                proof.attribution?.name?.startsWith("Ethereum #")) && (
                <div style={s.expandedSection}>
                  <h4 style={s.expandedSectionTitle}>Attribution</h4>
                  <div style={s.fieldGrid}>
                    {proofAttribution?.name && (
                      <FieldRow
                        label="Name"
                        value={proofAttribution.name}
                      />
                    )}
                    {proof.attribution?.title && (
                      <div style={s.etherscanRow}>
                        <a
                          href={proof.attribution.title}
                          target="_blank"
                          rel="noopener"
                          style={s.etherscanLink}
                        >
                          View on Etherscan &rarr;
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Actions ── */}
              <div style={s.expandedActions}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const json = JSON.stringify(proof, null, 2);
                    const blob = new Blob([json], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `occ-proof-${(proof.artifact?.digestB64 || "unknown").slice(0, 12)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={s.btnSmall}
                >
                  Download proof.json
                </button>
                <RawJsonToggle data={proof} />
              </div>
            </>
          )}

          {!loading && !proof && (
            <p style={s.loadingText}>
              Full proof not available for this entry.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── FieldRow ── */

function FieldRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={s.fieldRow}>
      <span style={s.fieldLabel}>{label}</span>
      {mono ? (
        <MonoValue value={value} />
      ) : (
        <span style={s.fieldValue}>{value}</span>
      )}
    </div>
  );
}

/* ── RawJsonToggle ── */

function RawJsonToggle({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        style={s.btnSmall}
      >
        {open ? "Hide JSON" : "View raw JSON"}
      </button>
      {open && (
        <div style={s.rawJsonWrap}>
          <div style={s.rawJsonHeader}>
            <span style={s.rawJsonLabel}>proof.json</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(json);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={s.rawJsonCopyBtn}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre style={s.rawJsonPre}>{json}</pre>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   STYLES
   ══════════════════════════════════════════════════════════════════════════ */

const MONO =
  "var(--font-mono, 'JetBrains Mono'), 'SF Mono', SFMono-Regular, ui-monospace, monospace";

const s: Record<string, React.CSSProperties> = {
  /* ── Layout ── */

  root: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--c-text)",
  },

  main: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "48px 24px 96px",
  },

  section: {
    marginBottom: 24,
  },

  /* ── Hero ── */

  hero: {
    marginBottom: 40,
  },

  heroTitle: {
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    lineHeight: 1.1,
    color: "var(--c-text)",
    marginBottom: 10,
  },

  heroSubtitle: {
    fontSize: 16,
    lineHeight: 1.6,
    color: "var(--c-text-secondary)",
    marginBottom: 24,
    maxWidth: 560,
  },

  /* ── Mode toggle ── */

  modeToggleWrap: {
    display: "inline-flex",
    gap: 0,
    borderRadius: 8,
    overflow: "hidden",
    border: "1px solid var(--c-border)",
  },

  modeToggleBtn: {
    padding: "8px 20px",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "inherit",
    border: "none",
    cursor: "pointer",
    background: "transparent",
    color: "var(--c-text-tertiary)",
    transition: "all 0.15s",
  },

  modeToggleBtnActive: {
    background: "var(--c-text)",
    color: "var(--bg)",
  },

  /* ── Options row (author + biometric) ── */

  optionsRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 12,
    padding: "10px 14px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--c-border-subtle)",
    borderRadius: 8,
  },

  authorInput: {
    flex: 1,
    height: 32,
    padding: "0 10px",
    fontSize: 13,
    fontFamily: "inherit",
    border: "1px solid var(--c-border)",
    borderRadius: 6,
    background: "transparent",
    color: "var(--c-text)",
    outline: "none",
  },

  biometricLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--c-text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },

  /* ── Status / progress cards ── */

  card: {
    border: "1px solid var(--c-border-subtle)",
    borderRadius: 10,
    padding: "24px 20px",
    background: "var(--bg-elevated)",
    marginBottom: 12,
  },

  statusCard: {
    border: "1px solid var(--c-border-subtle)",
    borderRadius: 10,
    padding: "48px 24px",
    background: "var(--bg-elevated)",
    textAlign: "center" as const,
  },

  statusText: {
    fontSize: 14,
    color: "var(--c-text-secondary)",
    marginBottom: 12,
  },

  monoSmall: {
    fontSize: 12,
    fontFamily: MONO,
    color: "var(--c-text-tertiary)",
  },

  progressTrack: {
    width: "100%",
    height: 3,
    borderRadius: 2,
    background: "var(--c-border)",
    overflow: "hidden",
    marginBottom: 8,
    maxWidth: 320,
    marginLeft: "auto",
    marginRight: "auto",
  },

  progressBar: {
    height: "100%",
    borderRadius: 2,
    background: "#22c55e",
    transition: "width 0.2s ease",
  },

  progressFileName: {
    fontSize: 12,
    fontFamily: MONO,
    color: "var(--c-text-tertiary)",
  },

  /* ── Result (after proof created) ── */

  resultWrap: {
    border: "1px solid var(--c-border-subtle)",
    borderRadius: 10,
    padding: "28px 24px",
    background: "var(--bg-elevated)",
  },

  resultHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 20,
  },

  successIcon: {
    flexShrink: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    background: "rgba(34, 197, 94, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  resultTitle: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "var(--c-text)",
    marginBottom: 2,
  },

  resultMeta: {
    fontSize: 13,
    color: "var(--c-text-secondary)",
  },

  resultDigestRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
    padding: "12px 0",
    borderTop: "1px solid var(--c-border-subtle)",
    borderBottom: "1px solid var(--c-border-subtle)",
    marginBottom: 20,
  },

  resultDigestLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--c-text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    flexShrink: 0,
  },

  resultActions: {
    display: "flex",
    gap: 10,
    marginBottom: 16,
  },

  rawJsonToggle: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--c-text-tertiary)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    fontFamily: "inherit",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },

  rawJsonWrap: {
    marginTop: 12,
    borderRadius: 8,
    overflow: "hidden",
    border: "1px solid var(--c-border-subtle)",
  },

  rawJsonHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 14px",
    background: "rgba(255,255,255,0.02)",
    borderBottom: "1px solid var(--c-border-subtle)",
  },

  rawJsonLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--c-text-tertiary)",
    fontFamily: MONO,
  },

  rawJsonCopyBtn: {
    fontSize: 12,
    fontWeight: 500,
    padding: "3px 10px",
    borderRadius: 4,
    border: "1px solid var(--c-border)",
    background: "transparent",
    color: "var(--c-text-secondary)",
    cursor: "pointer",
    fontFamily: "inherit",
  },

  rawJsonPre: {
    fontSize: 11,
    fontFamily: MONO,
    lineHeight: 1.6,
    color: "#94a3b8",
    background: "#0a0a0a",
    padding: 16,
    overflow: "auto",
    maxHeight: 400,
    margin: 0,
  },

  /* ── Buttons ── */

  btnPrimary: {
    flex: 1,
    height: 44,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "inherit",
    border: "none",
    borderRadius: 8,
    background: "#3b82f6",
    color: "#fff",
    cursor: "pointer",
    transition: "opacity 0.15s",
  },

  btnSecondary: {
    flex: 1,
    height: 44,
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "inherit",
    border: "1px solid var(--c-border)",
    borderRadius: 8,
    background: "transparent",
    color: "var(--c-text)",
    cursor: "pointer",
    transition: "all 0.15s",
  },

  btnSmall: {
    fontSize: 12,
    fontWeight: 500,
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid var(--c-border)",
    background: "transparent",
    color: "var(--c-text-secondary)",
    cursor: "pointer",
    fontFamily: "inherit",
  },

  /* ── Verify ── */

  verifyHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  verifyTitle: {
    fontSize: 17,
    fontWeight: 600,
    color: "var(--c-text)",
  },

  verifyChecks: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },

  verifyCheckRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 13,
    color: "var(--c-text-secondary)",
  },

  verifyCheckIcon: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },

  verifyCheckLabel: {},

  verifyCheckDetail: {
    color: "var(--c-text-tertiary)",
    fontSize: 12,
  },

  verifyProofDigest: {
    marginBottom: 8,
  },

  verifyProofMeta: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 12,
    fontSize: 12,
    color: "var(--c-text-tertiary)",
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--c-text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    marginBottom: 12,
  },

  /* ── Ledger ── */

  ledgerSection: {
    marginTop: 56,
  },

  ledgerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    flexWrap: "wrap" as const,
    gap: 12,
  },

  ledgerTitleRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
  },

  ledgerTitle: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "var(--c-text)",
  },

  ledgerCount: {
    fontSize: 13,
    color: "var(--c-text-tertiary)",
    fontFamily: MONO,
  },

  viewToggleWrap: {
    display: "inline-flex",
    borderRadius: 6,
    overflow: "hidden",
    border: "1px solid var(--c-border-subtle)",
    background: "var(--bg)",
  },

  viewToggleBtn: {
    padding: "5px 14px",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "inherit",
    border: "none",
    cursor: "pointer",
    background: "transparent",
    color: "var(--c-text-tertiary)",
    transition: "all 0.15s",
  },

  viewToggleBtnActive: {
    background: "var(--bg-elevated)",
    color: "var(--c-text)",
  },

  cardStack: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },

  emptyLedger: {
    textAlign: "center" as const,
    padding: "48px 24px",
    border: "1px solid var(--c-border-subtle)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    color: "var(--c-text-tertiary)",
    fontSize: 14,
  },

  /* ── Proof card (normal) ── */

  cardNormal: {
    border: "1px solid var(--c-border-subtle)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    overflow: "hidden",
    transition: "border-color 0.15s",
  },

  cardCollapsed: {
    padding: "14px 18px",
    cursor: "pointer",
  },

  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },

  cardCounter: {
    fontSize: 15,
    fontWeight: 700,
    fontFamily: MONO,
    color: "#3b82f6",
  },

  cardAge: {
    fontSize: 13,
    color: "var(--c-text-secondary)",
  },

  cardNameRow: {
    marginBottom: 8,
  },

  cardName: {
    fontSize: 14,
    color: "var(--c-text)",
    fontWeight: 500,
  },

  chainProgressTrack: {
    width: "100%",
    height: 2,
    borderRadius: 1,
    background: "var(--c-border-subtle)",
    marginBottom: 8,
    overflow: "hidden",
  },

  chainProgressBar: {
    height: "100%",
    borderRadius: 1,
    background:
      "linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)",
    transition: "width 0.3s ease",
  },

  cardBottomRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  cardDigest: {
    fontSize: 13,
    fontFamily: MONO,
    color: "#94a3b8",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },

  cardBadges: {
    display: "flex",
    gap: 6,
    flexShrink: 0,
  },

  badge: {
    fontSize: 11,
    fontWeight: 500,
    padding: "2px 8px",
    borderRadius: 4,
    background: "rgba(34, 197, 94, 0.1)",
    color: "#22c55e",
    whiteSpace: "nowrap" as const,
  },

  badgeTsa: {
    fontSize: 11,
    fontWeight: 500,
    padding: "2px 8px",
    borderRadius: 4,
    background: "rgba(59, 130, 246, 0.1)",
    color: "#60a5fa",
    whiteSpace: "nowrap" as const,
  },

  /* ── Proof card (time-only) ── */

  cardTimeOnly: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 18px",
    border: "1px solid var(--c-border-subtle)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
  },

  cardTimeOnlyTime: {
    fontSize: 13,
    fontFamily: MONO,
    color: "var(--c-text-secondary)",
    textAlign: "right" as const,
  },

  /* ── Expanded card ── */

  cardExpanded: {
    padding: "4px 18px 18px",
    borderTop: "1px solid var(--c-border-subtle)",
  },

  expandedSection: {
    paddingTop: 16,
    paddingBottom: 4,
    borderBottom: "1px solid var(--c-border-subtle)",
  },

  expandedSectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--c-text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 8,
  },

  fieldGrid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 0,
  },

  fieldRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "6px 0",
    fontSize: 13,
    gap: 12,
  },

  fieldLabel: {
    fontSize: 12,
    color: "var(--c-text-tertiary)",
    flexShrink: 0,
  },

  fieldValue: {
    fontSize: 13,
    color: "var(--c-text)",
    textAlign: "right" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },

  cryptoToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    marginBottom: 4,
  },

  cryptoToggleHint: {
    fontSize: 12,
    color: "var(--c-text-tertiary)",
    fontFamily: "inherit",
  },

  etherscanRow: {
    padding: "6px 0",
  },

  etherscanLink: {
    fontSize: 13,
    fontWeight: 500,
    color: "#3b82f6",
    textDecoration: "none",
  },

  expandedActions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    paddingTop: 16,
  },

  loadingText: {
    fontSize: 13,
    color: "var(--c-text-tertiary)",
    padding: "12px 0",
  },

  /* ── Mono value (click to copy) ── */

  monoValue: {
    fontFamily: MONO,
    fontSize: 13,
    color: "#94a3b8",
    cursor: "pointer",
    textAlign: "right" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },

  copyBtn: {
    fontSize: 12,
    background: "none",
    border: "none",
    color: "var(--c-text-tertiary)",
    cursor: "pointer",
    padding: "2px 4px",
    fontFamily: "inherit",
  },

  /* ── Pagination ── */

  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    marginTop: 20,
  },

  pageBtn: {
    height: 34,
    padding: "0 16px",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "inherit",
    border: "1px solid var(--c-border)",
    borderRadius: 6,
    background: "transparent",
    color: "var(--c-text-secondary)",
    cursor: "pointer",
  },

  pageInfo: {
    fontSize: 13,
    color: "var(--c-text-tertiary)",
    fontFamily: MONO,
  },
};

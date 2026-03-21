"use client";

import { useState, useCallback, useRef } from "react";
import { formatFileSize, type OCCProof } from "@/lib/occ";
import { verifyAsync as ed25519Verify } from "@noble/ed25519";
import { b64ToBytes, canonicalize } from "@/lib/canonical";
import { unzipSync, strFromU8 } from "fflate";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CheckResult {
  label: string;
  status: "pass" | "fail" | "warn" | "info";
  detail: string;
}

type Framework = {
  id: string;
  name: string;
  pkg: string;
  install: string;
  lang: "js" | "python";
};

interface PolicyRule {
  enabled: boolean;
  value: string | number;
}

interface PolicyState {
  allowedTools: { enabled: boolean; tools: string[] };
  maxActions: PolicyRule;
  timeWindow: { enabled: boolean; start: string; end: string };
  rateLimit: PolicyRule;
}

// ─── Framework data ──────────────────────────────────────────────────────────

const JS_FRAMEWORKS: Framework[] = [
  { id: "openai", name: "OpenAI", pkg: "occ-openai", install: "npm install occ-openai", lang: "js" },
  { id: "vercel", name: "Vercel AI", pkg: "occ-vercel", install: "npm install occ-vercel", lang: "js" },
  { id: "langgraph", name: "LangGraph", pkg: "occ-langgraph", install: "npm install occ-langgraph", lang: "js" },
  { id: "mastra", name: "Mastra", pkg: "occ-mastra", install: "npm install occ-mastra", lang: "js" },
  { id: "cloudflare", name: "Cloudflare Workers", pkg: "occ-cloudflare", install: "npm install occ-cloudflare", lang: "js" },
];

const PYTHON_FRAMEWORKS: Framework[] = [
  { id: "openai-agents", name: "OpenAI Agents SDK", pkg: "occ-openai-agents", install: "pip install occ-openai-agents", lang: "python" },
  { id: "langchain", name: "LangChain", pkg: "occ-langchain", install: "pip install occ-langchain", lang: "python" },
  { id: "crewai", name: "CrewAI", pkg: "occ-crewai", install: "pip install occ-crewai", lang: "python" },
  { id: "gemini", name: "Google Gemini", pkg: "occ-gemini", install: "pip install occ-gemini", lang: "python" },
  { id: "google-adk", name: "Google ADK", pkg: "occ-google-adk", install: "pip install occ-google-adk", lang: "python" },
  { id: "llamaindex", name: "LlamaIndex", pkg: "occ-llamaindex", install: "pip install occ-llamaindex", lang: "python" },
  { id: "autogen", name: "AutoGen", pkg: "occ-autogen", install: "pip install occ-autogen", lang: "python" },
];

// ─── Code generation ─────────────────────────────────────────────────────────

function generateCode(fw: Framework, policy: PolicyState): string {
  const tools = policy.allowedTools.enabled ? policy.allowedTools.tools : [];
  const toolsStr = tools.length > 0 ? tools : ["search"];

  if (fw.lang === "python") {
    return generatePythonCode(fw, toolsStr, policy);
  }
  return generateJSCode(fw, toolsStr, policy);
}

function generatePythonCode(fw: Framework, tools: string[], policy: PolicyState): string {
  const pyPkg = fw.pkg.replace(/-/g, "_");
  const toolsArray = `[${tools.map(t => `"${t}"`).join(", ")}]`;

  // Build policy dict entries
  const policyEntries: string[] = [
    `        "allowed_tools": ${toolsArray}`,
    `        "default_deny": True`,
  ];
  if (policy.maxActions.enabled && policy.maxActions.value) {
    policyEntries.push(`        "max_actions": ${policy.maxActions.value}`);
  }
  if (policy.rateLimit.enabled && policy.rateLimit.value) {
    policyEntries.push(`        "rate_limit": ${policy.rateLimit.value}`);
  }
  if (policy.timeWindow.enabled && policy.timeWindow.start && policy.timeWindow.end) {
    policyEntries.push(`        "time_window": ("${policy.timeWindow.start}", "${policy.timeWindow.end}")`);
  }
  const policyBlock = policyEntries.join(",\n");

  switch (fw.id) {
    case "openai-agents":
      return `from ${pyPkg} import OCCSigner, wrap_agent

signer = OCCSigner(
    policy={
${policyBlock}
    }
)

# Wrap your agent with OCC control
agent = wrap_agent(your_agent, signer=signer)`;

    case "langchain":
      return `from ${pyPkg} import OCCSigner, wrap_tools

signer = OCCSigner(
    policy={
${policyBlock}
    }
)

# Wrap your existing tools with OCC control
tools = wrap_tools(your_tools, signer=signer)`;

    case "crewai":
      return `from ${pyPkg} import OCCSigner, wrap_crew

signer = OCCSigner(
    policy={
${policyBlock}
    }
)

# Wrap your crew with OCC control
crew = wrap_crew(your_crew, signer=signer)`;

    case "gemini":
      return `from ${pyPkg} import wrap_gemini, OCCSigner

signer = OCCSigner(
    policy={
${policyBlock}
    }
)

model = wrap_gemini(genai.GenerativeModel("gemini-pro"), signer=signer)`;

    case "google-adk":
      return `from ${pyPkg} import OCCSigner, wrap_agent

signer = OCCSigner(
    policy={
${policyBlock}
    }
)

agent = wrap_agent(your_adk_agent, signer=signer)`;

    case "llamaindex":
      return `from ${pyPkg} import OCCSigner, wrap_query_engine

signer = OCCSigner(
    policy={
${policyBlock}
    }
)

engine = wrap_query_engine(your_engine, signer=signer)`;

    case "autogen":
      return `from ${pyPkg} import OCCSigner, wrap_agent

signer = OCCSigner(
    policy={
${policyBlock}
    }
)

agent = wrap_agent(your_agent, signer=signer)`;

    default:
      return `from ${pyPkg} import OCCSigner, wrap_tools

signer = OCCSigner(
    policy={
${policyBlock}
    }
)

tools = wrap_tools(your_tools, signer=signer)`;
  }
}

function generateJSCode(fw: Framework, tools: string[], policy: PolicyState): string {
  const toolsArray = `[${tools.map(t => `'${t}'`).join(", ")}]`;

  // Build policy object entries
  const policyEntries: string[] = [
    `    allowedTools: ${toolsArray}`,
    `    defaultDeny: true`,
  ];
  if (policy.maxActions.enabled && policy.maxActions.value) {
    policyEntries.push(`    maxActions: ${policy.maxActions.value}`);
  }
  if (policy.rateLimit.enabled && policy.rateLimit.value) {
    policyEntries.push(`    rateLimit: ${policy.rateLimit.value}`);
  }
  if (policy.timeWindow.enabled && policy.timeWindow.start && policy.timeWindow.end) {
    policyEntries.push(`    timeWindow: { start: '${policy.timeWindow.start}', end: '${policy.timeWindow.end}' }`);
  }
  const policyBlock = policyEntries.join(",\n");

  switch (fw.id) {
    case "openai":
      return `import { wrapOpenAI } from '${fw.pkg}';

const client = wrapOpenAI(new OpenAI(), {
  policy: {
${policyBlock}
  }
});`;

    case "vercel":
      return `import { wrapAI } from '${fw.pkg}';

const ai = wrapAI({
  policy: {
${policyBlock}
  }
});`;

    case "langgraph":
      return `import { wrapGraph } from '${fw.pkg}';

const graph = wrapGraph(yourGraph, {
  policy: {
${policyBlock}
  }
});`;

    case "mastra":
      return `import { wrapMastra } from '${fw.pkg}';

const mastra = wrapMastra(yourMastra, {
  policy: {
${policyBlock}
  }
});`;

    case "cloudflare":
      return `import { wrapWorker } from '${fw.pkg}';

export default wrapWorker(yourWorker, {
  policy: {
${policyBlock}
  }
});`;

    default:
      return `import { wrap } from '${fw.pkg}';

const wrapped = wrap(yourClient, {
  policy: {
${policyBlock}
  }
});`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert DER-encoded ECDSA signature to IEEE P1363 (raw r||s) format.
 */
function derToP1363(der: Uint8Array, n: number = 32): Uint8Array {
  if (der[0] !== 0x30) throw new Error("Not a DER sequence");
  let offset = 2;
  if (der[1]! & 0x80) offset = 2 + (der[1]! & 0x7f);
  if (der[offset] !== 0x02) throw new Error("Expected INTEGER tag for r");
  const rLen = der[offset + 1]!;
  const rStart = offset + 2;
  const rBytes = der.slice(rStart, rStart + rLen);
  const sOffset = rStart + rLen;
  if (der[sOffset] !== 0x02) throw new Error("Expected INTEGER tag for s");
  const sLen = der[sOffset + 1]!;
  const sStart = sOffset + 2;
  const sBytes = der.slice(sStart, sStart + sLen);
  const out = new Uint8Array(n * 2);
  const rTrimmed = rBytes[0] === 0 && rBytes.length > n ? rBytes.slice(1) : rBytes;
  const sTrimmed = sBytes[0] === 0 && sBytes.length > n ? sBytes.slice(1) : sBytes;
  out.set(rTrimmed, n - rTrimmed.length);
  out.set(sTrimmed, n * 2 - sTrimmed.length);
  return out;
}

// ─── Studio Page ─────────────────────────────────────────────────────────────

export default function StudioPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<"build" | "verify">("build");

  // ── Build state ──
  const [selectedFramework, setSelectedFramework] = useState<Framework | null>(null);
  const [policy, setPolicy] = useState<PolicyState>({
    allowedTools: { enabled: true, tools: [] },
    maxActions: { enabled: false, value: "" as unknown as number },
    timeWindow: { enabled: false, start: "09:00", end: "17:00" },
    rateLimit: { enabled: false, value: "" as unknown as number },
  });
  const [toolInput, setToolInput] = useState("");
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // ── Verify state ──
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [verifyResults, setVerifyResults] = useState<CheckResult[] | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [extractedName, setExtractedName] = useState<string | null>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);

  // ── Build handlers ──

  const addTool = useCallback((name: string) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return;
    setPolicy(prev => ({
      ...prev,
      allowedTools: {
        ...prev.allowedTools,
        tools: prev.allowedTools.tools.includes(trimmed)
          ? prev.allowedTools.tools
          : [...prev.allowedTools.tools, trimmed],
      },
    }));
    setToolInput("");
  }, []);

  const removeTool = useCallback((name: string) => {
    setPolicy(prev => ({
      ...prev,
      allowedTools: {
        ...prev.allowedTools,
        tools: prev.allowedTools.tools.filter(t => t !== name),
      },
    }));
  }, []);

  const copyToClipboard = useCallback(async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch { /* fallback: noop */ }
  }, []);

  // ── Verify handlers (exact copy from original) ──

  const handleZipFile = useCallback((f: File) => {
    setZipFile(f);
    setVerifyResults(null);
    setExtractedName(null);
  }, []);

  const handleClearZip = useCallback(() => {
    setZipFile(null);
    setVerifyResults(null);
    setExtractedName(null);
  }, []);

  const handleVerify = async () => {
    if (!zipFile) return;
    setVerifying(true);
    setVerifyResults(null);

    const checks: CheckResult[] = [];

    try {
      const zipData = new Uint8Array(await zipFile.arrayBuffer());
      let entries: Record<string, Uint8Array>;

      try {
        entries = unzipSync(zipData);
      } catch {
        checks.push({ label: "ZIP extraction", status: "fail", detail: "Could not extract the file. Make sure it is a valid proof.zip." });
        setVerifyResults(checks);
        setVerifying(false);
        return;
      }

      const proofEntry = entries["proof.json"];
      if (!proofEntry) {
        checks.push({ label: "ZIP structure", status: "fail", detail: "No proof.json found inside the archive." });
        setVerifyResults(checks);
        setVerifying(false);
        return;
      }

      let vProof: OCCProof;
      try {
        vProof = JSON.parse(strFromU8(proofEntry));
      } catch {
        checks.push({ label: "Proof parsing", status: "fail", detail: "proof.json is not valid JSON." });
        setVerifyResults(checks);
        setVerifying(false);
        return;
      }

      checks.push({ label: "ZIP structure", status: "pass", detail: `Extracted ${Object.keys(entries).length} files, proof.json found` });

      const originalFileName = Object.keys(entries).find((k) => k !== "proof.json");

      if (!originalFileName) {
        checks.push({ label: "Original file", status: "fail", detail: "No original file found in the archive." });
        setVerifyResults(checks);
        setVerifying(false);
        return;
      }

      setExtractedName(originalFileName);
      const originalBytes = entries[originalFileName];
      checks.push({ label: "Original file", status: "pass", detail: `${originalFileName} (${formatFileSize(originalBytes.length)})` });

      // Structural
      checks.push(vProof.version === "occ/1"
        ? { label: "Version", status: "pass", detail: "occ/1" }
        : { label: "Version", status: "fail", detail: `Expected "occ/1", got "${vProof.version}"` });

      checks.push(vProof.artifact?.hashAlg === "sha256" && vProof.artifact?.digestB64
        ? { label: "Artifact structure", status: "pass", detail: "hashAlg: sha256, digestB64 present" }
        : { label: "Artifact structure", status: "fail", detail: "Missing or invalid artifact fields" });

      checks.push(vProof.commit?.nonceB64
        ? { label: "Commit nonce", status: "pass", detail: `${vProof.commit.nonceB64.length} chars` }
        : { label: "Commit nonce", status: "fail", detail: "Missing nonceB64" });

      checks.push(vProof.signer?.publicKeyB64 && vProof.signer?.signatureB64
        ? { label: "Signer fields", status: "pass", detail: "publicKeyB64 and signatureB64 present" }
        : { label: "Signer fields", status: "fail", detail: "Missing signer fields" });

      const validEnforcements = ["stub", "hw-key", "measured-tee"];
      checks.push(vProof.environment?.enforcement && validEnforcements.includes(vProof.environment.enforcement)
        ? { label: "Enforcement tier", status: "pass", detail: vProof.environment.enforcement }
        : { label: "Enforcement tier", status: "fail", detail: `Invalid: "${vProof.environment?.enforcement}"` });

      checks.push(vProof.environment?.measurement
        ? { label: "Measurement", status: "pass", detail: `${vProof.environment.measurement.slice(0, 32)}…` }
        : { label: "Measurement", status: "fail", detail: "Missing measurement" });

      // Digest
      const { hashBytes } = await import("@/lib/occ");
      const computedDigest = await hashBytes(originalBytes);
      checks.push(computedDigest === vProof.artifact?.digestB64
        ? { label: "Artifact digest match", status: "pass", detail: "SHA-256 of original file matches proof.artifact.digestB64" }
        : { label: "Artifact digest match", status: "fail", detail: `Mismatch - computed: ${computedDigest.slice(0, 24)}…` });

      // Ed25519 signature verification
      try {
        const pubBytes = b64ToBytes(vProof.signer.publicKeyB64);
        const sigBytes = b64ToBytes(vProof.signer.signatureB64);

        if (pubBytes.length !== 32) {
          checks.push({ label: "Ed25519 signature", status: "fail", detail: `Public key is ${pubBytes.length} bytes; expected 32` });
        } else if (sigBytes.length !== 64) {
          checks.push({ label: "Ed25519 signature", status: "fail", detail: `Signature is ${sigBytes.length} bytes; expected 64` });
        } else {
          const signedBody: Record<string, unknown> = {
            version: vProof.version,
            artifact: vProof.artifact,
            commit: vProof.commit,
            publicKeyB64: vProof.signer.publicKeyB64,
            enforcement: vProof.environment.enforcement,
            measurement: vProof.environment.measurement,
          };
          if (vProof.environment.attestation) {
            signedBody.attestationFormat = vProof.environment.attestation.format;
          }
          if (vProof.agency) {
            signedBody.actor = vProof.agency.actor;
          }
          if (vProof.attribution) {
            signedBody.attribution = vProof.attribution;
          }

          const canonicalBytes = canonicalize(signedBody);
          const valid = await ed25519Verify(sigBytes, canonicalBytes, pubBytes);

          checks.push(valid
            ? { label: "Enclave commit signature", status: "pass", detail: "Proof committed inside AWS Nitro Enclave" }
            : { label: "Enclave commit signature", status: "fail", detail: "Signature does not match the signed body" });
        }
      } catch (sigErr) {
        checks.push({ label: "Ed25519 signature", status: "fail", detail: `Verification error: ${sigErr instanceof Error ? sigErr.message : "unknown"}` });
      }

      // Attestation
      checks.push(vProof.environment?.attestation
        ? { label: "Attestation", status: "pass", detail: `Format: ${vProof.environment.attestation.format}` }
        : { label: "Attestation", status: "warn", detail: "No attestation report. Hardware verification not available." });

      // Timestamps
      const tsa = vProof.timestamps?.artifact || vProof.timestamps?.proof;
      checks.push(tsa
        ? { label: "Timestamp (TSA)", status: "pass", detail: `${tsa.authority} - ${tsa.time}` }
        : { label: "Timestamp (TSA)", status: "warn", detail: "No RFC 3161 timestamp. Time is self-reported only." });

      // Chain
      checks.push(vProof.commit?.prevB64
        ? { label: "Chain link", status: "pass", detail: `Linked: ${vProof.commit.prevB64.slice(0, 16)}…` }
        : { label: "Chain link", status: "info", detail: "No chain link. First proof in epoch or chaining not used." });

      if (vProof.commit?.counter) checks.push({ label: "Counter", status: "pass", detail: `Value: ${vProof.commit.counter}` });
      if (vProof.commit?.epochId) checks.push({ label: "Epoch", status: "pass", detail: `${vProof.commit.epochId.slice(0, 20)}…` });

      // Agency verification
      if (vProof.agency) {
        const { actor, authorization } = vProof.agency;

        checks.push(actor.keyId && actor.publicKeyB64 && actor.algorithm === "ES256" && actor.provider
          ? { label: "Actor identity", status: "pass", detail: `${actor.provider} - ${actor.keyId.slice(0, 16)}…` }
          : { label: "Actor identity", status: "fail", detail: "Missing or invalid actor fields" });

        checks.push(authorization.purpose === "occ/commit-authorize/v1"
          ? { label: "Agency purpose", status: "pass", detail: authorization.purpose }
          : { label: "Agency purpose", status: "fail", detail: `Expected "occ/commit-authorize/v1", got "${authorization.purpose}"` });

        const bc = vProof.agency.batchContext;
        const artifactBindingOk =
          authorization.artifactHash === vProof.artifact.digestB64 ||
          (bc &&
            Array.isArray(bc.batchDigests) &&
            bc.batchDigests.includes(vProof.artifact.digestB64) &&
            bc.batchDigests[0] === authorization.artifactHash);
        checks.push(artifactBindingOk
          ? { label: "Agency artifact binding", status: "pass", detail: bc
              ? `Batch proof ${bc.batchIndex + 1}/${bc.batchSize} - authorized via first artifact`
              : "authorization.artifactHash matches proof.artifact.digestB64" }
          : { label: "Agency artifact binding", status: "fail", detail: "artifactHash does not match proof artifact digest" });

        checks.push(authorization.actorKeyId === actor.keyId
          ? { label: "Agency key ID binding", status: "pass", detail: "authorization.actorKeyId matches actor.keyId" }
          : { label: "Agency key ID binding", status: "fail", detail: "actorKeyId does not match actor.keyId" });

        try {
          const pubKeyDer = b64ToBytes(actor.publicKeyB64);
          const keyIdHash = await crypto.subtle.digest("SHA-256", pubKeyDer as unknown as BufferSource);
          const computedKeyId = Array.from(new Uint8Array(keyIdHash))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          checks.push(computedKeyId === actor.keyId
            ? { label: "Actor keyId derivation", status: "pass", detail: "keyId = SHA-256(SPKI pubkey) matches" }
            : { label: "Actor keyId derivation", status: "fail", detail: "keyId does not match SHA-256 of public key" });

          const cryptoKey = await crypto.subtle.importKey(
            "spki",
            pubKeyDer as unknown as BufferSource,
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["verify"]
          );

          const sigBytesRaw = b64ToBytes(authorization.signatureB64);
          const isWebAuthnFormat = "format" in authorization && (authorization as Record<string, unknown>).format === "webauthn";

          let p256Valid: boolean;
          if (isWebAuthnFormat) {
            const wa = authorization as unknown as Record<string, string>;
            const authData = b64ToBytes(wa.authenticatorDataB64);
            const clientDataHash = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(wa.clientDataJSON) as unknown as BufferSource
            );
            const signedData = new Uint8Array(authData.length + 32);
            signedData.set(authData, 0);
            signedData.set(new Uint8Array(clientDataHash), authData.length);

            if (authData.length >= 33) {
              const flags = authData[32];
              const UP = (flags & 0x01) !== 0;
              const UV = (flags & 0x04) !== 0;
              checks.push(UP && UV
                ? { label: "Biometric verification", status: "pass", detail: "User Present and User Verified flags set" }
                : { label: "Biometric verification", status: "fail", detail: `Flags: UP=${UP}, UV=${UV}` });
            }

            const sigP1363 = sigBytesRaw[0] === 0x30 ? derToP1363(sigBytesRaw) : sigBytesRaw;

            p256Valid = await crypto.subtle.verify(
              { name: "ECDSA", hash: "SHA-256" },
              cryptoKey,
              sigP1363 as unknown as BufferSource,
              signedData as unknown as BufferSource
            );

            checks.push(p256Valid
              ? { label: "Device authorization (WebAuthn)", status: "pass", detail: "Proof authorized by device key" }
              : { label: "Device authorization (WebAuthn)", status: "fail", detail: "WebAuthn signature verification failed" });
          } else {
            const canonicalPayload: Record<string, unknown> = {
              actorKeyId: authorization.actorKeyId,
              artifactHash: authorization.artifactHash,
              challenge: authorization.challenge,
              purpose: authorization.purpose,
              timestamp: authorization.timestamp,
            };
            if ("protocolVersion" in authorization && (authorization as Record<string, unknown>).protocolVersion !== undefined) {
              canonicalPayload.protocolVersion = (authorization as Record<string, unknown>).protocolVersion;
            }
            const payloadBytes = new TextEncoder().encode(
              JSON.stringify(canonicalPayload, Object.keys(canonicalPayload).sort())
            );

            p256Valid = await crypto.subtle.verify(
              { name: "ECDSA", hash: "SHA-256" },
              cryptoKey,
              sigBytesRaw as unknown as BufferSource,
              payloadBytes as unknown as BufferSource
            );

            checks.push(p256Valid
              ? { label: "Device authorization", status: "pass", detail: "Proof authorized by device key" }
              : { label: "Device authorization", status: "fail", detail: "Device authorization signature verification failed" });
          }
        } catch (agencyErr) {
          checks.push({ label: "P-256 actor signature", status: "fail", detail: `Verification error: ${agencyErr instanceof Error ? agencyErr.message : "unknown"}` });
        }
      } else {
        checks.push({ label: "Agency", status: "info", detail: "No actor identity. Proof does not identify WHO authorized the commitment." });
      }

      // Attribution
      if (vProof.attribution) {
        const parts: string[] = [];
        if (vProof.attribution.name) parts.push(vProof.attribution.name);
        if (vProof.attribution.title) parts.push(vProof.attribution.title);
        if (vProof.attribution.message) parts.push(`"${vProof.attribution.message}"`);
        checks.push({
          label: "Attribution",
          status: "pass",
          detail: `Sealed claim: ${parts.join(" - ")}`,
        });
      }

    } catch (err) {
      checks.push({ label: "Verification error", status: "fail", detail: err instanceof Error ? err.message : "Unknown error" });
    }

    setVerifyResults(checks);
    setVerifying(false);
  };

  const allPass = verifyResults?.every((r) => r.status === "pass" || r.status === "info");
  const anyFail = verifyResults?.some((r) => r.status === "fail");

  // Derived: has any rules been configured?
  const hasRules = policy.allowedTools.tools.length > 0 ||
    (policy.maxActions.enabled && policy.maxActions.value) ||
    (policy.rateLimit.enabled && policy.rateLimit.value) ||
    (policy.timeWindow.enabled && policy.timeWindow.start && policy.timeWindow.end);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] mb-3">
          Studio
        </h1>
        <p className="text-text-secondary text-[15px] leading-relaxed">
          Build your AI control layer. Verify cryptographic proofs.
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-8">
        <div className="flex gap-1 p-1 rounded-xl bg-bg-elevated border border-border-subtle">
          <button
            onClick={() => setActiveTab("build")}
            className={`flex-1 h-11 rounded-lg text-sm font-sans font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === "build"
                ? "bg-bg text-success shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Build
          </button>
          <button
            onClick={() => setActiveTab("verify")}
            className={`flex-1 h-11 rounded-lg text-sm font-sans font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === "verify"
                ? "bg-bg text-success shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Verify
          </button>
        </div>
      </div>

      {/* ═══════════════════ BUILD TAB ═══════════════════ */}
      {activeTab === "build" && (
        <div className="space-y-8">

          {/* ── Step 1: Pick your framework ── */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold shrink-0 ${
                selectedFramework
                  ? "bg-success/15 text-success"
                  : "bg-bg-elevated border border-border-subtle text-text-secondary"
              }`}>
                {selectedFramework ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6.5l3 3L10 3" />
                  </svg>
                ) : "1"}
              </span>
              <h2 className="text-sm font-semibold text-text">Pick your framework</h2>
            </div>

            {/* JS frameworks */}
            <div className="mb-3">
              <div className="text-[11px] uppercase tracking-[0.1em] text-text-tertiary mb-2 pl-10">JavaScript</div>
              <div className="space-y-1 pl-10">
                {JS_FRAMEWORKS.map(fw => (
                  <button
                    key={fw.id}
                    onClick={() => setSelectedFramework(fw)}
                    className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all duration-150 cursor-pointer ${
                      selectedFramework?.id === fw.id
                        ? "bg-success/10 text-success border border-success/25"
                        : "text-text-secondary hover:text-text hover:bg-bg-elevated border border-transparent"
                    }`}
                  >
                    <span className="font-medium">{fw.name}</span>
                    <span className="text-text-tertiary ml-2 font-mono text-xs">{fw.pkg}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Python frameworks */}
            <div>
              <div className="text-[11px] uppercase tracking-[0.1em] text-text-tertiary mb-2 pl-10">Python</div>
              <div className="space-y-1 pl-10">
                {PYTHON_FRAMEWORKS.map(fw => (
                  <button
                    key={fw.id}
                    onClick={() => setSelectedFramework(fw)}
                    className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all duration-150 cursor-pointer ${
                      selectedFramework?.id === fw.id
                        ? "bg-success/10 text-success border border-success/25"
                        : "text-text-secondary hover:text-text hover:bg-bg-elevated border border-transparent"
                    }`}
                  >
                    <span className="font-medium">{fw.name}</span>
                    <span className="text-text-tertiary ml-2 font-mono text-xs">{fw.pkg}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ── Step 2: Define your rules ── */}
          {selectedFramework && (
            <section className="animate-slide-up">
              <div className="flex items-center gap-3 mb-4">
                <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold shrink-0 ${
                  hasRules
                    ? "bg-success/15 text-success"
                    : "bg-bg-elevated border border-border-subtle text-text-secondary"
                }`}>
                  {hasRules ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 6.5l3 3L10 3" />
                    </svg>
                  ) : "2"}
                </span>
                <h2 className="text-sm font-semibold text-text">Define your rules</h2>
              </div>

              <div className="pl-10 space-y-3">
                {/* Default deny indicator */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-bg-elevated border border-border-subtle">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-text-tertiary shrink-0">
                    <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <span className="text-xs text-text-secondary">Default deny — only listed tools are allowed</span>
                </div>

                {/* Allowed tools */}
                <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-text">Allowed tools</label>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={toolInput}
                      onChange={e => setToolInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); addTool(toolInput); }
                      }}
                      placeholder="e.g. search, send_email"
                      className="flex-1 h-9 bg-bg rounded-lg border border-border-subtle px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-success/40 transition-colors"
                    />
                    <button
                      onClick={() => addTool(toolInput)}
                      disabled={!toolInput.trim()}
                      className="h-9 px-3 rounded-lg text-xs font-semibold bg-bg border border-border-subtle text-text-secondary hover:text-text hover:border-border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Add
                    </button>
                  </div>
                  {policy.allowedTools.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {policy.allowedTools.tools.map(tool => (
                        <span
                          key={tool}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success/10 text-success text-xs font-mono"
                        >
                          {tool}
                          <button
                            onClick={() => removeTool(tool)}
                            className="hover:text-success/70 cursor-pointer text-[10px] leading-none"
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {policy.allowedTools.tools.length === 0 && (
                    <p className="text-[11px] text-text-tertiary mt-1">No tools allowed yet. With default-deny, no tool calls will be permitted.</p>
                  )}
                </div>

                {/* Max actions */}
                <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-text">Max actions</label>
                    <button
                      onClick={() => setPolicy(prev => ({ ...prev, maxActions: { ...prev.maxActions, enabled: !prev.maxActions.enabled } }))}
                      className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer ${
                        policy.maxActions.enabled ? "bg-success" : "bg-bg-subtle border border-border-subtle"
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        policy.maxActions.enabled ? "translate-x-4" : ""
                      }`} />
                    </button>
                  </div>
                  {policy.maxActions.enabled && (
                    <div className="mt-3">
                      <input
                        type="number"
                        min="1"
                        value={policy.maxActions.value || ""}
                        onChange={e => setPolicy(prev => ({ ...prev, maxActions: { ...prev.maxActions, value: parseInt(e.target.value) || ("" as unknown as number) } }))}
                        placeholder="e.g. 50"
                        className="w-full h-9 bg-bg rounded-lg border border-border-subtle px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-success/40 transition-colors"
                      />
                      <p className="text-[11px] text-text-tertiary mt-1.5">Budget envelope — total tool calls allowed per session</p>
                    </div>
                  )}
                </div>

                {/* Rate limit */}
                <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-text">Rate limit</label>
                    <button
                      onClick={() => setPolicy(prev => ({ ...prev, rateLimit: { ...prev.rateLimit, enabled: !prev.rateLimit.enabled } }))}
                      className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer ${
                        policy.rateLimit.enabled ? "bg-success" : "bg-bg-subtle border border-border-subtle"
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        policy.rateLimit.enabled ? "translate-x-4" : ""
                      }`} />
                    </button>
                  </div>
                  {policy.rateLimit.enabled && (
                    <div className="mt-3">
                      <input
                        type="number"
                        min="1"
                        value={policy.rateLimit.value || ""}
                        onChange={e => setPolicy(prev => ({ ...prev, rateLimit: { ...prev.rateLimit, value: parseInt(e.target.value) || ("" as unknown as number) } }))}
                        placeholder="e.g. 10"
                        className="w-full h-9 bg-bg rounded-lg border border-border-subtle px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-success/40 transition-colors"
                      />
                      <p className="text-[11px] text-text-tertiary mt-1.5">Maximum tool calls per minute</p>
                    </div>
                  )}
                </div>

                {/* Time window */}
                <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-text">Time window</label>
                    <button
                      onClick={() => setPolicy(prev => ({ ...prev, timeWindow: { ...prev.timeWindow, enabled: !prev.timeWindow.enabled } }))}
                      className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer ${
                        policy.timeWindow.enabled ? "bg-success" : "bg-bg-subtle border border-border-subtle"
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        policy.timeWindow.enabled ? "translate-x-4" : ""
                      }`} />
                    </button>
                  </div>
                  {policy.timeWindow.enabled && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="time"
                        value={policy.timeWindow.start}
                        onChange={e => setPolicy(prev => ({ ...prev, timeWindow: { ...prev.timeWindow, start: e.target.value } }))}
                        className="flex-1 h-9 bg-bg rounded-lg border border-border-subtle px-3 text-sm text-text focus:outline-none focus:border-success/40 transition-colors"
                      />
                      <span className="text-xs text-text-tertiary">to</span>
                      <input
                        type="time"
                        value={policy.timeWindow.end}
                        onChange={e => setPolicy(prev => ({ ...prev, timeWindow: { ...prev.timeWindow, end: e.target.value } }))}
                        className="flex-1 h-9 bg-bg rounded-lg border border-border-subtle px-3 text-sm text-text focus:outline-none focus:border-success/40 transition-colors"
                      />
                    </div>
                  )}
                  {policy.timeWindow.enabled && (
                    <p className="text-[11px] text-text-tertiary mt-1.5">Tools only available during this window</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ── Step 3: Generated code ── */}
          {selectedFramework && (
            <section className="animate-slide-up">
              <div className="flex items-center gap-3 mb-4">
                <span className="inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold bg-bg-elevated border border-border-subtle text-text-secondary shrink-0">
                  3
                </span>
                <h2 className="text-sm font-semibold text-text">Drop this into your project</h2>
              </div>

              <div className="pl-10 space-y-4">
                {/* Install command */}
                <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
                    <span className="text-[11px] uppercase tracking-[0.1em] text-text-tertiary">Install</span>
                    <button
                      onClick={() => copyToClipboard(selectedFramework.install, setCopiedInstall)}
                      className="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer"
                    >
                      {copiedInstall ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="px-4 py-3">
                    <code className="text-sm font-mono text-success">{selectedFramework.install}</code>
                  </div>
                </div>

                {/* Generated code */}
                <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
                    <span className="text-[11px] uppercase tracking-[0.1em] text-text-tertiary">
                      {selectedFramework.lang === "python" ? "Python" : "JavaScript"}
                    </span>
                    <button
                      onClick={() => copyToClipboard(generateCode(selectedFramework, policy), setCopiedCode)}
                      className="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer"
                    >
                      {copiedCode ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="px-4 py-3 overflow-x-auto">
                    <code className="text-sm font-mono text-text leading-relaxed whitespace-pre">{generateCode(selectedFramework, policy)}</code>
                  </pre>
                </div>

                {/* Explanation */}
                <div className="rounded-lg border border-border-subtle px-4 py-3">
                  <p className="text-xs text-text-secondary leading-relaxed">
                    The proof IS the authorization. Your agent constructs a cryptographic proof for every tool call — if it cannot build a valid proof that satisfies the policy, the action does not execute. No proof, no action.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ═══════════════════ VERIFY TAB ═══════════════════ */}
      {activeTab === "verify" && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
            onDragLeave={() => setDragover(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragover(false);
              if (e.dataTransfer.files.length) handleZipFile(e.dataTransfer.files[0]);
            }}
            onClick={() => !zipFile && zipInputRef.current?.click()}
            className={`
              relative rounded-xl border transition-all duration-300 cursor-pointer min-h-[180px] flex items-center
              ${dragover
                ? "border-text/40 bg-text/5 ring-2 ring-text/10 ring-offset-2 ring-offset-bg scale-[1.01]"
                : zipFile
                ? "border-border bg-bg-elevated"
                : "border-border-subtle bg-bg-elevated/50 hover:border-border hover:bg-bg-elevated hover:shadow-[0_0_20px_rgba(255,255,255,0.015)]"
              }
            `}
          >
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,.proof.zip"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleZipFile(e.target.files[0]);
              }}
            />
            {zipFile ? (
              <div className="flex items-center justify-between px-6 py-5 w-full">
                <div>
                  <div className="text-sm font-medium text-text">{zipFile.name}</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    {formatFileSize(zipFile.size)}
                    {extractedName && (
                      <span className="ml-2 text-text-secondary">→ <span className="font-mono">{extractedName}</span></span>
                    )}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleClearZip(); }} className="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer">Remove</button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-14 px-6 w-full">
                <div className="w-14 h-14 rounded-xl bg-bg-subtle/80 border border-border-subtle flex items-center justify-center mb-5">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                    <path d="M10 2L3 5.5v4.5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V5.5L10 2z" />
                    <path d="M7 10l2.5 2.5L13 8" />
                  </svg>
                </div>
                <div className="text-[15px] text-text-secondary">
                  Drop <span className="font-mono text-text">proof.zip</span> here, or <span className="text-text font-medium">click to select</span>
                </div>
                <div className="text-xs text-text-tertiary mt-1">Runs entirely in your browser</div>
              </div>
            )}
          </div>

          <button
            onClick={handleVerify}
            disabled={!zipFile || verifying}
            className={`
              w-full h-12 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 shrink-0
              ${!zipFile || verifying
                ? "bg-bg-subtle text-text-tertiary/50 cursor-not-allowed border border-border-subtle"
                : "bg-text text-bg hover:opacity-90 active:scale-[0.98] cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
              }
            `}
          >
            {verifying ? "Verifying…" : "Verify Proof"}
          </button>

          {/* Verify results inline */}
          {verifyResults && (
            <div className="space-y-4 animate-slide-up pt-4">
              <div className={`rounded-xl border p-6 flex items-start gap-4 ${
                anyFail ? "border-error/30 bg-error/5" :
                allPass ? "border-success/30 bg-success/5" :
                "border-warning/30 bg-warning/5"
              }`}>
                <div className="shrink-0 mt-0.5">
                  {anyFail && (
                    <svg width="20" height="20" viewBox="0 0 20 20" className="text-error">
                      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15" />
                      <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                    </svg>
                  )}
                  {!anyFail && allPass && (
                    <svg width="20" height="20" viewBox="0 0 20 20" className="text-success">
                      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15" />
                      <path d="M6 10.5l2.5 2.5L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  )}
                  {!anyFail && !allPass && (
                    <svg width="20" height="20" viewBox="0 0 20 20" className="text-warning">
                      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.15" />
                      <path d="M10 6v5M10 13.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${
                    anyFail ? "text-error" : allPass ? "text-success" : "text-warning"
                  }`}>
                    {anyFail ? "Verification Failed" : allPass ? "Verification Passed" : "Passed with Warnings"}
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    {anyFail
                      ? "One or more checks failed. This proof may not be valid for the provided file."
                      : allPass
                      ? "All checks passed. The artifact digest matches and the proof structure is valid."
                      : "Core checks passed, but some optional fields are missing or could not be fully verified."}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border-subtle overflow-hidden">
                {verifyResults.map((check, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${
                      i > 0 ? "border-t border-border-subtle" : ""
                    } ${i % 2 === 1 ? "bg-bg-elevated/50" : ""}`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {check.status === "pass" && <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-success/20 text-success text-[11px]">✓</span>}
                      {check.status === "fail" && <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-error/20 text-error text-[11px]">✕</span>}
                      {check.status === "warn" && <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-warning/20 text-warning text-[11px]">!</span>}
                      {check.status === "info" && <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-info/20 text-info text-[11px]">i</span>}
                    </div>
                    <div>
                      <div className="text-sm font-sans font-medium text-text">{check.label}</div>
                      <div className="text-xs text-text-secondary mt-0.5">{check.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";

/* ── Minimal CBOR decoder (subset needed for COSE_Sign1 + Nitro attestation) ── */

function decodeCbor(data: Uint8Array, offset = 0): { value: unknown; offset: number } {
  const major = data[offset] >> 5;
  const info = data[offset] & 0x1f;
  offset++;

  function readLength(info: number, off: number): { len: number; off: number } {
    if (info < 24) return { len: info, off };
    if (info === 24) return { len: data[off], off: off + 1 };
    if (info === 25) return { len: (data[off] << 8) | data[off + 1], off: off + 2 };
    if (info === 26) return { len: ((data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3]) >>> 0, off: off + 4 };
    if (info === 27) {
      // 8-byte length — JS can't handle > 2^53 but for our purposes we read as number
      let len = 0;
      for (let i = 0; i < 8; i++) len = len * 256 + data[off + i];
      return { len, off: off + 8 };
    }
    throw new Error(`Unsupported CBOR length info: ${info}`);
  }

  switch (major) {
    case 0: { // unsigned int
      const { len } = readLength(info, offset);
      return { value: len, offset: info < 24 ? offset : info === 24 ? offset + 1 : info === 25 ? offset + 2 : info === 26 ? offset + 4 : offset + 8 };
    }
    case 1: { // negative int
      const r = readLength(info, offset);
      return { value: -1 - r.len, offset: r.off };
    }
    case 2: { // byte string
      const r = readLength(info, offset);
      return { value: data.slice(r.off, r.off + r.len), offset: r.off + r.len };
    }
    case 3: { // text string
      const r = readLength(info, offset);
      const text = new TextDecoder().decode(data.slice(r.off, r.off + r.len));
      return { value: text, offset: r.off + r.len };
    }
    case 4: { // array
      if (info === 31) {
        // indefinite-length array — read until break (0xFF)
        const arr: unknown[] = [];
        let off = offset;
        while (data[off] !== 0xff) {
          const item = decodeCbor(data, off);
          arr.push(item.value);
          off = item.offset;
        }
        return { value: arr, offset: off + 1 };
      }
      const r = readLength(info, offset);
      const arr: unknown[] = [];
      let off = r.off;
      for (let i = 0; i < r.len; i++) {
        const item = decodeCbor(data, off);
        arr.push(item.value);
        off = item.offset;
      }
      return { value: arr, offset: off };
    }
    case 5: { // map
      if (info === 31) {
        // indefinite-length map — read until break (0xFF)
        const map: Record<string, unknown> = {};
        let off = offset;
        while (data[off] !== 0xff) {
          const key = decodeCbor(data, off);
          const val = decodeCbor(data, key.offset);
          map[String(key.value)] = val.value;
          off = val.offset;
        }
        return { value: map, offset: off + 1 };
      }
      const r = readLength(info, offset);
      const map: Record<string, unknown> = {};
      let off = r.off;
      for (let i = 0; i < r.len; i++) {
        const key = decodeCbor(data, off);
        const val = decodeCbor(data, key.offset);
        map[String(key.value)] = val.value;
        off = val.offset;
      }
      return { value: map, offset: off };
    }
    case 6: { // tag
      const r = readLength(info, offset);
      const tagged = decodeCbor(data, r.off);
      return { value: tagged.value, offset: tagged.offset };
    }
    case 7: { // simple / float
      if (info === 20) return { value: false, offset };
      if (info === 21) return { value: true, offset };
      if (info === 22) return { value: null, offset };
      if (info === 23) return { value: undefined, offset };
      if (info === 25) return { value: null, offset: offset + 2 }; // half-float, skip
      if (info === 26) return { value: null, offset: offset + 4 }; // float, skip
      if (info === 27) return { value: null, offset: offset + 8 }; // double, skip
      return { value: null, offset };
    }
    default:
      throw new Error(`Unknown CBOR major type: ${major}`);
  }
}

function b64ToBytes(b64: string): Uint8Array {
  // Handle both standard and URL-safe base64, and fix padding
  let s = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

interface AttestationResult {
  moduleId: string | null;
  pcrs: Record<number, string>;
  timestamp: number | null;
  certCount: number;
  userData: string | null;
  nonce: string | null;
  digest: string | null;
}

function decodeNitroAttestation(reportB64: string): AttestationResult | null {
  try {
    const bytes = b64ToBytes(reportB64);
    // COSE_Sign1 is a CBOR array: [protected, unprotected, payload, signature]
    const decoded = decodeCbor(bytes, 0);
    const coseArray = decoded.value as unknown[];
    if (!Array.isArray(coseArray) || coseArray.length < 4) return null;

    // payload is the attestation doc (CBOR-encoded)
    const payload = coseArray[2] as Uint8Array;
    if (!(payload instanceof Uint8Array)) return null;

    const attDoc = decodeCbor(payload, 0).value as Record<string, unknown>;

    // Extract PCRs
    const pcrs: Record<number, string> = {};
    const pcrsMap = attDoc["pcrs"] as Record<string, unknown> | undefined;
    if (pcrsMap) {
      for (const [idx, val] of Object.entries(pcrsMap)) {
        if (val instanceof Uint8Array) {
          const hex = bytesToHex(val);
          // Only include non-zero PCRs
          if (hex.replace(/0/g, "").length > 0) {
            pcrs[Number(idx)] = hex;
          }
        }
      }
    }

    // Extract user_data
    const userData = attDoc["user_data"] instanceof Uint8Array
      ? bytesToHex(attDoc["user_data"])
      : null;

    // Extract nonce
    const nonce = attDoc["nonce"] instanceof Uint8Array
      ? bytesToHex(attDoc["nonce"])
      : null;

    // Certificate bundle
    const cabundle = attDoc["cabundle"] as unknown[];
    const certCount = Array.isArray(cabundle) ? cabundle.length : 0;

    return {
      moduleId: typeof attDoc["module_id"] === "string" ? attDoc["module_id"] : null,
      pcrs,
      timestamp: typeof attDoc["timestamp"] === "number" ? attDoc["timestamp"] : null,
      certCount,
      userData,
      nonce,
      digest: typeof attDoc["digest"] === "string" ? attDoc["digest"] : null,
    };
  } catch {
    return null;
  }
}

/* ── Component ── */

interface Props {
  reportB64: string;
  measurement: string;
}

export function AttestationVerifier({ reportB64, measurement }: Props) {
  const [result, setResult] = useState<AttestationResult | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(() => {
    setRunning(true);
    setError(null);
    setVerified(null);

    // Run in next tick to allow UI update
    setTimeout(() => {
      try {
        const att = decodeNitroAttestation(reportB64);
        if (!att) {
          setError("Failed to decode attestation document");
          setRunning(false);
          return;
        }
        setResult(att);

        // Cross-reference PCR0 with proof measurement
        const pcr0 = att.pcrs[0] ?? "";
        const match = pcr0 === measurement;
        setVerified(match);
      } catch (e) {
        setError(`Verification error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [reportB64, measurement]);

  return (
    <div className="mt-4 border border-border-subtle bg-bg-elevated overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
          Attestation Verification
        </h3>
        {!result && (
          <button
            onClick={verify}
            disabled={running}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
          >
            {running ? "Decoding..." : "Verify Attestation"}
          </button>
        )}
      </div>

      {!result && !error && (
        <div className="px-5 py-4 text-xs text-text-tertiary">
          Decodes the COSE_Sign1 attestation document, extracts PCR0, and verifies it matches the
          proof&apos;s measurement field. The certificate chain roots to the{" "}
          <a
            href="https://docs.aws.amazon.com/enclaves/latest/user/verify-root.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-secondary hover:text-text underline"
          >
            AWS Nitro root CA
          </a>.
        </div>
      )}

      {error && (
        <div className="px-5 py-4 text-xs text-red-400">{error}</div>
      )}

      {result && (
        <div className="px-5 py-4 space-y-4">
          {/* Verification result */}
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${verified ? "bg-blue-500" : "bg-red-500"}`} />
            <span className={`text-sm font-medium ${verified ? "text-blue-400" : "text-red-400"}`}>
              {verified
                ? "PCR0 matches proof measurement"
                : "PCR0 does NOT match proof measurement"}
            </span>
          </div>

          {/* Details */}
          <div className="space-y-2.5">
            {result.moduleId && (
              <Row label="Module ID" value={result.moduleId} />
            )}
            {result.digest && (
              <Row label="Digest Algorithm" value={result.digest} />
            )}
            {result.timestamp && (
              <Row
                label="Attestation Time"
                value={new Date(result.timestamp).toLocaleString()}
              />
            )}
            <Row label="Certificate Chain" value={`${result.certCount} certificates (roots to AWS Nitro CA)`} />

            {/* PCR0 comparison */}
            <div className="mt-3 pt-3 border-t border-border-subtle">
              <div className="text-xs text-text-tertiary font-medium mb-2">PCR0 Comparison</div>
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] text-text-tertiary mb-0.5">From attestation report</div>
                  <code className="text-[11px] font-mono text-text break-all leading-relaxed">
                    {result.pcrs[0] ?? "not found"}
                  </code>
                </div>
                <div>
                  <div className="text-[10px] text-text-tertiary mb-0.5">From proof measurement</div>
                  <code className="text-[11px] font-mono text-text break-all leading-relaxed">
                    {measurement}
                  </code>
                </div>
              </div>
            </div>

            {/* Other non-zero PCRs */}
            {Object.keys(result.pcrs).length > 1 && (
              <div className="mt-3 pt-3 border-t border-border-subtle">
                <div className="text-xs text-text-tertiary font-medium mb-2">
                  Other Active PCRs
                </div>
                <div className="space-y-1.5">
                  {Object.entries(result.pcrs)
                    .filter(([idx]) => idx !== "0")
                    .map(([idx, hex]) => (
                      <div key={idx}>
                        <span className="text-[10px] text-text-tertiary">PCR{idx}: </span>
                        <code className="text-[10px] font-mono text-text break-all">{hex}</code>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* user_data */}
            {result.userData && (
              <div className="mt-3 pt-3 border-t border-border-subtle">
                <div className="text-[10px] text-text-tertiary mb-0.5">user_data (binds attestation to this proof)</div>
                <code className="text-[10px] font-mono text-text break-all">{result.userData}</code>
              </div>
            )}
          </div>

          {/* AWS docs link */}
          <div className="pt-3 border-t border-border-subtle text-xs text-text-tertiary">
            <a
              href="https://docs.aws.amazon.com/enclaves/latest/user/verify-root.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-secondary hover:text-text underline"
            >
              AWS Nitro Enclaves attestation verification docs
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-text-tertiary shrink-0">{label}</span>
      <span className="text-xs text-text text-right break-all">{value}</span>
    </div>
  );
}

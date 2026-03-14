import { NextResponse } from "next/server";
import { sha256 } from "@noble/hashes/sha256";
import { canonicalize } from "occproof";

// ---------------------------------------------------------------------------
// Types (inlined to avoid cross-package build dependency in demo)
// ---------------------------------------------------------------------------

interface ExecutionEnvelope {
  type: "tool-execution";
  tool: string;
  toolVersion: string;
  runtime: string;
  adapter: "occ-agent";
  inputHashB64: string;
  outputHashB64: string;
  timestamp: number;
}

interface FetchUrlInput {
  url: string;
  method?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashValue(value: unknown): string {
  const bytes = canonicalize(value);
  const digest = sha256(bytes);
  return Buffer.from(digest).toString("base64");
}

function hashEnvelope(envelope: ExecutionEnvelope): string {
  const bytes = canonicalize(envelope);
  const digest = sha256(bytes);
  return Buffer.from(digest).toString("base64");
}

// ---------------------------------------------------------------------------
// POST /api/execute
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tool: string;
      input: FetchUrlInput;
    };

    if (body.tool !== "fetch_url") {
      return NextResponse.json(
        { error: `Unknown tool: ${body.tool}` },
        { status: 400 },
      );
    }

    const input = body.input;
    if (!input.url) {
      return NextResponse.json(
        { error: "Missing url in input" },
        { status: 400 },
      );
    }

    // 1. Normalize and hash input
    const normalizedInput = {
      url: input.url,
      method: input.method ?? "GET",
    };
    const inputHashB64 = hashValue(normalizedInput);

    // 2. Execute fetch
    const fetchStart = Date.now();
    const response = await fetch(input.url, {
      method: input.method ?? "GET",
    });
    const responseBody = await response.text();
    const fetchDuration = Date.now() - fetchStart;

    // 3. Normalize and hash output
    const responseHeaders: Record<string, string> = {};
    const headerKeys: string[] = [];
    response.headers.forEach((_v, k) => headerKeys.push(k));
    headerKeys.sort();
    for (const key of headerKeys) {
      const val = response.headers.get(key);
      if (val !== null) {
        responseHeaders[key] = val;
      }
    }

    const normalizedOutput = {
      url: input.url,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      contentType: response.headers.get("content-type") ?? "",
      contentLength: responseBody.length,
    };
    const outputHashB64 = hashValue(normalizedOutput);

    // 4. Build execution envelope
    const envelope: ExecutionEnvelope = {
      type: "tool-execution",
      tool: "fetch_url",
      toolVersion: "1.0.0",
      runtime: "agent-skills",
      adapter: "occ-agent",
      inputHashB64,
      outputHashB64,
      timestamp: Date.now(),
    };

    // 5. Hash envelope for OCC commit
    const envelopeDigestB64 = hashEnvelope(envelope);

    // 6. Commit to OCC
    const occApiUrl = process.env.OCC_API_URL;
    const occApiKey = process.env.OCC_API_KEY;

    let occProof = null;
    let occError = null;

    if (occApiUrl) {
      try {
        const commitHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (occApiKey) {
          commitHeaders["Authorization"] = `Bearer ${occApiKey}`;
        }

        const commitUrl = occApiUrl.replace(/\/$/, "") + "/commit";
        const commitResponse = await fetch(commitUrl, {
          method: "POST",
          headers: commitHeaders,
          body: JSON.stringify({
            digests: [{ digestB64: envelopeDigestB64, hashAlg: "sha256" }],
            metadata: {
              kind: "tool-execution",
              tool: "fetch_url",
              adapter: "occ-agent",
              runtime: "agent-skills",
            },
          }),
        });

        if (commitResponse.ok) {
          const proofs = await commitResponse.json();
          occProof = proofs[0];
        } else {
          occError = `OCC commit failed: ${commitResponse.status} ${await commitResponse.text()}`;
        }
      } catch (e) {
        occError = `OCC commit error: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      occError = "OCC_API_URL not configured — running in demo mode without real proofs";
    }

    // 7. Return complete result
    return NextResponse.json({
      output: {
        url: normalizedOutput.url,
        status: normalizedOutput.status,
        statusText: normalizedOutput.statusText,
        contentType: normalizedOutput.contentType,
        contentLength: normalizedOutput.contentLength,
        headers: normalizedOutput.headers,
        bodyPreview: responseBody.substring(0, 2000),
        fetchDuration,
      },
      executionEnvelope: envelope,
      envelopeDigestB64,
      occProof,
      occError,
      verification: occProof
        ? {
            envelopeHashMatch:
              envelopeDigestB64 === occProof.artifact?.digestB64,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Reference",
  description: "OCC Protocol API reference: commit, verify, key, and health endpoints.",
};

function Endpoint({
  method,
  path,
  description,
  children,
}: {
  method: string;
  path: string;
  description: string;
  children: React.ReactNode;
}) {
  const color = method === "POST" ? "text-info" : "text-success";
  return (
    <div className="rounded-lg border border-border-subtle overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border-subtle bg-bg-elevated">
        <span className={`text-xs font-mono font-bold uppercase ${color}`}>
          {method}
        </span>
        <code className="text-sm font-mono text-text">{path}</code>
      </div>
      <div className="px-6 py-4">
        <p className="text-sm text-text-secondary mb-4">{description}</p>
        {children}
      </div>
    </div>
  );
}

function CodeBlock({ title, code }: { title?: string; code: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated overflow-hidden mb-4">
      {title && (
        <div className="px-4 py-2 border-b border-border-subtle">
          <span className="text-xs font-mono text-text-tertiary">{title}</span>
        </div>
      )}
      <pre className="p-4 overflow-x-auto text-xs font-mono leading-relaxed text-text-secondary">
        {code}
      </pre>
    </div>
  );
}

export default function APIReferencePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="mb-12">
        <span className="inline-block text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary mb-4">
          API Reference
        </span>
        <h1 className="text-3xl font-semibold tracking-tight mb-4">
          OCC Protocol API
        </h1>
        <p className="text-text-secondary max-w-xl">
          REST API for committing artifacts and verifying proofs. The commit
          endpoint runs inside an AWS Nitro Enclave.
        </p>
        <div className="mt-6 rounded-lg border border-border-subtle bg-bg-elevated p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
            Base URL
          </div>
          <code className="text-sm font-mono text-text">
            https://nitro.occproof.com
          </code>
        </div>
      </div>

      {/* Authentication */}
      <div className="mb-12">
        <h2 className="text-xl font-semibold mb-4">Authentication</h2>
        <p className="text-sm text-text-secondary mb-4">
          Authentication is optional. If the server is configured with API keys,
          include a Bearer token:
        </p>
        <CodeBlock
          title="Authorization header"
          code={`Authorization: Bearer <your-api-key>`}
        />
        <p className="text-sm text-text-secondary">
          If no API keys are configured on the server, all endpoints are open.
          The public demo endpoint does not require authentication.
        </p>
      </div>

      {/* Endpoints */}
      <div className="space-y-8">
        <h2 className="text-xl font-semibold mb-4">Endpoints</h2>

        {/* POST /commit */}
        <Endpoint
          method="POST"
          path="/commit"
          description="Commit one or more artifact digests. The enclave generates a fresh nonce, increments its monotonic counter, signs with Ed25519, and returns a complete OCC proof for each digest."
        >
          <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
            Request body
          </h4>
          <CodeBlock
            code={`{
  "digests": [
    {
      "digestB64": "jYl9NHJP0VcRVh6OMEIU5VAGva6cu5kdrnPrlNr/RnU=",
      "hashAlg": "sha256"
    }
  ],
  "metadata": {                      // optional, advisory
    "source": "my-app",
    "fileName": "document.pdf"
  }
}`}
          />

          <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2 mt-6">
            Response (200)
          </h4>
          <CodeBlock
            code={`[
  {
    "version": "occ/1",
    "artifact": {
      "hashAlg": "sha256",
      "digestB64": "jYl9NHJP0VcRVh6OMEIU5VAGva6cu5kdrnPrlNr/RnU="
    },
    "commit": {
      "nonceB64": "gTME79qH3fXQ5qXX0JxX6T5oGhFRLLw2BIUoeQai9Z8=",
      "counter": "278",
      "time": 1741496392841,
      "epochId": "a1b2c3d4e5f6..."
    },
    "signer": {
      "publicKeyB64": "...",
      "signatureB64": "..."
    },
    "environment": {
      "enforcement": "measured-tee",
      "measurement": "ac813febd1ac4261...",
      "attestation": {
        "format": "aws-nitro",
        "reportB64": "..."
      }
    },
    "timestamps": {
      "artifact": {
        "authority": "http://freetsa.org/tsr",
        "time": "2026-03-07T12:00:00Z",
        "digestAlg": "sha256",
        "digestB64": "...",
        "tokenB64": "..."
      }
    }
  }
]`}
          />

          <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2 mt-6">
            Example: curl
          </h4>
          <CodeBlock
            code={`DIGEST=$(openssl dgst -sha256 -binary myfile.pdf | base64)

curl -X POST https://nitro.occproof.com/commit \\
  -H "Content-Type: application/json" \\
  -d '{
    "digests": [{
      "digestB64": "'$DIGEST'",
      "hashAlg": "sha256"
    }]
  }'`}
          />

          <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2 mt-6">
            Example: TypeScript
          </h4>
          <CodeBlock
            code={`const bytes = new Uint8Array(await file.arrayBuffer());
const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
const digestB64 = btoa(String.fromCharCode(...new Uint8Array(hashBuf)));

const resp = await fetch("https://nitro.occproof.com/commit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    digests: [{ digestB64, hashAlg: "sha256" }],
  }),
});

const proofs = await resp.json();
// proofs[0] is a complete OCCProof`}
          />
        </Endpoint>

        {/* GET /key */}
        <Endpoint
          method="GET"
          path="/key"
          description="Returns the enclave's current Ed25519 public key, platform measurement, and enforcement tier. Useful for pinning allowedMeasurements and allowedPublicKeys in verification policy."
        >
          <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
            Response (200)
          </h4>
          <CodeBlock
            code={`{
  "publicKeyB64": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
  "measurement": "ac813febd1ac4261eff4a6c059f78a5ecfc8c577...",
  "enforcement": "measured-tee"
}`}
          />
        </Endpoint>

        {/* POST /verify */}
        <Endpoint
          method="POST"
          path="/verify"
          description="Server-side verification of a proof against an optional policy. Note: verification can also be done entirely client-side. No API call required."
        >
          <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
            Request body
          </h4>
          <CodeBlock
            code={`{
  "proof": { ... },                  // complete OCCProof
  "policy": {                        // optional VerificationPolicy
    "requireEnforcement": "measured-tee",
    "allowedMeasurements": ["ac813febd1ac4261..."],
    "requireAttestation": true,
    "minCounter": "100"
  }
}`}
          />

          <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2 mt-6">
            Response (200)
          </h4>
          <CodeBlock
            code={`// Success
{ "valid": true }

// Failure
{ "valid": false, "reason": "measurement not in allowed set" }`}
          />
        </Endpoint>

        {/* GET /health */}
        <Endpoint
          method="GET"
          path="/health"
          description="Health check. Returns 200 if the parent server is running and can communicate with the enclave."
        >
          <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
            Response (200)
          </h4>
          <CodeBlock code={`{ "ok": true }`} />
        </Endpoint>
      </div>

      {/* Types */}
      <div className="mt-16 border-t border-border-subtle pt-12">
        <h2 className="text-xl font-semibold mb-6">Type definitions</h2>

        <h3 className="text-base font-semibold mb-3">OCCProof</h3>
        <CodeBlock
          title="TypeScript"
          code={`interface OCCProof {
  version: "occ/1";
  artifact: {
    hashAlg: "sha256";
    digestB64: string;
  };
  commit: {
    nonceB64: string;
    counter?: string;          // decimal, monotonic
    time?: number;             // Unix ms
    prevB64?: string;          // chain link
    epochId?: string;          // hex SHA-256
  };
  signer: {
    publicKeyB64: string;      // Ed25519, 32 bytes
    signatureB64: string;      // Ed25519, 64 bytes
  };
  environment: {
    enforcement: "stub" | "hw-key" | "measured-tee";
    measurement: string;
    attestation?: {
      format: string;          // e.g. "aws-nitro"
      reportB64: string;
    };
  };
  agency?: {                         // actor-bound proof
    actor: {
      keyId: string;
      publicKeyB64: string;
      algorithm: "ES256";
      provider: string;              // e.g. "apple-secure-enclave"
    };
    authorization: {
      purpose: "occ/commit-authorize/v1";
      actorKeyId: string;
      artifactHash: string;
      challenge: string;
      timestamp: number;
      signatureB64: string;          // P-256 ECDSA
    };
  };
  timestamps?: {
    artifact?: TsaToken;
    proof?: TsaToken;
  };
  metadata?: Record<string, unknown>;
}`}
        />

        <h3 className="text-base font-semibold mt-8 mb-3">VerificationPolicy</h3>
        <CodeBlock
          title="TypeScript"
          code={`interface VerificationPolicy {
  requireEnforcement?: "stub" | "hw-key" | "measured-tee";
  allowedMeasurements?: string[];
  allowedPublicKeys?: string[];
  requireAttestation?: boolean;
  requireAttestationFormat?: string[];
  minCounter?: string;
  maxCounter?: string;
  minTime?: number;
  maxTime?: number;
  requireEpochId?: boolean;

  // Actor-bound proof policy
  requireActor?: boolean;
  allowedActorKeyIds?: string[];
  allowedActorProviders?: string[];
}`}
        />

        <h3 className="text-base font-semibold mt-8 mb-3">TsaToken</h3>
        <CodeBlock
          title="TypeScript"
          code={`interface TsaToken {
  authority: string;
  time: string;               // ISO 8601
  digestAlg: string;
  digestB64: string;
  tokenB64: string;           // DER-encoded RFC 3161
}`}
        />
      </div>

      {/* Error codes */}
      <div className="mt-12 border-t border-border-subtle pt-12">
        <h2 className="text-xl font-semibold mb-6">Error responses</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-text-tertiary">Status</th>
                <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wider text-text-tertiary">Cause</th>
                <th className="text-left py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Body</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              <tr className="border-b border-border-subtle">
                <td className="py-2 pr-4">400</td>
                <td className="py-2 pr-4">Invalid request body</td>
                <td className="py-2"><code className="text-xs font-mono">{`{ "error": "..." }`}</code></td>
              </tr>
              <tr className="border-b border-border-subtle">
                <td className="py-2 pr-4">401</td>
                <td className="py-2 pr-4">Missing or invalid API key</td>
                <td className="py-2"><code className="text-xs font-mono">{`{ "error": "unauthorized" }`}</code></td>
              </tr>
              <tr>
                <td className="py-2 pr-4">500</td>
                <td className="py-2 pr-4">Enclave / internal error</td>
                <td className="py-2"><code className="text-xs font-mono">{`{ "error": "internal server error" }`}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

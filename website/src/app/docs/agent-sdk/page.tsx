import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent SDK",
  description: "Wrap AI tool calls with cryptographic execution receipts via OCC.",
};

export default function AgentSdkPage() {
  return (
    <article className="prose-doc">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] mb-6">Agent SDK</h1>
      <p className="text-text-secondary mb-6">
        Wrap any tool call with a portable, cryptographic execution receipt.
        The SDK normalizes inputs and outputs, hashes them into a canonical envelope,
        and commits the digest through OCC. Raw data never leaves your runtime.
      </p>
      <div className="mb-10">
        <a
          href="https://agent.proofstudio.xyz"
          target="_blank"
          rel="noopener"
          className="text-sm font-semibold text-accent underline underline-offset-4 hover:text-text transition-colors"
        >
          Try the live demo
        </a>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Install</h2>
      <div className="code-block">
        <div className="code-block-header"><span>Shell</span></div>
        <pre className="text-xs font-mono leading-relaxed text-text-secondary overflow-x-auto">{`npm install occ-agent`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Quick start</h2>
      <p className="text-text-secondary mb-4">
        The built-in <code className="text-xs font-mono bg-bg-subtle px-1.5 py-0.5 rounded">fetch_url</code> tool
        is ready to use. Wrap it, call it, and get back your output with an OCC proof attached.
      </p>
      <div className="code-block">
        <div className="code-block-header"><span>TypeScript</span></div>
        <pre className="text-xs font-mono leading-relaxed text-text-secondary overflow-x-auto">{`import { wrapTool, fetchUrlTool } from "occ-agent";

const verifiedFetch = wrapTool(fetchUrlTool, {
  apiUrl: "https://nitro.occproof.com",
});

const result = await verifiedFetch({ url: "https://api.example.com/data" });

result.output;            // normal fetch response
result.executionEnvelope; // canonical execution record
result.occProof;          // portable OCC proof`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">How it works</h2>
      <p className="text-text-secondary mb-4">
        Every call follows the same six-step pipeline:
      </p>
      <ol className="space-y-2 text-sm text-text-secondary mb-6">
        <li><strong className="text-text">1. Normalize input</strong> — deterministic JSON representation of the tool input</li>
        <li><strong className="text-text">2. Hash input</strong> — SHA-256 of the canonical input bytes</li>
        <li><strong className="text-text">3. Execute</strong> — run the tool function</li>
        <li><strong className="text-text">4. Normalize and hash output</strong> — same process for the response</li>
        <li><strong className="text-text">5. Build envelope</strong> — canonical JSON with tool name, version, both hashes, timestamp</li>
        <li><strong className="text-text">6. Commit</strong> — SHA-256 of the envelope is sent to OCC. The enclave signs it and returns a proof.</li>
      </ol>
      <div className="rounded-xl border border-border-subtle border-l-2 border-l-text-tertiary bg-bg-elevated p-6 mb-6">
        <p className="text-sm text-text italic">
          Only the 32-byte envelope digest crosses the network. The enclave never sees your input, output, or tool logic.
        </p>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Define a custom tool</h2>
      <p className="text-text-secondary mb-4">
        Any async function can become a verified tool. Define the execution logic
        and normalization functions — the SDK handles the rest.
      </p>
      <div className="code-block">
        <div className="code-block-header"><span>TypeScript</span></div>
        <pre className="text-xs font-mono leading-relaxed text-text-secondary overflow-x-auto">{`import { wrapTool } from "occ-agent";
import type { ToolDefinition } from "occ-agent";

const summarizeTool: ToolDefinition<
  { text: string },
  { summary: string }
> = {
  name: "summarize",
  version: "1.0.0",
  execute: async (input) => {
    const response = await callLLM(input.text);
    return { summary: response };
  },
  normalizeInput: (input) => ({ text: input.text }),
  normalizeOutput: (output) => ({ summary: output.summary }),
};

const verifiedSummarize = wrapTool(summarizeTool, {
  apiUrl: "https://nitro.occproof.com",
});

const result = await verifiedSummarize({ text: "..." });
// result.output.summary — the LLM response
// result.occProof — cryptographic proof of execution`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">One-shot execution</h2>
      <p className="text-text-secondary mb-4">
        For single calls without creating a reusable wrapper:
      </p>
      <div className="code-block">
        <div className="code-block-header"><span>TypeScript</span></div>
        <pre className="text-xs font-mono leading-relaxed text-text-secondary overflow-x-auto">{`import { runVerifiedTool, fetchUrlTool } from "occ-agent";

const result = await runVerifiedTool(
  fetchUrlTool,
  { url: "https://httpbin.org/json" },
  { apiUrl: "https://nitro.occproof.com" },
);`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Export a receipt</h2>
      <p className="text-text-secondary mb-4">
        Save the execution envelope and OCC proof as a portable JSON document.
        Raw tool output is intentionally excluded — it stays in your runtime.
      </p>
      <div className="code-block">
        <div className="code-block-header"><span>TypeScript</span></div>
        <pre className="text-xs font-mono leading-relaxed text-text-secondary overflow-x-auto">{`import { exportReceipt, loadReceipt } from "occ-agent";

// Export to JSON string
const json = exportReceipt(result);
await fs.writeFile("receipt.json", json);

// Load it back
const receipt = loadReceipt(await fs.readFile("receipt.json", "utf8"));
// receipt.envelope — the execution envelope
// receipt.proof    — the OCC proof`}</pre>
      </div>
      <div className="rounded-xl border border-border-subtle border-l-2 border-l-text-tertiary bg-bg-elevated p-6 mb-6">
        <p className="text-sm text-text italic">
          The receipt format is <code className="text-xs font-mono bg-bg-subtle px-1.5 py-0.5 rounded">occ-agent/receipt/1</code>. It contains everything needed for offline verification — hand it to anyone and they can verify without contacting OCC.
        </p>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Verify a receipt</h2>
      <p className="text-text-secondary mb-4">
        Verification is offline. Given an envelope and proof, anyone can check
        that the execution was committed through OCC. Works with a <code className="text-xs font-mono bg-bg-subtle px-1.5 py-0.5 rounded">VerifiedToolResult</code> or a loaded receipt.
      </p>
      <div className="code-block">
        <div className="code-block-header"><span>TypeScript</span></div>
        <pre className="text-xs font-mono leading-relaxed text-text-secondary overflow-x-auto">{`import { verifyExecutionReceipt, loadReceipt } from "occ-agent";

// From a VerifiedToolResult
const verification = await verifyExecutionReceipt(
  result.executionEnvelope,
  result.occProof,
);

// Or from an exported receipt
const receipt = loadReceipt(json);
const v = await verifyExecutionReceipt(receipt.envelope, receipt.proof);

v.valid;                    // true/false
v.checks.envelopeHashMatch; // digest matches artifact
v.checks.signatureValid;    // Ed25519 signature valid`}</pre>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Execution envelope</h2>
      <p className="text-text-secondary mb-4">
        The canonical execution record committed to OCC:
      </p>
      <div className="code-block">
        <div className="code-block-header"><span>JSON</span></div>
        <pre className="text-xs font-mono leading-relaxed text-text-secondary overflow-x-auto">{`{
  "type": "tool-execution",
  "tool": "fetch_url",
  "toolVersion": "1.0.0",
  "runtime": "agent-skills",
  "adapter": "occ-agent",
  "inputHashB64": "65ZIM1fa4oixyj6qdsQe...",
  "outputHashB64": "Y+aesdCj8/940fyda2T0...",
  "timestamp": 1773464119585
}`}</pre>
      </div>
      <p className="text-text-secondary mb-4">
        Fields are sorted alphabetically and serialized without whitespace
        before hashing. This ensures any implementation produces the same digest
        for the same execution.
      </p>

      <h2 className="text-xl font-semibold mt-12 mb-4">API reference</h2>

      <h3 className="text-lg font-semibold mt-8 mb-3">wrapTool(tool, config)</h3>
      <p className="text-text-secondary mb-4">
        Returns an async function that executes the tool and returns a <code className="text-xs font-mono bg-bg-subtle px-1.5 py-0.5 rounded">VerifiedToolResult</code>.
      </p>
      <div className="overflow-x-auto mb-6">
        <table>
          <thead>
            <tr>
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wide pb-3 pr-6">Parameter</th>
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wide pb-3 pr-6">Type</th>
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wide pb-3">Description</th>
            </tr>
          </thead>
          <tbody className="text-sm text-text-secondary">
            <tr className="border-t border-border-subtle">
              <td className="py-3 pr-6 font-mono text-xs">tool</td>
              <td className="py-3 pr-6 font-mono text-xs">ToolDefinition</td>
              <td className="py-3">Tool with name, version, execute, normalize functions</td>
            </tr>
            <tr className="border-t border-border-subtle">
              <td className="py-3 pr-6 font-mono text-xs">config.apiUrl</td>
              <td className="py-3 pr-6 font-mono text-xs">string</td>
              <td className="py-3">OCC commit service URL</td>
            </tr>
            <tr className="border-t border-border-subtle">
              <td className="py-3 pr-6 font-mono text-xs">config.apiKey</td>
              <td className="py-3 pr-6 font-mono text-xs">string?</td>
              <td className="py-3">Optional Bearer token for authenticated endpoints</td>
            </tr>
            <tr className="border-t border-border-subtle">
              <td className="py-3 pr-6 font-mono text-xs">config.runtime</td>
              <td className="py-3 pr-6 font-mono text-xs">string?</td>
              <td className="py-3">Runtime identifier (default: &quot;agent-skills&quot;)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="text-lg font-semibold mt-8 mb-3">ToolDefinition</h3>
      <div className="overflow-x-auto mb-6">
        <table>
          <thead>
            <tr>
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wide pb-3 pr-6">Field</th>
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wide pb-3 pr-6">Type</th>
              <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wide pb-3">Description</th>
            </tr>
          </thead>
          <tbody className="text-sm text-text-secondary">
            <tr className="border-t border-border-subtle">
              <td className="py-3 pr-6 font-mono text-xs">name</td>
              <td className="py-3 pr-6 font-mono text-xs">string</td>
              <td className="py-3">Tool identifier (e.g. &quot;fetch_url&quot;)</td>
            </tr>
            <tr className="border-t border-border-subtle">
              <td className="py-3 pr-6 font-mono text-xs">version</td>
              <td className="py-3 pr-6 font-mono text-xs">string</td>
              <td className="py-3">Semver version string</td>
            </tr>
            <tr className="border-t border-border-subtle">
              <td className="py-3 pr-6 font-mono text-xs">execute</td>
              <td className="py-3 pr-6 font-mono text-xs">(input) =&gt; Promise</td>
              <td className="py-3">The actual tool logic</td>
            </tr>
            <tr className="border-t border-border-subtle">
              <td className="py-3 pr-6 font-mono text-xs">normalizeInput</td>
              <td className="py-3 pr-6 font-mono text-xs">(input) =&gt; unknown</td>
              <td className="py-3">Deterministic input representation for hashing</td>
            </tr>
            <tr className="border-t border-border-subtle">
              <td className="py-3 pr-6 font-mono text-xs">normalizeOutput</td>
              <td className="py-3 pr-6 font-mono text-xs">(output) =&gt; unknown</td>
              <td className="py-3">Deterministic output representation for hashing</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-xl font-semibold mt-12 mb-4">Privacy model</h2>
      <ul className="space-y-2 text-sm text-text-secondary">
        <li>• <strong className="text-text">Hashes only.</strong> Only SHA-256 digests are sent to OCC. Raw input and output stay in your runtime.</li>
        <li>• <strong className="text-text">No reverse engineering.</strong> SHA-256 is preimage-resistant. The digest reveals nothing about the original data.</li>
        <li>• <strong className="text-text">Metadata is optional.</strong> Tool name and runtime are included in the commit metadata, but this is configurable.</li>
        <li>• <strong className="text-text">Verification is offline.</strong> Anyone with the envelope and proof can verify without contacting OCC.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-12 mb-4">Source</h2>
      <p className="text-text-secondary">
        <a href="https://github.com/mikeargento/occ/tree/main/packages/occ-agent" target="_blank" rel="noopener" className="text-text hover:text-accent transition-colors underline underline-offset-4">
          github.com/mikeargento/occ/packages/occ-agent
        </a>
        {" · "}
        <a href="https://www.npmjs.com/package/occ-agent" target="_blank" rel="noopener" className="text-text hover:text-accent transition-colors underline underline-offset-4">
          npm
        </a>
        {" · "}
        <a href="https://agent.proofstudio.xyz" target="_blank" rel="noopener" className="text-text hover:text-accent transition-colors underline underline-offset-4">
          demo
        </a>
      </p>
    </article>
  );
}

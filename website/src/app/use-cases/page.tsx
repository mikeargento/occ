import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Use Cases",
  description: "Where OCC applies — AI outputs, software pipelines, media, science, compliance, and agent workflows.",
};

const useCases = [
  {
    title: "AI Output Provenance",
    subtitle: "Model responses, generated images, predictions",
    description: "When a model generates a response or image, OCC commits the output inside a measured boundary. The proof binds the exact output bytes to the specific model environment and commit event. Downstream consumers can verify the proof offline without trusting the transport.",
    fields: "measurement identifies the model environment • counter provides ordering • attestation proves hardware boundary",
  },
  {
    title: "Agent Runs & Traces",
    subtitle: "Evaluations, red-teaming, tool-call logs",
    description: "AI agents produce traces of tool calls, reasoning steps, and intermediate results. OCC can commit each step with proof chaining (prevB64), creating a tamper-evident sequence. If any step is inserted, deleted, or reordered, the chain breaks. Evaluators can verify the complete trace was produced by a specific agent environment.",
    fields: "prevB64 provides chain integrity • epochId scopes to a single agent session • counter orders events",
  },
  {
    title: "Software Pipeline Artifacts",
    subtitle: "Build outputs, deployment packages, signed releases",
    description: "A CI/CD pipeline running inside a Nitro Enclave can commit build artifacts with OCC proofs. The proof ties each artifact to the specific pipeline image (measurement), the build sequence (counter), and the hardware boundary (attestation). Consumers can verify a binary was produced by the authorized build system.",
    fields: "measurement pins to specific CI/CD image • attestation proves Nitro Enclave • counter prevents replay",
  },
  {
    title: "Media & Journalism",
    subtitle: "Photos, video, audio, published content",
    description: "A capture device or content system running inside a measured boundary commits media at the moment of capture. The proof establishes that specific bytes were committed by a specific environment at a specific point in sequence. This is not proof that content is true — it is proof of commitment through an authorized boundary.",
    fields: "timestamps provide third-party time evidence • measurement identifies the capture environment",
  },
  {
    title: "Scientific Instruments",
    subtitle: "Sensor readings, lab data, telescope output",
    description: "Instruments that commit raw data through OCC produce proofs establishing that specific readings came from a specific instrument environment. Data integrity is verifiable from collection through analysis. The proof chain can establish that no readings were inserted or deleted between collection and publication.",
    fields: "prevB64 chains sequential readings • measurement identifies the instrument boundary",
  },
  {
    title: "Compliance & Audit Logs",
    subtitle: "Financial records, regulatory filings, access logs",
    description: "OCC-committed logs produce a tamper-evident record where each entry is bound to the previous one. Any modification, insertion, or deletion breaks the proof chain. Auditors can verify the complete sequence offline without trusting the log storage system.",
    fields: "prevB64 provides sequential integrity • counter prevents gaps • timestamps establish time claims",
  },
  {
    title: "Agent-to-Agent Handoff",
    subtitle: "Data passing between AI systems",
    description: "When Agent A passes data to Agent B, it can include an OCC proof. Agent B verifies the proof against the received bytes before processing. This eliminates trust in the transport layer — if the bytes match the proof, they are exactly what the source boundary committed.",
    fields: "artifact.digestB64 verifies byte integrity • signer identifies the source boundary",
  },
  {
    title: "Dataset Admission",
    subtitle: "Training data, RAG corpora, indexed content",
    description: "Before admitting data into a training set or retrieval corpus, the ingestion system can require a valid OCC proof. This establishes that each piece of data was committed through a known boundary and has not been modified since. The proof travels with the data.",
    fields: "measurement pins to known data source • artifact digest verifies byte-level match",
  },
];

export default function UseCasesPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="mb-16">
        <span className="inline-block text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary mb-4">
          Use Cases
        </span>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-6">
          Where it applies.
        </h1>
        <p className="text-text-secondary max-w-2xl leading-relaxed">
          OCC applies wherever artifacts need proof that they were committed
          through a specific boundary — not merely inspected after the fact.
          Each scenario below is a concrete application of the protocol.
        </p>
      </div>

      <div className="space-y-8">
        {useCases.map((uc) => (
          <div
            key={uc.title}
            className="rounded-lg border border-border-subtle bg-bg-elevated p-8"
          >
            <div className="text-xs text-text-tertiary mb-2">{uc.subtitle}</div>
            <h2 className="text-xl font-semibold mb-4">{uc.title}</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-4">
              {uc.description}
            </p>
            <div className="text-[11px] font-mono text-text-tertiary">
              {uc.fields}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 border-t border-border-subtle pt-12">
        <div className="rounded-lg border border-border-subtle bg-bg-elevated/50 p-8">
          <h2 className="text-lg font-semibold mb-3">What OCC does not prove</h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            OCC proves that specific bytes were committed through an authorized
            execution boundary during a single atomic event. It does not prove:
          </p>
          <ul className="space-y-2 text-sm text-text-secondary">
            <li>• <strong className="text-text">Truth or accuracy</strong> — the content may be factually wrong</li>
            <li>• <strong className="text-text">Authorship</strong> — a base proof attests which boundary committed, not who created. Actor-bound proofs can additionally attest a specific person or device.</li>
            <li>• <strong className="text-text">First creation</strong> — the same bytes could have existed elsewhere before</li>
            <li>• <strong className="text-text">Uniqueness</strong> — the same artifact can be committed to multiple boundaries</li>
          </ul>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/studio"
          className="inline-flex h-11 items-center rounded-md bg-text px-6 text-sm font-medium text-bg transition-colors hover:opacity-85"
        >
          Try the Studio
        </Link>
        <Link
          href="/docs"
          className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-medium text-text-secondary transition-colors hover:text-text hover:border-text-tertiary"
        >
          Read the Docs
        </Link>
      </div>
    </div>
  );
}

import type { OCCProof } from "@/lib/occ";

interface ProofMetaProps {
  proof: OCCProof;
  fileName?: string;
  fileSize?: number;
}

export function ProofMeta({ proof, fileName, fileSize }: ProofMetaProps) {
  const tsa = proof.timestamps?.artifact || proof.timestamps?.proof;

  return (
    <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
      {fileName && (
        <span>{fileName}{fileSize ? ` (${formatSize(fileSize)})` : ""}</span>
      )}
      {proof.environment?.enforcement && (
        <span className="inline-flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${
            proof.environment.enforcement === "measured-tee" ? "bg-success" :
            proof.environment.enforcement === "hw-key" ? "bg-info" : "bg-warning"
          }`} />
          {proof.environment.enforcement}
        </span>
      )}
      {proof.commit?.counter && (
        <span>counter {proof.commit.counter}</span>
      )}
      {proof.commit?.epochId && (
        <span>epoch {proof.commit.epochId.slice(0, 8)}…</span>
      )}
      {tsa?.authority && (
        <span>timestamped by {tsa.authority.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}</span>
      )}
      {proof.commit?.prevB64 && (
        <span className="text-success">chained</span>
      )}
    </div>
  );
}

function formatSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

import { useState } from "react";
import { Check, Copy, ChevronDown, ChevronRight, Download, ExternalLink } from "lucide-react";
import type { ProofEntry } from "@/api/proofs";

const PROOF_EXPLORER_URL: string | null = "https://occ.wtf/explorer";

interface Props {
  entry: ProofEntry;
}

function getExplorerUrl(_proof: Record<string, unknown>): string | null {
  if (!PROOF_EXPLORER_URL) return null;
  const artifact = _proof.artifact as Record<string, unknown> | undefined;
  const digestB64 = artifact?.digestB64 as string | undefined;
  if (!digestB64) return null;
  return `${PROOF_EXPLORER_URL}/${encodeURIComponent(digestB64)}`;
}

function downloadProof(proof: Record<string, unknown>, counter: string | null) {
  const json = JSON.stringify(proof, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `occ-proof-${counter ?? "unknown"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProofDetail({ entry }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const proof = entry.proof;
  const signer = proof.signer as Record<string, unknown> | undefined;
  const commit = proof.commit as Record<string, unknown> | undefined;
  const env = proof.environment as Record<string, unknown> | undefined;
  const sigB64 = (signer?.signatureB64 as string) ?? "";
  const pubKey = (signer?.publicKeyB64 as string) ?? "";
  const hasAttestation = !!(env?.attestation);
  const explorerUrl = getExplorerUrl(proof);

  const copySignature = async () => {
    await navigator.clipboard.writeText(sigB64);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-border/50 mt-2 pt-2">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mb-3">
        <div>
          <span className="text-muted-foreground">Public Key</span>
          <p className="font-mono truncate">{pubKey}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Signature</span>
          <div className="flex items-center gap-1">
            <p className="font-mono truncate flex-1">{sigB64.slice(0, 32)}...</p>
            <button onClick={copySignature} className="shrink-0 p-0.5 hover:text-foreground text-muted-foreground">
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Counter</span>
          <p className="font-mono">{entry.counter ?? "—"}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Chain Hash</span>
          <p className="font-mono truncate">{entry.prevB64 ? entry.prevB64.slice(0, 24) + "..." : "genesis"}</p>
        </div>
        {typeof commit?.epochId === "string" && (
          <div>
            <span className="text-muted-foreground">Epoch</span>
            <p className="font-mono truncate">{commit.epochId.slice(0, 24)}...</p>
          </div>
        )}
        {hasAttestation && (
          <div>
            <span className="text-muted-foreground">Attestation</span>
            <p className="text-green-500 font-medium">AWS Nitro Enclave</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => downloadProof(proof, entry.counter)}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3 w-3" />
          Export proof
        </button>

        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            View on Proof Explorer
          </a>
        )}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Raw proof JSON
      </button>

      {expanded && (
        <pre className="mt-2 p-3 rounded bg-muted text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap break-all">
          {JSON.stringify(proof, null, 2)}
        </pre>
      )}
    </div>
  );
}

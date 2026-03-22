import { Link2, Link2Off } from "lucide-react";
import type { ProofEntry } from "@/api/proofs";

interface Props {
  proofs: ProofEntry[];
}

export function ProofChainIndicator({ proofs }: Props) {
  if (proofs.length === 0) return null;

  const sorted = [...proofs].sort(
    (a, b) => parseInt(a.counter ?? "0", 10) - parseInt(b.counter ?? "0", 10),
  );

  // Check chain linkage — each proof should reference the previous via prevB64
  let linked = 0;
  for (const p of sorted) {
    if (p.prevB64) linked++;
  }
  const linkRate = sorted.length > 1 ? Math.round((linked / (sorted.length - 1)) * 100) : 100;

  // Check ordering — counters should be strictly increasing
  let ordered = true;
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseInt(sorted[i - 1].counter ?? "0", 10);
    const curr = parseInt(sorted[i].counter ?? "0", 10);
    if (curr <= prev) {
      ordered = false;
      break;
    }
  }

  const intact = ordered && linkRate >= 90;

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
        intact
          ? "text-green-500 border-green-500/30 bg-green-500/5"
          : "text-yellow-500 border-yellow-500/30 bg-yellow-500/5"
      }`}
    >
      {intact ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
      {intact ? "Chain intact" : !ordered ? "Order violation" : "Weak linkage"}
      <span className="text-muted-foreground">
        ({sorted.length} proofs, counters {sorted[0]?.counter}–{sorted[sorted.length - 1]?.counter})
      </span>
    </div>
  );
}

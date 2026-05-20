import { NextRequest, NextResponse } from "next/server";
import { getProofByDigest, getAnchorsAfterCounter } from "@/lib/s3";
import { fromUrlSafeB64 } from "@/lib/explorer";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ digest: string }> }) {
  try {
    const { digest } = await params;
    const standardB64 = fromUrlSafeB64(decodeURIComponent(digest));
    const proof = await getProofByDigest(standardB64);
    if (!proof) {
      return NextResponse.json({ proofs: [] });
    }

    // Build causal window from S3 anchors
    let causalWindow = null;
    try {
      const commit = proof.commit as { counter?: string; epochId?: string };
      if (commit?.counter && commit?.epochId) {
        const counter = parseInt(commit.counter, 10);
        const anchors = await getAnchorsAfterCounter(counter, commit.epochId, 1);
        if (anchors.length > 0) {
          const anchor = anchors[0];
          // Anchor format: { proof: { commit, attribution, artifact, ... }, ethereum, counter, epochId }
          const anchorProof = anchor.proof as Record<string, unknown> | undefined;
          const anchorCommit = (anchorProof?.commit || anchor.commit) as { counter?: string } | undefined;
          const anchorAttr = (anchorProof?.attribution || anchor.attribution) as { name?: string; title?: string; message?: string } | undefined;
          const anchorArtifact = (anchorProof?.artifact || anchor.artifact) as { digestB64?: string } | undefined;
          const eth = anchor.ethereum as { blockNumber?: number; blockHash?: string; blockTime?: number; blockTimeISO?: string } | undefined;
          const blockNumber = eth?.blockNumber?.toString() || anchorAttr?.title?.match(/\/block\/(\d+)/)?.[1];

          // Block timestamp: the anchor service writes this into every anchor at
          // commit time as metadata.anchor.blockTimeISO (signed-adjacent, advisory).
          // Reading from S3 is fast, reliable, and removes the runtime dependency
          // on third-party Ethereum RPCs. The RPC fallback below stays in place as
          // a defensive measure for any anchor that for some reason lacks the
          // field — should be rare, possibly never. Eventually the fallback can be
          // deleted once we're confident every anchor in the ledger has blockTime.
          const anchorMetadata = ((anchorProof?.metadata || anchor.metadata) as
            { anchor?: { blockTimeISO?: string; blockTime?: number } } | undefined)?.anchor;
          let blockTime: string | null =
            anchorMetadata?.blockTimeISO
            ?? eth?.blockTimeISO
            ?? (anchorMetadata?.blockTime ? new Date(anchorMetadata.blockTime * 1000).toISOString() : null)
            ?? (eth?.blockTime ? new Date(eth.blockTime * 1000).toISOString() : null);

          if (!blockTime && blockNumber) {
            // Defensive RPC fallback — only fires if the anchor's metadata is
            // missing blockTime entirely. Tight timeout so a slow node can't hang
            // the page; multiple endpoints so a single flaky RPC doesn't poison it.
            const rpcEndpoints = [
              "https://ethereum-rpc.publicnode.com",
              "https://cloudflare-eth.com",
              "https://rpc.ankr.com/eth",
            ];
            for (const endpoint of rpcEndpoints) {
              try {
                const rpcRes = await fetch(endpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBlockByNumber", params: ["0x" + parseInt(blockNumber, 10).toString(16), false], id: 1 }),
                  signal: AbortSignal.timeout(2500),
                });
                if (!rpcRes.ok) continue;
                const rpcData = await rpcRes.json() as { result?: { timestamp?: string } };
                if (rpcData.result?.timestamp) {
                  blockTime = new Date(parseInt(rpcData.result.timestamp, 16) * 1000).toISOString();
                  break;
                }
              } catch (_) { /* try next endpoint */ }
            }
          }
          causalWindow = {
            anchorBefore: null,
            anchorAfter: {
              counter: anchor.counter as string || anchorCommit?.counter || "?",
              attrName: anchorAttr?.name || "Ethereum Anchor",
              blockNumber: blockNumber ? parseInt(blockNumber, 10) : null,
              blockHash: eth?.blockHash || anchorAttr?.message || null,
              etherscanUrl: anchorAttr?.title || (blockNumber ? `https://etherscan.io/block/${blockNumber}` : null),
              blockTime,
              digestB64: anchorArtifact?.digestB64 || null,
            },
          };
        }
      }
    } catch (_) { /* non-critical */ }

    return NextResponse.json({ proofs: [{ proof }], causalWindow });
  } catch (e) {
    console.error("GET /api/proofs/digest error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

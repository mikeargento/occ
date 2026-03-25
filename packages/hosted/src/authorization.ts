/**
 * Authorization Object Module
 *
 * Authorization is not a check. It's a precondition for existence.
 * An action cannot exist unless a prior, cryptographically bound
 * authorization object already exists that makes it possible.
 */

import { sha256 } from "@noble/hashes/sha256";
import { db } from "./db.js";

const TEE_URL = "https://nitro.occproof.com";

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function canonicalize(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort()));
}

function digestOf(obj: Record<string, unknown>): string {
  return toBase64(sha256(canonicalize(obj)));
}

async function teeCommit(digestB64: string, metadata: Record<string, unknown>, policyBinding?: { authorProofDigestB64: string }, chainId?: string, principal?: { id: string; provider?: string }): Promise<{ proof: any; digestB64: string }> {
  try {
    const body: Record<string, unknown> = {
      digests: [{ digestB64, hashAlg: "sha256" }],
      metadata,
    };
    if (policyBinding) {
      body.policy = { digestB64: policyBinding.authorProofDigestB64, name: "occ-hosted" };
    }
    if (chainId) {
      body.chainId = chainId;
    }
    if (principal) {
      body.principal = principal;
    }

    const res = await fetch(`${TEE_URL}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`TEE ${res.status}`);

    const data = await res.json();
    const proof = Array.isArray(data) ? data[0] : data.proofs?.[0] ?? data;

    // Forward to explorer
    fetch("https://www.occ.wtf/api/proofs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof }),
    }).then(r => {
      if (!r.ok) console.warn("  [occ] Explorer forward failed:", r.status);
    }).catch(e => console.warn("  [occ] Explorer forward error:", e.message));

    return { proof, digestB64: proof?.artifact?.digestB64 ?? digestB64 };
  } catch (err) {
    console.warn("  [occ] TEE commit failed:", (err as Error).message);
    // Fallback: local hash (no TEE proof, but system still works)
    return { proof: null, digestB64 };
  }
}

/**
 * Create an authorization object.
 * This is the KEY. It exists BEFORE any execution.
 * The proof that results IS the authorization.
 */
export async function createAuthorizationObject(
  userId: string,
  agentId: string,
  tool: string,
  constraints?: Record<string, unknown>,
  chainId?: string,
  principal?: { id: string; provider?: string }
): Promise<{ proof: any; digest: string }> {
  // The artifact encodes what is being authorized
  const artifact = {
    type: "authorization" as const,
    tool,
    agentId,
    userId,
    constraints: constraints ?? {},
    timestamp: Date.now(),
  };
  const digest = digestOf(artifact);

  // Commit through TEE — this creates the signed authorization proof
  // chainId ensures this proof goes into the user's/agent's own chain
  const { proof, digestB64 } = await teeCommit(digest, {
    kind: "authorization",
    tool,
    agentId,
    adapter: "hosted-mcp",
    runtime: "agent.occ.wtf",
  }, undefined, chainId, principal);

  // Store the authorization object
  await db.storeAuthorization(userId, agentId, tool, "authorization", digestB64, proof, undefined, constraints);

  // Update the agent's allowed_tools cache
  await db.enableTool(userId, agentId, tool);

  return { proof, digest: digestB64 };
}

/**
 * Validate that a valid authorization object exists.
 * Returns the authorization or null.
 * No authorization = no execution path.
 */
export async function validateAuthorization(
  userId: string,
  agentId: string,
  tool: string
): Promise<{ proofDigest: string; proof: any; constraints: any } | null> {
  return db.getValidAuthorization(userId, agentId, tool);
}

/**
 * Create an execution proof.
 * The execution proof's policy binding references the authorization proof's digest.
 * This is the causal link: authorization came first, execution depends on it.
 */
export async function createExecutionProof(
  userId: string,
  agentId: string,
  tool: string,
  args: unknown,
  authorizationDigest: string,
  chainId?: string,
  principal?: { id: string; provider?: string }
): Promise<{ proof: any; digest: string }> {
  const artifact = {
    type: "execution" as const,
    tool,
    agentId,
    args,
    timestamp: Date.now(),
  };
  const digest = digestOf(artifact);

  // The policy binding points to the authorization proof — the causal link
  const { proof, digestB64 } = await teeCommit(digest, {
    kind: "execution",
    tool,
    agentId,
    authorizationDigest,
    adapter: "hosted-mcp",
    runtime: "agent.occ.wtf",
  }, { authorProofDigestB64: authorizationDigest }, chainId, principal);

  // Store in proof log
  await db.addProof(userId, {
    agentId,
    tool,
    allowed: true,
    args,
    proofDigest: digestB64,
    receipt: proof,
    reason: `Authorized by ${authorizationDigest}`,
  });

  await db.incrementAgentCalls(userId, agentId, true);

  return { proof, digest: digestB64 };
}

/**
 * Commit a policy as a proof.
 * The policy proof is the RULE. It exists before any authorization.
 * Every authorization references this proof's digest.
 * Change the policy → new proof → old authorizations are re-evaluated.
 */
export async function commitPolicyProof(
  userId: string,
  policy: { categories: Record<string, boolean>; customRules: string[] },
  chainId?: string,
  principal?: { id: string; provider?: string }
): Promise<{ proof: any; digest: string }> {
  const artifact = {
    type: "policy" as const,
    userId,
    categories: policy.categories,
    customRules: policy.customRules,
    timestamp: Date.now(),
  };
  const digest = digestOf(artifact);

  const { proof, digestB64 } = await teeCommit(digest, {
    kind: "policy-commitment",
    userId,
    adapter: "hosted-mcp",
    runtime: "agent.occ.wtf",
  }, undefined, chainId, principal);

  return { proof, digest: digestB64 };
}

/**
 * Create a revocation object.
 * The revocation supersedes the authorization.
 * After revocation, no execution path exists until a new authorization is created.
 */
export async function createRevocationObject(
  userId: string,
  agentId: string,
  tool: string,
  authorizationDigest: string,
  chainId?: string,
  principal?: { id: string; provider?: string }
): Promise<{ proof: any; digest: string }> {
  const artifact = {
    type: "revocation" as const,
    tool,
    agentId,
    userId,
    authorizationDigest,
    timestamp: Date.now(),
  };
  const digest = digestOf(artifact);

  const { proof, digestB64 } = await teeCommit(digest, {
    kind: "revocation",
    tool,
    agentId,
    authorizationDigest,
    adapter: "hosted-mcp",
    runtime: "agent.occ.wtf",
  }, undefined, chainId, principal);

  // Store revocation
  await db.storeAuthorization(userId, agentId, tool, "revocation", digestB64, proof, authorizationDigest);

  // Update cache: remove from allowed
  await db.disableTool(userId, agentId, tool);

  return { proof, digest: digestB64 };
}

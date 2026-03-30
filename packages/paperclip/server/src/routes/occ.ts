/**
 * OCC Proof API Routes
 *
 * Exposes OCC proof digests and explorer links for runs and approvals.
 */

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns, approvals } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { occService } from "../services/occ.js";
import { assertBoard } from "../middleware/auth.js";

export function occRoutes(db: Db) {
  const router = Router();
  const occ = occService();

  // Get OCC proofs for a run
  router.get("/runs/:runId/occ-proofs", async (req, res) => {
    assertBoard(req);
    const runId = req.params.runId as string;

    const [run] = await db
      .select({
        id: heartbeatRuns.id,
        occAuthDigestB64: heartbeatRuns.occAuthDigestB64,
        occProofDigestB64: heartbeatRuns.occProofDigestB64,
      })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId))
      .limit(1);

    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    res.json({
      runId: run.id,
      occEnabled: occ.isEnabled(),
      authorization: run.occAuthDigestB64
        ? { digestB64: run.occAuthDigestB64, explorerUrl: occ.explorerUrl(run.occAuthDigestB64) }
        : null,
      execution: run.occProofDigestB64
        ? { digestB64: run.occProofDigestB64, explorerUrl: occ.explorerUrl(run.occProofDigestB64) }
        : null,
    });
  });

  // Get OCC proof for an approval
  router.get("/approvals/:id/occ-proof", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;

    const [approval] = await db
      .select({
        id: approvals.id,
        occProofDigestB64: approvals.occProofDigestB64,
      })
      .from(approvals)
      .where(eq(approvals.id, id))
      .limit(1);

    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }

    res.json({
      approvalId: approval.id,
      occEnabled: occ.isEnabled(),
      proof: approval.occProofDigestB64
        ? { digestB64: approval.occProofDigestB64, explorerUrl: occ.explorerUrl(approval.occProofDigestB64) }
        : null,
    });
  });

  // OCC status
  router.get("/occ/status", (_req, res) => {
    res.json({
      enabled: occ.isEnabled(),
      explorerUrl: occ.isEnabled() ? occ.explorerUrl("") : null,
    });
  });

  return router;
}

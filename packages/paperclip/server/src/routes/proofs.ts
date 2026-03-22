import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { proofService } from "../services/proofs.js";
import { assertCompanyAccess } from "./authz.js";

export function proofRoutes(db: Db) {
  const router = Router();
  const svc = proofService(db);

  router.get("/companies/:companyId/proofs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const filters = {
      agentId: req.query.agentId as string | undefined,
      proofType: req.query.proofType as string | undefined,
      enforcement: req.query.enforcement as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    };
    const result = await svc.listProofs(companyId, filters);
    res.json(result);
  });

  router.get("/companies/:companyId/proofs/stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const stats = await svc.getProofStats(companyId);
    res.json(stats);
  });

  router.get("/companies/:companyId/proofs/runs/:runId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const proofs = await svc.getProofsForRun(req.params.runId as string);
    res.json(proofs);
  });

  // Export all proofs as JSONL
  router.get("/companies/:companyId/proofs/export", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const filters = {
      agentId: req.query.agentId as string | undefined,
      proofType: req.query.proofType as string | undefined,
      enforcement: req.query.enforcement as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      limit: 10000,
      offset: 0,
    };
    const result = await svc.listProofs(companyId, filters);
    const filename = `occ-proofs-${companyId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.jsonl`;
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    for (const p of result.proofs) {
      res.write(JSON.stringify(p.proof) + "\n");
    }
    res.end();
  });

  // Export a single proof as JSON
  router.get("/companies/:companyId/proofs/export/:proofId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const proofId = req.params.proofId as string;
    assertCompanyAccess(req, companyId);

    // proofId format: "run:<runId>:pre", "run:<runId>:post", "event:<eventId>"
    const parts = proofId.split(":");
    let proof: Record<string, unknown> | null = null;

    if (parts[0] === "run" && parts[1]) {
      const runProofs = await svc.getProofsForRun(parts[1]);
      const match = runProofs.find((p) => p.id === proofId);
      if (match) proof = match.proof;
    } else if (parts[0] === "event") {
      // Search in all proofs (not ideal but works)
      const result = await svc.listProofs(companyId, { limit: 10000, offset: 0 });
      const match = result.proofs.find((p) => p.id === proofId);
      if (match) proof = match.proof;
    }

    if (!proof) {
      res.status(404).json({ error: "Proof not found" });
      return;
    }

    const commit = proof.commit as Record<string, unknown> | undefined;
    const counter = (commit?.counter as string) ?? "unknown";
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="occ-proof-${counter}.json"`);
    res.json(proof);
  });

  return router;
}

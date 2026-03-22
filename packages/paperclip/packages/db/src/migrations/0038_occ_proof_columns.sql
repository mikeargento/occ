-- OCC Protocol: Add cryptographic proof columns
DO $$ BEGIN
  ALTER TABLE "heartbeat_runs" ADD COLUMN "occ_proof_pre_exec" jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "heartbeat_runs" ADD COLUMN "occ_proof_post_exec" jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "heartbeat_run_events" ADD COLUMN "occ_proof" jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

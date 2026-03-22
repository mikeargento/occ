-- Convergence Prime Verification System
-- Cryptographic multi-agent review protocol with OCC proofs

-- Add convergence columns to issues
DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "convergence_prime" integer;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "issues" ADD COLUMN "consensus_mode" text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Convergence cycles: tracks one review cycle per issue
CREATE TABLE IF NOT EXISTS "convergence_cycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "issue_id" uuid NOT NULL REFERENCES "issues"("id"),
  "cycle_number" integer NOT NULL DEFAULT 1,
  "convergence_prime" integer NOT NULL,
  "consensus_mode" text NOT NULL DEFAULT 'unanimous',
  "status" text NOT NULL DEFAULT 'open',
  "author_agent_id" uuid REFERENCES "agents"("id"),
  "artifact_digest_b64" text,
  "board_override_by" text,
  "board_override_at" timestamptz,
  "board_override_proof" jsonb,
  "rejected_at" timestamptz,
  "rejected_by_agent_id" uuid REFERENCES "agents"("id"),
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "convergence_cycles_company_issue_status_idx"
  ON "convergence_cycles" ("company_id", "issue_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "convergence_cycles_issue_cycle_idx"
  ON "convergence_cycles" ("issue_id", "cycle_number");

-- Convergence votes: each signed vote (approve/reject) in a cycle
CREATE TABLE IF NOT EXISTS "convergence_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "cycle_id" uuid NOT NULL REFERENCES "convergence_cycles"("id"),
  "voter_agent_id" uuid NOT NULL REFERENCES "agents"("id"),
  "vote_type" text NOT NULL,
  "sequence" integer NOT NULL,
  "occ_proof" jsonb NOT NULL,
  "proof_hash_b64" text NOT NULL,
  "prev_proof_hash_b64" text,
  "review_note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "convergence_votes_cycle_voter_idx"
  ON "convergence_votes" ("cycle_id", "voter_agent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "convergence_votes_cycle_sequence_idx"
  ON "convergence_votes" ("cycle_id", "sequence");
CREATE INDEX IF NOT EXISTS "convergence_votes_company_cycle_idx"
  ON "convergence_votes" ("company_id", "cycle_id");

-- Convergence Prime: company-level defaults (always on)
DO $$ BEGIN
  ALTER TABLE "companies" ADD COLUMN "convergence_prime" integer NOT NULL DEFAULT 3;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "companies" ADD COLUMN "consensus_mode" text NOT NULL DEFAULT 'unanimous';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

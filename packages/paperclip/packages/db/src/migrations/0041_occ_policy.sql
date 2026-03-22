ALTER TABLE "agents" ADD COLUMN "occ_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "scenarios" ADD COLUMN IF NOT EXISTS "hospital_states" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- Add standing column to companies so we can filter active vs inactive clients.
-- Nullable because existing rows won't have a value until the next sync run.
ALTER TABLE companies ADD COLUMN standing text;

CREATE INDEX idx_companies_standing ON companies(standing);

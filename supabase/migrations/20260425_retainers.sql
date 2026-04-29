-- Manual retainer ranges. Each row is a billing period with a monthly value.
-- Active range = end_date IS NULL. When price changes, close old range and insert new.

CREATE TABLE IF NOT EXISTS retainers (
  id                 bigserial PRIMARY KEY,
  company_accelo_id  int NOT NULL,
  monthly_value      numeric NOT NULL DEFAULT 0,
  start_date         date NOT NULL,
  end_date           date,
  created_by         int,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX idx_retainers_company ON retainers(company_accelo_id);
CREATE INDEX idx_retainers_active ON retainers(company_accelo_id) WHERE end_date IS NULL;

ALTER TABLE retainers ENABLE ROW LEVEL SECURITY;

CREATE POLICY retainers_manager_select
  ON retainers FOR SELECT TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY retainers_manager_write
  ON retainers FOR ALL TO authenticated
  USING (auth_role() = 'manager')
  WITH CHECK (auth_role() = 'manager');

CREATE POLICY retainers_service_write
  ON retainers FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TABLE IF EXISTS contracts;

-- =============================================================================
-- Phase 5: Client Health Layer
-- Invoices, contracts, and computed health scores.
-- Invoices and contracts are synced from Accelo; health scores are computed
-- by the compute-health cron job.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- invoices (synced from Accelo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id           bigserial PRIMARY KEY,
  accelo_id    int UNIQUE NOT NULL,
  company_id   int,
  standing     text,
  date_issued  timestamptz,
  date_due     timestamptz,
  date_paid    timestamptz,
  total        numeric DEFAULT 0,
  outstanding  numeric DEFAULT 0,
  synced_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_standing ON invoices(standing);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_manager_select
  ON invoices
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY invoices_service_write
  ON invoices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- contracts (synced from Accelo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  accelo_id    int PRIMARY KEY,
  company_id   int,
  title        text,
  value        numeric DEFAULT 0,
  standing     text,
  date_expires timestamptz,
  synced_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_contracts_company ON contracts(company_id);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_manager_select
  ON contracts
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY contracts_service_write
  ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- health_scores (computed by compute-health cron)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS health_scores (
  company_accelo_id  int PRIMARY KEY,
  score              numeric DEFAULT 0,
  interaction_score  numeric DEFAULT 0,
  invoice_score      numeric DEFAULT 0,
  task_score         numeric DEFAULT 0,
  contract_score     numeric DEFAULT 0,
  computed_at        timestamptz DEFAULT now()
);

ALTER TABLE health_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_scores_manager_select
  ON health_scores
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY health_scores_service_write
  ON health_scores
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Add invoices watermark to sync_watermarks
-- ---------------------------------------------------------------------------
INSERT INTO sync_watermarks (entity) VALUES ('invoices')
  ON CONFLICT (entity) DO NOTHING;

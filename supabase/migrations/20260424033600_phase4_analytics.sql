-- =============================================================================
-- Phase 4: Operational Analytics
-- Adds analytics_snapshots and task_flags tables.
-- Adds a `note` column to the existing task_transitions table.
-- task_transitions already exists (migration 0003) with columns:
--   id, task_accelo_id, from_status_id, to_status_id, transitioned_at, detected_at
-- =============================================================================

-- ---------------------------------------------------------------------------
-- task_transitions: add `note` column for manual status-change annotations
-- ---------------------------------------------------------------------------
ALTER TABLE task_transitions ADD COLUMN IF NOT EXISTS note text;

-- Ensure index on changed_at (transitioned_at) exists for recent-transition queries
CREATE INDEX IF NOT EXISTS idx_task_transitions_transitioned
  ON task_transitions(transitioned_at DESC);

-- Insert policy for service-role writes (cron + API write-back)
-- RLS is already enabled and SELECT policies exist from migration 0004.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'task_transitions' AND policyname = 'transitions_insert_service'
  ) THEN
    CREATE POLICY transitions_insert_service ON task_transitions
      FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- analytics_snapshots: hourly rollup of utilization / revenue / margin per staff
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_start    date        NOT NULL,
  period_end      date        NOT NULL,
  period_type     text        NOT NULL,
  staff_id        int,
  company_id      int,
  billable_hrs    numeric     DEFAULT 0,
  nonbillable_hrs numeric     DEFAULT 0,
  utilization     numeric     DEFAULT 0,
  revenue         numeric     DEFAULT 0,
  cost            numeric     DEFAULT 0,
  margin          numeric     DEFAULT 0,
  tasks_completed int         DEFAULT 0,
  computed_at     timestamptz DEFAULT now(),
  UNIQUE (period_start, period_end, period_type, staff_id)
);

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- Managers only — workers never see aggregated analytics
CREATE POLICY analytics_manager_read ON analytics_snapshots
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

-- ---------------------------------------------------------------------------
-- task_flags: escalation flags (overdue, blocked, etc.) set by managers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_flags (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_accelo_id int         NOT NULL,
  flag_type      text        NOT NULL,
  created_by     int,
  created_at     timestamptz DEFAULT now(),
  resolved_at    timestamptz,
  resolved_by    int,
  note           text
);

CREATE INDEX idx_task_flags_task ON task_flags(task_accelo_id);
CREATE INDEX idx_task_flags_unresolved ON task_flags(task_accelo_id) WHERE resolved_at IS NULL;

ALTER TABLE task_flags ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read flags
CREATE POLICY flags_read_all ON task_flags
  FOR SELECT
  TO authenticated
  USING (true);

-- Managers can insert, update, delete flags
CREATE POLICY flags_manager_write ON task_flags
  FOR ALL
  TO authenticated
  USING (auth_role() = 'manager')
  WITH CHECK (auth_role() = 'manager');

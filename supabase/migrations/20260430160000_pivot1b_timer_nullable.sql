-- =============================================================================
-- Pivot 1B: Make time_entries support running timers
-- A running timer is an entry with stopped_at IS NULL, duration_seconds = 0,
-- rounded_seconds = 0. These fields must be nullable / have defaults to allow
-- INSERT of a running entry.
-- =============================================================================

ALTER TABLE time_entries ALTER COLUMN stopped_at DROP NOT NULL;
ALTER TABLE time_entries ALTER COLUMN duration_seconds SET DEFAULT 0;
ALTER TABLE time_entries ALTER COLUMN rounded_seconds SET DEFAULT 0;

-- Workers need to UPDATE their own running entries (set stopped_at, description, etc.)
CREATE POLICY time_entries_worker_update
  ON time_entries FOR UPDATE TO authenticated
  USING (auth_role() = 'worker' AND user_id = auth.uid())
  WITH CHECK (auth_role() = 'worker' AND user_id = auth.uid());

-- Managers can update any entry (corrections, billing adjustments)
CREATE POLICY time_entries_manager_update
  ON time_entries FOR UPDATE TO authenticated
  USING (auth_role() = 'manager')
  WITH CHECK (auth_role() = 'manager');

-- Index to quickly find the active (running) timer for a user
CREATE INDEX idx_time_entries_active_user
  ON time_entries(user_id) WHERE stopped_at IS NULL;

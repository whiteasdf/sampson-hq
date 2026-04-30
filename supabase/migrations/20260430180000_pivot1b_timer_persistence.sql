-- =============================================================================
-- Pivot 1B: Timer Persistence — View, Unique Constraint
--
-- Builds on the timer_nullable migration (20260430160000) which made
-- stopped_at nullable, added UPDATE RLS policies, and created a non-unique
-- index on active entries.
--
-- This migration adds:
--   1. A view `active_time_entries` (with security_barrier) for quick lookups
--   2. A unique partial index enforcing at most ONE active timer per user
--   3. GRANT SELECT on the view to authenticated role
-- =============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. View: active_time_entries (with security_barrier)                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE VIEW active_time_entries
  WITH (security_barrier = true) AS
  SELECT * FROM time_entries WHERE stopped_at IS NULL;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. Unique partial index — at most ONE active timer per user             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Critical safety constraint. Without it, concurrent START requests
-- could create duplicate running timers for the same user. The database
-- enforces the invariant regardless of application bugs or race conditions.

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_one_active_per_user
  ON time_entries(user_id) WHERE stopped_at IS NULL;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. GRANT SELECT on the view to authenticated role                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

GRANT SELECT ON active_time_entries TO authenticated;

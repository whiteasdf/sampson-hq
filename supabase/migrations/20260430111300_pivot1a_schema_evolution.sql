-- =============================================================================
-- Pivot 1A: Schema Evolution
-- Foundation for the Supabase-first pivot. Creates new tables (time_entries,
-- sync_failures, recurring_task_templates), alters tasks for native ownership,
-- and applies RLS policies for all new/modified tables.
--
-- Linear: GAR-990, GAR-991, GAR-992, GAR-993, GAR-994
-- =============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. ALTER tasks — Supabase-native ownership                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Make accelo_id nullable — tasks created in-app won't have one until synced.
-- Keep the UNIQUE constraint: PostgreSQL treats NULLs as distinct in unique
-- indexes, so multiple rows with accelo_id=NULL are allowed. This preserves
-- compatibility with existing upsert calls using onConflict: "accelo_id".
ALTER TABLE tasks ALTER COLUMN accelo_id DROP NOT NULL;

-- New pivot columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS synced_to_accelo_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by          uuid REFERENCES auth.users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at          timestamptz;

-- Backfill: all existing rows came from Accelo, mark them as synced
UPDATE tasks SET synced_to_accelo_at = now() WHERE synced_to_accelo_at IS NULL AND accelo_id IS NOT NULL;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_tasks_unsynced  ON tasks(id) WHERE synced_to_accelo_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_active    ON tasks(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deleted   ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. time_entries — Supabase-native time records                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE time_entries (
  id                bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           uuid         NOT NULL REFERENCES auth.users(id),
  staff_accelo_id   int          NOT NULL,
  task_id           bigint       NOT NULL REFERENCES tasks(id),
  started_at        timestamptz  NOT NULL,
  stopped_at        timestamptz  NOT NULL,
  duration_seconds  int          NOT NULL,
  rounded_seconds   int          NOT NULL,
  billable          boolean      NOT NULL DEFAULT true,
  rate_id           int          REFERENCES rates(id),
  description       text,
  synced_to_accelo_at timestamptz,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_entries_user_id         ON time_entries(user_id);
CREATE INDEX idx_time_entries_task_id         ON time_entries(task_id);
CREATE INDEX idx_time_entries_staff_accelo_id ON time_entries(staff_accelo_id);
CREATE INDEX idx_time_entries_unsynced        ON time_entries(id) WHERE synced_to_accelo_at IS NULL;
CREATE INDEX idx_time_entries_created         ON time_entries(created_at DESC);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. sync_failures — outbound sync retry queue                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE sync_failures (
  id             bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type    text         NOT NULL,
  entity_id      bigint       NOT NULL,
  operation      text         NOT NULL,
  payload        jsonb,
  error_message  text,
  attempts       int          NOT NULL DEFAULT 0,
  max_attempts   int          NOT NULL DEFAULT 5,
  next_retry_at  timestamptz,
  resolved_at    timestamptz,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_failures_pending
  ON sync_failures(next_retry_at ASC)
  WHERE resolved_at IS NULL AND attempts < max_attempts;

CREATE INDEX idx_sync_failures_entity
  ON sync_failures(entity_type, entity_id);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. recurring_task_templates — manager-configured recurrence              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE recurring_task_templates (
  id                bigint     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title             text       NOT NULL,
  company_id        int,
  assignee_id       int,
  recurrence        text       NOT NULL DEFAULT 'daily',
  day_of_week       int,
  day_of_month      int,
  default_status_id int        REFERENCES task_statuses(id) DEFAULT 2,
  budgeted_seconds  int,
  active            boolean    NOT NULL DEFAULT true,
  created_by        uuid       REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_templates_active
  ON recurring_task_templates(id) WHERE active = true;

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER recurring_task_templates_set_updated_at
  BEFORE UPDATE ON recurring_task_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. RLS — new tables                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ── time_entries ─────────────────────────────────────────────────────────────

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_entries_worker_select
  ON time_entries FOR SELECT TO authenticated
  USING (auth_role() = 'worker' AND user_id = auth.uid());

CREATE POLICY time_entries_manager_select
  ON time_entries FOR SELECT TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY time_entries_insert_own
  ON time_entries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY time_entries_service_all
  ON time_entries FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── sync_failures ────────────────────────────────────────────────────────────

ALTER TABLE sync_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_failures_manager_select
  ON sync_failures FOR SELECT TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY sync_failures_service_all
  ON sync_failures FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── recurring_task_templates ─────────────────────────────────────────────────

ALTER TABLE recurring_task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_manager_all
  ON recurring_task_templates FOR ALL TO authenticated
  USING (auth_role() = 'manager')
  WITH CHECK (auth_role() = 'manager');

CREATE POLICY templates_worker_select
  ON recurring_task_templates FOR SELECT TO authenticated
  USING (auth_role() = 'worker');

CREATE POLICY templates_service_all
  ON recurring_task_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. RLS — update existing tasks policies for soft-delete + write         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Drop existing SELECT policies and recreate with soft-delete filter
DROP POLICY IF EXISTS tasks_manager_select ON tasks;
DROP POLICY IF EXISTS tasks_worker_select  ON tasks;

CREATE POLICY tasks_manager_select
  ON tasks FOR SELECT TO authenticated
  USING (auth_role() = 'manager' AND deleted_at IS NULL);

CREATE POLICY tasks_worker_select
  ON tasks FOR SELECT TO authenticated
  USING (
    auth_role() = 'worker'
    AND deleted_at IS NULL
    AND (
      assignee_id = auth_staff_id()
      OR company_id IN (
        SELECT company_accelo_id FROM company_managers
        WHERE staff_accelo_id = auth_staff_id()
      )
    )
  );

-- INSERT: managers can create any task; workers can only create tasks assigned to themselves
CREATE POLICY tasks_manager_insert
  ON tasks FOR INSERT TO authenticated
  WITH CHECK (auth_role() = 'manager' AND deleted_at IS NULL);

CREATE POLICY tasks_worker_insert
  ON tasks FOR INSERT TO authenticated
  WITH CHECK (
    auth_role() = 'worker'
    AND deleted_at IS NULL
    AND assignee_id = auth_staff_id()
  );

-- UPDATE: managers can update any active task; workers can update their own
CREATE POLICY tasks_manager_update
  ON tasks FOR UPDATE TO authenticated
  USING (auth_role() = 'manager' AND deleted_at IS NULL)
  WITH CHECK (auth_role() = 'manager');

CREATE POLICY tasks_worker_update
  ON tasks FOR UPDATE TO authenticated
  USING (
    auth_role() = 'worker'
    AND deleted_at IS NULL
    AND assignee_id = auth_staff_id()
  )
  WITH CHECK (
    auth_role() = 'worker'
    AND assignee_id = auth_staff_id()
  );

-- service_role: full access for cron sync
CREATE POLICY tasks_service_all
  ON tasks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- NOTE: No sync_watermarks entries for time_entries or sync_failures —
-- these are Supabase-native tables with outbound push, not inbound sync.
-- Outbound sync state is tracked via synced_to_accelo_at and sync_failures.

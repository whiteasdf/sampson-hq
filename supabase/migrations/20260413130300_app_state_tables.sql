-- =============================================================================
-- Migration 3: App State Tables
-- Application-specific state that lives in Supabase (not mirrored from Accelo).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- sync_watermarks
-- Tracks the high-water mark for each entity's cron sync job (Phase 4).
-- ---------------------------------------------------------------------------
CREATE TABLE sync_watermarks (
  entity         text        PRIMARY KEY,
  last_synced_at timestamptz NOT NULL DEFAULT '1970-01-01'
);

INSERT INTO sync_watermarks (entity) VALUES
  ('staff'),
  ('companies'),
  ('tasks'),
  ('activities');

-- ---------------------------------------------------------------------------
-- company_managers
-- Maps which staff member(s) manage which company.
-- Populated manually by managers after Phase 1.
-- Uses accelo_ids directly (no FK — mirrors tables use accelo_id as unique key,
-- not PK, so a direct FK cannot be declared here without extra complexity).
-- ---------------------------------------------------------------------------
CREATE TABLE company_managers (
  company_accelo_id  int NOT NULL,
  staff_accelo_id    int NOT NULL,
  PRIMARY KEY (company_accelo_id, staff_accelo_id)
);

-- ---------------------------------------------------------------------------
-- staff_cost_rates
-- Internal hourly cost per staff member, editable by managers (Phase 5).
-- ---------------------------------------------------------------------------
CREATE TABLE staff_cost_rates (
  staff_accelo_id  int            PRIMARY KEY,
  hourly_cost      numeric(10, 2),
  effective_from   date           NOT NULL DEFAULT CURRENT_DATE
);

-- ---------------------------------------------------------------------------
-- app_config
-- Global settings (key/value, JSON values for flexibility).
-- ---------------------------------------------------------------------------
CREATE TABLE app_config (
  key   text  PRIMARY KEY,
  value jsonb NOT NULL
);

-- ---------------------------------------------------------------------------
-- user_preferences
-- Per-user UI preferences. Cascades on auth user deletion.
-- ---------------------------------------------------------------------------
CREATE TABLE user_preferences (
  user_id     uuid  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- task_transitions
-- Written by the sync-tasks cron when it detects a status change on a task.
-- Provides an audit trail of task lifecycle events.
-- ---------------------------------------------------------------------------
CREATE TABLE task_transitions (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_accelo_id   int    NOT NULL,
  from_status_id   int,
  to_status_id     int,
  transitioned_at  timestamptz NOT NULL DEFAULT now(),
  detected_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_transitions_task_accelo_id ON task_transitions(task_accelo_id);

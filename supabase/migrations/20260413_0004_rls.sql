-- =============================================================================
-- Migration 4: Row Level Security
-- Uses STABLE SECURITY DEFINER helper functions for JWT claims to avoid
-- per-row subselect overhead that would occur with inline auth.jwt() calls.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- JWT helper functions
-- Read from app_metadata (NOT user_metadata) — app_metadata is server-only
-- and cannot be overwritten by the client. user_metadata is user-writable,
-- which would allow any worker to self-promote to manager via updateUser().
-- Set these fields via the Supabase Admin API (seed-auth-users.ts).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_staff_id() RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT (auth.jwt() -> 'app_metadata' ->> 'staff_accelo_id')::int;
  $$;

CREATE OR REPLACE FUNCTION auth_role() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT auth.jwt() -> 'app_metadata' ->> 'role';
  $$;

-- ---------------------------------------------------------------------------
-- Cross-table subquery helpers (SECURITY DEFINER bypasses RLS inside policies)
-- These prevent recursive RLS evaluation when policies reference other tables.
-- Called only from within USING clauses — never from client queries.
-- ---------------------------------------------------------------------------

-- Returns company accelo_ids the current worker has assigned tasks for.
CREATE OR REPLACE FUNCTION worker_task_company_ids() RETURNS SETOF int
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT DISTINCT company_id
    FROM tasks
    WHERE assignee_id = auth_staff_id()
      AND company_id IS NOT NULL;
  $$;

-- Returns task accelo_ids visible to the current worker (assigned + managed companies).
CREATE OR REPLACE FUNCTION worker_visible_task_ids() RETURNS SETOF int
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT accelo_id FROM tasks
    WHERE
      assignee_id = auth_staff_id()
      OR company_id IN (
        SELECT company_accelo_id FROM company_managers
        WHERE staff_accelo_id = auth_staff_id()
      );
  $$;

-- ---------------------------------------------------------------------------
-- Enable RLS on all controlled tables
-- ---------------------------------------------------------------------------
ALTER TABLE staff              ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_managers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_cost_rates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences   ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_transitions   ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- STAFF
-- Managers see all rows; workers see only their own row.
-- =============================================================================
CREATE POLICY staff_manager_select
  ON staff
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY staff_worker_select
  ON staff
  FOR SELECT
  TO authenticated
  USING (
    auth_role() = 'worker'
    AND accelo_id = auth_staff_id()
  );

-- =============================================================================
-- COMPANIES
-- Managers see all rows.
-- Workers see companies where they have an assigned task, or where they are
-- listed as a company manager.
-- =============================================================================
CREATE POLICY companies_manager_select
  ON companies
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY companies_worker_select
  ON companies
  FOR SELECT
  TO authenticated
  USING (
    auth_role() = 'worker'
    AND (
      accelo_id IN (SELECT worker_task_company_ids())
      OR accelo_id IN (
        SELECT company_accelo_id FROM company_managers
        WHERE staff_accelo_id = auth_staff_id()
      )
    )
  );

-- =============================================================================
-- TASKS
-- Managers see all rows.
-- Workers see tasks they are assigned to, or tasks belonging to companies
-- they manage.
-- =============================================================================
CREATE POLICY tasks_manager_select
  ON tasks
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY tasks_worker_select
  ON tasks
  FOR SELECT
  TO authenticated
  USING (
    auth_role() = 'worker'
    AND (
      assignee_id = auth_staff_id()
      OR company_id IN (
        SELECT company_accelo_id FROM company_managers
        WHERE staff_accelo_id = auth_staff_id()
      )
    )
  );

-- =============================================================================
-- ACTIVITIES
-- Managers see all rows; workers see only their own logged activities.
-- =============================================================================
CREATE POLICY activities_manager_select
  ON activities
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY activities_worker_select
  ON activities
  FOR SELECT
  TO authenticated
  USING (
    auth_role() = 'worker'
    AND staff_id = auth_staff_id()
  );

-- =============================================================================
-- COMPANY_MANAGERS
-- Managers see all rows; workers see only their own manager assignments.
-- =============================================================================
CREATE POLICY company_managers_manager_select
  ON company_managers
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY company_managers_worker_select
  ON company_managers
  FOR SELECT
  TO authenticated
  USING (
    auth_role() = 'worker'
    AND staff_accelo_id = auth_staff_id()
  );

-- =============================================================================
-- STAFF_COST_RATES
-- Managers only — workers never see internal cost data.
-- =============================================================================
CREATE POLICY staff_cost_rates_manager_select
  ON staff_cost_rates
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

-- =============================================================================
-- USER_PREFERENCES
-- Each user can perform all operations on their own row only.
-- =============================================================================
CREATE POLICY user_preferences_owner_all
  ON user_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- TASK_TRANSITIONS
-- Managers see all transitions; workers see transitions for their assigned tasks.
-- =============================================================================
CREATE POLICY task_transitions_manager_select
  ON task_transitions
  FOR SELECT
  TO authenticated
  USING (auth_role() = 'manager');

CREATE POLICY task_transitions_worker_select
  ON task_transitions
  FOR SELECT
  TO authenticated
  USING (
    auth_role() = 'worker'
    AND task_accelo_id IN (SELECT worker_visible_task_ids())
  );

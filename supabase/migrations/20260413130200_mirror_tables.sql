-- =============================================================================
-- Migration 2: Mirror Tables
-- Read-layer cache of Accelo entities, populated by Phase 4 cron sync jobs.
-- accelo_id is the external unique key used for upserts; it is NOT the PK.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
CREATE TABLE staff (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  accelo_id  int    NOT NULL UNIQUE,
  firstname  text,
  surname    text,
  email      text,
  username   text,
  rate_id    int    REFERENCES rates(id),
  synced_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
CREATE TABLE companies (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  accelo_id  int    NOT NULL UNIQUE,
  name       text   NOT NULL,
  synced_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- tasks
-- assignee_id stores staff.accelo_id (not FK — avoids cross-table accelo_id
-- constraint overhead; sync job is responsible for referential integrity).
-- company_id  stores companies.accelo_id for the same reason.
-- ---------------------------------------------------------------------------
CREATE TABLE tasks (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  accelo_id    int    NOT NULL UNIQUE,
  title        text   NOT NULL,
  status_id    int    REFERENCES task_statuses(id),
  assignee_id  int,   -- stores staff.accelo_id
  company_id   int,   -- stores companies.accelo_id
  job_id       int,
  due_date     date,
  created_at   timestamptz,
  synced_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX idx_tasks_company_id  ON tasks(company_id);
CREATE INDEX idx_tasks_status_id   ON tasks(status_id);

-- ---------------------------------------------------------------------------
-- activities
-- staff_id stores staff.accelo_id.
-- task_id  stores tasks.accelo_id — sourced from activity.task?.id, NOT
--          activity.against_id, because Accelo re-parents activities.
-- ---------------------------------------------------------------------------
CREATE TABLE activities (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  accelo_id        int    NOT NULL UNIQUE,
  staff_id         int,          -- stores staff.accelo_id
  task_id          int,          -- stores tasks.accelo_id (via activity.task?.id)
  company_id       int,
  date_created     timestamptz,
  date_logged      timestamptz,
  duration_seconds int,
  rate_id          int,
  subject          text,
  synced_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activities_staff_id   ON activities(staff_id);
CREATE INDEX idx_activities_task_id    ON activities(task_id);
CREATE INDEX idx_activities_date_logged ON activities(date_logged);

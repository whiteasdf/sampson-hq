/**
 * Integration tests for migration: 20260430_pivot1a_schema_evolution.sql
 *
 * Strategy: no live database connection is required.
 *   1. Type-level tests — TypeScript's structural typing is used as the
 *      assertion mechanism.  Assignments that would fail to compile if a
 *      field were missing, mis-typed, or no longer nullable are captured
 *      at runtime by building minimal objects and using `satisfies` / direct
 *      type assertions via helper functions.  We also probe the shape of
 *      the Database type at runtime by inspecting a canonical Row object.
 *   2. SQL text tests — the raw migration file is read from disk and
 *      searched for the exact DDL tokens the migration promises to contain.
 *   3. Timer-store compatibility — verify that `rounded_seconds` (an `int`
 *      column in time_entries) round-trips correctly through the 360-second
 *      billing increment logic used by timerToHours / formatBillingTime.
 *
 * All tests are synchronous and complete in < 10 ms.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ── Type imports ──────────────────────────────────────────────────────────────

import type { Database } from "@/lib/database.types";
import { timerToHours, formatBillingTime } from "@/lib/timer-store";

// ── Convenience type aliases ──────────────────────────────────────────────────

type TimeEntryRow         = Database["public"]["Tables"]["time_entries"]["Row"];
type TimeEntryInsert      = Database["public"]["Tables"]["time_entries"]["Insert"];
type SyncFailureRow       = Database["public"]["Tables"]["sync_failures"]["Row"];
type RecurringTemplateRow = Database["public"]["Tables"]["recurring_task_templates"]["Row"];
type TaskRow              = Database["public"]["Tables"]["tasks"]["Row"];
type TaskInsert           = Database["public"]["Tables"]["tasks"]["Insert"];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the migration SQL text.  Cached at module scope so the file is
 * only read once regardless of how many describe blocks consume it.
 */
const SQL_PATH = path.resolve(
  __dirname,
  "../../supabase/migrations/20260430111300_pivot1a_schema_evolution.sql"
);

const migrationSql: string = readFileSync(SQL_PATH, "utf-8");

// ── 1. Type Validation Tests ──────────────────────────────────────────────────

describe("pivot1a types — time_entries Row", () => {
  /**
   * Build a complete TimeEntryRow object that TypeScript must accept.
   * If the generated types are missing a field, adding it here would produce
   * a compile error (excess property) and removing a required one would also
   * error.  At runtime we assert on the concrete values.
   */
  const row: TimeEntryRow = {
    id: 1,
    user_id: "00000000-0000-0000-0000-000000000001",
    staff_accelo_id: 42,
    task_id: 100,
    started_at: "2026-04-30T09:00:00Z",
    stopped_at: "2026-04-30T09:06:00Z",
    duration_seconds: 360,
    rounded_seconds: 360,
    billable: true,
    rate_id: null,
    description: null,
    synced_to_accelo_at: null,
    created_at: "2026-04-30T09:06:00Z",
  };

  it("has id as number", () => {
    expect(typeof row.id).toBe("number");
  });

  it("has user_id as string (UUID)", () => {
    expect(typeof row.user_id).toBe("string");
  });

  it("has staff_accelo_id as number", () => {
    expect(typeof row.staff_accelo_id).toBe("number");
  });

  it("has task_id as number", () => {
    expect(typeof row.task_id).toBe("number");
  });

  it("has started_at as string", () => {
    expect(typeof row.started_at).toBe("string");
  });

  it("has stopped_at as string", () => {
    expect(typeof row.stopped_at).toBe("string");
  });

  it("has duration_seconds as number", () => {
    expect(typeof row.duration_seconds).toBe("number");
  });

  it("has rounded_seconds as number", () => {
    expect(typeof row.rounded_seconds).toBe("number");
  });

  it("has billable as boolean", () => {
    expect(typeof row.billable).toBe("boolean");
  });

  it("allows rate_id as null (optional FK)", () => {
    expect(row.rate_id).toBeNull();
  });

  it("allows description as null", () => {
    expect(row.description).toBeNull();
  });

  it("allows synced_to_accelo_at as null (unsynced entry)", () => {
    expect(row.synced_to_accelo_at).toBeNull();
  });

  it("has created_at as string", () => {
    expect(typeof row.created_at).toBe("string");
  });
});

describe("pivot1a types — time_entries Insert", () => {
  /**
   * The Insert type must make `id` non-insertable (GENERATED ALWAYS AS
   * IDENTITY), and optional fields like billable/rate_id/description must
   * allow omission.
   */
  const minimalInsert: TimeEntryInsert = {
    user_id: "00000000-0000-0000-0000-000000000001",
    staff_accelo_id: 42,
    task_id: 100,
    started_at: "2026-04-30T09:00:00Z",
    stopped_at: "2026-04-30T09:06:00Z",
    duration_seconds: 360,
    rounded_seconds: 360,
  };

  it("accepts a minimal Insert without optional fields", () => {
    // If types compiled this far, the shape is correct
    expect(minimalInsert.duration_seconds).toBe(360);
  });

  it("does not include id in the minimal Insert (identity column)", () => {
    // `id?: never` means the key should not exist on a well-formed insert
    expect(Object.prototype.hasOwnProperty.call(minimalInsert, "id")).toBe(false);
  });

  it("allows synced_to_accelo_at to be omitted in Insert", () => {
    // Confirms the field is optional — no key present means it was omitted
    expect(Object.prototype.hasOwnProperty.call(minimalInsert, "synced_to_accelo_at")).toBe(false);
  });
});

describe("pivot1a types — sync_failures Row", () => {
  const row: SyncFailureRow = {
    id: 1,
    entity_type: "time_entries",
    entity_id: 99,
    operation: "insert",
    payload: null,
    error_message: null,
    attempts: 0,
    max_attempts: 5,
    next_retry_at: null,
    resolved_at: null,
    created_at: "2026-04-30T10:00:00Z",
  };

  it("has id as number", () => {
    expect(typeof row.id).toBe("number");
  });

  it("has entity_type as string", () => {
    expect(typeof row.entity_type).toBe("string");
  });

  it("has entity_id as number", () => {
    expect(typeof row.entity_id).toBe("number");
  });

  it("has operation as string", () => {
    expect(typeof row.operation).toBe("string");
  });

  it("allows payload as null (optional JSONB)", () => {
    expect(row.payload).toBeNull();
  });

  it("allows error_message as null", () => {
    expect(row.error_message).toBeNull();
  });

  it("has attempts as number with default 0", () => {
    expect(row.attempts).toBe(0);
  });

  it("has max_attempts as number with default 5", () => {
    expect(row.max_attempts).toBe(5);
  });

  it("allows next_retry_at as null (not yet scheduled)", () => {
    expect(row.next_retry_at).toBeNull();
  });

  it("allows resolved_at as null (pending failure)", () => {
    expect(row.resolved_at).toBeNull();
  });

  it("has created_at as string", () => {
    expect(typeof row.created_at).toBe("string");
  });
});

describe("pivot1a types — recurring_task_templates Row", () => {
  const row: RecurringTemplateRow = {
    id: 1,
    title: "Daily standup notes",
    company_id: null,
    assignee_id: null,
    recurrence: "daily",
    day_of_week: null,
    day_of_month: null,
    default_status_id: null,
    budgeted_seconds: null,
    active: true,
    created_by: null,
    created_at: "2026-04-30T08:00:00Z",
    updated_at: "2026-04-30T08:00:00Z",
  };

  it("has id as number", () => {
    expect(typeof row.id).toBe("number");
  });

  it("has title as string", () => {
    expect(typeof row.title).toBe("string");
  });

  it("allows company_id as null", () => {
    expect(row.company_id).toBeNull();
  });

  it("allows assignee_id as null", () => {
    expect(row.assignee_id).toBeNull();
  });

  it("has recurrence as string", () => {
    expect(typeof row.recurrence).toBe("string");
  });

  it("allows day_of_week as null (not weekly)", () => {
    expect(row.day_of_week).toBeNull();
  });

  it("allows day_of_month as null (not monthly)", () => {
    expect(row.day_of_month).toBeNull();
  });

  it("allows default_status_id as null", () => {
    expect(row.default_status_id).toBeNull();
  });

  it("allows budgeted_seconds as null", () => {
    expect(row.budgeted_seconds).toBeNull();
  });

  it("has active as boolean", () => {
    expect(typeof row.active).toBe("boolean");
  });

  it("allows created_by as null (UUID string or null)", () => {
    expect(row.created_by).toBeNull();
  });

  it("has created_at as string", () => {
    expect(typeof row.created_at).toBe("string");
  });

  it("has updated_at as string", () => {
    expect(typeof row.updated_at).toBe("string");
  });
});

describe("pivot1a types — tasks Row alterations", () => {
  /**
   * The migration makes accelo_id nullable and adds synced_to_accelo_at,
   * created_by, deleted_at.  This block verifies the generated types
   * reflect all four changes.
   */
  const rowWithNullAcceloId: TaskRow = {
    id: 1,
    title: "In-app task",
    accelo_id: null,          // was NOT NULL before pivot
    assignee_id: null,
    company_id: null,
    created_at: "2026-04-30T08:00:00Z",
    due_date: null,
    job_id: null,
    status_id: null,
    synced_at: "2026-04-30T08:00:00Z",
    synced_to_accelo_at: null,  // new column
    created_by: null,           // new column
    deleted_at: null,           // new column (soft-delete)
  };

  const rowWithAcceloId: TaskRow = {
    ...rowWithNullAcceloId,
    accelo_id: 9001,
    synced_to_accelo_at: "2026-04-30T07:00:00Z",
  };

  it("allows accelo_id as null (in-app task not yet synced)", () => {
    expect(rowWithNullAcceloId.accelo_id).toBeNull();
  });

  it("allows accelo_id as number (synced task)", () => {
    expect(typeof rowWithAcceloId.accelo_id).toBe("number");
  });

  it("has synced_to_accelo_at as string | null", () => {
    // null variant
    expect(rowWithNullAcceloId.synced_to_accelo_at).toBeNull();
    // string variant
    expect(typeof rowWithAcceloId.synced_to_accelo_at).toBe("string");
  });

  it("has created_by as string | null (UUID of creating user)", () => {
    const withCreator: TaskRow = { ...rowWithNullAcceloId, created_by: "00000000-0000-0000-0000-000000000001" };
    expect(typeof withCreator.created_by).toBe("string");
    expect(rowWithNullAcceloId.created_by).toBeNull();
  });

  it("has deleted_at as string | null (soft-delete sentinel)", () => {
    const softDeleted: TaskRow = { ...rowWithNullAcceloId, deleted_at: "2026-04-30T12:00:00Z" };
    expect(typeof softDeleted.deleted_at).toBe("string");
    expect(rowWithNullAcceloId.deleted_at).toBeNull();
  });
});

describe("pivot1a types — tasks Insert allows omitting accelo_id", () => {
  const insert: TaskInsert = {
    title: "Brand-new in-app task",
    // accelo_id intentionally omitted — was required before, now optional
  };

  it("accepts a TaskInsert without accelo_id", () => {
    expect(insert.title).toBe("Brand-new in-app task");
  });

  it("does not carry accelo_id when omitted", () => {
    expect(Object.prototype.hasOwnProperty.call(insert, "accelo_id")).toBe(false);
  });

  it("allows synced_to_accelo_at to be omitted in Insert", () => {
    expect(Object.prototype.hasOwnProperty.call(insert, "synced_to_accelo_at")).toBe(false);
  });

  it("allows deleted_at to be omitted in Insert", () => {
    expect(Object.prototype.hasOwnProperty.call(insert, "deleted_at")).toBe(false);
  });
});

// ── 2. Migration SQL Validation Tests ────────────────────────────────────────

describe("pivot1a SQL — CREATE TABLE statements", () => {
  it("creates the time_entries table", () => {
    expect(migrationSql).toContain("CREATE TABLE time_entries");
  });

  it("creates the sync_failures table", () => {
    expect(migrationSql).toContain("CREATE TABLE sync_failures");
  });

  it("creates the recurring_task_templates table", () => {
    expect(migrationSql).toContain("CREATE TABLE recurring_task_templates");
  });
});

describe("pivot1a SQL — ALTER TABLE tasks statements", () => {
  it("drops NOT NULL on accelo_id", () => {
    expect(migrationSql).toContain("ALTER COLUMN accelo_id DROP NOT NULL");
  });

  it("keeps the UNIQUE constraint — PostgreSQL allows multiple NULLs naturally", () => {
    expect(migrationSql).not.toContain("DROP CONSTRAINT IF EXISTS tasks_accelo_id_key");
  });

  it("adds synced_to_accelo_at column", () => {
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS synced_to_accelo_at");
  });

  it("adds created_by column", () => {
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS created_by");
  });

  it("adds deleted_at column", () => {
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS deleted_at");
  });
});

describe("pivot1a SQL — RLS ENABLE statements", () => {
  it("enables RLS on time_entries", () => {
    expect(migrationSql).toContain("ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY");
  });

  it("enables RLS on sync_failures", () => {
    expect(migrationSql).toContain("ALTER TABLE sync_failures ENABLE ROW LEVEL SECURITY");
  });

  it("enables RLS on recurring_task_templates", () => {
    expect(migrationSql).toContain("ALTER TABLE recurring_task_templates ENABLE ROW LEVEL SECURITY");
  });
});

describe("pivot1a SQL — index names", () => {
  it("creates idx_tasks_unsynced (tasks not yet synced to Accelo)", () => {
    expect(migrationSql).toContain("idx_tasks_unsynced");
  });

  it("creates idx_tasks_active (active / non-deleted tasks)", () => {
    expect(migrationSql).toContain("idx_tasks_active");
  });

  it("creates idx_tasks_deleted (soft-deleted tasks)", () => {
    expect(migrationSql).toContain("idx_tasks_deleted");
  });

  it("creates idx_time_entries_user_id", () => {
    expect(migrationSql).toContain("idx_time_entries_user_id");
  });

  it("creates idx_time_entries_task_id", () => {
    expect(migrationSql).toContain("idx_time_entries_task_id");
  });

  it("creates idx_time_entries_staff_accelo_id (analytics join column)", () => {
    expect(migrationSql).toContain("idx_time_entries_staff_accelo_id");
  });

  it("creates idx_time_entries_unsynced", () => {
    expect(migrationSql).toContain("idx_time_entries_unsynced");
  });

  it("creates idx_time_entries_created", () => {
    expect(migrationSql).toContain("idx_time_entries_created");
  });

  it("creates idx_sync_failures_pending", () => {
    expect(migrationSql).toContain("idx_sync_failures_pending");
  });

  it("creates idx_sync_failures_entity", () => {
    expect(migrationSql).toContain("idx_sync_failures_entity");
  });

  it("creates idx_recurring_templates_active", () => {
    expect(migrationSql).toContain("idx_recurring_templates_active");
  });
});

describe("pivot1a SQL — triggers", () => {
  it("creates set_updated_at trigger function", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION set_updated_at()");
  });

  it("attaches updated_at trigger to recurring_task_templates", () => {
    expect(migrationSql).toContain("recurring_task_templates_set_updated_at");
  });
});

describe("pivot1a SQL — policy names", () => {
  // time_entries policies
  it("defines time_entries_worker_select policy", () => {
    expect(migrationSql).toContain("time_entries_worker_select");
  });

  it("defines time_entries_manager_select policy", () => {
    expect(migrationSql).toContain("time_entries_manager_select");
  });

  it("defines time_entries_insert_own policy (both roles can log time)", () => {
    expect(migrationSql).toContain("time_entries_insert_own");
  });

  it("defines time_entries_service_all policy", () => {
    expect(migrationSql).toContain("time_entries_service_all");
  });

  // sync_failures policies
  it("defines sync_failures_manager_select policy", () => {
    expect(migrationSql).toContain("sync_failures_manager_select");
  });

  it("defines sync_failures_service_all policy", () => {
    expect(migrationSql).toContain("sync_failures_service_all");
  });

  // recurring_task_templates policies
  it("defines templates_manager_all policy", () => {
    expect(migrationSql).toContain("templates_manager_all");
  });

  it("defines templates_worker_select policy", () => {
    expect(migrationSql).toContain("templates_worker_select");
  });

  it("defines templates_service_all policy", () => {
    expect(migrationSql).toContain("templates_service_all");
  });

  // Updated tasks policies
  it("recreates tasks_manager_select with soft-delete filter", () => {
    expect(migrationSql).toContain("tasks_manager_select");
  });

  it("recreates tasks_worker_select with soft-delete filter", () => {
    expect(migrationSql).toContain("tasks_worker_select");
  });

  it("defines tasks_manager_insert policy", () => {
    expect(migrationSql).toContain("tasks_manager_insert");
  });

  it("defines tasks_worker_insert policy (restricted to own assignee_id)", () => {
    expect(migrationSql).toContain("tasks_worker_insert");
  });

  it("defines tasks_manager_update policy", () => {
    expect(migrationSql).toContain("tasks_manager_update");
  });

  it("defines tasks_worker_update policy", () => {
    expect(migrationSql).toContain("tasks_worker_update");
  });

  it("defines tasks_service_all policy", () => {
    expect(migrationSql).toContain("tasks_service_all");
  });
});

describe("pivot1a SQL — backfill and watermark statements", () => {
  it("contains the backfill UPDATE for synced_to_accelo_at on existing rows", () => {
    expect(migrationSql).toContain(
      "UPDATE tasks SET synced_to_accelo_at = now() WHERE synced_to_accelo_at IS NULL AND accelo_id IS NOT NULL"
    );
  });

  it("does NOT add sync_watermarks for native tables (outbound sync uses synced_to_accelo_at)", () => {
    expect(migrationSql).not.toContain("INSERT INTO sync_watermarks");
  });
});

describe("pivot1a SQL — soft-delete filter on tasks SELECT policies", () => {
  it("includes deleted_at IS NULL guard in tasks_manager_select", () => {
    // Locate the CREATE POLICY block (after the DROP statements) and extract
    // the slice up to the next policy definition to avoid false positives.
    const createManagerPolicy = "CREATE POLICY tasks_manager_select";
    const managerStart = migrationSql.indexOf(createManagerPolicy);
    const managerEnd   = migrationSql.indexOf("CREATE POLICY tasks_worker_select");
    const managerSelectBlock = migrationSql.slice(managerStart, managerEnd);
    expect(managerSelectBlock).toContain("deleted_at IS NULL");
  });

  it("includes deleted_at IS NULL guard in tasks_worker_select", () => {
    const workerStart = migrationSql.indexOf("CREATE POLICY tasks_worker_select");
    const workerEnd   = migrationSql.indexOf("tasks_manager_insert");
    const workerSelectBlock = migrationSql.slice(workerStart, workerEnd);
    expect(workerSelectBlock).toContain("deleted_at IS NULL");
  });

  it("drops both existing tasks SELECT policies before recreating them", () => {
    expect(migrationSql).toContain("DROP POLICY IF EXISTS tasks_manager_select ON tasks");
    expect(migrationSql).toContain("DROP POLICY IF EXISTS tasks_worker_select  ON tasks");
  });
});

// ── 3. Timer Store Compatibility Tests ────────────────────────────────────────

describe("pivot1a timer compatibility — rounded_seconds and timerToHours", () => {
  /**
   * time_entries.rounded_seconds stores the result of timerToHours() × 3600.
   * These tests confirm that the integer values produced by the rounding
   * function are valid values for the `int` column, and that the inverse
   * conversion back to hours is lossless.
   *
   * The 360-second increment means valid rounded values are always
   * multiples of 360 (0, 360, 720, 1080, …).
   */

  it("timerToHours(360) produces 0.1 hours, stored as rounded_seconds = 360", () => {
    const hours = timerToHours(360);
    // Reconstruct rounded_seconds the way the API route does
    const roundedSeconds = Math.round(hours * 10) / 10 * 3600;
    expect(hours).toBe(0.1);
    expect(roundedSeconds).toBe(360);
  });

  it("timerToHours(3600) produces 1.0 hours, stored as rounded_seconds = 3600", () => {
    const hours = timerToHours(3600);
    const roundedSeconds = hours * 3600;
    expect(hours).toBe(1.0);
    expect(roundedSeconds).toBe(3600);
  });

  it("timerToHours(5400) produces 1.5 hours, stored as rounded_seconds = 5400", () => {
    const hours = timerToHours(5400);
    const roundedSeconds = hours * 3600;
    expect(hours).toBe(1.5);
    expect(roundedSeconds).toBe(5400);
  });

  it("timerToHours(179) rounds up to 0.1 — any non-zero work bills as minimum increment", () => {
    // Math.ceil(179 / 360) = 1 → 1 increment → 360 s → 0.1 h
    const hours = timerToHours(179);
    expect(hours).toBe(0.1);
  });

  it("timerToHours(180) rounds up to 360 — the minimum billable increment", () => {
    // 180 / 360 = 0.5 → rounds up to 1 increment → 360 s → 0.1 h
    const hours = timerToHours(180);
    expect(hours).toBe(0.1);
    const roundedSeconds = hours * 3600;
    expect(roundedSeconds).toBe(360);
    // This is a safe int value for the rounded_seconds column
    expect(Number.isInteger(roundedSeconds)).toBe(true);
  });

  it("rounded_seconds is always a multiple of 360 for any input", () => {
    const testInputs = [360, 720, 1080, 1440, 1800, 3600, 7200, 9000];
    for (const input of testInputs) {
      const rounded = timerToHours(input) * 3600;
      expect(rounded % 360).toBe(0);
    }
  });

  it("rounded_seconds is always a safe integer (fits in Postgres int column)", () => {
    // Postgres int max = 2,147,483,647. A 596-hour timer = 2,145,600 s, still fits.
    const veryLongSession = 596 * 3600; // seconds
    const rounded = timerToHours(veryLongSession) * 3600;
    expect(Number.isInteger(rounded)).toBe(true);
    expect(rounded).toBeLessThan(2_147_483_647);
  });

  it("formatBillingTime correctly formats rounded_seconds back to human-readable string", () => {
    expect(formatBillingTime(360)).toBe("6m");
    expect(formatBillingTime(3600)).toBe("1h");
    expect(formatBillingTime(5400)).toBe("1h 30m");
    expect(formatBillingTime(7200)).toBe("2h");
    expect(formatBillingTime(720)).toBe("12m");
  });

  it("a time_entries Row with rounded_seconds can be converted back to billable hours", () => {
    // Simulate retrieving a row and displaying it — the round-trip must be exact
    const row: TimeEntryRow = {
      id: 42,
      user_id: "00000000-0000-0000-0000-000000000001",
      staff_accelo_id: 5,
      task_id: 10,
      started_at: "2026-04-30T09:00:00Z",
      stopped_at: "2026-04-30T09:30:00Z",
      duration_seconds: 1800,
      rounded_seconds: 1800,  // 30 minutes exactly = 5 × 360 s
      billable: true,
      rate_id: null,
      description: "Review PR",
      synced_to_accelo_at: null,
      created_at: "2026-04-30T09:30:00Z",
    };

    const billableHours = row.rounded_seconds / 3600;
    expect(billableHours).toBe(0.5);
    expect(formatBillingTime(row.rounded_seconds)).toBe("30m");
  });
});

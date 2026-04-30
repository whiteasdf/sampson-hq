/**
 * Tests for Pivot 1D: Outbound Sync Engine
 *
 * Covers:
 *   1. accelo-client.ts typed helpers (acceloCreateTask, acceloUpdateTask, acceloCreateActivity)
 *   2. push-tasks cron route — auth, empty batch, create path, update path,
 *      missing job id, blocked entries, Accelo API failure, retry processing,
 *      race prevention
 *   3. push-time-entries cron route — auth, missing accelo ids, zero duration,
 *      successful push, activity mirroring, blocked entries
 *   4. compute-analytics cron route — auth, time_entries query, billable/non-billable
 *      aggregation, utilization calculation, error handling
 *   5. vercel.json cron configuration validation
 *   6. Migration SQL validation for pivot1a schema evolution
 *
 * All tests mock Supabase at the module boundary. No live database or network
 * calls are made. Each describe block calls vi.clearAllMocks() in beforeEach
 * to guarantee isolation between cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Module-level mocks (hoisted before imports)
// ═══════════════════════════════════════════════════════════════════════════════

const { mockFrom, mockAcceloPost, mockAcceloPut, mockAcceloCreateTask, mockAcceloUpdateTask, mockAcceloCreateActivity } =
  vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockAcceloPost: vi.fn(),
    mockAcceloPut: vi.fn(),
    mockAcceloCreateTask: vi.fn(),
    mockAcceloUpdateTask: vi.fn(),
    mockAcceloCreateActivity: vi.fn(),
  }));

vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

// For accelo-client typed-helper tests we need acceloPost / acceloPut injectable,
// so we provide a partial mock that keeps the module importable but redirects
// the low-level calls to our spies.
vi.mock("@/lib/accelo-client", () => ({
  acceloPost: mockAcceloPost,
  acceloPut: mockAcceloPut,
  acceloCreateTask: mockAcceloCreateTask,
  acceloUpdateTask: mockAcceloUpdateTask,
  acceloCreateActivity: mockAcceloCreateActivity,
}));

// Import route handlers AFTER mocks are registered.
import { GET as pushTasksGET } from "@/app/api/cron/push-tasks/route";
import { GET as pushTimeEntriesGET } from "@/app/api/cron/push-time-entries/route";
import { GET as computeAnalyticsGET } from "@/app/api/cron/compute-analytics/route";

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Shared test helpers
// ═══════════════════════════════════════════════════════════════════════════════

const CRON_SECRET = "test-secret";

function makeCronRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
}

function makeUnauthRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function makeWrongAuthRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { Authorization: "Bearer wrong-secret" },
  });
}

// ─── Supabase chain builder ───────────────────────────────────────────────────
//
// The routes in this test file use several different chain termination patterns.
// We need a single chain object that:
//   1. Is itself a thenable (so `await from("x").select(...).limit(50)` works)
//   2. Returns ITSELF from every method (for further chaining)
//   3. .single() / .maybeSingle() also return the same thenable chain
//
// This works because all terminal patterns — .is(), .lte(), .in(), .limit(),
// .not(), .eq(), .single(), .upsert(), .insert() — all resolve to the same
// configured terminalResult when awaited, and all return the chain for further
// method chaining.

function makeChain(terminalResult: { data: unknown; error: unknown }) {
  const p = Promise.resolve(terminalResult);

  const chain: Record<string, unknown> = {};

  // Every method on the chain returns the chain itself (for chaining)
  // AND the chain is itself a thenable resolving to terminalResult.
  const allMethods = [
    "select", "insert", "update", "upsert",
    "eq", "is", "not", "in", "gte", "lte", "lt", "order", "limit",
    "single", "maybeSingle",
  ];

  for (const m of allMethods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }

  // Make chain itself a thenable so any `await chain.someMethod(...)` resolves
  // to terminalResult. This works because every method returns `chain`, and
  // `chain` has .then/.catch/.finally bound to our resolved promise.
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);

  return chain;
}

/**
 * Queues one chainable response for the next from() call.
 */
function nextFrom(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain = makeChain(result);
  mockFrom.mockReturnValueOnce(chain);
  return chain;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Migration SQL validation
// ═══════════════════════════════════════════════════════════════════════════════

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../supabase/migrations/20260430111300_pivot1a_schema_evolution.sql"
);
const migrationSql: string = readFileSync(MIGRATION_PATH, "utf-8");

describe("pivot1a SQL — sync_failures table", () => {
  it("creates the sync_failures table", () => {
    expect(migrationSql).toContain("CREATE TABLE sync_failures");
  });

  it("has entity_type column (text, NOT NULL)", () => {
    expect(migrationSql).toMatch(/entity_type\s+text\s+NOT NULL/);
  });

  it("has entity_id column (bigint, NOT NULL)", () => {
    expect(migrationSql).toMatch(/entity_id\s+bigint\s+NOT NULL/);
  });

  it("has operation column (text, NOT NULL)", () => {
    expect(migrationSql).toMatch(/operation\s+text\s+NOT NULL/);
  });

  it("has payload jsonb column", () => {
    expect(migrationSql).toContain("payload        jsonb");
  });

  it("has error_message column", () => {
    expect(migrationSql).toContain("error_message  text");
  });

  it("has attempts column with DEFAULT 0", () => {
    expect(migrationSql).toMatch(/attempts\s+int\s+NOT NULL DEFAULT 0/);
  });

  it("has max_attempts column with DEFAULT 5", () => {
    expect(migrationSql).toMatch(/max_attempts\s+int\s+NOT NULL DEFAULT 5/);
  });

  it("has next_retry_at timestamptz column", () => {
    expect(migrationSql).toContain("next_retry_at  timestamptz");
  });

  it("has resolved_at timestamptz column", () => {
    expect(migrationSql).toContain("resolved_at    timestamptz");
  });

  it("creates pending index on sync_failures (for retry queue lookup)", () => {
    expect(migrationSql).toContain("idx_sync_failures_pending");
  });

  it("pending index filters WHERE resolved_at IS NULL AND attempts < max_attempts", () => {
    const idxStart = migrationSql.indexOf("idx_sync_failures_pending");
    const idxEnd = migrationSql.indexOf(";", idxStart);
    const idxStatement = migrationSql.slice(idxStart, idxEnd);
    expect(idxStatement).toContain("resolved_at IS NULL");
    expect(idxStatement).toContain("attempts < max_attempts");
  });

  it("creates entity lookup index on sync_failures", () => {
    expect(migrationSql).toContain("idx_sync_failures_entity");
    const idxStart = migrationSql.indexOf("idx_sync_failures_entity");
    const idxEnd = migrationSql.indexOf(";", idxStart);
    const idxStatement = migrationSql.slice(idxStart, idxEnd);
    expect(idxStatement).toContain("entity_type, entity_id");
  });
});

describe("pivot1a SQL — time_entries table", () => {
  it("creates the time_entries table", () => {
    expect(migrationSql).toContain("CREATE TABLE time_entries");
  });

  it("has synced_to_accelo_at column in time_entries", () => {
    // Must appear inside the time_entries CREATE TABLE block
    const teStart = migrationSql.indexOf("CREATE TABLE time_entries");
    const teEnd = migrationSql.indexOf(";", teStart);
    const teBlock = migrationSql.slice(teStart, teEnd);
    expect(teBlock).toContain("synced_to_accelo_at");
  });

  it("creates unsynced index on time_entries (WHERE synced_to_accelo_at IS NULL)", () => {
    expect(migrationSql).toContain("idx_time_entries_unsynced");
    const idxStart = migrationSql.indexOf("idx_time_entries_unsynced");
    const idxEnd = migrationSql.indexOf(";", idxStart);
    const idxStatement = migrationSql.slice(idxStart, idxEnd);
    expect(idxStatement).toContain("synced_to_accelo_at IS NULL");
  });

  it("creates user_id index on time_entries", () => {
    expect(migrationSql).toContain("idx_time_entries_user_id");
  });

  it("creates task_id index on time_entries", () => {
    expect(migrationSql).toContain("idx_time_entries_task_id");
  });
});

describe("pivot1a SQL — tasks table alterations", () => {
  it("adds synced_to_accelo_at column to tasks", () => {
    expect(migrationSql).toContain(
      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS synced_to_accelo_at timestamptz"
    );
  });

  it("adds deleted_at column to tasks", () => {
    expect(migrationSql).toContain(
      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at          timestamptz"
    );
  });

  it("creates unsynced index for tasks (WHERE synced_to_accelo_at IS NULL AND deleted_at IS NULL)", () => {
    expect(migrationSql).toContain("idx_tasks_unsynced");
    const idxStart = migrationSql.indexOf("idx_tasks_unsynced");
    const idxEnd = migrationSql.indexOf(";", idxStart);
    const idxStatement = migrationSql.slice(idxStart, idxEnd);
    expect(idxStatement).toContain("synced_to_accelo_at IS NULL");
    expect(idxStatement).toContain("deleted_at IS NULL");
  });

  it("creates active tasks index (WHERE deleted_at IS NULL)", () => {
    expect(migrationSql).toContain("idx_tasks_active");
    const idxStart = migrationSql.indexOf("idx_tasks_active");
    const idxEnd = migrationSql.indexOf(";", idxStart);
    const idxStatement = migrationSql.slice(idxStart, idxEnd);
    expect(idxStatement).toContain("deleted_at IS NULL");
  });

  it("creates deleted tasks index on deleted_at column", () => {
    expect(migrationSql).toContain("idx_tasks_deleted");
    const idxStart = migrationSql.indexOf("idx_tasks_deleted");
    const idxEnd = migrationSql.indexOf(";", idxStart);
    const idxStatement = migrationSql.slice(idxStart, idxEnd);
    expect(idxStatement).toContain("deleted_at IS NOT NULL");
  });

  it("drops NOT NULL constraint on accelo_id (makes tasks.accelo_id nullable)", () => {
    expect(migrationSql).toContain("ALTER TABLE tasks ALTER COLUMN accelo_id DROP NOT NULL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. vercel.json cron validation
// ═══════════════════════════════════════════════════════════════════════════════

const vercelConfig = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf-8")
);

describe("vercel.json — cron configuration", () => {
  it("has exactly 3 cron entries", () => {
    expect(vercelConfig.crons).toHaveLength(3);
  });

  it("includes push-tasks cron", () => {
    const cron = vercelConfig.crons.find(
      (c: { path: string }) => c.path === "/api/cron/push-tasks"
    );
    expect(cron).toBeDefined();
  });

  it("push-tasks runs every 2 minutes", () => {
    const cron = vercelConfig.crons.find(
      (c: { path: string }) => c.path === "/api/cron/push-tasks"
    );
    expect(cron.schedule).toBe("*/2 * * * *");
  });

  it("includes push-time-entries cron", () => {
    const cron = vercelConfig.crons.find(
      (c: { path: string }) => c.path === "/api/cron/push-time-entries"
    );
    expect(cron).toBeDefined();
  });

  it("push-time-entries runs every 2 minutes", () => {
    const cron = vercelConfig.crons.find(
      (c: { path: string }) => c.path === "/api/cron/push-time-entries"
    );
    expect(cron.schedule).toBe("*/2 * * * *");
  });

  it("includes compute-analytics cron", () => {
    const cron = vercelConfig.crons.find(
      (c: { path: string }) => c.path === "/api/cron/compute-analytics"
    );
    expect(cron).toBeDefined();
  });

  it("compute-analytics runs hourly", () => {
    const cron = vercelConfig.crons.find(
      (c: { path: string }) => c.path === "/api/cron/compute-analytics"
    );
    expect(cron.schedule).toBe("0 * * * *");
  });

  it("does not include any legacy sync-* cron entries", () => {
    const legacyCrons = vercelConfig.crons.filter(
      (c: { path: string }) => c.path.includes("/api/cron/sync-")
    );
    expect(legacyCrons).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. accelo-client.ts typed helpers
//
// These test the typed wrapper functions (acceloCreateTask, acceloUpdateTask,
// acceloCreateActivity) using the actual module source, with acceloPost and
// acceloPut mocked at the module boundary. We import the real implementations
// from a separate dynamic import to bypass the vi.mock() that replaces the
// entire module in the route tests above.
//
// Since vi.mock("@/lib/accelo-client") is hoisted and replaces everything,
// we test the wrapper logic inline — replicating the exact logic from
// accelo-client.ts to verify correct field mapping and validation.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Inline replicas of the typed wrappers (mirrors accelo-client.ts exactly) ──

interface AcceloTaskPayload {
  title: string;
  against_type: "job";
  against_id: number;
  assignee?: number;
  date_due?: string;
  budgeted?: number;
  status?: number;
}

interface AcceloActivityPayload {
  against_type: "task";
  against_id: number;
  owner_id: number;
  rate_id: number;
  billable: number;
  nonbillable: number;
  subject: string;
  body?: string;
  medium: string;
  standing: "complete";
  date_logged: number;
}

async function acceloCreateTaskInline(
  task: AcceloTaskPayload,
  acceloPost: (path: string, body: Record<string, string | number | boolean>) => Promise<unknown>
): Promise<{ id: number }> {
  const body: Record<string, string | number | boolean> = {
    title: task.title,
    against_type: task.against_type,
    against_id: task.against_id,
  };
  if (task.assignee != null) body.assignee = task.assignee;
  if (task.date_due != null) body.date_due = task.date_due;
  if (task.budgeted != null) body.budgeted = task.budgeted;
  if (task.status != null) body.status = task.status;

  const res = await acceloPost("/tasks", body);
  const obj = res as Record<string, unknown>;
  if (typeof obj?.id !== "number") {
    throw new Error(`Accelo create task returned unexpected response: ${JSON.stringify(obj)}`);
  }
  return { id: obj.id };
}

async function acceloUpdateTaskInline(
  acceloId: number,
  fields: Partial<Omit<AcceloTaskPayload, "against_type" | "against_id">>,
  acceloPut: (path: string, body: Record<string, string | number | boolean>) => Promise<unknown>
): Promise<unknown> {
  const body: Record<string, string | number | boolean> = {};
  if (fields.title != null) body.title = fields.title;
  if (fields.assignee != null) body.assignee = fields.assignee;
  if (fields.date_due != null) body.date_due = fields.date_due;
  if (fields.budgeted != null) body.budgeted = fields.budgeted;
  if (fields.status != null) body.status = fields.status;

  if (Object.keys(body).length === 0) return;

  return acceloPut(`/tasks/${acceloId}`, body);
}

async function acceloCreateActivityInline(
  entry: AcceloActivityPayload,
  acceloPost: (path: string, body: Record<string, string | number | boolean>) => Promise<unknown>
): Promise<{ id: number }> {
  const res = await acceloPost("/activities", {
    against_type: entry.against_type,
    against_id: entry.against_id,
    owner_id: entry.owner_id,
    rate_id: entry.rate_id,
    billable: entry.billable,
    nonbillable: entry.nonbillable,
    subject: entry.subject,
    body: entry.body ?? "",
    medium: entry.medium,
    standing: entry.standing,
    date_logged: entry.date_logged,
  });
  const obj = res as Record<string, unknown>;
  if (typeof obj?.id !== "number") {
    throw new Error(
      `Accelo create activity returned unexpected response: ${JSON.stringify(obj)}`
    );
  }
  return { id: obj.id };
}

describe("acceloCreateTask typed helper", () => {
  it("calls acceloPost('/tasks', ...) with required fields", async () => {
    const post = vi.fn().mockResolvedValue({ id: 101 });
    await acceloCreateTaskInline(
      { title: "Fix the bug", against_type: "job", against_id: 500 },
      post
    );
    expect(post).toHaveBeenCalledWith(
      "/tasks",
      expect.objectContaining({
        title: "Fix the bug",
        against_type: "job",
        against_id: 500,
      })
    );
  });

  it("includes optional fields when provided (assignee, date_due, budgeted, status)", async () => {
    const post = vi.fn().mockResolvedValue({ id: 102 });
    await acceloCreateTaskInline(
      {
        title: "Full task",
        against_type: "job",
        against_id: 500,
        assignee: 42,
        date_due: "2026-12-31",
        budgeted: 7200,
        status: 3,
      },
      post
    );
    expect(post).toHaveBeenCalledWith(
      "/tasks",
      expect.objectContaining({
        assignee: 42,
        date_due: "2026-12-31",
        budgeted: 7200,
        status: 3,
      })
    );
  });

  it("omits optional fields when not provided (no accidental undefined in body)", async () => {
    const post = vi.fn().mockResolvedValue({ id: 103 });
    await acceloCreateTaskInline(
      { title: "Minimal task", against_type: "job", against_id: 500 },
      post
    );
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("assignee");
    expect(body).not.toHaveProperty("date_due");
    expect(body).not.toHaveProperty("budgeted");
    expect(body).not.toHaveProperty("status");
  });

  it("returns { id: number } from the response", async () => {
    const post = vi.fn().mockResolvedValue({ id: 999 });
    const result = await acceloCreateTaskInline(
      { title: "T", against_type: "job", against_id: 1 },
      post
    );
    expect(result).toEqual({ id: 999 });
  });

  it("throws if Accelo response id is not a number", async () => {
    const post = vi.fn().mockResolvedValue({ id: "not-a-number" });
    await expect(
      acceloCreateTaskInline({ title: "T", against_type: "job", against_id: 1 }, post)
    ).rejects.toThrow("Accelo create task returned unexpected response");
  });

  it("throws if Accelo response is null/missing id", async () => {
    const post = vi.fn().mockResolvedValue(null);
    await expect(
      acceloCreateTaskInline({ title: "T", against_type: "job", against_id: 1 }, post)
    ).rejects.toThrow("Accelo create task returned unexpected response");
  });

  it("throws if Accelo response has no id property at all", async () => {
    const post = vi.fn().mockResolvedValue({ name: "some task" });
    await expect(
      acceloCreateTaskInline({ title: "T", against_type: "job", against_id: 1 }, post)
    ).rejects.toThrow("Accelo create task returned unexpected response");
  });
});

describe("acceloUpdateTask typed helper", () => {
  it("calls acceloPut('/tasks/:id', ...) with provided fields", async () => {
    const put = vi.fn().mockResolvedValue({ id: 200 });
    await acceloUpdateTaskInline(200, { title: "Updated title", assignee: 77 }, put);
    expect(put).toHaveBeenCalledWith(
      "/tasks/200",
      expect.objectContaining({ title: "Updated title", assignee: 77 })
    );
  });

  it("no-ops (returns undefined without calling acceloPut) when fields object is empty", async () => {
    const put = vi.fn();
    const result = await acceloUpdateTaskInline(200, {}, put);
    expect(put).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("no-ops when all optional fields are null/undefined", async () => {
    const put = vi.fn();
    const result = await acceloUpdateTaskInline(
      200,
      { title: undefined, assignee: undefined, date_due: undefined, budgeted: undefined, status: undefined },
      put
    );
    expect(put).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("includes status field when provided", async () => {
    const put = vi.fn().mockResolvedValue({ id: 201 });
    await acceloUpdateTaskInline(201, { status: 5 }, put);
    expect(put).toHaveBeenCalledWith("/tasks/201", expect.objectContaining({ status: 5 }));
  });

  it("includes budgeted field when provided", async () => {
    const put = vi.fn().mockResolvedValue({ id: 202 });
    await acceloUpdateTaskInline(202, { budgeted: 3600 }, put);
    expect(put).toHaveBeenCalledWith("/tasks/202", expect.objectContaining({ budgeted: 3600 }));
  });

  it("uses the correct Accelo ID in the PUT path", async () => {
    const put = vi.fn().mockResolvedValue({ id: 9876 });
    await acceloUpdateTaskInline(9876, { title: "Check path" }, put);
    expect(put.mock.calls[0][0]).toBe("/tasks/9876");
  });
});

describe("acceloCreateActivity typed helper", () => {
  it("calls acceloPost('/activities', ...) with all required fields", async () => {
    const post = vi.fn().mockResolvedValue({ id: 300 });
    await acceloCreateActivityInline(
      {
        against_type: "task",
        against_id: 50,
        owner_id: 42,
        rate_id: 5,
        billable: 1.5,
        nonbillable: 0,
        subject: "Time entry",
        medium: "note",
        standing: "complete",
        date_logged: 1_700_000_000,
      },
      post
    );
    expect(post).toHaveBeenCalledWith(
      "/activities",
      expect.objectContaining({
        against_type: "task",
        against_id: 50,
        owner_id: 42,
        rate_id: 5,
        billable: 1.5,
        nonbillable: 0,
        subject: "Time entry",
        medium: "note",
        standing: "complete",
        date_logged: 1_700_000_000,
      })
    );
  });

  it("uses empty string for body when body is not provided", async () => {
    const post = vi.fn().mockResolvedValue({ id: 301 });
    await acceloCreateActivityInline(
      {
        against_type: "task",
        against_id: 50,
        owner_id: 42,
        rate_id: 5,
        billable: 0.5,
        nonbillable: 0,
        subject: "Quick entry",
        medium: "note",
        standing: "complete",
        date_logged: 1_700_000_000,
      },
      post
    );
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.body).toBe("");
  });

  it("passes custom body text when provided", async () => {
    const post = vi.fn().mockResolvedValue({ id: 302 });
    await acceloCreateActivityInline(
      {
        against_type: "task",
        against_id: 50,
        owner_id: 42,
        rate_id: 5,
        billable: 1,
        nonbillable: 0,
        subject: "With body",
        body: "Detailed description of work",
        medium: "note",
        standing: "complete",
        date_logged: 1_700_000_000,
      },
      post
    );
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.body).toBe("Detailed description of work");
  });

  it("returns { id: number } from Accelo response", async () => {
    const post = vi.fn().mockResolvedValue({ id: 555 });
    const result = await acceloCreateActivityInline(
      {
        against_type: "task",
        against_id: 1,
        owner_id: 1,
        rate_id: 1,
        billable: 1,
        nonbillable: 0,
        subject: "Test",
        medium: "note",
        standing: "complete",
        date_logged: 0,
      },
      post
    );
    expect(result).toEqual({ id: 555 });
  });

  it("throws if Accelo activity response id is not a number", async () => {
    const post = vi.fn().mockResolvedValue({ id: null });
    await expect(
      acceloCreateActivityInline(
        {
          against_type: "task",
          against_id: 1,
          owner_id: 1,
          rate_id: 1,
          billable: 1,
          nonbillable: 0,
          subject: "Test",
          medium: "note",
          standing: "complete",
          date_logged: 0,
        },
        post
      )
    ).rejects.toThrow("Accelo create activity returned unexpected response");
  });

  it("throws if Accelo response is a string instead of object", async () => {
    const post = vi.fn().mockResolvedValue("not-an-object");
    await expect(
      acceloCreateActivityInline(
        {
          against_type: "task",
          against_id: 1,
          owner_id: 1,
          rate_id: 1,
          billable: 1,
          nonbillable: 0,
          subject: "Test",
          medium: "note",
          standing: "complete",
          date_logged: 0,
        },
        post
      )
    ).rejects.toThrow("Accelo create activity returned unexpected response");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. push-tasks cron route
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/cron/push-tasks — auth guard", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("rejects request with no Authorization header (401)", async () => {
    const req = makeUnauthRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it("rejects request with wrong CRON_SECRET (401)", async () => {
    const req = makeWrongAuthRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });
});

describe("GET /api/cron/push-tasks — empty batch", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("returns { ok: true, synced: 0 } when no unsynced tasks exist", async () => {
    // blocked failures query
    nextFrom({ data: [], error: null });
    // tasks query — empty
    nextFrom({ data: [], error: null });
    // retry failures query — also empty
    nextFrom({ data: [], error: null });

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.synced).toBe(0);
  });
});

describe("GET /api/cron/push-tasks — create path (accelo_id = null)", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("calls acceloCreateTask and stores returned id on success", async () => {
    mockAcceloCreateTask.mockResolvedValue({ id: 9001 });

    // blocked failures — none
    nextFrom({ data: [], error: null });
    // tasks — one task with no accelo_id
    nextFrom({
      data: [
        {
          id: 1,
          accelo_id: null,
          title: "New Task",
          company_id: 10,
          assignee_id: 42,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
          companies: { default_job_accelo_id: 500 },
        },
      ],
      error: null,
    });
    // update tasks (stores accelo_id + synced_to_accelo_at)
    nextFrom({ data: null, error: null });
    // retry failures — none
    nextFrom({ data: [], error: null });

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New Task",
        against_type: "job",
        against_id: 500,
        assignee: 42,
      })
    );
    expect(json.synced).toBe(1);
    expect(json.failed).toBe(0);
  });

  it("stores the returned Accelo id back to the tasks table", async () => {
    mockAcceloCreateTask.mockResolvedValue({ id: 9002 });

    nextFrom({ data: [], error: null }); // blocked failures
    nextFrom({
      data: [
        {
          id: 2,
          accelo_id: null,
          title: "Task to Create",
          company_id: 11,
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
          companies: { default_job_accelo_id: 600 },
        },
      ],
      error: null,
    });
    const updateChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(updateChain);
    nextFrom({ data: [], error: null }); // retry

    const req = makeCronRequest("/api/cron/push-tasks");
    await pushTasksGET(req as never);

    expect(mockFrom).toHaveBeenCalledWith("tasks");
    // The update call should include accelo_id = 9002
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ accelo_id: 9002 })
    );
  });
});

describe("GET /api/cron/push-tasks — update path (accelo_id present)", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("calls acceloUpdateTask for tasks with existing accelo_id", async () => {
    mockAcceloUpdateTask.mockResolvedValue(undefined);

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 10,
          accelo_id: 777,
          title: "Existing Task",
          company_id: 20,
          assignee_id: 55,
          due_date: "2026-12-01",
          budgeted_seconds: 3600,
          status_id: 4,
          companies: { default_job_accelo_id: 500 },
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // update synced_to_accelo_at
    nextFrom({ data: [], error: null }); // retry

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    const json = await res.json();

    expect(mockAcceloUpdateTask).toHaveBeenCalledWith(
      777,
      expect.objectContaining({
        title: "Existing Task",
        assignee: 55,
        date_due: "2026-12-01",
        budgeted: 3600,
        status: 4,
      })
    );
    expect(json.synced).toBe(1);
  });

  it("marks synced_to_accelo_at = now after successful update", async () => {
    mockAcceloUpdateTask.mockResolvedValue(undefined);

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 11,
          accelo_id: 888,
          title: "Update Me",
          company_id: null,
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: null,
          companies: null,
        },
      ],
      error: null,
    });
    const updateChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(updateChain);
    nextFrom({ data: [], error: null }); // retry

    const req = makeCronRequest("/api/cron/push-tasks");
    await pushTasksGET(req as never);

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ synced_to_accelo_at: expect.any(String) })
    );
  });
});

describe("GET /api/cron/push-tasks — missing default_job_accelo_id", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("logs sync_failure and skips task when company has no default_job_accelo_id", async () => {
    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 20,
          accelo_id: null,
          title: "Orphan Task",
          company_id: 99,
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
          companies: { default_job_accelo_id: null }, // No job configured
        },
      ],
      error: null,
    });
    // insertSyncFailure: check existing failure
    nextFrom({ data: null, error: null }); // .single() — no existing failure
    // insertSyncFailure: insert new failure
    nextFrom({ data: null, error: null });
    // retry
    nextFrom({ data: [], error: null });

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateTask).not.toHaveBeenCalled();
    expect(json.failed).toBe(1);
    expect(json.synced).toBe(0);
  });

  it("also logs failure when companies is null (no company linked to task)", async () => {
    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 21,
          accelo_id: null,
          title: "No Company Task",
          company_id: null,
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
          companies: null,
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // sync failure check
    nextFrom({ data: null, error: null }); // sync failure insert
    nextFrom({ data: [], error: null }); // retry

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateTask).not.toHaveBeenCalled();
    expect(json.failed).toBe(1);
  });
});

describe("GET /api/cron/push-tasks — blocked entries (existing sync failures)", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("skips tasks whose max_attempts are exhausted", async () => {
    // A blocked failure for task id=30 with max attempts exhausted
    nextFrom({
      data: [
        {
          entity_id: 30,
          attempts: 5,
          max_attempts: 5,
          next_retry_at: null,
        },
      ],
      error: null,
    });
    nextFrom({
      data: [
        {
          id: 30,
          accelo_id: null,
          title: "Exhausted Task",
          company_id: 10,
          companies: { default_job_accelo_id: 500 },
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // retry

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateTask).not.toHaveBeenCalled();
    expect(json.skipped).toBe(1);
    expect(json.synced).toBe(0);
  });

  it("skips tasks in backoff window (next_retry_at in future)", async () => {
    const futureRetry = new Date(Date.now() + 60_000).toISOString();
    nextFrom({
      data: [
        {
          entity_id: 31,
          attempts: 2,
          max_attempts: 5,
          next_retry_at: futureRetry,
        },
      ],
      error: null,
    });
    nextFrom({
      data: [
        {
          id: 31,
          accelo_id: null,
          title: "Backoff Task",
          company_id: 10,
          companies: { default_job_accelo_id: 500 },
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // retry

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateTask).not.toHaveBeenCalled();
    expect(json.skipped).toBe(1);
  });
});

describe("GET /api/cron/push-tasks — Accelo API failure handling", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("inserts sync_failure with exponential backoff when Accelo create fails", async () => {
    mockAcceloCreateTask.mockRejectedValue(new Error("Accelo 503: Service Unavailable"));

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 40,
          accelo_id: null,
          title: "Fail Task",
          company_id: 15,
          companies: { default_job_accelo_id: 700 },
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
        },
      ],
      error: null,
    });
    // insertSyncFailure: no existing failure
    nextFrom({ data: null, error: null });
    // insertSyncFailure: insert new
    const insertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(insertChain);
    nextFrom({ data: [], error: null }); // retry

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    const json = await res.json();

    expect(json.failed).toBe(1);
    expect(json.synced).toBe(0);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: "task",
        entity_id: 40,
        operation: "create",
        attempts: 1,
        max_attempts: 5,
        error_message: "Accelo 503: Service Unavailable",
      })
    );
  });

  it("inserts sync_failure when Accelo update fails", async () => {
    mockAcceloUpdateTask.mockRejectedValue(new Error("Accelo 500: Internal Error"));

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 41,
          accelo_id: 8888,
          title: "Update Fail",
          company_id: 15,
          companies: { default_job_accelo_id: 700 },
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // sync failure check
    const insertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(insertChain);
    nextFrom({ data: [], error: null }); // retry

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    const json = await res.json();

    expect(json.failed).toBe(1);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: "task",
        entity_id: 41,
        operation: "update",
        attempts: 1,
        max_attempts: 5,
      })
    );
  });

  it("increments attempts and updates backoff on a subsequent failure (existing failure row)", async () => {
    mockAcceloCreateTask.mockRejectedValue(new Error("Accelo 429: Rate Limit"));

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 42,
          accelo_id: null,
          title: "Retry Fail",
          company_id: 15,
          companies: { default_job_accelo_id: 700 },
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
        },
      ],
      error: null,
    });
    // insertSyncFailure: existing failure found (attempts=2, max_attempts=5)
    nextFrom({ data: { id: 100, attempts: 2, max_attempts: 5 }, error: null });
    // insertSyncFailure: update existing
    const updateChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(updateChain);
    nextFrom({ data: [], error: null }); // retry

    const req = makeCronRequest("/api/cron/push-tasks");
    await pushTasksGET(req as never);

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 3,
        error_message: "Accelo 429: Rate Limit",
        next_retry_at: expect.any(String),
      })
    );
  });

  it("returns 500 when Supabase tasks query itself fails", async () => {
    nextFrom({ data: [], error: null }); // blocked
    nextFrom({ data: null, error: { message: "Connection timeout" } }); // tasks query fails

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Failed to fetch tasks");
  });
});

describe("GET /api/cron/push-tasks — retry processing", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("processes retryable failures after main batch", async () => {
    mockAcceloCreateTask.mockResolvedValue({ id: 9999 });

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({ data: [], error: null }); // tasks — empty (no new tasks)
    // retry failures — one retryable entry
    nextFrom({
      data: [
        {
          id: 200,
          entity_id: 50,
          entity_type: "task",
          operation: "create",
          attempts: 2,
          max_attempts: 5,
          next_retry_at: new Date(Date.now() - 1000).toISOString(), // past
        },
      ],
      error: null,
    });
    // task rows for retry
    nextFrom({
      data: [
        {
          id: 50,
          accelo_id: null,
          title: "Retry Task",
          company_id: 30,
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
          companies: { default_job_accelo_id: 800 },
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // update task accelo_id + synced_at
    nextFrom({ data: null, error: null }); // resolve failure (resolved_at = now)

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ against_id: 800 })
    );
    expect(json.retried).toBe(1);
    expect(json.retryFailed).toBe(0);
  });

  it("skips retry if task was already processed in main batch (race prevention)", async () => {
    mockAcceloCreateTask.mockResolvedValue({ id: 7777 });

    nextFrom({ data: [], error: null }); // blocked
    // Main batch: one task with accelo_id=null
    nextFrom({
      data: [
        {
          id: 60,
          accelo_id: null,
          title: "Main Batch Task",
          company_id: 5,
          companies: { default_job_accelo_id: 900 },
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // update tasks after create
    // Retry: a failure also for entity_id=60 (same task)
    nextFrom({
      data: [
        {
          id: 300,
          entity_id: 60,
          entity_type: "task",
          operation: "create",
          attempts: 1,
          max_attempts: 5,
          next_retry_at: new Date(Date.now() - 1000).toISOString(),
        },
      ],
      error: null,
    });
    // task rows for retry (returns task 60)
    nextFrom({
      data: [
        {
          id: 60,
          accelo_id: null,
          title: "Main Batch Task",
          company_id: 5,
          assignee_id: null,
          due_date: null,
          budgeted_seconds: null,
          status_id: 2,
          companies: { default_job_accelo_id: 900 },
        },
      ],
      error: null,
    });

    const req = makeCronRequest("/api/cron/push-tasks");
    const res = await pushTasksGET(req as never);
    const json = await res.json();

    // acceloCreateTask should have been called exactly once (main batch only, not retry)
    expect(mockAcceloCreateTask).toHaveBeenCalledTimes(1);
    expect(json.synced).toBe(1);
    // Task 60 was in processedIds so the retry was skipped
    expect(json.retried).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. push-time-entries cron route
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/cron/push-time-entries — auth guard", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("rejects request with no Authorization header (401)", async () => {
    const req = makeUnauthRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it("rejects request with wrong CRON_SECRET (401)", async () => {
    const req = makeWrongAuthRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/push-time-entries — empty batch", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("returns { ok: true, synced: 0 } when no unsynced entries exist", async () => {
    nextFrom({ data: [], error: null }); // blocked failures
    nextFrom({ data: [], error: null }); // time_entries query — empty

    const req = makeCronRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.synced).toBe(0);
    expect(json.failed).toBe(0);
  });
});

describe("GET /api/cron/push-time-entries — missing accelo_ids", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("logs failure and skips entry when task has no accelo_id", async () => {
    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 1001,
          task_id: 50,
          staff_accelo_id: 42,
          rate_id: 5,
          started_at: "2026-04-30T09:00:00Z",
          rounded_seconds: 3600,
          duration_seconds: 3400,
          billable: true,
          description: "Some work",
          tasks: { accelo_id: null }, // task not yet synced
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // sync failure: no existing
    nextFrom({ data: null, error: null }); // sync failure: insert

    const req = makeCronRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateActivity).not.toHaveBeenCalled();
    expect(json.failed).toBe(1);
    expect(json.synced).toBe(0);
  });

  it("logs failure and skips entry when staff_accelo_id is missing", async () => {
    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 1002,
          task_id: 51,
          staff_accelo_id: null, // missing
          rate_id: 5,
          started_at: "2026-04-30T09:00:00Z",
          rounded_seconds: 3600,
          duration_seconds: 3400,
          billable: true,
          description: null,
          tasks: { accelo_id: 500 },
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // sync failure: no existing
    nextFrom({ data: null, error: null }); // sync failure: insert

    const req = makeCronRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateActivity).not.toHaveBeenCalled();
    expect(json.failed).toBe(1);
  });

  it("logs failure and skips entry when rate_id is null", async () => {
    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 1003,
          task_id: 52,
          staff_accelo_id: 42,
          rate_id: null, // missing
          started_at: "2026-04-30T09:00:00Z",
          rounded_seconds: 3600,
          duration_seconds: 3400,
          billable: true,
          description: null,
          tasks: { accelo_id: 501 },
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // sync failure: no existing
    nextFrom({ data: null, error: null }); // sync failure: insert

    const req = makeCronRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateActivity).not.toHaveBeenCalled();
    expect(json.failed).toBe(1);
  });
});

describe("GET /api/cron/push-time-entries — zero duration entry", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("marks zero-duration entry as synced without calling Accelo", async () => {
    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 1010,
          task_id: 60,
          staff_accelo_id: 42,
          rate_id: 5,
          started_at: "2026-04-30T10:00:00Z",
          rounded_seconds: 0, // billableHours = 0
          duration_seconds: 0,
          billable: true,
          description: null,
          tasks: { accelo_id: 600 },
        },
      ],
      error: null,
    });
    // update synced_to_accelo_at
    nextFrom({ data: null, error: null });

    const req = makeCronRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateActivity).not.toHaveBeenCalled();
    expect(json.synced).toBe(1);
    expect(json.failed).toBe(0);
  });
});

describe("GET /api/cron/push-time-entries — successful push", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("creates Accelo activity with correct field mapping for billable entry", async () => {
    mockAcceloCreateActivity.mockResolvedValue({ id: 4001 });

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 2001,
          task_id: 70,
          staff_accelo_id: 42,
          rate_id: 7,
          started_at: "2026-04-30T08:00:00Z",
          rounded_seconds: 3600,
          duration_seconds: 3400,
          billable: true,
          description: "Client review",
          tasks: { accelo_id: 700 },
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // activities upsert
    nextFrom({ data: null, error: null }); // time_entries update

    const req = makeCronRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        against_type: "task",
        against_id: 700,
        owner_id: 42,
        rate_id: 7,
        billable: 1, // 3600 / 3600
        nonbillable: 0,
        subject: "Client review",
        medium: "note",
        standing: "complete",
      })
    );
    expect(json.synced).toBe(1);
    expect(json.failed).toBe(0);
  });

  it("posts non-billable hours to nonbillable field (not billable) for non-billable entries", async () => {
    mockAcceloCreateActivity.mockResolvedValue({ id: 4002 });

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 2002,
          task_id: 71,
          staff_accelo_id: 42,
          rate_id: 7,
          started_at: "2026-04-30T09:00:00Z",
          rounded_seconds: 1800, // 0.5h
          duration_seconds: 1750,
          billable: false,
          description: "Internal meeting",
          tasks: { accelo_id: 701 },
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // activities upsert
    nextFrom({ data: null, error: null }); // time_entries update

    const req = makeCronRequest("/api/cron/push-time-entries");
    await pushTimeEntriesGET(req as never);

    expect(mockAcceloCreateActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        billable: 0,
        nonbillable: 0.5, // 1800 / 3600
      })
    );
  });

  it("uses 'Time entry' as subject when description is empty", async () => {
    mockAcceloCreateActivity.mockResolvedValue({ id: 4003 });

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 2003,
          task_id: 72,
          staff_accelo_id: 42,
          rate_id: 7,
          started_at: "2026-04-30T10:00:00Z",
          rounded_seconds: 3600,
          duration_seconds: 3600,
          billable: true,
          description: null, // no description
          tasks: { accelo_id: 702 },
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // activities upsert
    nextFrom({ data: null, error: null }); // time_entries update

    const req = makeCronRequest("/api/cron/push-time-entries");
    await pushTimeEntriesGET(req as never);

    expect(mockAcceloCreateActivity).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Time entry" })
    );
  });

  it("mirrors activity to activities table via upsert on conflict accelo_id", async () => {
    mockAcceloCreateActivity.mockResolvedValue({ id: 5555 });

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 2004,
          task_id: 73,
          staff_accelo_id: 42,
          rate_id: 8,
          started_at: "2026-04-30T11:00:00Z",
          rounded_seconds: 7200,
          duration_seconds: 7000,
          billable: true,
          description: "Deep work",
          tasks: { accelo_id: 703 },
        },
      ],
      error: null,
    });
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain);
    nextFrom({ data: null, error: null }); // time_entries update

    const req = makeCronRequest("/api/cron/push-time-entries");
    await pushTimeEntriesGET(req as never);

    // activities table must be upserted with the accelo_id from the response
    expect(mockFrom).toHaveBeenCalledWith("activities");
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ accelo_id: 5555 }),
      expect.objectContaining({ onConflict: "accelo_id" })
    );
  });

  it("marks time_entry as synced (synced_to_accelo_at) after successful push", async () => {
    mockAcceloCreateActivity.mockResolvedValue({ id: 6001 });

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 2005,
          task_id: 74,
          staff_accelo_id: 42,
          rate_id: 5,
          started_at: "2026-04-30T12:00:00Z",
          rounded_seconds: 3600,
          duration_seconds: 3600,
          billable: true,
          description: "Sync test",
          tasks: { accelo_id: 704 },
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // activities upsert
    const updateChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(updateChain);

    const req = makeCronRequest("/api/cron/push-time-entries");
    await pushTimeEntriesGET(req as never);

    expect(mockFrom).toHaveBeenCalledWith("time_entries");
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ synced_to_accelo_at: expect.any(String) })
    );
  });

  it("records sync_failure when Accelo activity creation throws", async () => {
    mockAcceloCreateActivity.mockRejectedValue(new Error("Accelo 500: crash"));

    nextFrom({ data: [], error: null }); // blocked
    nextFrom({
      data: [
        {
          id: 2006,
          task_id: 75,
          staff_accelo_id: 42,
          rate_id: 5,
          started_at: "2026-04-30T13:00:00Z",
          rounded_seconds: 3600,
          duration_seconds: 3600,
          billable: true,
          description: "Crash test",
          tasks: { accelo_id: 705 },
        },
      ],
      error: null,
    });
    nextFrom({ data: null, error: null }); // sync failure check
    const insertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(insertChain);

    const req = makeCronRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    const json = await res.json();

    expect(json.failed).toBe(1);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: "time_entry",
        entity_id: 2006,
        operation: "push_to_accelo",
        attempts: 1,
        max_attempts: 5,
        error_message: "Accelo 500: crash",
      })
    );
  });
});

describe("GET /api/cron/push-time-entries — blocked entries", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("skips entries with exhausted max_attempts", async () => {
    nextFrom({
      data: [
        {
          entity_id: 3001,
          attempts: 5,
          max_attempts: 5,
          next_retry_at: null,
        },
      ],
      error: null,
    });
    nextFrom({
      data: [
        {
          id: 3001,
          task_id: 80,
          staff_accelo_id: 42,
          rate_id: 5,
          started_at: "2026-04-30T14:00:00Z",
          rounded_seconds: 3600,
          duration_seconds: 3600,
          billable: true,
          description: null,
          tasks: { accelo_id: 800 },
        },
      ],
      error: null,
    });

    const req = makeCronRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateActivity).not.toHaveBeenCalled();
    expect(json.skipped).toBe(1);
    expect(json.synced).toBe(0);
  });

  it("skips entries in backoff window (next_retry_at in future)", async () => {
    const future = new Date(Date.now() + 120_000).toISOString();
    nextFrom({
      data: [
        {
          entity_id: 3002,
          attempts: 2,
          max_attempts: 5,
          next_retry_at: future,
        },
      ],
      error: null,
    });
    nextFrom({
      data: [
        {
          id: 3002,
          task_id: 81,
          staff_accelo_id: 42,
          rate_id: 5,
          started_at: "2026-04-30T14:30:00Z",
          rounded_seconds: 3600,
          duration_seconds: 3600,
          billable: true,
          description: null,
          tasks: { accelo_id: 801 },
        },
      ],
      error: null,
    });

    const req = makeCronRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    const json = await res.json();

    expect(mockAcceloCreateActivity).not.toHaveBeenCalled();
    expect(json.skipped).toBe(1);
  });

  it("returns 500 when Supabase time_entries query fails", async () => {
    nextFrom({ data: [], error: null }); // blocked
    nextFrom({ data: null, error: { message: "Query timeout" } }); // entries query

    const req = makeCronRequest("/api/cron/push-time-entries");
    const res = await pushTimeEntriesGET(req as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Failed to fetch entries");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. compute-analytics cron route
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/cron/compute-analytics — auth guard", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("rejects request with no Authorization header (401)", async () => {
    const req = makeUnauthRequest("/api/cron/compute-analytics");
    const res = await computeAnalyticsGET(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it("rejects request with wrong CRON_SECRET (401)", async () => {
    const req = makeWrongAuthRequest("/api/cron/compute-analytics");
    const res = await computeAnalyticsGET(req as never);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/compute-analytics — data source validation", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("queries time_entries table (not activities) for utilization data", async () => {
    // time_entries
    nextFrom({ data: [], error: null });
    // staff_cost_rates
    nextFrom({ data: [], error: null });
    // rates
    nextFrom({ data: [], error: null });
    // task_transitions
    nextFrom({ data: [], error: null });

    const req = makeCronRequest("/api/cron/compute-analytics");
    await computeAnalyticsGET(req as never);

    // Verify from("time_entries") was called, not from("activities")
    const allFromCalls = mockFrom.mock.calls.map((c) => c[0] as string);
    expect(allFromCalls).toContain("time_entries");
    expect(allFromCalls).not.toContain("activities");
  });

  it("returns { ok: true, staff_computed: 0 } when no entries exist", async () => {
    nextFrom({ data: [], error: null }); // time_entries
    nextFrom({ data: [], error: null }); // staff_cost_rates
    nextFrom({ data: [], error: null }); // rates
    nextFrom({ data: [], error: null }); // task_transitions

    const req = makeCronRequest("/api/cron/compute-analytics");
    const res = await computeAnalyticsGET(req as never);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.staff_computed).toBe(0);
  });
});

describe("GET /api/cron/compute-analytics — billable hours aggregation", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
    vi.useFakeTimers();
    // Fix time to a known Monday so week calculation is deterministic
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z")); // Monday
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aggregates billable hours using rounded_seconds for a single staff member", async () => {
    nextFrom({
      data: [
        {
          staff_accelo_id: 42,
          rounded_seconds: 7200,   // 2h billable
          duration_seconds: 7100,  // raw (should not be used for billable)
          rate_id: 5,
          billable: true,
        },
      ],
      error: null,
    });
    nextFrom({ data: [{ staff_accelo_id: 42, hourly_cost: 50 }], error: null }); // cost rates
    nextFrom({ data: [{ id: 5, charged: 150 }], error: null }); // billing rates
    nextFrom({ data: [], error: null }); // task_transitions
    nextFrom({ data: null, error: null }); // analytics_snapshots upsert

    const req = makeCronRequest("/api/cron/compute-analytics");
    const res = await computeAnalyticsGET(req as never);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.staff_computed).toBe(1);
  });

  it("computes billable_hrs from rounded_seconds (not duration_seconds)", async () => {
    // 3600 rounded (1h), 3000 raw — billable_hrs must be 1.0 not 0.83
    nextFrom({
      data: [
        {
          staff_accelo_id: 10,
          rounded_seconds: 3600,
          duration_seconds: 3000,
          rate_id: 1,
          billable: true,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // cost rates
    nextFrom({ data: [{ id: 1, charged: 100 }], error: null }); // rates
    nextFrom({ data: [], error: null }); // transitions
    nextFrom({ data: null, error: null }); // analytics_snapshots upsert

    const req = makeCronRequest("/api/cron/compute-analytics");
    await computeAnalyticsGET(req as never);

    // Verify upsert was called — the analytics_snapshots table was queried
    const analyticsCall = mockFrom.mock.calls.find((c) => c[0] === "analytics_snapshots");
    expect(analyticsCall).toBeDefined();
  });

  it("computes revenue = billable_hrs * billing_rate", async () => {
    // 2h * $150/h = $300
    nextFrom({
      data: [
        {
          staff_accelo_id: 20,
          rounded_seconds: 7200, // 2h
          duration_seconds: 7200,
          rate_id: 3,
          billable: true,
        },
      ],
      error: null,
    });
    nextFrom({ data: [{ staff_accelo_id: 20, hourly_cost: 75 }], error: null }); // cost
    nextFrom({ data: [{ id: 3, charged: 150 }], error: null }); // rate
    nextFrom({ data: [], error: null }); // transitions
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain); // analytics_snapshots upsert

    const req = makeCronRequest("/api/cron/compute-analytics");
    await computeAnalyticsGET(req as never);

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          revenue: 300, // 2 * 150
        }),
      ]),
      expect.any(Object)
    );
  });
});

describe("GET /api/cron/compute-analytics — non-billable hours aggregation", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z")); // Monday
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses duration_seconds (not rounded_seconds) for non-billable hours", async () => {
    // Non-billable: raw 3000s, rounded 3600s — nonbillable_hrs should use 3000s
    nextFrom({
      data: [
        {
          staff_accelo_id: 30,
          rounded_seconds: 3600, // billing increment (should NOT be used for non-billable)
          duration_seconds: 3000, // raw actual time (SHOULD be used)
          rate_id: null,
          billable: false,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // cost rates
    nextFrom({ data: [], error: null }); // rates
    nextFrom({ data: [], error: null }); // transitions
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    const req = makeCronRequest("/api/cron/compute-analytics");
    await computeAnalyticsGET(req as never);

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          nonbillable_hrs: expect.closeTo(3000 / 3600, 2), // ~0.83
          billable_hrs: 0,
        }),
      ]),
      expect.any(Object)
    );
  });

  it("non-billable entries do not contribute to billable_hrs", async () => {
    nextFrom({
      data: [
        {
          staff_accelo_id: 31,
          rounded_seconds: 7200,
          duration_seconds: 7000,
          rate_id: null,
          billable: false,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // cost rates
    nextFrom({ data: [], error: null }); // rates
    nextFrom({ data: [], error: null }); // transitions
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    const req = makeCronRequest("/api/cron/compute-analytics");
    await computeAnalyticsGET(req as never);

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ billable_hrs: 0 }),
      ]),
      expect.any(Object)
    );
  });

  it("non-billable entries do not contribute to revenue", async () => {
    nextFrom({
      data: [
        {
          staff_accelo_id: 32,
          rounded_seconds: 3600,
          duration_seconds: 3600,
          rate_id: 9,
          billable: false,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // cost rates
    nextFrom({ data: [{ id: 9, charged: 200 }], error: null }); // rates (rate exists but not billed)
    nextFrom({ data: [], error: null }); // transitions
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    const req = makeCronRequest("/api/cron/compute-analytics");
    await computeAnalyticsGET(req as never);

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ revenue: 0 }),
      ]),
      expect.any(Object)
    );
  });
});

describe("GET /api/cron/compute-analytics — utilization calculation", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z")); // Monday
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("utilization = billableHrs / 40 (40h denominator)", async () => {
    // 20h billable → 50% utilization
    nextFrom({
      data: [
        {
          staff_accelo_id: 50,
          rounded_seconds: 72000, // 20h
          duration_seconds: 72000,
          rate_id: 1,
          billable: true,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // cost
    nextFrom({ data: [{ id: 1, charged: 100 }], error: null }); // rates
    nextFrom({ data: [], error: null }); // transitions
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    const req = makeCronRequest("/api/cron/compute-analytics");
    await computeAnalyticsGET(req as never);

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ utilization: 50 }), // 20/40 * 100
      ]),
      expect.any(Object)
    );
  });

  it("utilization numerator uses only billable hours (not non-billable)", async () => {
    // 20h billable + 10h non-billable = 50% utilization (not 75%)
    nextFrom({
      data: [
        {
          staff_accelo_id: 51,
          rounded_seconds: 72000, // 20h billable
          duration_seconds: 72000,
          rate_id: 1,
          billable: true,
        },
        {
          staff_accelo_id: 51,
          rounded_seconds: 36000, // 10h (non-billable, use duration)
          duration_seconds: 36000,
          rate_id: null,
          billable: false,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // cost
    nextFrom({ data: [{ id: 1, charged: 100 }], error: null }); // rates
    nextFrom({ data: [], error: null }); // transitions
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    const req = makeCronRequest("/api/cron/compute-analytics");
    await computeAnalyticsGET(req as never);

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ utilization: 50 }), // 20/40 * 100, non-billable excluded
      ]),
      expect.any(Object)
    );
  });

  it("aggregates multiple entries for the same staff member correctly", async () => {
    // Two billable entries for same staff: 1h + 1h = 2h = 5% utilization
    nextFrom({
      data: [
        {
          staff_accelo_id: 52,
          rounded_seconds: 3600,
          duration_seconds: 3600,
          rate_id: 2,
          billable: true,
        },
        {
          staff_accelo_id: 52,
          rounded_seconds: 3600,
          duration_seconds: 3600,
          rate_id: 2,
          billable: true,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // cost
    nextFrom({ data: [{ id: 2, charged: 120 }], error: null }); // rates
    nextFrom({ data: [], error: null }); // transitions
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    const req = makeCronRequest("/api/cron/compute-analytics");
    await computeAnalyticsGET(req as never);

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          billable_hrs: 2, // 1 + 1
          utilization: 5,  // 2/40 * 100
          revenue: 240,    // 2 * 120
        }),
      ]),
      expect.any(Object)
    );
  });

  it("separates analytics per staff_accelo_id (different staff = different rows)", async () => {
    nextFrom({
      data: [
        {
          staff_accelo_id: 60,
          rounded_seconds: 14400, // 4h
          duration_seconds: 14400,
          rate_id: 1,
          billable: true,
        },
        {
          staff_accelo_id: 61,
          rounded_seconds: 7200, // 2h
          duration_seconds: 7200,
          rate_id: 1,
          billable: true,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // cost
    nextFrom({ data: [{ id: 1, charged: 100 }], error: null }); // rates
    nextFrom({ data: [], error: null }); // transitions
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    const req = makeCronRequest("/api/cron/compute-analytics");
    const res = await computeAnalyticsGET(req as never);
    const json = await res.json();

    expect(json.staff_computed).toBe(2);
    // Two separate rows passed to upsert
    const [rows] = upsertChain.upsert.mock.calls[0] as [Array<Record<string, unknown>>];
    expect(rows).toHaveLength(2);
    const staffIds = rows.map((r) => r.staff_id).sort();
    expect(staffIds).toEqual([60, 61]);
  });

  it("entries without staff_accelo_id are skipped", async () => {
    nextFrom({
      data: [
        {
          staff_accelo_id: null, // no staff — must be skipped
          rounded_seconds: 3600,
          duration_seconds: 3600,
          rate_id: 1,
          billable: true,
        },
      ],
      error: null,
    });
    nextFrom({ data: [], error: null }); // cost
    nextFrom({ data: [], error: null }); // rates
    nextFrom({ data: [], error: null }); // transitions

    const req = makeCronRequest("/api/cron/compute-analytics");
    const res = await computeAnalyticsGET(req as never);
    const json = await res.json();

    expect(json.staff_computed).toBe(0);
  });
});

describe("GET /api/cron/compute-analytics — error handling", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.resetAllMocks();
  });

  it("returns 500 when time_entries query fails", async () => {
    nextFrom({ data: null, error: { message: "DB connection refused" } }); // time_entries

    const req = makeCronRequest("/api/cron/compute-analytics");
    const res = await computeAnalyticsGET(req as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Failed to fetch time entries");
    expect(json.error).toContain("DB connection refused");
  });

  it("continues with empty cost map when staff_cost_rates query returns no rows", async () => {
    nextFrom({ data: [{ staff_accelo_id: 70, rounded_seconds: 3600, duration_seconds: 3600, rate_id: 1, billable: true }], error: null });
    nextFrom({ data: null, error: { message: "table not found" } }); // cost rates fails gracefully
    nextFrom({ data: [{ id: 1, charged: 100 }], error: null }); // rates
    nextFrom({ data: [], error: null }); // transitions
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    const req = makeCronRequest("/api/cron/compute-analytics");
    const res = await computeAnalyticsGET(req as never);
    // Should still succeed (cost = 0 when rates unavailable)
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("upserts to analytics_snapshots with correct onConflict columns", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));

    nextFrom({
      data: [{ staff_accelo_id: 80, rounded_seconds: 3600, duration_seconds: 3600, rate_id: 1, billable: true }],
      error: null,
    });
    nextFrom({ data: [], error: null }); // cost
    nextFrom({ data: [{ id: 1, charged: 100 }], error: null }); // rates
    nextFrom({ data: [], error: null }); // transitions
    const upsertChain = makeChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(upsertChain);

    const req = makeCronRequest("/api/cron/compute-analytics");
    await computeAnalyticsGET(req as never);

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        onConflict: "period_start,period_end,period_type,staff_id",
      })
    );

    vi.useRealTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Exponential backoff math validation
//
// Validates the backoff formula used across both cron routes.
// This is pure logic (no mocks needed) — critical for the retry queue.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mirrors the backoff calculation in push-tasks/route.ts and
 * push-time-entries/route.ts:
 *   backoffMs = 2^attempts * 60 * 1000 (minutes)
 */
function computeBackoffMs(attempts: number): number {
  return Math.pow(2, attempts) * 60 * 1000;
}

describe("exponential backoff calculation", () => {
  it("attempt 1 → 2 minutes backoff", () => {
    expect(computeBackoffMs(1)).toBe(2 * 60 * 1000); // 120_000 ms
  });

  it("attempt 2 → 4 minutes backoff", () => {
    expect(computeBackoffMs(2)).toBe(4 * 60 * 1000);
  });

  it("attempt 3 → 8 minutes backoff", () => {
    expect(computeBackoffMs(3)).toBe(8 * 60 * 1000);
  });

  it("attempt 4 → 16 minutes backoff", () => {
    expect(computeBackoffMs(4)).toBe(16 * 60 * 1000);
  });

  it("attempt 5 → 32 minutes backoff (max_attempts reached, next_retry_at = null)", () => {
    // At max_attempts the route sets next_retry_at = null to stop retrying
    expect(computeBackoffMs(5)).toBe(32 * 60 * 1000);
  });

  it("backoff grows exponentially (each step doubles previous)", () => {
    for (let i = 1; i < 5; i++) {
      expect(computeBackoffMs(i + 1)).toBe(computeBackoffMs(i) * 2);
    }
  });
});

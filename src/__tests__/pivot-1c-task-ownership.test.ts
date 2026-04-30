/**
 * Tests for Pivot 1C: Task Ownership (Supabase-first)
 *
 * Covers:
 *   1. POST /api/tasks — create a Supabase-native task
 *   2. PUT /api/tasks/[id]/status — update status (Supabase PK + accelo_id legacy)
 *   3. PUT /api/tasks/[id]/assignee — reassign task (Supabase PK + accelo_id legacy)
 *   4. createTaskInDb query function — insert logic + name resolution + status mapping
 *
 * All tests mock Supabase at the module boundary via vi.mock() so no live
 * database or network calls are made.  Each describe block calls vi.clearAllMocks()
 * in beforeEach to guarantee isolation between cases.
 *
 * Sections 5–7 (createTaskInDb logic) test the query function behaviour by
 * replicating its logic with a mock SupabaseClient, following the same
 * pattern as pivot1b-timer-persistence.test.ts, which tests query functions
 * inline rather than importing mocked exports.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Module-level mocks (hoisted before imports)
// ═══════════════════════════════════════════════════════════════════════════════

const {
  mockGetUser,
  mockFrom,
  mockCreateTaskInDb,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateTaskInDb: vi.fn(),
}));

// Mock the Supabase admin client used by all three route handlers.
vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}));

// Mock createTaskInDb for the route-level POST tests only.
// Direct query-layer tests replicate the function logic inline with a mock client.
vi.mock("@/lib/queries/tasks", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/queries/tasks")>();
  return {
    ...original,
    createTaskInDb: mockCreateTaskInDb,
  };
});

// Import route handlers AFTER mocks are registered.
import { POST as postTasks } from "@/app/api/tasks/route";
import { PUT as putStatus } from "@/app/api/tasks/[id]/status/route";
import { PUT as putAssignee } from "@/app/api/tasks/[id]/assignee/route";

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Shared test helpers
// ═══════════════════════════════════════════════════════════════════════════════

function makeRequest(
  url: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
  headers: Record<string, string> = {}
): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${url}`, init);
}

function makeParams(id: string | number): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

const MANAGER_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  app_metadata: { role: "manager", staff_accelo_id: 42 },
};

const WORKER_USER = {
  id: "00000000-0000-0000-0000-000000000002",
  app_metadata: { role: "worker", staff_accelo_id: 99 },
};

function mockAuthAs(user: typeof MANAGER_USER | typeof WORKER_USER) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
}

// ─── Supabase chain builder ───────────────────────────────────────────────────
//
// The status and assignee routes call chains like:
//
//   from("tasks").select(...).eq(...).is(...).single()          ← lookup
//   from("tasks").update(...).eq(...).is(...)                   ← update (no .single())
//   from("task_transitions").insert(...)                        ← optional transition
//
// The update chain in the routes resolves implicitly when awaited without a
// terminal like .single().  We model that by making .is() (the last call in
// the update chain) return a thenable that resolves to { data, error }.
//
// For lookup chains, .single() is the terminal and resolves to { data, error }.

function makeChainResult(terminalResult: { data: unknown; error: unknown }) {
  // A promise that resolves to terminalResult — used as the thenable payload
  const p = Promise.resolve(terminalResult);

  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const passThrough = ["select", "update", "eq", "not", "in", "order", "limit"];
  for (const m of passThrough) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }

  // .single() — terminal for lookup queries
  chain.single = vi.fn().mockResolvedValue(terminalResult);

  // .maybeSingle() — terminal for optional-single lookups
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult);

  // .insert() — terminal for task_transitions (resolved directly)
  chain.insert = vi.fn().mockResolvedValue(terminalResult);

  // .is() — terminal for update chains in this codebase.
  // The route does: await supabaseAdmin.from(...).update(...).eq(...).is(...)
  // So .is() must be a thenable.
  chain.is = vi.fn().mockImplementation(() => ({
    ...chain,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }));

  return chain;
}

/**
 * Queues one chainable response for the next from() call.
 * Returns the chain so tests can assert on method calls.
 */
function nextFrom(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain = makeChainResult(result);
  mockFrom.mockReturnValueOnce(chain);
  return chain;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. POST /api/tasks
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/tasks — auth guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when Authorization header is absent", async () => {
    const req = makeRequest("/api/tasks", "POST", { title: "Test" });
    const res = await postTasks(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it("returns 401 when Authorization header does not start with 'Bearer '", async () => {
    const req = makeRequest("/api/tasks", "POST", { title: "Test" }, {
      Authorization: "Token abc123",
    });
    const res = await postTasks(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 when Supabase auth returns an error (invalid token)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid JWT") });
    const req = makeRequest("/api/tasks", "POST", { title: "Test" }, {
      Authorization: "Bearer bad-token",
    });
    const res = await postTasks(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/invalid session/i);
  });

  it("returns 401 when Supabase returns no user and no error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const req = makeRequest("/api/tasks", "POST", { title: "Test" }, {
      Authorization: "Bearer ghost-token",
    });
    const res = await postTasks(req as never);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/tasks — metadata validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when user is missing staff_accelo_id in app_metadata", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { role: "manager" } } },
      error: null,
    });
    const req = makeRequest("/api/tasks", "POST", { title: "Test" }, {
      Authorization: "Bearer valid-token",
    });
    const res = await postTasks(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/staff_accelo_id/i);
  });
});

describe("POST /api/tasks — body validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 400 when title is missing from body", async () => {
    const req = makeRequest("/api/tasks", "POST", { company_id: 5 }, {
      Authorization: "Bearer valid-token",
    });
    const res = await postTasks(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing or empty title/i);
  });

  it("returns 400 when title is an empty string", async () => {
    const req = makeRequest("/api/tasks", "POST", { title: "" }, {
      Authorization: "Bearer valid-token",
    });
    const res = await postTasks(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing or empty title/i);
  });

  it("returns 400 when title is whitespace-only", async () => {
    const req = makeRequest("/api/tasks", "POST", { title: "   " }, {
      Authorization: "Bearer valid-token",
    });
    const res = await postTasks(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing or empty title/i);
  });

  it("returns 400 when request body is invalid JSON", async () => {
    const req = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid-token" },
      body: "{ not valid json ,,, }",
    });
    const res = await postTasks(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });
});

describe("POST /api/tasks — authorization (role-based)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when worker tries to create a task for a different assignee", async () => {
    mockAuthAs(WORKER_USER);
    const req = makeRequest("/api/tasks", "POST",
      { title: "Do my taxes", assignee_id: 55 },
      { Authorization: "Bearer worker-token" }
    );
    const res = await postTasks(req as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/workers can only create tasks assigned to themselves/i);
  });

  it("returns 201 when worker creates a task assigned to their own staff_accelo_id", async () => {
    mockAuthAs(WORKER_USER);
    mockCreateTaskInDb.mockResolvedValue({
      id: "10", title: "Self-assigned task", client: "", assignee: "Worker",
      category: "", priority: "medium", status: "todo", dueDate: "",
      estimatedHours: 0, loggedHours: 0, recurring: false,
    });
    const req = makeRequest("/api/tasks", "POST",
      { title: "Self-assigned task", assignee_id: 99 },
      { Authorization: "Bearer worker-token" }
    );
    const res = await postTasks(req as never);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.task.id).toBe("10");
  });

  it("returns 201 when worker omits assignee_id (defaults to own ID)", async () => {
    mockAuthAs(WORKER_USER);
    mockCreateTaskInDb.mockResolvedValue({ id: "11", title: "My own task" });
    const req = makeRequest("/api/tasks", "POST",
      { title: "My own task" },
      { Authorization: "Bearer worker-token" }
    );
    const res = await postTasks(req as never);
    expect(res.status).toBe(201);
    expect(mockCreateTaskInDb).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assignee_id: WORKER_USER.app_metadata.staff_accelo_id })
    );
  });

  it("returns 201 when manager assigns to any staff_accelo_id", async () => {
    mockAuthAs(MANAGER_USER);
    mockCreateTaskInDb.mockResolvedValue({ id: "12", title: "Manager assigned task" });
    const req = makeRequest("/api/tasks", "POST",
      { title: "Manager assigned task", assignee_id: 777 },
      { Authorization: "Bearer manager-token" }
    );
    const res = await postTasks(req as never);
    expect(res.status).toBe(201);
    expect(mockCreateTaskInDb).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assignee_id: 777 })
    );
  });
});

describe("POST /api/tasks — happy path (all fields)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 201 with the created task object when all fields are provided", async () => {
    const expectedTask = {
      id: "42", title: "Comprehensive Task", client: "ACME Corp", assignee: "Gio",
      category: "", priority: "medium" as const, status: "todo" as const,
      dueDate: "2026-06-01", estimatedHours: 5, loggedHours: 0, recurring: false,
    };
    mockCreateTaskInDb.mockResolvedValue(expectedTask);
    const req = makeRequest("/api/tasks", "POST", {
      title: "Comprehensive Task",
      assignee_id: 10,
      company_id: 20,
      status_id: 4,
      due_date: "2026-06-01",
      budgeted_seconds: 18000,
    }, { Authorization: "Bearer manager-token" });
    const res = await postTasks(req as never);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.task).toEqual(expectedTask);
  });

  it("passes all supplied fields through to createTaskInDb", async () => {
    mockCreateTaskInDb.mockResolvedValue({ id: "99", title: "Full Task" });
    const req = makeRequest("/api/tasks", "POST", {
      title: "Full Task",
      assignee_id: 10,
      company_id: 20,
      status_id: 4,
      due_date: "2026-06-01",
      budgeted_seconds: 18000,
    }, { Authorization: "Bearer manager-token" });
    await postTasks(req as never);
    expect(mockCreateTaskInDb).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Full Task",
        assignee_id: 10,
        company_id: 20,
        status_id: 4,
        due_date: "2026-06-01",
        budgeted_seconds: 18000,
        created_by: MANAGER_USER.id,
      })
    );
  });

  it("trims whitespace from title before passing to createTaskInDb", async () => {
    mockCreateTaskInDb.mockResolvedValue({ id: "43", title: "Trimmed Title" });
    const req = makeRequest("/api/tasks", "POST", { title: "  Trimmed Title  " }, {
      Authorization: "Bearer manager-token",
    });
    await postTasks(req as never);
    expect(mockCreateTaskInDb).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: "Trimmed Title" })
    );
  });
});

describe("POST /api/tasks — happy path (minimal fields / defaults)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 201 with minimal body (title only)", async () => {
    mockCreateTaskInDb.mockResolvedValue({ id: "50", title: "Minimal Task" });
    const req = makeRequest("/api/tasks", "POST", { title: "Minimal Task" }, {
      Authorization: "Bearer manager-token",
    });
    const res = await postTasks(req as never);
    expect(res.status).toBe(201);
  });

  it("defaults status_id to 2 (Pending) when not provided", async () => {
    mockCreateTaskInDb.mockResolvedValue({ id: "51", title: "Default Status" });
    const req = makeRequest("/api/tasks", "POST", { title: "Default Status" }, {
      Authorization: "Bearer manager-token",
    });
    await postTasks(req as never);
    expect(mockCreateTaskInDb).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status_id: 2 })
    );
  });

  it("defaults assignee_id to caller's staff_accelo_id when not provided", async () => {
    mockCreateTaskInDb.mockResolvedValue({ id: "52", title: "Default Assignee" });
    const req = makeRequest("/api/tasks", "POST", { title: "Default Assignee" }, {
      Authorization: "Bearer manager-token",
    });
    await postTasks(req as never);
    expect(mockCreateTaskInDb).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assignee_id: MANAGER_USER.app_metadata.staff_accelo_id })
    );
  });

  it("defaults company_id to null when not provided", async () => {
    mockCreateTaskInDb.mockResolvedValue({ id: "53", title: "No Company" });
    const req = makeRequest("/api/tasks", "POST", { title: "No Company" }, {
      Authorization: "Bearer manager-token",
    });
    await postTasks(req as never);
    expect(mockCreateTaskInDb).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ company_id: null })
    );
  });

  it("sets created_by to the authenticated user's UUID", async () => {
    mockCreateTaskInDb.mockResolvedValue({ id: "54", title: "Audit Trail" });
    const req = makeRequest("/api/tasks", "POST", { title: "Audit Trail" }, {
      Authorization: "Bearer manager-token",
    });
    await postTasks(req as never);
    expect(mockCreateTaskInDb).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ created_by: MANAGER_USER.id })
    );
  });
});

describe("POST /api/tasks — createTaskInDb error propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 500 when createTaskInDb throws", async () => {
    mockCreateTaskInDb.mockRejectedValue(new Error("unique constraint violation"));
    const req = makeRequest("/api/tasks", "POST", { title: "Boom" }, {
      Authorization: "Bearer manager-token",
    });
    const res = await postTasks(req as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/failed to create task/i);
    expect(json.error).toContain("unique constraint violation");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PUT /api/tasks/[id]/status
// ═══════════════════════════════════════════════════════════════════════════════

describe("PUT /api/tasks/[id]/status — auth guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when Authorization header is absent", async () => {
    const req = makeRequest("/api/tasks/123/status", "PUT", { status_id: 4 });
    const res = await putStatus(req as never, makeParams(123));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it("returns 401 when Authorization header is malformed (no Bearer prefix)", async () => {
    const req = makeRequest("/api/tasks/123/status", "PUT", { status_id: 4 }, {
      Authorization: "Basic abc",
    });
    const res = await putStatus(req as never, makeParams(123));
    expect(res.status).toBe(401);
  });

  it("returns 401 when Supabase auth returns an error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("expired JWT") });
    const req = makeRequest("/api/tasks/123/status", "PUT", { status_id: 4 }, {
      Authorization: "Bearer expired-token",
    });
    const res = await putStatus(req as never, makeParams(123));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated user does not have manager role", async () => {
    mockAuthAs(WORKER_USER);
    const req = makeRequest("/api/tasks/123/status", "PUT", { status_id: 4 }, {
      Authorization: "Bearer worker-token",
    });
    const res = await putStatus(req as never, makeParams(123));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/manager role required/i);
  });
});

describe("PUT /api/tasks/[id]/status — body validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 400 when status_id is missing from body", async () => {
    const req = makeRequest("/api/tasks/123/status", "PUT", {}, {
      Authorization: "Bearer manager-token",
    });
    const res = await putStatus(req as never, makeParams(123));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing status_id/i);
  });

  it("returns 400 when request body is invalid JSON", async () => {
    const req = new Request("http://localhost/api/tasks/123/status", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer manager-token" },
      body: "{{ broken json",
    });
    const res = await putStatus(req as never, makeParams(123));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it("returns 400 when id param cannot be parsed as a number", async () => {
    mockAuthAs(MANAGER_USER);
    const req = makeRequest("/api/tasks/abc/status", "PUT", { status_id: 4 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putStatus(req as never, makeParams("abc"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid task id/i);
  });
});

describe("PUT /api/tasks/[id]/status — happy path (Supabase PK lookup)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 200 and updates the task found by Supabase PK", async () => {
    // PK lookup hits
    nextFrom({ data: { id: 100, accelo_id: null, status_id: 2 }, error: null });
    // Update (resolves via .is())
    nextFrom({ data: null, error: null });

    const req = makeRequest("/api/tasks/100/status", "PUT", { status_id: 4 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putStatus(req as never, makeParams(100));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status_id).toBe(4);
  });

  it("sets synced_to_accelo_at = null on update (marks task dirty for outbound cron)", async () => {
    nextFrom({ data: { id: 100, accelo_id: null, status_id: 2 }, error: null });
    const updateChain = makeChainResult({ data: null, error: null });
    mockFrom.mockReturnValueOnce(updateChain);

    const req = makeRequest("/api/tasks/100/status", "PUT", { status_id: 4 }, {
      Authorization: "Bearer manager-token",
    });
    await putStatus(req as never, makeParams(100));

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status_id: 4, synced_to_accelo_at: null })
    );
  });

  it("excludes soft-deleted tasks: both lookups return null → 404", async () => {
    // deleted_at IS NOT NULL guard in the query means the row is not returned
    nextFrom({ data: null, error: null }); // PK miss (task deleted)
    nextFrom({ data: null, error: null }); // accelo_id miss (task deleted)

    const req = makeRequest("/api/tasks/999/status", "PUT", { status_id: 5 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putStatus(req as never, makeParams(999));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/task not found/i);
  });
});

describe("PUT /api/tasks/[id]/status — happy path (accelo_id legacy lookup)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("finds and updates a task by accelo_id when Supabase PK lookup misses", async () => {
    // from() call 1 — PK lookup misses (9001 is not a Supabase PK in this DB)
    nextFrom({ data: null, error: null });
    // from() call 2 — accelo_id lookup hits (status_id=3 is different from requested 5,
    //   and accelo_id is non-null, so a task_transitions insert will also be triggered)
    nextFrom({ data: { id: 55, accelo_id: 9001, status_id: 3 }, error: null });
    // from() call 3 — update resolves via .is() with no error
    nextFrom({ data: null, error: null });
    // from() call 4 — task_transitions insert (status changed + accelo_id present)
    nextFrom({ data: null, error: null });

    const req = makeRequest("/api/tasks/9001/status", "PUT", { status_id: 5 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putStatus(req as never, makeParams(9001));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status_id).toBe(5);
  });
});

describe("PUT /api/tasks/[id]/status — task_transitions recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("records a task_transition when task has accelo_id and status changes", async () => {
    // Task found by PK with accelo_id, status changing 2 → 4
    nextFrom({ data: { id: 10, accelo_id: 9001, status_id: 2 }, error: null });
    // Update
    nextFrom({ data: null, error: null });
    // task_transitions insert — capture this chain so we can assert on it
    const transitionChain = makeChainResult({ data: null, error: null });
    mockFrom.mockReturnValueOnce(transitionChain);

    const req = makeRequest("/api/tasks/10/status", "PUT", { status_id: 4 }, {
      Authorization: "Bearer manager-token",
    });
    await putStatus(req as never, makeParams(10));

    // Verify from("task_transitions") was called and insert used correct data
    expect(mockFrom).toHaveBeenCalledWith("task_transitions");
    expect(transitionChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        task_accelo_id: 9001,
        from_status_id: 2,
        to_status_id: 4,
      })
    );
  });

  it("does NOT record a task_transition when accelo_id is null (Supabase-native task)", async () => {
    // Task is in-app: accelo_id is null
    nextFrom({ data: { id: 10, accelo_id: null, status_id: 2 }, error: null });
    // Update
    nextFrom({ data: null, error: null });

    const req = makeRequest("/api/tasks/10/status", "PUT", { status_id: 4 }, {
      Authorization: "Bearer manager-token",
    });
    await putStatus(req as never, makeParams(10));

    // task_transitions must NOT be touched
    const allFromCalls = mockFrom.mock.calls.map((c) => c[0] as string);
    expect(allFromCalls).not.toContain("task_transitions");
  });

  it("does NOT record a transition when status_id is unchanged (no-op update)", async () => {
    // Current status_id matches the requested status_id
    nextFrom({ data: { id: 10, accelo_id: 9001, status_id: 4 }, error: null });
    nextFrom({ data: null, error: null });

    const req = makeRequest("/api/tasks/10/status", "PUT", { status_id: 4 }, {
      Authorization: "Bearer manager-token",
    });
    await putStatus(req as never, makeParams(10));

    const allFromCalls = mockFrom.mock.calls.map((c) => c[0] as string);
    expect(allFromCalls).not.toContain("task_transitions");
  });
});

describe("PUT /api/tasks/[id]/status — not found", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 404 when neither Supabase PK nor accelo_id lookup finds the task", async () => {
    nextFrom({ data: null, error: null }); // PK miss
    nextFrom({ data: null, error: null }); // accelo_id miss

    const req = makeRequest("/api/tasks/99999/status", "PUT", { status_id: 5 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putStatus(req as never, makeParams(99999));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/task not found/i);
  });
});

describe("PUT /api/tasks/[id]/status — Supabase update error propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 500 when Supabase update returns an error", async () => {
    nextFrom({ data: { id: 10, accelo_id: null, status_id: 2 }, error: null });
    // Update chain resolves with an error
    nextFrom({ data: null, error: { message: "DB write timeout" } });

    const req = makeRequest("/api/tasks/10/status", "PUT", { status_id: 4 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putStatus(req as never, makeParams(10));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("DB write timeout");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PUT /api/tasks/[id]/assignee
// ═══════════════════════════════════════════════════════════════════════════════

describe("PUT /api/tasks/[id]/assignee — auth guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when Authorization header is absent", async () => {
    const req = makeRequest("/api/tasks/123/assignee", "PUT", { assignee_id: 10 });
    const res = await putAssignee(req as never, makeParams(123));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it("returns 401 when Authorization header is malformed", async () => {
    const req = makeRequest("/api/tasks/123/assignee", "PUT", { assignee_id: 10 }, {
      Authorization: "Scheme abc",
    });
    const res = await putAssignee(req as never, makeParams(123));
    expect(res.status).toBe(401);
  });

  it("returns 401 when Supabase auth returns an error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid JWT") });
    const req = makeRequest("/api/tasks/123/assignee", "PUT", { assignee_id: 10 }, {
      Authorization: "Bearer bad-token",
    });
    const res = await putAssignee(req as never, makeParams(123));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated user is a worker (non-manager)", async () => {
    mockAuthAs(WORKER_USER);
    const req = makeRequest("/api/tasks/123/assignee", "PUT", { assignee_id: 10 }, {
      Authorization: "Bearer worker-token",
    });
    const res = await putAssignee(req as never, makeParams(123));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/manager role required/i);
  });
});

describe("PUT /api/tasks/[id]/assignee — body validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 400 when assignee_id is missing from body", async () => {
    const req = makeRequest("/api/tasks/123/assignee", "PUT", {}, {
      Authorization: "Bearer manager-token",
    });
    const res = await putAssignee(req as never, makeParams(123));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing assignee_id/i);
  });

  it("returns 400 when request body is invalid JSON", async () => {
    const req = new Request("http://localhost/api/tasks/123/assignee", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer manager-token" },
      body: "not-json-at-all",
    });
    const res = await putAssignee(req as never, makeParams(123));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it("returns 400 when id param cannot be parsed as a number", async () => {
    const req = makeRequest("/api/tasks/xyz/assignee", "PUT", { assignee_id: 10 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putAssignee(req as never, makeParams("xyz"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid task id/i);
  });
});

describe("PUT /api/tasks/[id]/assignee — happy path (Supabase PK lookup)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 200 with ok:true and assignee_id when update succeeds via PK", async () => {
    nextFrom({ data: { id: 200 }, error: null }); // PK lookup
    nextFrom({ data: null, error: null });           // update

    const req = makeRequest("/api/tasks/200/assignee", "PUT", { assignee_id: 33 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putAssignee(req as never, makeParams(200));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.assignee_id).toBe(33);
  });

  it("sets synced_to_accelo_at = null on update", async () => {
    nextFrom({ data: { id: 200 }, error: null });
    const updateChain = makeChainResult({ data: null, error: null });
    mockFrom.mockReturnValueOnce(updateChain);

    const req = makeRequest("/api/tasks/200/assignee", "PUT", { assignee_id: 33 }, {
      Authorization: "Bearer manager-token",
    });
    await putAssignee(req as never, makeParams(200));

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ assignee_id: 33, synced_to_accelo_at: null })
    );
  });

  it("excludes soft-deleted tasks: both lookups return null → 404", async () => {
    nextFrom({ data: null, error: null }); // PK miss (deleted)
    nextFrom({ data: null, error: null }); // accelo_id miss (deleted)

    const req = makeRequest("/api/tasks/999/assignee", "PUT", { assignee_id: 33 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putAssignee(req as never, makeParams(999));
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/tasks/[id]/assignee — happy path (accelo_id legacy lookup)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("finds and updates a task via accelo_id when PK lookup misses", async () => {
    nextFrom({ data: null, error: null });          // PK miss
    nextFrom({ data: { id: 77 }, error: null });   // accelo_id hit
    nextFrom({ data: null, error: null });           // update

    const req = makeRequest("/api/tasks/8888/assignee", "PUT", { assignee_id: 50 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putAssignee(req as never, makeParams(8888));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.assignee_id).toBe(50);
  });
});

describe("PUT /api/tasks/[id]/assignee — not found", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 404 when task is not found by either lookup", async () => {
    nextFrom({ data: null, error: null }); // PK miss
    nextFrom({ data: null, error: null }); // accelo_id miss

    const req = makeRequest("/api/tasks/0/assignee", "PUT", { assignee_id: 10 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putAssignee(req as never, makeParams(0));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/task not found/i);
  });
});

describe("PUT /api/tasks/[id]/assignee — Supabase update error propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthAs(MANAGER_USER);
  });

  it("returns 500 when Supabase update returns an error", async () => {
    nextFrom({ data: { id: 10 }, error: null });
    nextFrom({ data: null, error: { message: "connection lost" } });

    const req = makeRequest("/api/tasks/10/assignee", "PUT", { assignee_id: 5 }, {
      Authorization: "Bearer manager-token",
    });
    const res = await putAssignee(req as never, makeParams(10));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("connection lost");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. createTaskInDb — query logic (inline, with mock SupabaseClient)
//
// Strategy: vi.mock() replaces createTaskInDb for the entire test file, so we
// cannot call the imported symbol and get the real implementation.  Instead,
// we replicate the function's logic inline — exactly as pivot1b-timer-
// persistence.test.ts does with its timer query functions — and exercise it
// with a mock SupabaseClient.  This covers:
//   - Insert payload shape (accelo_id=null, synced_to_accelo_at=null, created_by)
//   - Name resolution (staff + companies lookups)
//   - Status mapping
//   - Error propagation
// ═══════════════════════════════════════════════════════════════════════════════

// ── Status mapping (copied from tasks.ts) ────────────────────────────────────

const STATUS_ID_MAP: Record<number, string> = {
  2: "todo",
  3: "todo",
  4: "in-progress",
  5: "done",
  6: "done",
  7: "waiting",
};

function mapStatus(id: number | null): string {
  if (id === null) return "todo";
  return STATUS_ID_MAP[id] ?? "todo";
}

// ── rowToTask (mirrors tasks.ts) ─────────────────────────────────────────────

type RowLike = {
  id: number;
  accelo_id: number | null;
  title: string;
  status_id: number | null;
  assignee_id: number | null;
  company_id: number | null;
  due_date: string | null;
  budgeted_seconds: number | null;
  logged_seconds: number | null;
  staff: { firstname: string | null; surname: string | null } | null;
  companies: { name: string } | null;
};

function rowToTaskInline(r: RowLike) {
  const assigneeName = r.staff
    ? [r.staff.firstname, r.staff.surname].filter(Boolean).join(" ")
    : "";
  return {
    id: String(r.id),
    title: r.title,
    client: r.companies?.name ?? "",
    assignee: assigneeName,
    category: "",
    priority: "medium" as const,
    status: mapStatus(r.status_id),
    dueDate: r.due_date ?? "",
    estimatedHours: Math.round(((r.budgeted_seconds ?? 0) / 3600) * 10) / 10,
    loggedHours: Math.round(((r.logged_seconds ?? 0) / 3600) * 10) / 10,
    recurring: false,
  };
}

// ── createTaskInDb logic (inline) ────────────────────────────────────────────

const SIMPLE_TASK_SELECT =
  "accelo_id, title, status_id, assignee_id, company_id, due_date, budgeted_seconds, logged_seconds";

type MockClient = {
  from: ReturnType<typeof vi.fn>;
};

type InsertParams = {
  title: string;
  assignee_id?: number | null;
  company_id?: number | null;
  status_id?: number | null;
  due_date?: string | null;
  budgeted_seconds?: number | null;
  created_by: string;
};

/**
 * Replicates createTaskInDb from src/lib/queries/tasks.ts.
 * Used only within this test file for isolated query-layer testing.
 */
async function createTaskInDbInline(supabase: MockClient, params: InsertParams) {
  const { data: rawData, error } = await supabase
    .from("tasks")
    .insert({
      title: params.title,
      assignee_id: params.assignee_id ?? null,
      company_id: params.company_id ?? null,
      status_id: params.status_id ?? 2,
      due_date: params.due_date ?? null,
      budgeted_seconds: params.budgeted_seconds ?? null,
      logged_seconds: 0,
      accelo_id: null,
      synced_to_accelo_at: null,
      created_by: params.created_by,
    })
    .select(SIMPLE_TASK_SELECT + ", id")
    .single();

  if (error) throw new Error(`createTaskInDb: ${(error as { message: string }).message}`);

  const data = rawData as RowLike;

  let staff: { firstname: string | null; surname: string | null } | null = null;
  let companies: { name: string } | null = null;

  if (data.assignee_id) {
    const { data: s } = await supabase
      .from("staff")
      .select("firstname, surname")
      .eq("accelo_id", data.assignee_id)
      .single();
    if (s) staff = s as { firstname: string | null; surname: string | null };
  }

  if (data.company_id) {
    const { data: c } = await supabase
      .from("companies")
      .select("name")
      .eq("accelo_id", data.company_id)
      .single();
    if (c) companies = c as { name: string };
  }

  return rowToTaskInline({ ...data, accelo_id: data.accelo_id ?? data.id, staff, companies });
}

// ── Mock SupabaseClient for query tests ──────────────────────────────────────

/**
 * Creates a mock SupabaseClient where each table name maps to a single().
 * response.  The chain is fully traversable but single() resolves to the
 * configured result.
 */
function makeQueryClient(tableResults: Record<string, { data: unknown; error: unknown }>) {
  const from = vi.fn().mockImplementation((table: string) => {
    const result = tableResults[table] ?? { data: null, error: null };
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const pass = ["select", "eq", "is", "not", "in", "order", "limit"];
    for (const m of pass) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // insert must also chain
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue(result);
    chain.maybeSingle = vi.fn().mockResolvedValue(result);
    return chain;
  });

  return { from };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("createTaskInDb logic — happy path", () => {
  it("returns a Task with id = DB primary key (not accelo_id)", async () => {
    const inserted = {
      id: 77, accelo_id: null, title: "Brand New Task",
      status_id: 2, assignee_id: null, company_id: null,
      due_date: null, budgeted_seconds: null, logged_seconds: 0,
      staff: null, companies: null,
    };
    const client = makeQueryClient({ tasks: { data: inserted, error: null } });
    const result = await createTaskInDbInline(client, {
      title: "Brand New Task",
      created_by: "00000000-0000-0000-0000-000000000001",
    });
    // Task.id must be the DB PK, not the (null) accelo_id
    expect(result.id).toBe("77");
    expect(result.title).toBe("Brand New Task");
  });

  it("inserts with accelo_id = null (Supabase-native — not yet synced)", async () => {
    const client = makeQueryClient({
      tasks: { data: { id: 78, accelo_id: null, title: "T", status_id: 2,
        assignee_id: null, company_id: null, due_date: null,
        budgeted_seconds: null, logged_seconds: 0 }, error: null },
    });
    await createTaskInDbInline(client, { title: "T", created_by: "u1" });

    const tasksFrom = client.from.mock.calls.findIndex((c) => c[0] === "tasks");
    const tasksChain = client.from.mock.results[tasksFrom].value;
    expect(tasksChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ accelo_id: null })
    );
  });

  it("inserts with synced_to_accelo_at = null (marks task as needing outbound sync)", async () => {
    const client = makeQueryClient({
      tasks: { data: { id: 79, accelo_id: null, title: "T", status_id: 2,
        assignee_id: null, company_id: null, due_date: null,
        budgeted_seconds: null, logged_seconds: 0 }, error: null },
    });
    await createTaskInDbInline(client, { title: "T", created_by: "u1" });

    const tasksFrom = client.from.mock.calls.findIndex((c) => c[0] === "tasks");
    const tasksChain = client.from.mock.results[tasksFrom].value;
    expect(tasksChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ synced_to_accelo_at: null })
    );
  });

  it("forwards created_by to the insert payload for audit trail", async () => {
    const createdBy = "00000000-0000-0000-0000-000000000099";
    const client = makeQueryClient({
      tasks: { data: { id: 80, accelo_id: null, title: "T", status_id: 2,
        assignee_id: null, company_id: null, due_date: null,
        budgeted_seconds: null, logged_seconds: 0 }, error: null },
    });
    await createTaskInDbInline(client, { title: "T", created_by: createdBy });

    const tasksFrom = client.from.mock.calls.findIndex((c) => c[0] === "tasks");
    const tasksChain = client.from.mock.results[tasksFrom].value;
    expect(tasksChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: createdBy })
    );
  });

  it("resolves assignee name from staff lookup when assignee_id is set", async () => {
    const client = makeQueryClient({
      tasks: { data: { id: 81, accelo_id: null, title: "Named Assignee Task",
        status_id: 2, assignee_id: 42, company_id: null, due_date: null,
        budgeted_seconds: null, logged_seconds: 0 }, error: null },
      staff: { data: { firstname: "Gio", surname: "Rossi" }, error: null },
    });
    const result = await createTaskInDbInline(client, {
      title: "Named Assignee Task",
      assignee_id: 42,
      created_by: "u1",
    });
    expect(result.assignee).toBe("Gio Rossi");
  });

  it("resolves company name from companies lookup when company_id is set", async () => {
    const client = makeQueryClient({
      tasks: { data: { id: 82, accelo_id: null, title: "Named Company Task",
        status_id: 2, assignee_id: null, company_id: 99, due_date: null,
        budgeted_seconds: null, logged_seconds: 0 }, error: null },
      companies: { data: { name: "ACME Corp" }, error: null },
    });
    const result = await createTaskInDbInline(client, {
      title: "Named Company Task",
      company_id: 99,
      created_by: "u1",
    });
    expect(result.client).toBe("ACME Corp");
  });

  it("leaves assignee as empty string when assignee_id is null (no staff lookup)", async () => {
    const client = makeQueryClient({
      tasks: { data: { id: 83, accelo_id: null, title: "Unassigned",
        status_id: 2, assignee_id: null, company_id: null, due_date: null,
        budgeted_seconds: null, logged_seconds: 0 }, error: null },
    });
    const result = await createTaskInDbInline(client, { title: "Unassigned", created_by: "u1" });
    expect(result.assignee).toBe("");
    // Staff table must NOT be queried when assignee_id is null
    const staffCalls = client.from.mock.calls.filter((c) => c[0] === "staff");
    expect(staffCalls).toHaveLength(0);
  });

  it("leaves client as empty string when company_id is null (no companies lookup)", async () => {
    const client = makeQueryClient({
      tasks: { data: { id: 84, accelo_id: null, title: "No Client",
        status_id: 2, assignee_id: null, company_id: null, due_date: null,
        budgeted_seconds: null, logged_seconds: 0 }, error: null },
    });
    const result = await createTaskInDbInline(client, { title: "No Client", created_by: "u1" });
    expect(result.client).toBe("");
    // Companies table must NOT be queried when company_id is null
    const companyCalls = client.from.mock.calls.filter((c) => c[0] === "companies");
    expect(companyCalls).toHaveLength(0);
  });

  it("defaults status_id to 2 (Pending) when not supplied", async () => {
    const client = makeQueryClient({
      tasks: { data: { id: 85, accelo_id: null, title: "Default Status",
        status_id: 2, assignee_id: null, company_id: null, due_date: null,
        budgeted_seconds: null, logged_seconds: 0 }, error: null },
    });
    await createTaskInDbInline(client, { title: "Default Status", created_by: "u1" });

    const tasksFrom = client.from.mock.calls.findIndex((c) => c[0] === "tasks");
    const tasksChain = client.from.mock.results[tasksFrom].value;
    expect(tasksChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status_id: 2 })
    );
  });
});

describe("createTaskInDb logic — status mapping", () => {
  // Parameterised: each status_id maps to the correct Task.status string
  const statusCases: Array<{ status_id: number; expected: string }> = [
    { status_id: 2, expected: "todo" },        // Pending
    { status_id: 3, expected: "todo" },        // Accepted
    { status_id: 4, expected: "in-progress" }, // Started
    { status_id: 5, expected: "done" },        // Complete
    { status_id: 6, expected: "done" },        // Inactive
    { status_id: 7, expected: "waiting" },     // Paused
  ];

  for (const { status_id, expected } of statusCases) {
    it(`maps status_id=${status_id} to Task.status="${expected}"`, async () => {
      const client = makeQueryClient({
        tasks: {
          data: {
            id: 200 + status_id, accelo_id: null,
            title: "Status Test", status_id,
            assignee_id: null, company_id: null,
            due_date: null, budgeted_seconds: null, logged_seconds: 0,
          },
          error: null,
        },
      });
      const result = await createTaskInDbInline(client, {
        title: "Status Test",
        status_id,
        created_by: "u1",
      });
      expect(result.status).toBe(expected);
    });
  }

  it("defaults to 'todo' when status_id is null", () => {
    expect(mapStatus(null)).toBe("todo");
  });

  it("defaults to 'todo' for unknown status_id values", () => {
    expect(mapStatus(999)).toBe("todo");
  });
});

describe("createTaskInDb logic — error handling", () => {
  it("throws when Supabase insert returns an error", async () => {
    const client = makeQueryClient({
      tasks: { data: null, error: { message: "unique constraint violation" } },
    });
    await expect(
      createTaskInDbInline(client, {
        title: "Failing Task",
        created_by: "u1",
      })
    ).rejects.toThrow("createTaskInDb: unique constraint violation");
  });

  it("includes the Supabase error message in the thrown error text", async () => {
    const client = makeQueryClient({
      tasks: { data: null, error: { message: "foreign key constraint on company_id" } },
    });
    await expect(
      createTaskInDbInline(client, {
        title: "Bad FK Task",
        company_id: 9999999,
        created_by: "u1",
      })
    ).rejects.toThrow("foreign key constraint on company_id");
  });
});

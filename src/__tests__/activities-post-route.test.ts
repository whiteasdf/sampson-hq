/**
 * Unit tests for POST /api/activities/post (src/app/api/activities/post/route.ts).
 *
 * Strategy: the route file imports @supabase/supabase-js and @/lib/accelo-client
 * at module scope.  We vi.mock() both before importing the handler so no real
 * network calls are made.  Each test builds a minimal NextRequest and asserts
 * on the Response that the handler returns.
 *
 * Covers:
 *   - 401 when Authorization header is missing
 *   - 401 when Authorization header does not start with "Bearer "
 *   - 401 when Supabase returns an auth error (invalid token)
 *   - 400 when user metadata is missing staff_accelo_id
 *   - 400 when user metadata is missing rate_id
 *   - 400 when request body is missing accelo_task_id
 *   - 400 when request body is missing elapsed_seconds
 *   - 400 when duration rounds to zero (less than 3 minutes)
 *   - 200 with correct billable_hours after rounding to 6-minute increment
 *   - 502 when acceloPost throws
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock @supabase/supabase-js ─────────────────────────────────────────────────
// vi.mock() is hoisted before variable declarations, so we use vi.hoisted()
// to declare shared mock functions that are available inside factory closures.

const { mockGetUser, mockFrom, mockAcceloPost } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockAcceloPost: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

// ── Mock @/lib/accelo-client ───────────────────────────────────────────────────

vi.mock("@/lib/accelo-client", () => ({
  acceloPost: mockAcceloPost,
}));

// ── Import handler AFTER mocks are registered ─────────────────────────────────

import { POST } from "@/app/api/activities/post/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request("http://localhost/api/activities/post", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** The minimal user object returned by supabase.auth.getUser for happy-path tests. */
const VALID_USER = {
  id: "user-abc",
  user_metadata: {
    staff_accelo_id: 101,
    rate_id: 5,
  },
};

/** A Supabase upsert chain that resolves without error. */
function mockSupabaseUpsertOk() {
  mockFrom.mockReturnValue({
    upsert: vi.fn().mockResolvedValue({ error: null }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: env vars present (route uses them at module scope via process.env)
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Auth guard ────────────────────────────────────────────────────────────────

describe("POST /api/activities/post — auth guard", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const req = makeRequest({ accelo_task_id: 1, elapsed_seconds: 360, billable: true });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it("returns 401 when Authorization header does not start with 'Bearer '", async () => {
    const req = makeRequest(
      { accelo_task_id: 1, elapsed_seconds: 360, billable: true },
      { Authorization: "Token abc123" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 when Supabase auth returns an error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error("invalid JWT"),
    });

    const req = makeRequest(
      { accelo_task_id: 1, elapsed_seconds: 360, billable: true },
      { Authorization: "Bearer bad-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/invalid session/i);
  });

  it("returns 401 when Supabase returns no user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const req = makeRequest(
      { accelo_task_id: 1, elapsed_seconds: 360, billable: true },
      { Authorization: "Bearer ghost-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });
});

// ── User metadata validation ──────────────────────────────────────────────────

describe("POST /api/activities/post — user metadata validation", () => {
  it("returns 400 when staff_accelo_id is missing from user metadata", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", user_metadata: { rate_id: 5 } } },
      error: null,
    });

    const req = makeRequest(
      { accelo_task_id: 1, elapsed_seconds: 360, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/staff_accelo_id/i);
  });

  it("returns 400 when rate_id is missing from user metadata", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", user_metadata: { staff_accelo_id: 42 } } },
      error: null,
    });

    const req = makeRequest(
      { accelo_task_id: 1, elapsed_seconds: 360, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/rate_id/i);
  });
});

// ── Request body validation ───────────────────────────────────────────────────

describe("POST /api/activities/post — request body validation", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: VALID_USER },
      error: null,
    });
  });

  it("returns 400 when accelo_task_id is missing", async () => {
    const req = makeRequest(
      { elapsed_seconds: 360, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing accelo_task_id|elapsed_seconds/i);
  });

  it("returns 400 when elapsed_seconds is missing", async () => {
    const req = makeRequest(
      { accelo_task_id: 1, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missing accelo_task_id|elapsed_seconds/i);
  });

  it("returns 400 when both fields are missing", async () => {
    const req = makeRequest(
      { billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});

// ── Zero-duration guard ───────────────────────────────────────────────────────

describe("POST /api/activities/post — zero-duration guard", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: VALID_USER },
      error: null,
    });
  });

  it("returns 400 when elapsed_seconds rounds to zero (e.g. 179 seconds)", async () => {
    // 179 / 360 ≈ 0.497 → rounds to 0 increments → 0 hours
    const req = makeRequest(
      { accelo_task_id: 1, elapsed_seconds: 179, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/rounds to zero|minimum/i);
  });

  it("returns 400 when elapsed_seconds is exactly 1 second", async () => {
    const req = makeRequest(
      { accelo_task_id: 1, elapsed_seconds: 1, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});

// ── Happy path — billing rounding ─────────────────────────────────────────────

describe("POST /api/activities/post — successful submission", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: VALID_USER },
      error: null,
    });
    mockSupabaseUpsertOk();
  });

  it("returns 200 with correct billable_hours for a 6-minute entry (360 s)", async () => {
    mockAcceloPost.mockResolvedValue({ id: 1001 });

    const req = makeRequest(
      { accelo_task_id: 5, elapsed_seconds: 360, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.billable_hours).toBe(0.1);
    expect(json.rounded_seconds).toBe(360);
  });

  it("rounds 390 s up to 360 s (nearest 6-min increment)", async () => {
    // 390 / 360 = 1.083 → rounds to 1 increment → 360 s → 0.1 h
    mockAcceloPost.mockResolvedValue({ id: 1002 });

    const req = makeRequest(
      { accelo_task_id: 5, elapsed_seconds: 390, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    const json = await res.json();
    expect(json.billable_hours).toBe(0.1);
    expect(json.rounded_seconds).toBe(360);
  });

  it("rounds 3600 s to exactly 1.0 billable hours", async () => {
    mockAcceloPost.mockResolvedValue({ id: 1003 });

    const req = makeRequest(
      { accelo_task_id: 7, elapsed_seconds: 3600, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    const json = await res.json();
    expect(json.billable_hours).toBe(1.0);
    expect(json.rounded_seconds).toBe(3600);
  });

  it("rounds 5400 s to exactly 1.5 billable hours", async () => {
    mockAcceloPost.mockResolvedValue({ id: 1004 });

    const req = makeRequest(
      { accelo_task_id: 7, elapsed_seconds: 5400, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    const json = await res.json();
    expect(json.billable_hours).toBe(1.5);
    expect(json.rounded_seconds).toBe(5400);
  });

  it("returns the activity_id from Accelo in the response", async () => {
    mockAcceloPost.mockResolvedValue({ id: 9999 });

    const req = makeRequest(
      { accelo_task_id: 5, elapsed_seconds: 3600, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    const json = await res.json();
    expect(json.activity_id).toBe(9999);
  });

  it("uses 'Time entry' as subject when description is omitted", async () => {
    mockAcceloPost.mockResolvedValue({ id: 555 });

    const req = makeRequest(
      { accelo_task_id: 5, elapsed_seconds: 3600, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    await POST(req as never);

    const callArgs = mockAcceloPost.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs.subject).toBe("Time entry");
  });

  it("uses the provided description as the activity subject", async () => {
    mockAcceloPost.mockResolvedValue({ id: 556 });

    const req = makeRequest(
      {
        accelo_task_id: 5,
        elapsed_seconds: 3600,
        billable: true,
        description: "Code review",
      },
      { Authorization: "Bearer valid-token" }
    );
    await POST(req as never);

    const callArgs = mockAcceloPost.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs.subject).toBe("Code review");
  });
});

// ── Accelo failure → 502 ──────────────────────────────────────────────────────

describe("POST /api/activities/post — Accelo write failure", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: VALID_USER },
      error: null,
    });
  });

  it("returns 502 when acceloPost throws an error", async () => {
    mockAcceloPost.mockRejectedValue(new Error("Accelo is down"));

    const req = makeRequest(
      { accelo_task_id: 5, elapsed_seconds: 3600, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/accelo write failed/i);
  });

  it("includes the underlying error message in the 502 response", async () => {
    mockAcceloPost.mockRejectedValue(new Error("Connection refused"));

    const req = makeRequest(
      { accelo_task_id: 5, elapsed_seconds: 3600, billable: true },
      { Authorization: "Bearer valid-token" }
    );
    const res = await POST(req as never);
    const json = await res.json();
    expect(json.error).toContain("Connection refused");
  });
});

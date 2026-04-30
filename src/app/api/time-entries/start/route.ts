import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createTimeEntry, stopAllActive } from "@/lib/queries/time-entries";

export async function POST(request: NextRequest) {
  // 1. Verify Supabase session
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return Response.json({ error: "Invalid session" }, { status: 401 });
  }

  // 2. Extract metadata
  const staffAcceloId = user.app_metadata?.staff_accelo_id;
  const rateId = user.app_metadata?.rate_id ?? null;

  if (!staffAcceloId) {
    return Response.json(
      { error: "User missing staff_accelo_id in metadata" },
      { status: 400 }
    );
  }

  // 3. Parse and validate body
  let body: { task_id?: number; billable?: boolean; started_at?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.task_id || typeof body.task_id !== "number") {
    return Response.json({ error: "Missing or invalid task_id" }, { status: 400 });
  }

  const billable = body.billable !== undefined ? body.billable : true;

  // Validate started_at if provided (for offline reconciliation)
  let startedAt = new Date().toISOString();
  if (body.started_at) {
    const parsed = new Date(body.started_at);
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) {
      startedAt = parsed.toISOString();
    }
  }

  // 4. Stop any currently running entries (safety)
  try {
    await stopAllActive(supabaseAdmin, user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Failed to stop active entries: ${message}` },
      { status: 500 }
    );
  }

  // 5. Create new running entry
  try {
    const entry = await createTimeEntry(supabaseAdmin, {
      user_id: user.id,
      staff_accelo_id: staffAcceloId,
      task_id: body.task_id,
      started_at: startedAt,
      billable,
      rate_id: rateId,
    });

    return Response.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Failed to create entry: ${message}` }, { status: 500 });
  }
}

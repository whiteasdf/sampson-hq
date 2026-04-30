import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createTaskInDb } from "@/lib/queries/tasks";

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
  if (!staffAcceloId) {
    return Response.json(
      { error: "User missing staff_accelo_id in metadata" },
      { status: 400 }
    );
  }

  // 3. Parse and validate body
  let body: {
    title?: string;
    assignee_id?: number;
    company_id?: number;
    status_id?: number;
    due_date?: string;
    budgeted_seconds?: number;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
    return Response.json({ error: "Missing or empty title" }, { status: 400 });
  }

  // 4. Authorization: workers can only create tasks assigned to themselves
  const role = user.app_metadata?.role;
  if (role === "worker" && body.assignee_id && body.assignee_id !== staffAcceloId) {
    return Response.json(
      { error: "Workers can only create tasks assigned to themselves" },
      { status: 403 }
    );
  }

  // 5. Create task in Supabase
  try {
    const task = await createTaskInDb(supabaseAdmin, {
      title: body.title.trim(),
      assignee_id: body.assignee_id ?? staffAcceloId,
      company_id: body.company_id ?? null,
      status_id: body.status_id ?? 2,
      due_date: body.due_date ?? null,
      budgeted_seconds: body.budgeted_seconds ?? null,
      created_by: user.id,
    });

    return Response.json({ task }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Failed to create task: ${message}` }, { status: 500 });
  }
}

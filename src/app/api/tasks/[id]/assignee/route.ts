// Pivot 1C: Task assignee update (Supabase-first)
// PUT /api/tasks/:id/assignee — reassign task directly in Supabase.
// Sets synced_to_accelo_at = NULL so the outbound push cron picks up the change.
// Requires manager role (checked via app_metadata, consistent with RLS helpers).

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  if (user.app_metadata?.role !== "manager") {
    return Response.json({ error: "Manager role required" }, { status: 403 });
  }

  let body: { assignee_id?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { assignee_id } = body;
  if (!assignee_id) {
    return Response.json({ error: "Missing assignee_id" }, { status: 400 });
  }

  try {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      return Response.json({ error: "Invalid task ID" }, { status: 400 });
    }

    // Resolve task: try Supabase PK first, then accelo_id
    let taskId: number | null = null;

    const { data: byId } = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("id", numericId)
      .is("deleted_at", null)
      .single();

    if (byId) {
      taskId = byId.id;
    } else {
      const { data: byAccelo } = await supabaseAdmin
        .from("tasks")
        .select("id")
        .eq("accelo_id", numericId)
        .is("deleted_at", null)
        .single();
      taskId = byAccelo?.id ?? null;
    }

    if (!taskId) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("tasks")
      .update({ assignee_id, synced_to_accelo_at: null })
      .eq("id", taskId)
      .is("deleted_at", null);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({ ok: true, assignee_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

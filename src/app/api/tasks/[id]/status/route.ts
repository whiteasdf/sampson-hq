// Pivot 1C: Task status update (Supabase-first)
// PUT /api/tasks/:id/status — update task status directly in Supabase.
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

  // Use app_metadata (server-only, not user-writable) — matches RLS helpers
  if (user.app_metadata?.role !== "manager") {
    return Response.json({ error: "Manager role required" }, { status: 403 });
  }

  let body: { status_id?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { status_id } = body;
  if (!status_id) {
    return Response.json({ error: "Missing status_id" }, { status: 400 });
  }

  try {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      return Response.json({ error: "Invalid task ID" }, { status: 400 });
    }

    // Resolve task: try Supabase PK first, then accelo_id (avoids ambiguity
    // since new in-app tasks only have a PK, not an accelo_id)
    let task: { id: number; accelo_id: number | null; status_id: number } | null = null;

    const { data: byId } = await supabaseAdmin
      .from("tasks")
      .select("id, accelo_id, status_id")
      .eq("id", numericId)
      .is("deleted_at", null)
      .single();

    if (byId) {
      task = byId;
    } else {
      const { data: byAccelo } = await supabaseAdmin
        .from("tasks")
        .select("id, accelo_id, status_id")
        .eq("accelo_id", numericId)
        .is("deleted_at", null)
        .single();
      task = byAccelo;
    }

    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("tasks")
      .update({ status_id, synced_to_accelo_at: null })
      .eq("id", task.id)
      .is("deleted_at", null);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    // Record transition (only for Accelo-synced tasks — Supabase-native tasks
    // don't have an accelo_id yet, so skip to avoid corrupting the column)
    if (task.accelo_id && task.status_id && task.status_id !== status_id) {
      await supabaseAdmin.from("task_transitions").insert({
        task_accelo_id: task.accelo_id,
        from_status_id: task.status_id,
        to_status_id: status_id,
        transitioned_at: new Date().toISOString(),
        detected_at: new Date().toISOString(),
      });
    }

    return Response.json({ ok: true, status_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

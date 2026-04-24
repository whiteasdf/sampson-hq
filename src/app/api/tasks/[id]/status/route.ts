// Phase 4: Task status write-back
// PUT /api/tasks/:id/status — change task status in Accelo, then mirror to Supabase.
// Requires manager role (checked via app_metadata, consistent with RLS helpers).

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const acceloId = parseInt(id, 10);
  if (isNaN(acceloId)) {
    return Response.json({ error: "Invalid task ID" }, { status: 400 });
  }

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

  const { status_id } = await request.json();
  if (!status_id) {
    return Response.json({ error: "Missing status_id" }, { status: 400 });
  }

  try {
    // Dynamically import to avoid build errors if acceloPut is not yet available
    const { acceloPut } = await import("@/lib/accelo-client");

    // 1. Get current status for transition record
    const { data: current } = await supabaseAdmin
      .from("tasks")
      .select("status_id")
      .eq("accelo_id", acceloId)
      .single();

    // 2. PUT to Accelo first (source of truth)
    await acceloPut(`/tasks/${acceloId}`, { status_id });

    // 3. On success: update Supabase mirror
    await supabaseAdmin
      .from("tasks")
      .update({ status_id, synced_at: new Date().toISOString() })
      .eq("accelo_id", acceloId);

    // 4. Record transition (uses transitioned_at to match existing schema)
    if (current?.status_id && current.status_id !== status_id) {
      await supabaseAdmin.from("task_transitions").insert({
        task_accelo_id: acceloId,
        from_status_id: current.status_id,
        to_status_id: status_id,
        transitioned_at: new Date().toISOString(),
        detected_at: new Date().toISOString(),
      });
    }

    return Response.json({ ok: true, status_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}

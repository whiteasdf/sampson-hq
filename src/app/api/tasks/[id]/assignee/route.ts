// Phase 4: Task assignee write-back
// PUT /api/tasks/:id/assignee — reassign task in Accelo, then mirror to Supabase.
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

  if (user.app_metadata?.role !== "manager") {
    return Response.json({ error: "Manager role required" }, { status: 403 });
  }

  const { assignee_id } = await request.json();
  if (!assignee_id) {
    return Response.json({ error: "Missing assignee_id" }, { status: 400 });
  }

  try {
    // Dynamically import to avoid build errors if acceloPut is not yet available
    const { acceloPut } = await import("@/lib/accelo-client");

    // PUT to Accelo first (source of truth)
    await acceloPut(`/tasks/${acceloId}`, { assignee_id });

    // On success: update Supabase mirror
    await supabaseAdmin
      .from("tasks")
      .update({ assignee_id, synced_at: new Date().toISOString() })
      .eq("accelo_id", acceloId);

    return Response.json({ ok: true, assignee_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}

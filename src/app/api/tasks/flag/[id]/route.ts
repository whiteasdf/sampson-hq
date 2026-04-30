// Phase 4: Resolve a task escalation flag
// DELETE /api/tasks/flag/:id — soft-resolves the flag (sets resolved_at/resolved_by).
// Requires manager role (checked via app_metadata, consistent with RLS helpers).

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const flagId = parseInt(id, 10);
  if (isNaN(flagId)) {
    return Response.json({ error: "Invalid flag ID" }, { status: 400 });
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

  const staffAcceloId = user.app_metadata?.staff_accelo_id;

  const { error } = await supabaseAdmin
    .from("task_flags")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: staffAcceloId,
    })
    .eq("id", flagId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

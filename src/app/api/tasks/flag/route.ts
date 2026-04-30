// Phase 4: Task escalation flags
// POST /api/tasks/flag — create a new escalation flag on a task.
// Requires manager role (checked via app_metadata, consistent with RLS helpers).

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
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

  const { task_accelo_id, flag_type, note } = await request.json();
  if (!task_accelo_id || !flag_type) {
    return Response.json(
      { error: "Missing task_accelo_id or flag_type" },
      { status: 400 }
    );
  }

  const staffAcceloId = user.app_metadata?.staff_accelo_id;

  const { data, error } = await supabaseAdmin
    .from("task_flags")
    .insert({
      task_accelo_id,
      flag_type,
      created_by: staffAcceloId,
      note: note || null,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, flag: data });
}

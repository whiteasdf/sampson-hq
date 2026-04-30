import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { updateTimeEntry, deleteTimeEntry } from "@/lib/queries/time-entries";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // 2. Parse route param
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id || isNaN(id)) {
    return Response.json({ error: "Invalid entry id" }, { status: 400 });
  }

  // 3. Parse body
  let body: { billable?: boolean; description?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.billable === undefined && body.description === undefined) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  // 4. Check if entry has already been synced to Accelo
  const { data: existing } = await supabaseAdmin
    .from("time_entries")
    .select("synced_to_accelo_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (existing?.synced_to_accelo_at) {
    return Response.json(
      { error: "Cannot modify an entry that has already been synced to Accelo" },
      { status: 409 }
    );
  }

  // 5. Update
  try {
    const entry = await updateTimeEntry(supabaseAdmin, {
      id,
      user_id: user.id,
      billable: body.billable,
      description: body.description,
    });

    return Response.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Failed to update entry: ${message}` }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // 2. Parse route param
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!id || isNaN(id)) {
    return Response.json({ error: "Invalid entry id" }, { status: 400 });
  }

  // 3. Delete (query layer enforces user_id match and synced_to_accelo_at IS NULL)
  try {
    const entry = await deleteTimeEntry(supabaseAdmin, {
      id,
      user_id: user.id,
    });

    return Response.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("synced to Accelo")) {
      return Response.json(
        { error: "Cannot delete an entry that has already been synced to Accelo" },
        { status: 409 }
      );
    }
    if (message.includes("no entry found")) {
      return Response.json({ error: "Entry not found" }, { status: 404 });
    }
    return Response.json({ error: `Failed to delete entry: ${message}` }, { status: 500 });
  }
}

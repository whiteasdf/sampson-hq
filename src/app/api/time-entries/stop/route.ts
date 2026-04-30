import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { stopTimeEntry, getActiveEntry } from "@/lib/queries/time-entries";

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

  // 2. Parse body
  let body: { id?: number; description?: string };
  try {
    body = await request.json();
  } catch {
    // Body is optional — default to stopping the active entry
    body = {};
  }

  // 3. Validate and resolve the entry to stop
  if (body.id !== undefined && (typeof body.id !== "number" || !Number.isInteger(body.id) || body.id <= 0)) {
    return Response.json({ error: "Invalid entry id" }, { status: 400 });
  }
  let entryId = body.id;

  if (!entryId) {
    // No explicit id — find the active entry
    try {
      const active = await getActiveEntry(supabaseAdmin, user.id);
      if (!active) {
        return Response.json({ error: "No active timer running" }, { status: 404 });
      }
      entryId = active.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return Response.json(
        { error: `Failed to find active entry: ${message}` },
        { status: 500 }
      );
    }
  }

  // 4. Stop the entry
  try {
    const entry = await stopTimeEntry(supabaseAdmin, {
      id: entryId,
      user_id: user.id,
      stopped_at: new Date().toISOString(),
      description: body.description,
    });

    return Response.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Distinguish "not found" from other errors
    if (message.includes("no active entry found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: `Failed to stop entry: ${message}` }, { status: 500 });
  }
}

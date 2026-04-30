import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getActiveEntry } from "@/lib/queries/time-entries";

export async function GET(request: NextRequest) {
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

  // 2. Fetch active entry
  try {
    const entry = await getActiveEntry(supabaseAdmin, user.id);
    return Response.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Failed to fetch active entry: ${message}` },
      { status: 500 }
    );
  }
}

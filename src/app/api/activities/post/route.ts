import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { acceloPost } from "@/lib/accelo-client";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type PostActivityRequest = {
  accelo_task_id: number;
  elapsed_seconds: number;
  description?: string;
  billable: boolean;
};

function roundToBillingIncrement(seconds: number): number {
  return Math.round(seconds / 360) * 360;
}

export async function POST(request: NextRequest) {
  // 1. Verify Supabase session
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return Response.json({ error: "Invalid session" }, { status: 401 });
  }

  // 2. Extract staff_accelo_id and rate_id from user metadata
  const staffAcceloId = user.user_metadata?.staff_accelo_id;
  const rateId = user.user_metadata?.rate_id;

  if (!staffAcceloId) {
    return Response.json({ error: "User missing staff_accelo_id in metadata" }, { status: 400 });
  }

  if (!rateId) {
    return Response.json({ error: "User missing rate_id in metadata — cannot post without billing rate" }, { status: 400 });
  }

  // 3. Parse and validate request body
  const body: PostActivityRequest = await request.json();

  if (!body.accelo_task_id || !body.elapsed_seconds) {
    return Response.json({ error: "Missing accelo_task_id or elapsed_seconds" }, { status: 400 });
  }

  // 4. Round to 6-minute billing increment
  const roundedSeconds = roundToBillingIncrement(body.elapsed_seconds);
  const billableHours = roundedSeconds / 3600;

  if (billableHours === 0) {
    return Response.json({ error: "Duration rounds to zero — minimum is 6 minutes (0.1h)" }, { status: 400 });
  }

  // 5. POST to Accelo
  try {
    const acceloActivity = await acceloPost("/activities", {
      against_type: "task",
      against_id: body.accelo_task_id,
      staff_id: staffAcceloId,
      rate_id: rateId,
      billable: body.billable ? billableHours : 0,
      nonbillable: body.billable ? 0 : billableHours,
      subject: body.description || "Time entry",
      medium: "note",
      standing: "complete",
      date_logged: Math.floor(Date.now() / 1000),
    });

    // 6. Mirror to Supabase for read-your-writes
    const activity = acceloActivity as Record<string, unknown>;
    if (activity?.id) {
      await supabaseAdmin.from("activities").upsert({
        accelo_id: Number(activity.id),
        subject: body.description || "Time entry",
        billable: body.billable ? roundedSeconds : 0,
        nonbillable: body.billable ? 0 : roundedSeconds,
        staff_id: staffAcceloId,
        task_id: body.accelo_task_id,
        medium: "note",
        date_logged: new Date().toISOString(),
        rate_charged: 0,
        standing: "complete",
        synced_at: new Date().toISOString(),
      }, { onConflict: "accelo_id" });
    }

    return Response.json({
      ok: true,
      activity_id: activity?.id,
      billable_hours: billableHours,
      rounded_seconds: roundedSeconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Accelo write failed: ${message}` }, { status: 502 });
  }
}

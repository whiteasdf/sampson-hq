// GAR-637: sync-activities — every 2 minutes, date-range windowed
//
// CRITICAL task_id extraction:
//   Accelo re-parents activities logged against tasks to their parent Job.
//   `against_type=task` is NOT stored. The task link is in the nested `task` field:
//   const taskId = activity.task?.id ?? null;  ← CORRECT
//   activity.against_id → this is a job_id, not a task_id
//
// Uses date-range windowing (NOT offset pagination) because at 327K records
// Accelo's offset pagination breaks around page 3,000.

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { acceloFetchAll } from "@/lib/accelo-client";

type AcceloActivity = {
  id: number;
  subject: string;
  billable: number;    // seconds
  nonbillable: number; // seconds
  date_created: number; // unix timestamp
  date_logged: number;  // unix timestamp
  rate_charged: number; // rate ID
  standing: string;
  staff: { id: number } | null;
  task:  { id: number } | null; // CRITICAL: use this for task_id, not against_id
};

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const nowTs = Math.floor(now.getTime() / 1000);
  const nowIso = now.toISOString();

  // ── 1. Read watermark ────────────────────────────────────────────────────────
  const { data: wm } = await supabaseAdmin
    .from("sync_watermarks")
    .select("last_synced_at")
    .eq("entity", "activities")
    .single();

  const lastSynced = wm?.last_synced_at;
  const isFirstRun = !lastSynced || lastSynced === "1970-01-01T00:00:00+00:00";

  // For first run, look back 30 days; for incremental, use watermark
  const windowStart = isFirstRun
    ? Math.floor(Date.now() / 1000) - 30 * 24 * 3600
    : Math.floor(new Date(lastSynced).getTime() / 1000);

  // ── 2. Fetch from Accelo (date-range window) ──────────────────────────────────
  const activities = await acceloFetchAll<AcceloActivity>("/activities", {
    _fields:  "id,subject,billable,nonbillable,date_created,date_logged,rate_charged,standing,staff(id),task(id)",
    _filters: `date_logged_after(${windowStart}),date_logged_before(${nowTs})`,
  });

  // ── 3. Upsert ────────────────────────────────────────────────────────────────
  const rows = activities.map((a) => ({
    accelo_id:        a.id,
    staff_id:         a.staff?.id   ?? null,
    task_id:          a.task?.id    ?? null, // ← CORRECT field (not against_id)
    date_created:     a.date_created ? new Date(a.date_created * 1000).toISOString() : null,
    date_logged:      a.date_logged  ? new Date(a.date_logged  * 1000).toISOString() : null,
    duration_seconds: (a.billable ?? 0) + (a.nonbillable ?? 0),
    rate_id:          a.rate_charged ?? null,
    subject:          a.subject ?? null,
    synced_at:        nowIso,
  }));

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("activities")
      .upsert(rows, { onConflict: "accelo_id" });
    if (error) throw new Error(`activities upsert: ${error.message}`);
  }

  // ── 4. Update watermark ──────────────────────────────────────────────────────
  const { error: wmErr } = await supabaseAdmin
    .from("sync_watermarks")
    .update({ last_synced_at: nowIso })
    .eq("entity", "activities");
  if (wmErr) throw new Error(`watermark update: ${wmErr.message}`);

  return Response.json({ ok: true, activities: rows.length, windowStart: new Date(windowStart * 1000).toISOString() });
}

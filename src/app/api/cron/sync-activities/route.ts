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
  against_id: number;  // job_id (activities are re-parented to jobs)
  staff:   { id: number } | null;
  task:    { id: number } | null; // CRITICAL: use this for task_id, not against_id
  company: { id: number } | null;
};

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const nowTs = Math.floor(now.getTime() / 1000);
    const nowIso = now.toISOString();

    // ── 1. Read watermark ──────────────────────────────────────────────────────
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

    // ── 2. Fetch from Accelo (date-range window) ────────────────────────────────
    const activities = await acceloFetchAll<AcceloActivity>("/activities", {
      _fields:  "id,subject,billable,nonbillable,date_created,date_logged,rate_charged,standing,against_id,staff(id),task(id),company(id)",
      _filters: `date_logged_after(${windowStart}),date_logged_before(${nowTs})`,
    });

    // ── 2b. Resolve company_id via parent jobs ────────────────────────────────
    // Activities are re-parented to jobs in Accelo, so company is usually null.
    // Use against_id (job_id) to resolve the parent company.
    const jobIds = [...new Set(
      activities
        .filter((a) => !a.company?.id && a.against_id)
        .map((a) => a.against_id)
    )];

    const jobToCompanyMap = new Map<number, number>();
    if (jobIds.length > 0) {
      const BATCH = 50;
      for (let i = 0; i < jobIds.length; i += BATCH) {
        const batch = jobIds.slice(i, i + BATCH);
        const jobs = await acceloFetchAll<{ id: number; company: { id: number } | null }>(
          "/jobs",
          { _fields: "id,company(id)", _filters: `id_in(${batch.join(",")})` }
        );
        for (const j of jobs) {
          if (j.company?.id) jobToCompanyMap.set(j.id, j.company.id);
        }
      }
    }

    // ── 3. Upsert ──────────────────────────────────────────────────────────────
    const rows = activities.map((a) => {
      // Accelo returns some numeric fields as strings like "0.00"
      const billable    = Math.round(Number(a.billable)    || 0);
      const nonbillable = Math.round(Number(a.nonbillable) || 0);
      const rateId      = a.rate_charged ? Math.round(Number(a.rate_charged)) || null : null;
      const companyId   = a.company?.id ?? jobToCompanyMap.get(a.against_id) ?? null;

      return {
        accelo_id:        a.id,
        staff_id:         a.staff?.id    ?? null,
        task_id:          a.task?.id     ?? null,
        company_id:       companyId,
        date_created:     a.date_created ? new Date(Number(a.date_created) * 1000).toISOString() : null,
        date_logged:      a.date_logged  ? new Date(Number(a.date_logged)  * 1000).toISOString() : null,
        duration_seconds: billable + nonbillable,
        rate_id:          rateId,
        subject:          a.subject ?? null,
        synced_at:        nowIso,
      };
    });

    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from("activities")
        .upsert(rows, { onConflict: "accelo_id" });
      if (error) throw new Error(`activities upsert: ${error.message}`);
    }

    // ── 3b. Backfill company_id from linked tasks ─────────────────────────────
    // Activities logged against tasks return company=null from Accelo.
    // Resolve company_id by joining through the task's company.
    let backfilled = 0;
    const taskIds = [
      ...new Set(
        rows
          .filter((r) => r.task_id != null && r.company_id == null)
          .map((r) => r.task_id as number),
      ),
    ];

    if (taskIds.length > 0) {
      const { data: taskRows } = await supabaseAdmin
        .from("tasks")
        .select("accelo_id, company_id")
        .in("accelo_id", taskIds)
        .not("company_id", "is", null);

      if (taskRows && taskRows.length > 0) {
        const taskCompanyMap = new Map(
          taskRows.map((t) => [t.accelo_id, t.company_id]),
        );

        const updates = rows
          .filter(
            (r) =>
              r.task_id != null &&
              r.company_id == null &&
              taskCompanyMap.has(r.task_id as number),
          )
          .map((r) => ({
            accelo_id: r.accelo_id,
            company_id: taskCompanyMap.get(r.task_id as number),
          }));

        for (const u of updates) {
          const { error: updateErr } = await supabaseAdmin
            .from("activities")
            .update({ company_id: u.company_id })
            .eq("accelo_id", u.accelo_id);
          if (updateErr)
            throw new Error(
              `backfill company_id for activity ${u.accelo_id}: ${updateErr.message}`,
            );
        }
        backfilled = updates.length;
      }
    }

    // ── 4. Update watermark ────────────────────────────────────────────────────
    const { error: wmErr } = await supabaseAdmin
      .from("sync_watermarks")
      .update({ last_synced_at: nowIso })
      .eq("entity", "activities");
    if (wmErr) throw new Error(`watermark update: ${wmErr.message}`);

    return Response.json({ ok: true, activities: rows.length, backfilled, windowStart: new Date(windowStart * 1000).toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync-activities error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

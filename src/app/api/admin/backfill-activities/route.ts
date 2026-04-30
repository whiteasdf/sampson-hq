// GAR-638: one-time activity backfill (327K records, monthly windows)
//
// Admin-only route — NOT a cron job. Call once to populate the full activity
// history from Accelo into Supabase.
//
// Strategy: walk month-by-month from START_YEAR to now. For each month,
// paginate all activities within that date window. This avoids the Accelo
// offset limit (~page 3,000 breaks with 327K total records).
//
// Usage:
//   curl -X GET https://<host>/api/admin/backfill-activities \
//     -H "Authorization: Bearer $ADMIN_SECRET"
//
// Set ADMIN_SECRET in Vercel env vars (separate from CRON_SECRET).
// Estimated time: ~3,274 API calls over ~14 monthly windows at 60 req/min ≈ 55 min.

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { acceloFetchAll } from "@/lib/accelo-client";

const START_YEAR  = 2020;
const START_MONTH = 1;     // January

type AcceloActivity = {
  id: number;
  subject: string;
  billable: number;
  nonbillable: number;
  date_created: number;
  date_logged: number;
  rate_charged: number;
  standing: string;
  staff: { id: number } | null;
  task:  { id: number } | null;
};

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now   = new Date();
  const totals = { months: 0, activities: 0, errors: 0 };
  const log: string[] = [];

  let year  = START_YEAR;
  let month = START_MONTH;

  // Walk month by month until we pass the current month
  while (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth() + 1)) {
    const windowStart = new Date(year, month - 1, 1);
    const windowEnd   = new Date(year, month, 1); // first day of next month

    const startTs = Math.floor(windowStart.getTime() / 1000);
    const endTs   = Math.floor(windowEnd.getTime()   / 1000);

    try {
      const activities = await acceloFetchAll<AcceloActivity>("/activities", {
        _fields:  "id,subject,billable,nonbillable,date_created,date_logged,rate_charged,standing,staff(id),task(id)",
        _filters: `date_logged_after(${startTs}),date_logged_before(${endTs})`,
      });

      const rows = activities.map((a) => ({
        accelo_id:        a.id,
        staff_id:         a.staff?.id ?? null,
        task_id:          a.task?.id  ?? null,
        date_created:     a.date_created ? new Date(a.date_created * 1000).toISOString() : null,
        date_logged:      a.date_logged  ? new Date(a.date_logged  * 1000).toISOString() : null,
        duration_seconds: (a.billable ?? 0) + (a.nonbillable ?? 0),
        rate_id:          a.rate_charged ?? null,
        subject:          a.subject ?? null,
        synced_at:        new Date().toISOString(),
      }));

      if (rows.length > 0) {
        // Upsert in chunks of 500 to avoid request size limits
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await supabaseAdmin
            .from("activities")
            .upsert(chunk, { onConflict: "accelo_id" });
          if (error) {
            totals.errors++;
            log.push(`${year}-${String(month).padStart(2, "0")}: upsert error — ${error.message}`);
          }
        }
      }

      totals.activities += rows.length;
      totals.months++;
      log.push(`${year}-${String(month).padStart(2, "0")}: ${rows.length} activities`);
    } catch (err) {
      totals.errors++;
      log.push(`${year}-${String(month).padStart(2, "0")}: fetch error — ${String(err)}`);
    }

    // Advance to next month
    month++;
    if (month > 12) { month = 1; year++; }
  }

  return Response.json({ ok: true, ...totals, log });
}

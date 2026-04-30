// Phase 4: Compute analytics snapshots
// GET /api/cron/compute-analytics — aggregates weekly utilization, revenue, and
// margin per staff member from time_entries and cost rates.
// Triggered by Vercel Cron (hourly) — requires CRON_SECRET.
//
// Data source: `time_entries` table (Supabase-first architecture).
// Uses `rounded_seconds` (billable duration after 6-min rounding) and the
// `billable` boolean flag to split billable vs non-billable hours.
// Only completed entries (stopped_at IS NOT NULL) are counted.

import { supabaseAdmin } from "@/lib/supabase-server";

export async function GET(request: Request) {
  if (
    request.headers.get("Authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Current week boundaries (Monday-Sunday)
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Fetch completed time entries for current week
  const { data: weekEntries, error: entriesErr } = await supabaseAdmin
    .from("time_entries")
    .select("staff_accelo_id, rounded_seconds, duration_seconds, rate_id, billable")
    .not("stopped_at", "is", null)
    .gte("started_at", weekStart.toISOString())
    .lte("started_at", weekEnd.toISOString());

  if (entriesErr) {
    return Response.json({ error: `Failed to fetch time entries: ${entriesErr.message}` }, { status: 500 });
  }

  // Fetch staff cost rates
  const { data: costRates } = await supabaseAdmin
    .from("staff_cost_rates")
    .select("staff_accelo_id, hourly_cost");

  const costMap = new Map(
    (costRates ?? []).map((r) => [r.staff_accelo_id, r.hourly_cost ?? 0])
  );

  // Fetch billing rates for revenue calculation
  const { data: rates } = await supabaseAdmin
    .from("rates")
    .select("id, charged");

  const rateMap = new Map(
    (rates ?? []).map((r) => [r.id, r.charged ?? 0])
  );

  // Fetch completed task transitions this week
  // Status 5 = Complete (matches STATUS_ID_MAP in queries/tasks.ts)
  const { data: completedTransitions } = await supabaseAdmin
    .from("task_transitions")
    .select("task_accelo_id")
    .eq("to_status_id", 5)
    .gte("transitioned_at", weekStart.toISOString())
    .lte("transitioned_at", weekEnd.toISOString());

  // Aggregate by staff for weekly snapshot
  const staffWeekly = new Map<
    number,
    { billableSeconds: number; nonbillableSeconds: number; revenue: number }
  >();

  for (const entry of weekEntries ?? []) {
    if (!entry.staff_accelo_id) continue;
    const existing = staffWeekly.get(entry.staff_accelo_id) ?? {
      billableSeconds: 0,
      nonbillableSeconds: 0,
      revenue: 0,
    };
    const isBillable = entry.billable !== false;

    if (isBillable) {
      const billSecs = entry.rounded_seconds ?? 0;
      existing.billableSeconds += billSecs;
      const billingRate = entry.rate_id ? (rateMap.get(entry.rate_id) ?? 0) : 0;
      existing.revenue += (billSecs / 3600) * billingRate;
    } else {
      // Non-billable: use raw duration (not billing-rounded) for accurate cost tracking
      existing.nonbillableSeconds += entry.duration_seconds ?? entry.rounded_seconds ?? 0;
    }

    staffWeekly.set(entry.staff_accelo_id, existing);
  }

  // Count completed tasks per staff via task assignees
  const completedTaskIds = [
    ...new Set(
      (completedTransitions ?? []).map((t) => t.task_accelo_id).filter(Boolean)
    ),
  ];

  const taskCompletedByStaff = new Map<number, number>();
  if (completedTaskIds.length > 0) {
    const { data: completedTasks } = await supabaseAdmin
      .from("tasks")
      .select("accelo_id, assignee_id")
      .in("accelo_id", completedTaskIds);

    for (const t of completedTasks ?? []) {
      if (!t.assignee_id) continue;
      taskCompletedByStaff.set(
        t.assignee_id,
        (taskCompletedByStaff.get(t.assignee_id) ?? 0) + 1
      );
    }
  }

  // Build weekly snapshot rows
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const weeklyRows = Array.from(staffWeekly.entries()).map(
    ([staffId, data]) => {
      const billableHrs = data.billableSeconds / 3600;
      const nonbillableHrs = data.nonbillableSeconds / 3600;
      const totalHrs = billableHrs + nonbillableHrs;
      const costRate = costMap.get(staffId) ?? 0;
      const cost = totalHrs * costRate;
      // Standard 40h work week — only billable hours count towards utilization
      const standardHrs = 40;

      return {
        period_start: weekStartStr,
        period_end: weekEndStr,
        period_type: "week",
        staff_id: staffId,
        billable_hrs: Math.round(billableHrs * 100) / 100,
        nonbillable_hrs: Math.round(nonbillableHrs * 100) / 100,
        utilization:
          standardHrs > 0
            ? Math.round((billableHrs / standardHrs) * 10000) / 100
            : 0,
        revenue: Math.round(data.revenue * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        margin: Math.round((data.revenue - cost) * 100) / 100,
        tasks_completed: taskCompletedByStaff.get(staffId) ?? 0,
        computed_at: now.toISOString(),
      };
    }
  );

  if (weeklyRows.length > 0) {
    await supabaseAdmin.from("analytics_snapshots").upsert(weeklyRows, {
      onConflict: "period_start,period_end,period_type,staff_id",
    });
  }

  return Response.json({
    ok: true,
    staff_computed: weeklyRows.length,
    week: `${weekStartStr} to ${weekEndStr}`,
  });
}

// Phase 4: Compute analytics snapshots
// GET /api/cron/compute-analytics — aggregates weekly utilization, revenue, and
// margin per staff member from activities and cost rates.
// Triggered by Vercel Cron (hourly) — requires CRON_SECRET.
//
// NOTE: The activities table stores total `duration_seconds` (not separate
// billable/nonbillable columns). All logged time is treated as billable for
// revenue calculation. Once Accelo sync is extended to split billable vs
// nonbillable seconds, this aggregation can be refined.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  // Fetch all activities for current week
  const { data: weekActivities } = await supabase
    .from("activities")
    .select("staff_id, duration_seconds, rate_id")
    .gte("date_logged", weekStart.toISOString())
    .lte("date_logged", weekEnd.toISOString());

  // Fetch staff cost rates
  const { data: costRates } = await supabase
    .from("staff_cost_rates")
    .select("staff_accelo_id, hourly_cost");

  const costMap = new Map(
    (costRates ?? []).map((r) => [r.staff_accelo_id, r.hourly_cost ?? 0])
  );

  // Fetch billing rates for revenue calculation
  const { data: rates } = await supabase
    .from("rates")
    .select("id, charged");

  const rateMap = new Map(
    (rates ?? []).map((r) => [r.id, r.charged ?? 0])
  );

  // Fetch completed task transitions this week
  // Status 5 = Complete (matches STATUS_ID_MAP in queries/tasks.ts)
  const { data: completedTransitions } = await supabase
    .from("task_transitions")
    .select("task_accelo_id")
    .eq("to_status_id", 5)
    .gte("transitioned_at", weekStart.toISOString())
    .lte("transitioned_at", weekEnd.toISOString());

  // Aggregate by staff for weekly snapshot
  const staffWeekly = new Map<
    number,
    { totalSeconds: number; revenue: number }
  >();

  for (const a of weekActivities ?? []) {
    if (!a.staff_id) continue;
    const existing = staffWeekly.get(a.staff_id) ?? {
      totalSeconds: 0,
      revenue: 0,
    };
    const seconds = a.duration_seconds ?? 0;
    const hours = seconds / 3600;
    const billingRate = a.rate_id ? (rateMap.get(a.rate_id) ?? 0) : 0;

    existing.totalSeconds += seconds;
    existing.revenue += hours * billingRate;
    staffWeekly.set(a.staff_id, existing);
  }

  // Count completed tasks per staff via task assignees
  const completedTaskIds = [
    ...new Set(
      (completedTransitions ?? []).map((t) => t.task_accelo_id).filter(Boolean)
    ),
  ];

  const taskCompletedByStaff = new Map<number, number>();
  if (completedTaskIds.length > 0) {
    const { data: completedTasks } = await supabase
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
      const totalHrs = data.totalSeconds / 3600;
      const costRate = costMap.get(staffId) ?? 0;
      const cost = totalHrs * costRate;
      // Standard 40h work week for utilization calculation
      const standardHrs = 40;

      return {
        period_start: weekStartStr,
        period_end: weekEndStr,
        period_type: "week",
        staff_id: staffId,
        billable_hrs: Math.round(totalHrs * 100) / 100,
        nonbillable_hrs: 0, // Will be refined when activities split billable/nonbillable
        utilization:
          standardHrs > 0
            ? Math.round((totalHrs / standardHrs) * 10000) / 100
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
    await supabase.from("analytics_snapshots").upsert(weeklyRows, {
      onConflict: "period_start,period_end,period_type,staff_id",
    });
  }

  return Response.json({
    ok: true,
    staff_computed: weeklyRows.length,
    week: `${weekStartStr} to ${weekEndStr}`,
  });
}

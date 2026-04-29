import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getManager(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  if (!user || user.app_metadata?.role !== "manager") return null;
  return user;
}

export async function GET(request: NextRequest) {
  const user = await getManager(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const companyAcceloId = request.nextUrl.searchParams.get("company_accelo_id");
  if (!companyAcceloId) {
    return Response.json({ error: "Missing company_accelo_id query parameter" }, { status: 400 });
  }

  const companyId = Number(companyAcceloId);
  if (isNaN(companyId)) {
    return Response.json({ error: "company_accelo_id must be a number" }, { status: 400 });
  }

  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const cutoffDate = twelveMonthsAgo.toISOString().slice(0, 10);

  // Parallel fetch: direct activities, task IDs, staff cost rates, retainers, staff, company
  const [
    directActivitiesResult,
    taskIdsResult,
    costRatesResult,
    retainersResult,
    staffResult,
    companyResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("activities")
      .select("accelo_id, staff_id, duration_seconds, date_logged")
      .eq("company_id", companyId)
      .gte("date_logged", cutoffDate),
    supabaseAdmin
      .from("tasks")
      .select("accelo_id")
      .eq("company_id", companyId),
    supabaseAdmin
      .from("staff_cost_rates")
      .select("staff_accelo_id, hourly_cost"),
    supabaseAdmin
      .from("retainers")
      .select("monthly_value, start_date, end_date")
      .eq("company_accelo_id", companyId),
    supabaseAdmin
      .from("staff")
      .select("accelo_id, firstname, surname"),
    supabaseAdmin
      .from("companies")
      .select("name, standing")
      .eq("accelo_id", companyId)
      .single(),
  ]);

  if (directActivitiesResult.error) return Response.json({ error: directActivitiesResult.error.message }, { status: 500 });
  if (taskIdsResult.error) return Response.json({ error: taskIdsResult.error.message }, { status: 500 });
  if (costRatesResult.error) return Response.json({ error: costRatesResult.error.message }, { status: 500 });
  if (retainersResult.error) return Response.json({ error: retainersResult.error.message }, { status: 500 });
  if (staffResult.error) return Response.json({ error: staffResult.error.message }, { status: 500 });
  if (companyResult.error) return Response.json({ error: companyResult.error.message }, { status: 500 });

  // Fetch task-linked activities (where activity.company_id is null but linked via task)
  const taskAcceloIds = taskIdsResult.data.map((t) => t.accelo_id);
  let taskLinkedActivities: typeof directActivitiesResult.data = [];

  if (taskAcceloIds.length > 0) {
    const taskLinkedResult = await supabaseAdmin
      .from("activities")
      .select("accelo_id, staff_id, duration_seconds, date_logged")
      .in("task_id", taskAcceloIds)
      .is("company_id", null)
      .gte("date_logged", cutoffDate);

    if (taskLinkedResult.error) return Response.json({ error: taskLinkedResult.error.message }, { status: 500 });
    taskLinkedActivities = taskLinkedResult.data;
  }

  // Combine and deduplicate activities by accelo_id
  const activityMap = new Map<number, (typeof directActivitiesResult.data)[number]>();
  for (const a of directActivitiesResult.data) {
    activityMap.set(a.accelo_id, a);
  }
  for (const a of taskLinkedActivities) {
    if (!activityMap.has(a.accelo_id)) {
      activityMap.set(a.accelo_id, a);
    }
  }
  const allActivities = Array.from(activityMap.values());

  // Build lookup maps
  const costMap = new Map(
    costRatesResult.data.map((c) => [c.staff_accelo_id, c.hourly_cost as number])
  );
  const staffMap = new Map(
    staffResult.data.map((s) => [s.accelo_id, s])
  );

  // Generate list of months (YYYY-MM) for the last 12 months
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
  }

  // Group activities by month
  const activitiesByMonth = new Map<string, typeof allActivities>();
  for (const m of months) {
    activitiesByMonth.set(m, []);
  }
  for (const a of allActivities) {
    if (!a.date_logged) continue;
    const d = new Date(a.date_logged);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = activitiesByMonth.get(month);
    if (bucket) bucket.push(a);
  }

  // Build monthly breakdown
  const monthlyBreakdown = months.map((month) => {
    const [yearStr, monthStr] = month.split("-");
    const year = Number(yearStr);
    const mon = Number(monthStr);
    const lastDayOfMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();

    const firstDayStr = `${yearStr}-${monthStr}-01`;
    const lastDayStr = `${yearStr}-${monthStr}-${String(lastDayOfMonth).padStart(2, "0")}`;

    // Revenue: sum of active retainers for this month
    let revenue = 0;
    for (const r of retainersResult.data) {
      const retainerStart = r.start_date ?? "";
      const retainerEnd = r.end_date;
      const isActive =
        retainerStart <= lastDayStr &&
        (retainerEnd == null || retainerEnd >= firstDayStr);
      if (isActive) {
        revenue += r.monthly_value ?? 0;
      }
    }

    // Cost: sum of (duration_seconds / 3600 * hourly_cost) for activities in this month
    const monthActivities = activitiesByMonth.get(month) ?? [];
    let cost = 0;
    let hours = 0;
    for (const a of monthActivities) {
      const h = (a.duration_seconds ?? 0) / 3600;
      hours += h;
      const rate = costMap.get(a.staff_id) ?? 0;
      cost += h * rate;
    }

    const margin = revenue - cost;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

    return {
      month,
      revenue: Math.round(revenue * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      margin: Math.round(margin * 100) / 100,
      margin_pct: Math.round(marginPct * 100) / 100,
      hours: Math.round(hours * 100) / 100,
    };
  });

  // Build staff breakdown (aggregate across all 12 months)
  const staffAgg = new Map<number, { hours: number; cost: number }>();
  for (const a of allActivities) {
    const staffId = a.staff_id;
    if (staffId == null) continue;
    const h = (a.duration_seconds ?? 0) / 3600;
    const rate = costMap.get(staffId) ?? 0;
    const existing = staffAgg.get(staffId);
    if (existing) {
      existing.hours += h;
      existing.cost += h * rate;
    } else {
      staffAgg.set(staffId, { hours: h, cost: h * rate });
    }
  }

  const staffBreakdown = Array.from(staffAgg.entries())
    .map(([staffId, agg]) => {
      const s = staffMap.get(staffId);
      const name = s
        ? [s.firstname, s.surname].filter(Boolean).join(" ") || "Unknown"
        : "Unknown";
      return {
        staff_id: staffId,
        name,
        hours: Math.round(agg.hours * 100) / 100,
        cost: Math.round(agg.cost * 100) / 100,
      };
    })
    .sort((a, b) => b.cost - a.cost);

  // Compute totals
  const totals = monthlyBreakdown.reduce(
    (acc, m) => {
      acc.revenue += m.revenue;
      acc.cost += m.cost;
      acc.margin += m.margin;
      acc.hours += m.hours;
      return acc;
    },
    { revenue: 0, cost: 0, margin: 0, hours: 0 }
  );
  const totalMarginPct = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0;

  // Current retainer: active as of today
  const todayStr = now.toISOString().slice(0, 10);
  let currentRetainer = 0;
  for (const r of retainersResult.data) {
    const retainerStart = r.start_date ?? "";
    const retainerEnd = r.end_date;
    const isActive =
      retainerStart <= todayStr &&
      (retainerEnd == null || retainerEnd >= todayStr);
    if (isActive) {
      currentRetainer += r.monthly_value ?? 0;
    }
  }

  return Response.json({
    company: {
      accelo_id: companyId,
      name: companyResult.data.name,
      standing: companyResult.data.standing,
    },
    current_retainer: currentRetainer,
    months: monthlyBreakdown,
    staff_breakdown: staffBreakdown,
    totals: {
      revenue: Math.round(totals.revenue * 100) / 100,
      cost: Math.round(totals.cost * 100) / 100,
      margin: Math.round(totals.margin * 100) / 100,
      margin_pct: Math.round(totalMarginPct * 100) / 100,
      hours: Math.round(totals.hours * 100) / 100,
    },
  });
}

// GAR-640: Typed Supabase query functions for the manager dashboard.
//
// When supabase gen types typescript runs, tighten SupabaseClient to
// SupabaseClient<Database> from '@/lib/database.types'.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMember } from "@/lib/data";

// ── Team capacity (staff + today's activity hours) ─────────────────────────────

export type StaffCapacity = TeamMember;

/**
 * Returns all staff with their billable hours logged today.
 * Aggregates duration_seconds from the activities table for today's date.
 */
export async function getTeamCapacity(supabase: SupabaseClient): Promise<StaffCapacity[]> {
  // Query the full current week (Mon–Sun) for the capacity breakdown
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const weekStart = monday.toISOString().slice(0, 10);

  const [staffRes, activitiesRes, costRatesRes, ratesRes] = await Promise.all([
    supabase
      .from("staff")
      .select("accelo_id, firstname, surname, rate_id"),
    supabase
      .from("activities")
      .select("staff_id, duration_seconds")
      .gte("date_logged", weekStart),
    supabase
      .from("staff_cost_rates")
      .select("staff_accelo_id, hourly_cost"),
    supabase
      .from("rates")
      .select("id, title"),
  ]);

  if (staffRes.error) throw new Error(`getTeamCapacity staff: ${staffRes.error.message}`);
  if (activitiesRes.error) throw new Error(`getTeamCapacity activities: ${activitiesRes.error.message}`);
  if (costRatesRes.error) throw new Error(`getTeamCapacity cost_rates: ${costRatesRes.error.message}`);
  if (ratesRes.error) throw new Error(`getTeamCapacity rates: ${ratesRes.error.message}`);

  const hoursMap = new Map<number, number>();
  for (const a of activitiesRes.data ?? []) {
    if (a.staff_id === null) continue;
    const prev = hoursMap.get(a.staff_id) ?? 0;
    hoursMap.set(a.staff_id, prev + (a.duration_seconds ?? 0));
  }

  const costMap = new Map(
    (costRatesRes.data ?? []).map((r) => [r.staff_accelo_id, Number(r.hourly_cost) || 0]),
  );

  const ratesTitleMap = new Map(
    (ratesRes.data ?? []).map((r) => [r.id, r.title as string]),
  );

  return (staffRes.data ?? []).map((s) => {
    const loggedSeconds = hoursMap.get(s.accelo_id) ?? 0;
    const loggedHours   = loggedSeconds / 3600;
    const totalHours    = 40;
    const utilization   = Math.min(Math.round((loggedHours / totalHours) * 100), 100);

    return {
      id:            String(s.accelo_id),
      name:          [s.firstname, s.surname].filter(Boolean).join(" "),
      role:          (s.rate_id ? ratesTitleMap.get(s.rate_id) : null) ?? "",
      avatar:        (s.firstname ?? "?")[0].toUpperCase(),
      utilization,
      billableHours: Math.round(loggedHours * 10) / 10,
      totalHours,
      // rates table has titles only, no dollar amounts — billing rate needs Accelo rate-charge sync
      billingRate:   0,
      costRate:      costMap.get(s.accelo_id) ?? 0,
    };
  });
}

// ── Today's time log feed ──────────────────────────────────────────────────────

export type TimeLogEntry = {
  id: string;
  staffName: string;
  subject: string | null;
  durationHours: number;
  dateLogged: string;
  taskId: number | null;
  billable: boolean;
  clientName: string | null;
  category: string | null;
};

/**
 * Returns all activities logged today, with staff names resolved.
 * Used by the dashboard's live activity feed.
 */
export async function getTodayTimeLog(supabase: SupabaseClient): Promise<TimeLogEntry[]> {
  const todayDate = new Date().toISOString().slice(0, 10);

  const { data: activities, error: aErr } = await supabase
    .from("activities")
    .select("accelo_id, staff_id, task_id, company_id, subject, duration_seconds, date_logged, rate_id")
    .gte("date_logged", todayDate)
    .order("date_logged", { ascending: false });
  if (aErr) throw new Error(`getTodayTimeLog: ${aErr.message}`);

  if (!activities || activities.length === 0) return [];

  const staffIds = [...new Set(activities.map((a) => a.staff_id).filter(Boolean))] as number[];
  const taskIds = [...new Set(activities.map((a) => a.task_id).filter(Boolean))] as number[];
  const companyIds = [...new Set(activities.map((a) => a.company_id).filter(Boolean))] as number[];

  const [staffRes, tasksRes, companiesRes] = await Promise.all([
    staffIds.length > 0
      ? supabase.from("staff").select("accelo_id, firstname, surname").in("accelo_id", staffIds)
      : { data: [], error: null },
    taskIds.length > 0
      ? supabase.from("tasks").select("accelo_id, title, company_id").in("accelo_id", taskIds)
      : { data: [], error: null },
    companyIds.length > 0
      ? supabase.from("companies").select("accelo_id, name").in("accelo_id", companyIds)
      : { data: [], error: null },
  ]);

  const staffMap = new Map(
    (staffRes.data ?? []).map((s) => [
      s.accelo_id,
      [s.firstname, s.surname].filter(Boolean).join(" "),
    ]),
  );

  const taskMap = new Map(
    (tasksRes.data ?? []).map((t) => [t.accelo_id, t]),
  );

  // Collect company_ids from tasks that weren't already in the activity-level set
  const taskCompanyIds = (tasksRes.data ?? [])
    .map((t) => t.company_id)
    .filter((id): id is number => id != null && !companyIds.includes(id));

  let extraCompaniesRes: { data: Array<{ accelo_id: number; name: string }> | null } = { data: [] };
  if (taskCompanyIds.length > 0) {
    extraCompaniesRes = await supabase
      .from("companies")
      .select("accelo_id, name")
      .in("accelo_id", taskCompanyIds);
  }

  const companyMap = new Map(
    [...(companiesRes.data ?? []), ...(extraCompaniesRes.data ?? [])].map((c) => [c.accelo_id, c.name as string]),
  );

  return activities.map((a) => {
    const task = a.task_id ? taskMap.get(a.task_id) : null;

    // Activity-level company_id takes precedence, fall back to the task's company
    const resolvedCompanyId = a.company_id ?? task?.company_id ?? null;

    // rate_id null means non-billable (internal/admin time in Accelo)
    const billable = a.rate_id != null;

    return {
      id:            String(a.accelo_id),
      staffName:     staffMap.get(a.staff_id) ?? "Unknown",
      subject:       a.subject,
      durationHours: Math.round(((a.duration_seconds ?? 0) / 3600) * 10) / 10,
      dateLogged:    a.date_logged ?? "",
      taskId:        a.task_id,
      billable,
      clientName:    resolvedCompanyId ? companyMap.get(resolvedCompanyId) ?? null : null,
      category:      task?.title ?? null,
    };
  });
}

// ── Firm stats ─────────────────────────────────────────────────────────────────

export type FirmStats = {
  totalClients: number;
  openTasks: number;
  billableHoursToday: number;
  activeStaff: number;
};

/**
 * Returns high-level firm stats for the dashboard header cards.
 */
export async function getFirmStats(supabase: SupabaseClient): Promise<FirmStats> {
  const todayDate = new Date().toISOString().slice(0, 10);

  const [companiesRes, tasksRes, activitiesRes, staffRes] = await Promise.all([
    supabase.from("companies").select("accelo_id", { count: "exact", head: true }),
    supabase.from("tasks").select("accelo_id", { count: "exact", head: true }).not("status_id", "in", "(5,6)"),
    supabase.from("activities").select("duration_seconds").gte("date_logged", todayDate),
    supabase.from("staff").select("accelo_id", { count: "exact", head: true }),
  ]);

  const billableSeconds = (activitiesRes.data ?? []).reduce(
    (sum, a) => sum + (a.duration_seconds ?? 0),
    0
  );

  return {
    totalClients:        companiesRes.count ?? 0,
    openTasks:           tasksRes.count ?? 0,
    billableHoursToday:  Math.round((billableSeconds / 3600) * 10) / 10,
    activeStaff:         staffRes.count ?? 0,
  };
}

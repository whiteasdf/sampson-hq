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
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: staff, error: sErr } = await supabase
    .from("staff")
    .select("accelo_id, firstname, surname, rate_id");
  if (sErr) throw new Error(`getTeamCapacity staff: ${sErr.message}`);

  const { data: activities, error: aErr } = await supabase
    .from("activities")
    .select("staff_id, duration_seconds")
    .gte("date_logged", todayStart.toISOString());
  if (aErr) throw new Error(`getTeamCapacity activities: ${aErr.message}`);

  // Aggregate hours per staff member
  const hoursMap = new Map<number, number>();
  for (const a of activities ?? []) {
    if (a.staff_id === null) continue;
    const prev = hoursMap.get(a.staff_id) ?? 0;
    hoursMap.set(a.staff_id, prev + (a.duration_seconds ?? 0));
  }

  return (staff ?? []).map((s) => {
    const loggedSeconds = hoursMap.get(s.accelo_id) ?? 0;
    const loggedHours   = loggedSeconds / 3600;
    const totalHours    = 8; // standard workday assumption
    const utilization   = Math.min(Math.round((loggedHours / totalHours) * 100), 100);

    return {
      id:            String(s.accelo_id),
      name:          [s.firstname, s.surname].filter(Boolean).join(" "),
      role:          "",           // not stored in DB yet
      avatar:        (s.firstname ?? "?")[0].toUpperCase(),
      utilization,
      billableHours: Math.round(loggedHours * 10) / 10,
      totalHours,
      billingRate:   0,            // from rates table / staff_cost_rates (Phase 5)
      costRate:      0,
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
};

/**
 * Returns all activities logged today, with staff names resolved.
 * Used by the dashboard's live activity feed.
 */
export async function getTodayTimeLog(supabase: SupabaseClient): Promise<TimeLogEntry[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: activities, error: aErr } = await supabase
    .from("activities")
    .select("accelo_id, staff_id, task_id, subject, duration_seconds, date_logged")
    .gte("date_logged", todayStart.toISOString())
    .order("date_logged", { ascending: false });
  if (aErr) throw new Error(`getTodayTimeLog: ${aErr.message}`);

  if (!activities || activities.length === 0) return [];

  // Resolve staff names
  const staffIds = [...new Set(activities.map((a) => a.staff_id).filter(Boolean))];
  const staffRes = staffIds.length > 0
    ? await supabase.from("staff").select("accelo_id, firstname, surname").in("accelo_id", staffIds)
    : { data: [] };

  const staffMap = new Map((staffRes.data ?? []).map((s) => [
    s.accelo_id,
    [s.firstname, s.surname].filter(Boolean).join(" "),
  ]));

  return activities.map((a) => ({
    id:            String(a.accelo_id),
    staffName:     staffMap.get(a.staff_id) ?? "Unknown",
    subject:       a.subject,
    durationHours: Math.round(((a.duration_seconds ?? 0) / 3600) * 10) / 10,
    dateLogged:    a.date_logged ?? "",
    taskId:        a.task_id,
  }));
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
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [companiesRes, tasksRes, activitiesRes, staffRes] = await Promise.all([
    supabase.from("companies").select("accelo_id", { count: "exact", head: true }),
    supabase.from("tasks").select("accelo_id", { count: "exact", head: true }).not("status_id", "in", "(5,6)"),
    supabase.from("activities").select("duration_seconds").gte("date_logged", todayStart.toISOString()),
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

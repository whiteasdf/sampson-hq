// Phase 4: Analytics query functions for the manager dashboard.
// Follows the same patterns as queries/dashboard.ts and queries/tasks.ts.
//
// When supabase gen types typescript runs, tighten SupabaseClient to
// SupabaseClient<Database> from '@/lib/database.types'.

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Team utilization (from pre-computed snapshots) ─────────────────────────────

export type TeamUtilization = {
  staff_id: number;
  staff_name: string;
  billable_hrs: number;
  nonbillable_hrs: number;
  utilization: number;
  revenue: number;
  cost: number;
  margin: number;
};

/**
 * Returns team utilization data from analytics_snapshots for the current
 * week or month. Resolves staff names via the staff table.
 */
export async function getTeamUtilization(
  supabase: SupabaseClient,
  periodType: "week" | "month" = "week"
): Promise<TeamUtilization[]> {
  const now = new Date();
  let periodStart: string;

  if (periodType === "week") {
    const ws = new Date(now);
    ws.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    periodStart = ws.toISOString().split("T")[0];
  } else {
    periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }

  const { data: snapshots } = await supabase
    .from("analytics_snapshots")
    .select("*")
    .eq("period_type", periodType)
    .eq("period_start", periodStart);

  if (!snapshots || snapshots.length === 0) return [];

  // Resolve staff names
  const staffIds = [
    ...new Set(snapshots.map((s) => s.staff_id).filter(Boolean)),
  ];
  const { data: staffRecords } = await supabase
    .from("staff")
    .select("accelo_id, firstname, surname")
    .in("accelo_id", staffIds);

  const staffMap = new Map(
    (staffRecords ?? []).map((s) => [
      s.accelo_id,
      [s.firstname, s.surname].filter(Boolean).join(" "),
    ])
  );

  return snapshots.map((s) => ({
    staff_id: s.staff_id,
    staff_name: staffMap.get(s.staff_id) ?? "Unknown",
    billable_hrs: s.billable_hrs ?? 0,
    nonbillable_hrs: s.nonbillable_hrs ?? 0,
    utilization: s.utilization ?? 0,
    revenue: s.revenue ?? 0,
    cost: s.cost ?? 0,
    margin: s.margin ?? 0,
  }));
}

// ── Task transitions (audit trail) ─────────────────────────────────────────────

export type TaskTransition = {
  id: number;
  from_status: string;
  to_status: string;
  transitioned_at: string;
};

/**
 * Returns the transition history for a specific task, with status names resolved
 * from the task_statuses lookup table.
 *
 * NOTE: Uses `transitioned_at` column (not `changed_at`) — matches the schema
 * established in migration 0003.
 */
export async function getTaskTransitions(
  supabase: SupabaseClient,
  taskAcceloId: number
): Promise<TaskTransition[]> {
  const { data } = await supabase
    .from("task_transitions")
    .select("id, from_status_id, to_status_id, transitioned_at")
    .eq("task_accelo_id", taskAcceloId)
    .order("transitioned_at", { ascending: false });

  if (!data) return [];

  // Resolve status names from task_statuses lookup table
  const statusIds = new Set<number>();
  for (const t of data) {
    if (t.from_status_id) statusIds.add(t.from_status_id);
    if (t.to_status_id) statusIds.add(t.to_status_id);
  }

  const { data: statuses } = await supabase
    .from("task_statuses")
    .select("id, title")
    .in("id", [...statusIds]);

  const statusMap = new Map(
    (statuses ?? []).map((s) => [s.id, s.title])
  );

  return data.map((t) => ({
    id: t.id,
    from_status: statusMap.get(t.from_status_id) ?? "Unknown",
    to_status: statusMap.get(t.to_status_id) ?? "Unknown",
    transitioned_at: t.transitioned_at,
  }));
}

// ── Unresolved task flags ──────────────────────────────────────────────────────

export type TaskFlag = {
  id: number;
  flag_type: string;
  note: string | null;
  created_at: string;
};

/**
 * Returns unresolved flags grouped by task accelo ID.
 * Optionally scoped to a set of task IDs (for efficient batch loading).
 */
export async function getUnresolvedFlags(
  supabase: SupabaseClient,
  taskAcceloIds?: number[]
): Promise<Record<number, TaskFlag[]>> {
  let query = supabase
    .from("task_flags")
    .select("id, task_accelo_id, flag_type, note, created_at")
    .is("resolved_at", null);

  if (taskAcceloIds && taskAcceloIds.length > 0) {
    query = query.in("task_accelo_id", taskAcceloIds);
  }

  const { data } = await query;
  const result: Record<number, TaskFlag[]> = {};

  for (const f of data ?? []) {
    if (!result[f.task_accelo_id]) result[f.task_accelo_id] = [];
    result[f.task_accelo_id].push({
      id: f.id,
      flag_type: f.flag_type,
      note: f.note,
      created_at: f.created_at,
    });
  }

  return result;
}

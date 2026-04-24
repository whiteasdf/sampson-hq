// GAR-640: Typed Supabase query functions for the tasks UI.
// All page-level data fetching goes through these — no raw Supabase calls in pages.
//
// Status ID → UI string mapping (mirrors task_statuses lookup table):
//   2 Pending  → "todo"
//   3 Accepted → "todo"
//   4 Started  → "in-progress"
//   5 Complete → "done"
//   6 Inactive → "done"
//   7 Paused   → "todo"
//
// When supabase gen types typescript runs, replace `any` SupabaseClient
// with `SupabaseClient<Database>` from '@/lib/database.types'.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/lib/data";

// ── Status mapping ─────────────────────────────────────────────────────────────

const STATUS_ID_MAP: Record<number, Task["status"]> = {
  2: "todo",
  3: "todo",
  4: "in-progress",
  5: "done",
  6: "done",
  7: "waiting",
};

function mapStatus(id: number | null): Task["status"] {
  if (id === null) return "todo";
  return STATUS_ID_MAP[id] ?? "todo";
}

// ── Row shape returned by the join query ───────────────────────────────────────

type TaskRow = {
  accelo_id: number;
  title: string;
  status_id: number | null;
  assignee_id: number | null;
  company_id: number | null;
  due_date: string | null;
  staff: { firstname: string | null; surname: string | null } | null;
  companies: { name: string } | null;
};

function rowToTask(r: TaskRow): Task {
  const assigneeName = r.staff
    ? [r.staff.firstname, r.staff.surname].filter(Boolean).join(" ")
    : "";

  return {
    id:             String(r.accelo_id),
    title:          r.title,
    client:         r.companies?.name ?? "",
    assignee:       assigneeName,
    category:       "",          // not stored in DB yet
    priority:       "medium",    // not stored in DB yet
    status:         mapStatus(r.status_id),
    dueDate:        r.due_date ?? "",
    estimatedHours: 0,           // not stored in DB yet
    loggedHours:    0,           // compute from activities in a future phase
    recurring:      false,       // not stored in DB yet
  };
}

// ── Shared select string ───────────────────────────────────────────────────────

const TASK_SELECT = `
  accelo_id,
  title,
  status_id,
  assignee_id,
  company_id,
  due_date,
  staff!tasks_assignee_id_fkey ( firstname, surname ),
  companies!tasks_company_id_fkey ( name )
`.trim();

// Supabase doesn't have FK declarations on accelo_id cross-references, so we
// use manual join syntax: embed staff via a separate lookup after fetching.
// For now, use a simpler select and resolve names client-side.

const SIMPLE_TASK_SELECT = "accelo_id, title, status_id, assignee_id, company_id, due_date";

// ── Query: all open tasks (managers) ──────────────────────────────────────────

/**
 * Returns all tasks that are not complete/inactive, with company and assignee
 * names resolved via separate lookups. Used by the manager Task Manager page.
 */
export async function getOpenTasks(supabase: SupabaseClient): Promise<Task[]> {
  // Fetch tasks excluding done statuses (status_id 5=Complete, 6=Inactive)
  const { data: tasks, error: tErr } = await supabase
    .from("tasks")
    .select(SIMPLE_TASK_SELECT)
    .not("status_id", "in", "(5,6)")
    .order("due_date", { ascending: true });

  if (tErr) throw new Error(`getOpenTasks: ${tErr.message}`);
  if (!tasks || tasks.length === 0) return [];

  // Resolve assignee names
  const assigneeIds = [...new Set(tasks.map((t) => t.assignee_id).filter(Boolean))];
  const companyIds  = [...new Set(tasks.map((t) => t.company_id).filter(Boolean))];

  const [staffRes, companiesRes] = await Promise.all([
    assigneeIds.length > 0
      ? supabase.from("staff").select("accelo_id, firstname, surname").in("accelo_id", assigneeIds)
      : Promise.resolve({ data: [] }),
    companyIds.length > 0
      ? supabase.from("companies").select("accelo_id, name").in("accelo_id", companyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const staffMap   = new Map((staffRes.data ?? []).map((s) => [s.accelo_id, s]));
  const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.accelo_id, c]));

  return tasks.map((t) => {
    const s = staffMap.get(t.assignee_id);
    const c = companyMap.get(t.company_id);
    return rowToTask({
      ...t,
      staff:     s ? { firstname: s.firstname, surname: s.surname } : null,
      companies: c ? { name: c.name } : null,
    });
  });
}

/**
 * Returns tasks assigned to the current authenticated worker.
 * RLS automatically filters to the calling user's staff_accelo_id.
 */
export async function getWorkerTasks(supabase: SupabaseClient): Promise<Task[]> {
  const { data: tasks, error: tErr } = await supabase
    .from("tasks")
    .select(SIMPLE_TASK_SELECT)
    .not("status_id", "in", "(5,6)")
    .order("due_date", { ascending: true });

  if (tErr) throw new Error(`getWorkerTasks: ${tErr.message}`);
  if (!tasks || tasks.length === 0) return [];

  const companyIds = [...new Set(tasks.map((t) => t.company_id).filter(Boolean))];
  const companiesRes = companyIds.length > 0
    ? await supabase.from("companies").select("accelo_id, name").in("accelo_id", companyIds)
    : { data: [] };

  const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.accelo_id, c]));

  return tasks.map((t) => rowToTask({
    ...t,
    staff:     null, // worker sees their own tasks — no need to resolve name
    companies: companyMap.get(t.company_id) ? { name: companyMap.get(t.company_id)!.name } : null,
  }));
}

/**
 * Fetches a single task by Accelo ID (for the focus page).
 */
export async function getTaskByAcceloId(
  supabase: SupabaseClient,
  acceloId: number
): Promise<Task | null> {
  const { data: t, error } = await supabase
    .from("tasks")
    .select(SIMPLE_TASK_SELECT)
    .eq("accelo_id", acceloId)
    .single();

  if (error || !t) return null;

  return rowToTask({ ...t, staff: null, companies: null });
}

/**
 * Returns names of all active staff (for assignee dropdowns).
 */
export async function getStaffNames(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("staff")
    .select("firstname, surname")
    .order("firstname");
  return (data ?? []).map((s) => [s.firstname, s.surname].filter(Boolean).join(" ")).filter(Boolean);
}

/**
 * Returns names of all companies (for client filter dropdowns).
 */
export async function getCompanyNames(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("companies")
    .select("name")
    .order("name");
  return (data ?? []).map((c) => c.name).filter(Boolean);
}

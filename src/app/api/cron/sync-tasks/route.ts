// GAR-636: sync-tasks — every 2 minutes, incremental
// Most critical sync — tasks are the primary UI data.
//
// CRITICAL: NEVER use standing=active filter on tasks — returns 0 results.
// Use date_modified_after(watermark) to fetch all recently changed tasks.
// Detects status changes and writes to task_transitions for audit trail.

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { acceloFetchAll } from "@/lib/accelo-client";

type AcceloTask = {
  id: number;
  title: string;
  against_id: number;
  against_type: string;
  standing: string;
  date_modified: number; // unix timestamp
  date_due: number;      // unix timestamp
  budgeted: number;      // seconds
  logged: number;        // seconds
  staff:   { id: number } | null;
  manager: { id: number } | null;
  status:  { id: number; title: string; standing: string } | null;
};

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // ── 1. Read watermark ────────────────────────────────────────────────────────
  const { data: wm } = await supabaseAdmin
    .from("sync_watermarks")
    .select("last_synced_at")
    .eq("entity", "tasks")
    .single();

  const lastSynced = wm?.last_synced_at;
  const isFirstRun = !lastSynced || lastSynced === "1970-01-01T00:00:00+00:00";

  // ── 2. Fetch from Accelo ─────────────────────────────────────────────────────
  const params: Record<string, string> = {
    _fields: "id,title,against_id,against_type,standing,date_modified,date_due,budgeted,logged,staff(id),manager(id),status(id,title,standing)",
  };

  if (!isFirstRun) {
    const unixTs = Math.floor(new Date(lastSynced).getTime() / 1000);
    params._filters = `date_modified_after(${unixTs})`;
  }

  const tasks = await acceloFetchAll<AcceloTask>("/tasks", params);

  if (tasks.length === 0) {
    await supabaseAdmin
      .from("sync_watermarks")
      .update({ last_synced_at: now })
      .eq("entity", "tasks");
    return Response.json({ ok: true, tasks: 0 });
  }

  // ── 3. Check existing status_ids for transition detection ────────────────────
  const acceloIds = tasks.map((t) => t.id);
  const { data: existing } = await supabaseAdmin
    .from("tasks")
    .select("accelo_id, status_id")
    .in("accelo_id", acceloIds);

  const existingMap = new Map<number, number | null>(
    (existing ?? []).map((r) => [r.accelo_id, r.status_id])
  );

  // ── 4. Build rows + detect transitions ──────────────────────────────────────
  const rows: Record<string, unknown>[] = [];
  const transitions: Record<string, unknown>[] = [];

  for (const t of tasks) {
    const companyId  = t.against_type === "company" ? t.against_id : null;
    const assigneeId = t.staff?.id   ?? null;
    const newStatusId = t.status?.id ?? null;
    const oldStatusId = existingMap.get(t.id);

    // Detect status change — only when task already existed in Supabase
    if (oldStatusId !== undefined && oldStatusId !== newStatusId) {
      transitions.push({
        task_accelo_id: t.id,
        from_status_id: oldStatusId,
        to_status_id:   newStatusId,
        transitioned_at: now,
        detected_at:     now,
      });
    }

    rows.push({
      accelo_id:   t.id,
      title:       t.title ?? "",
      status_id:   newStatusId,
      assignee_id: assigneeId,
      company_id:  companyId,
      due_date:    t.date_due ? new Date(t.date_due * 1000).toISOString().split("T")[0] : null,
      synced_at:   now,
    });
  }

  // ── 5. Upsert tasks ──────────────────────────────────────────────────────────
  const { error: taskErr } = await supabaseAdmin
    .from("tasks")
    .upsert(rows, { onConflict: "accelo_id" });
  if (taskErr) throw new Error(`tasks upsert: ${taskErr.message}`);

  // ── 6. Insert transitions ────────────────────────────────────────────────────
  if (transitions.length > 0) {
    const { error: transErr } = await supabaseAdmin
      .from("task_transitions")
      .insert(transitions);
    if (transErr) throw new Error(`task_transitions insert: ${transErr.message}`);
  }

  // ── 7. Update watermark ──────────────────────────────────────────────────────
  const { error: wmErr } = await supabaseAdmin
    .from("sync_watermarks")
    .update({ last_synced_at: now })
    .eq("entity", "tasks");
  if (wmErr) throw new Error(`watermark update: ${wmErr.message}`);

  return Response.json({ ok: true, tasks: rows.length, transitions: transitions.length });
}

// One-time backfill: resolve company_id on tasks and activities.
//
// Tasks in Accelo are children of Jobs (Company → Job → Task).
// The task sync stored against_id as job_id but only set company_id
// when against_type === "company" (which is rare). This endpoint:
//
// 1. Finds all tasks with company_id IS NULL and a valid against_id (job_id)
// 2. Fetches those jobs from Accelo to get their parent company
// 3. Updates tasks with the resolved company_id
// 4. Backfills activities.company_id from their linked tasks

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { acceloFetchAll } from "@/lib/accelo-client";

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── 1. Find tasks missing company_id ─────────────────────────────────
    const { data: tasksWithoutCompany, error: taskErr } = await supabaseAdmin
      .from("tasks")
      .select("accelo_id")
      .is("company_id", null)
      .limit(10000);

    if (taskErr) throw new Error(`tasks query: ${taskErr.message}`);

    const taskAcceloIds = (tasksWithoutCompany ?? []).map((t) => t.accelo_id);

    // ── 2. Fetch tasks from Accelo to get against_id (job_id) ───────────
    const BATCH_SIZE = 50;
    const jobIds = new Set<number>();
    const taskToJobMap = new Map<number, number>();
    const jobToCompanyMap = new Map<number, number>();
    let tasksUpdated = 0;

    for (let i = 0; i < taskAcceloIds.length; i += BATCH_SIZE) {
      const batch = taskAcceloIds.slice(i, i + BATCH_SIZE);
      const acceloTasks = await acceloFetchAll<{
        id: number;
        against_id: number;
        against_type: string;
      }>("/tasks", {
        _fields: "id,against_id,against_type",
        _filters: `id_in(${batch.join(",")})`,
      });

      for (const t of acceloTasks) {
        if (t.against_type === "job" && t.against_id) {
          jobIds.add(t.against_id);
          taskToJobMap.set(t.id, t.against_id);
        }
      }
    }

    // ── 3. Fetch jobs from Accelo to get company_id ─────────────────────
    if (jobIds.size > 0) {
      const jobIdArr = [...jobIds];
      for (let i = 0; i < jobIdArr.length; i += BATCH_SIZE) {
        const batch = jobIdArr.slice(i, i + BATCH_SIZE);
        const jobs = await acceloFetchAll<{
          id: number;
          company: { id: number } | null;
        }>("/jobs", {
          _fields: "id,company(id)",
          _filters: `id_in(${batch.join(",")})`,
        });

        for (const j of jobs) {
          if (j.company?.id) {
            jobToCompanyMap.set(j.id, j.company.id);
          }
        }
      }
    }

    // ── 4. Update tasks with resolved company_id ────────────────────────
    for (const [taskId, jobId] of taskToJobMap) {
      const companyId = jobToCompanyMap.get(jobId);
      if (companyId == null) continue;

      const { error } = await supabaseAdmin
        .from("tasks")
        .update({ company_id: companyId })
        .eq("accelo_id", taskId);

      if (!error) tasksUpdated++;
    }

    // ── 5. Backfill activities.company_id from tasks ────────────────────
    const { data: activitiesWithoutCompany } = await supabaseAdmin
      .from("activities")
      .select("accelo_id, task_id")
      .is("company_id", null)
      .not("task_id", "is", null);

    let activitiesUpdated = 0;
    if (activitiesWithoutCompany && activitiesWithoutCompany.length > 0) {
      const activityTaskIds = [...new Set(activitiesWithoutCompany.map((a) => a.task_id as number))];

      const { data: taskCompanies } = await supabaseAdmin
        .from("tasks")
        .select("accelo_id, company_id")
        .in("accelo_id", activityTaskIds)
        .not("company_id", "is", null);

      if (taskCompanies && taskCompanies.length > 0) {
        const taskCompanyMap = new Map(taskCompanies.map((t) => [t.accelo_id, t.company_id as number]));

        for (const a of activitiesWithoutCompany) {
          const companyId = taskCompanyMap.get(a.task_id as number);
          if (companyId == null) continue;

          const { error } = await supabaseAdmin
            .from("activities")
            .update({ company_id: companyId })
            .eq("accelo_id", a.accelo_id);

          if (!error) activitiesUpdated++;
        }
      }
    }

    // ── 6. Backfill remaining activities via Accelo job resolution ────
    // Most activities have no task_id — they're logged against jobs directly.
    // Fetch their against_id from Accelo, resolve job → company.
    const { data: remainingActivities } = await supabaseAdmin
      .from("activities")
      .select("accelo_id")
      .is("company_id", null)
      .limit(10000);

    let activitiesViaJobs = 0;
    if (remainingActivities && remainingActivities.length > 0) {
      const remainingIds = remainingActivities.map((a) => a.accelo_id);

      // Fetch activities from Accelo to get against_id
      const actJobMap = new Map<number, number>();
      for (let i = 0; i < remainingIds.length; i += BATCH_SIZE) {
        const batch = remainingIds.slice(i, i + BATCH_SIZE);
        const acceloActs = await acceloFetchAll<{
          id: number;
          against_id: number;
        }>("/activities", {
          _fields: "id,against_id",
          _filters: `id_in(${batch.join(",")})`,
        });
        for (const a of acceloActs) {
          if (a.against_id) actJobMap.set(a.id, a.against_id);
        }
      }

      // Collect unique job IDs we haven't resolved yet
      const newJobIds = [...new Set(
        [...actJobMap.values()].filter((jid) => !jobToCompanyMap.has(jid))
      )];

      // Fetch any new jobs
      for (let i = 0; i < newJobIds.length; i += BATCH_SIZE) {
        const batch = newJobIds.slice(i, i + BATCH_SIZE);
        const jobs = await acceloFetchAll<{
          id: number;
          company: { id: number } | null;
        }>("/jobs", {
          _fields: "id,company(id)",
          _filters: `id_in(${batch.join(",")})`,
        });
        for (const j of jobs) {
          if (j.company?.id) jobToCompanyMap.set(j.id, j.company.id);
        }
      }

      // Update activities
      for (const [actId, jid] of actJobMap) {
        const cid = jobToCompanyMap.get(jid);
        if (cid == null) continue;

        const { error } = await supabaseAdmin
          .from("activities")
          .update({ company_id: cid })
          .eq("accelo_id", actId);

        if (!error) activitiesViaJobs++;
      }
    }

    return Response.json({
      ok: true,
      tasks_without_company: tasksWithoutCompany.length,
      unique_jobs: jobIds.size,
      jobs_with_company: jobToCompanyMap.size,
      tasks_updated: tasksUpdated,
      activities_via_tasks: activitiesUpdated,
      activities_via_jobs: activitiesViaJobs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("backfill-company-ids error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

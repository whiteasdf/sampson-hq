// GAR-959: Push unsynced tasks from Supabase to Accelo.
// Runs on a cron schedule (every 2 minutes). Processes up to 50 tasks
// per invocation to stay within serverless timeout limits.
//
// Flow:
// 1. Query tasks where synced_to_accelo_at IS NULL and deleted_at IS NULL
// 2. Join to companies to get default_job_accelo_id for Accelo task creation
// 3. If accelo_id is NULL → create in Accelo; if present → update in Accelo
// 4. On success: mark synced_to_accelo_at = now(), store returned accelo_id
// 5. On failure: insert into sync_failures with exponential backoff
// 6. Also process retryable sync_failures for entity_type='task'

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { acceloCreateTask, acceloUpdateTask } from "@/lib/accelo-client";

const BATCH_LIMIT = 50;

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Get IDs of tasks that have unresolved sync failures with
  // a future retry time or exhausted attempts, so we skip them.
  const { data: blockedFailures } = await supabaseAdmin
    .from("sync_failures")
    .select("entity_id, attempts, max_attempts, next_retry_at")
    .eq("entity_type", "task")
    .is("resolved_at", null);

  const blockedIds = new Set<number>();
  if (blockedFailures) {
    for (const f of blockedFailures) {
      // Skip if max attempts exhausted
      if (f.attempts >= f.max_attempts) {
        blockedIds.add(f.entity_id);
        continue;
      }
      // Skip if backoff window hasn't elapsed yet
      if (f.next_retry_at && new Date(f.next_retry_at).getTime() > Date.now()) {
        blockedIds.add(f.entity_id);
      }
    }
  }

  // 1. Fetch unsynced, non-deleted tasks with their company's default_job_accelo_id
  const { data: tasks, error: fetchErr } = await supabaseAdmin
    .from("tasks")
    .select("*, companies!tasks_company_id_fkey(default_job_accelo_id)")
    .is("synced_to_accelo_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (fetchErr) {
    return Response.json(
      { error: `Failed to fetch tasks: ${fetchErr.message}` },
      { status: 500 }
    );
  }

  if (!tasks || tasks.length === 0) {
    const retryResult = await processRetries(now, new Set());
    return Response.json({ ok: true, synced: 0, failed: 0, skipped: 0, ...retryResult });
  }

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  const processedIds = new Set<number>();

  for (const task of tasks) {
    // Respect backoff — skip tasks with pending retries or exhausted attempts
    if (blockedIds.has(task.id)) {
      skipped++;
      continue;
    }

    const company = task.companies as { default_job_accelo_id: number | null } | null;
    const jobAcceloId = company?.default_job_accelo_id;

    if (task.accelo_id) {
      // ── UPDATE existing Accelo task ──────────────────────────────────
      try {
        await acceloUpdateTask(task.accelo_id, {
          title: task.title,
          assignee: task.assignee_id ?? undefined,
          date_due: task.due_date ?? undefined,
          budgeted: task.budgeted_seconds ?? undefined,
          status: task.status_id ?? undefined,
        });

        await supabaseAdmin
          .from("tasks")
          .update({ synced_to_accelo_at: now })
          .eq("id", task.id);

        synced++;
        processedIds.add(task.id);
      } catch (err) {
        failed++;
        processedIds.add(task.id);
        const message = err instanceof Error ? err.message : "Unknown error";
        await insertSyncFailure(
          task.id,
          "update",
          {
            task_id: task.id,
            accelo_id: task.accelo_id,
            title: task.title,
          },
          message
        );
      }
    } else {
      // ── CREATE new Accelo task ───────────────────────────────────────

      // Company must have a default_job_accelo_id to create tasks under
      if (!jobAcceloId) {
        failed++;
        await insertSyncFailure(
          task.id,
          "create",
          { task_id: task.id, company_id: task.company_id },
          `Company id=${task.company_id} has no default_job_accelo_id — cannot create task in Accelo`
        );
        continue;
      }

      try {
        const result = await acceloCreateTask({
          title: task.title,
          against_type: "job",
          against_id: jobAcceloId,
          assignee: task.assignee_id ?? undefined,
          date_due: task.due_date ?? undefined,
          budgeted: task.budgeted_seconds ?? undefined,
          status: task.status_id ?? undefined,
        });

        // Store the returned accelo_id and mark as synced
        await supabaseAdmin
          .from("tasks")
          .update({ accelo_id: result.id, synced_to_accelo_at: now })
          .eq("id", task.id);

        synced++;
        processedIds.add(task.id);
      } catch (err) {
        failed++;
        processedIds.add(task.id);
        const message = err instanceof Error ? err.message : "Unknown error";
        await insertSyncFailure(
          task.id,
          "create",
          {
            task_id: task.id,
            company_id: task.company_id,
            job_accelo_id: jobAcceloId,
            title: task.title,
          },
          message
        );
      }
    }
  }

  // Process retryable failures after handling new tasks
  const retryResult = await processRetries(now, processedIds);

  return Response.json({ ok: true, synced, failed, skipped, ...retryResult });
}

async function processRetries(
  now: string,
  alreadyProcessed: Set<number>
): Promise<{ retried: number; retryFailed: number }> {
  const { data: retryable } = await supabaseAdmin
    .from("sync_failures")
    .select("*")
    .eq("entity_type", "task")
    .is("resolved_at", null)
    .lte("next_retry_at", now);

  // Filter in app code: respect per-row max_attempts and skip already-processed tasks
  const eligible = (retryable ?? []).filter(
    (f) => f.attempts < f.max_attempts && !alreadyProcessed.has(f.entity_id)
  );

  if (eligible.length === 0) {
    return { retried: 0, retryFailed: 0 };
  }

  const entityIds = eligible.map((f) => f.entity_id);
  const { data: taskRows } = await supabaseAdmin
    .from("tasks")
    .select("*, companies!tasks_company_id_fkey(default_job_accelo_id)")
    .in("id", entityIds);

  const taskMap = new Map(
    (taskRows ?? []).map((t) => [t.id, t])
  );

  let retried = 0;
  let retryFailed = 0;

  for (const failure of eligible) {
    const taskRow = taskMap.get(failure.entity_id);
    const task = taskRow as {
      id: number;
      accelo_id: number | null;
      title: string;
      assignee_id: number | null;
      due_date: string | null;
      budgeted_seconds: number | null;
      status_id: number | null;
      company_id: number | null;
      companies: { default_job_accelo_id: number | null } | null;
    } | undefined;

    if (!task) {
      // Task was deleted — resolve the failure
      await supabaseAdmin
        .from("sync_failures")
        .update({ resolved_at: now })
        .eq("id", failure.id);
      retried++;
      continue;
    }

    const operation = failure.operation as string;
    const jobAcceloId = task.companies?.default_job_accelo_id;

    try {
      if (operation === "update" && task.accelo_id) {
        await acceloUpdateTask(task.accelo_id, {
          title: task.title,
          assignee: task.assignee_id ?? undefined,
          date_due: task.due_date ?? undefined,
          budgeted: task.budgeted_seconds ?? undefined,
          status: task.status_id ?? undefined,
        });

        await supabaseAdmin
          .from("tasks")
          .update({ synced_to_accelo_at: now })
          .eq("id", task.id);
      } else if (operation === "create") {
        if (!jobAcceloId) {
          // Still no job — increment attempts and backoff
          const newAttempts = failure.attempts + 1;
          const backoffMs = Math.pow(2, newAttempts) * 60 * 1000;
          const nextRetry = new Date(Date.now() + backoffMs).toISOString();

          await supabaseAdmin
            .from("sync_failures")
            .update({
              attempts: newAttempts,
              error_message: `Company id=${task.company_id} still has no default_job_accelo_id`,
              next_retry_at: newAttempts >= failure.max_attempts ? null : nextRetry,
            })
            .eq("id", failure.id);

          retryFailed++;
          continue;
        }

        const result = await acceloCreateTask({
          title: task.title,
          against_type: "job",
          against_id: jobAcceloId,
          assignee: task.assignee_id ?? undefined,
          date_due: task.due_date ?? undefined,
          budgeted: task.budgeted_seconds ?? undefined,
          status: task.status_id ?? undefined,
        });

        await supabaseAdmin
          .from("tasks")
          .update({ accelo_id: result.id, synced_to_accelo_at: now })
          .eq("id", task.id);
      }

      // Resolve the failure on success
      await supabaseAdmin
        .from("sync_failures")
        .update({ resolved_at: now })
        .eq("id", failure.id);

      retried++;
    } catch (err) {
      retryFailed++;
      const message = err instanceof Error ? err.message : "Unknown error";
      const newAttempts = failure.attempts + 1;
      const backoffMs = Math.pow(2, newAttempts) * 60 * 1000;
      const nextRetry = new Date(Date.now() + backoffMs).toISOString();

      await supabaseAdmin
        .from("sync_failures")
        .update({
          attempts: newAttempts,
          error_message: message,
          next_retry_at: newAttempts >= failure.max_attempts ? null : nextRetry,
        })
        .eq("id", failure.id);
    }
  }

  return { retried, retryFailed };
}

/**
 * Insert or update a sync_failures row with exponential backoff.
 * If a failure already exists for this entity, increment attempts and
 * push next_retry_at further out.
 */
async function insertSyncFailure(
  entityId: number,
  operation: string,
  payload: Record<string, unknown>,
  errorMessage: string
): Promise<void> {
  // Check for existing unresolved failure
  const { data: existing } = await supabaseAdmin
    .from("sync_failures")
    .select("id, attempts, max_attempts")
    .eq("entity_type", "task")
    .eq("entity_id", entityId)
    .is("resolved_at", null)
    .single();

  if (existing) {
    const newAttempts = existing.attempts + 1;
    // Exponential backoff: 2^attempts minutes (2, 4, 8, 16, 32 min)
    const backoffMs = Math.pow(2, newAttempts) * 60 * 1000;
    const nextRetry = new Date(Date.now() + backoffMs).toISOString();

    await supabaseAdmin
      .from("sync_failures")
      .update({
        attempts: newAttempts,
        error_message: errorMessage,
        next_retry_at: newAttempts >= existing.max_attempts ? null : nextRetry,
      })
      .eq("id", existing.id);
  } else {
    // First failure — retry in 2 minutes
    const nextRetry = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    await supabaseAdmin.from("sync_failures").insert({
      entity_type: "task",
      entity_id: entityId,
      operation,
      payload: payload as unknown as Record<string, unknown>,
      error_message: errorMessage,
      attempts: 1,
      max_attempts: 5,
      next_retry_at: nextRetry,
    });
  }
}

// Pivot 1B: Push completed, unsynced time_entries to Accelo as activities.
// Runs on a cron schedule (e.g. every 2 minutes). Processes up to 20 entries
// per invocation to stay within serverless timeout limits.
//
// Flow:
// 1. Query completed entries where synced_to_accelo_at IS NULL
// 2. Join to tasks to get accelo_id for the Accelo API call
// 3. POST each as an Accelo activity
// 4. On success: mark synced_to_accelo_at = now()
// 5. On failure: insert into sync_failures with exponential backoff

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { acceloPost } from "@/lib/accelo-client";

const BATCH_LIMIT = 20;

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // C5/C6 fix: Get IDs of entries that have unresolved sync failures with
  // a future retry time or exhausted attempts, so we skip them.
  const { data: blockedFailures } = await supabaseAdmin
    .from("sync_failures")
    .select("entity_id, attempts, max_attempts, next_retry_at")
    .eq("entity_type", "time_entry")
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

  // 1. Fetch unsynced, completed entries with their task's accelo_id
  const { data: entries, error: fetchErr } = await supabaseAdmin
    .from("time_entries")
    .select("*, tasks!time_entries_task_id_fkey(accelo_id)")
    .is("synced_to_accelo_at", null)
    .not("stopped_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (fetchErr) {
    return Response.json(
      { error: `Failed to fetch entries: ${fetchErr.message}` },
      { status: 500 }
    );
  }

  if (!entries || entries.length === 0) {
    return Response.json({ ok: true, synced: 0, failed: 0, skipped: 0 });
  }

  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const entry of entries) {
    // C5: respect backoff — skip entries with pending retries or exhausted attempts
    if (blockedIds.has(entry.id)) {
      skipped++;
      continue;
    }

    const task = entry.tasks as { accelo_id: number | null } | null;
    const acceloTaskId = task?.accelo_id;

    // Skip entries whose parent task hasn't been synced to Accelo yet
    if (!acceloTaskId) {
      failed++;
      await insertSyncFailure(
        entry.id,
        { entry_id: entry.id, task_id: entry.task_id },
        `Task id=${entry.task_id} has no accelo_id — cannot push to Accelo`
      );
      continue;
    }

    const billableHours = entry.rounded_seconds / 3600;
    if (billableHours === 0) {
      // Duration rounds to zero — mark as synced to avoid infinite retries
      await supabaseAdmin
        .from("time_entries")
        .update({ synced_to_accelo_at: now })
        .eq("id", entry.id);
      synced++;
      continue;
    }

    try {
      const acceloActivity = await acceloPost("/activities", {
        against_type: "task",
        against_id: acceloTaskId,
        staff_id: entry.staff_accelo_id,
        rate_id: entry.rate_id ?? 0,
        billable: entry.billable ? billableHours : 0,
        nonbillable: entry.billable ? 0 : billableHours,
        subject: entry.description || "Time entry",
        medium: "note",
        standing: "complete",
        date_logged: Math.floor(new Date(entry.started_at).getTime() / 1000),
      });

      // Mirror to activities table for read-your-writes
      const activity = acceloActivity as Record<string, unknown>;
      if (activity?.id) {
        await supabaseAdmin.from("activities").upsert(
          {
            accelo_id: Number(activity.id),
            subject: entry.description || "Time entry",
            duration_seconds: entry.rounded_seconds,
            staff_id: entry.staff_accelo_id,
            task_id: acceloTaskId,
            rate_id: entry.rate_id,
            date_logged: new Date(entry.started_at).toISOString(),
            synced_at: now,
          },
          { onConflict: "accelo_id" }
        );
      }

      // Mark as synced
      await supabaseAdmin
        .from("time_entries")
        .update({ synced_to_accelo_at: now })
        .eq("id", entry.id);

      synced++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "Unknown error";
      await insertSyncFailure(
        entry.id,
        {
          entry_id: entry.id,
          staff_accelo_id: entry.staff_accelo_id,
          accelo_task_id: acceloTaskId,
          rounded_seconds: entry.rounded_seconds,
          billable: entry.billable,
        },
        message
      );
    }
  }

  return Response.json({ ok: true, synced, failed, skipped });
}

/**
 * Insert or update a sync_failures row with exponential backoff.
 * If a failure already exists for this entity, increment attempts and
 * push next_retry_at further out.
 */
async function insertSyncFailure(
  entityId: number,
  payload: Record<string, unknown>,
  errorMessage: string
): Promise<void> {
  // Check for existing unresolved failure
  const { data: existing } = await supabaseAdmin
    .from("sync_failures")
    .select("id, attempts, max_attempts")
    .eq("entity_type", "time_entry")
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
      entity_type: "time_entry",
      entity_id: entityId,
      operation: "push_to_accelo",
      payload: payload as unknown as Record<string, unknown>,
      error_message: errorMessage,
      attempts: 1,
      max_attempts: 5,
      next_retry_at: nextRetry,
    });
  }
}

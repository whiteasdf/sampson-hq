// Pivot 1B: Typed Supabase query functions for time_entries.
// All time-entry data access goes through these — no raw Supabase calls in routes.
//
// Billing increment: 6 minutes (360 seconds) = 0.1 hours.
// Running entries have stopped_at = NULL, duration_seconds = 0, rounded_seconds = 0.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type TimeEntryRow = Database["public"]["Tables"]["time_entries"]["Row"];
type TimeEntryInsert = Database["public"]["Tables"]["time_entries"]["Insert"];
type TimeEntryUpdate = Database["public"]["Tables"]["time_entries"]["Update"];

// ── Rounding helper ────────────────────────────────────────────────────────────

/** Round seconds up to the nearest 6-minute (360s) billing increment. */
function roundToIncrement(seconds: number): number {
  return Math.ceil(seconds / 360) * 360;
}

// ── Queries ────────────────────────────────────────────────────────────────────

/**
 * Insert a new running time entry (stopped_at = null).
 * Only one entry should be running per user at a time — callers should
 * call stopAllActive() first.
 */
export async function createTimeEntry(
  supabase: SupabaseClient<Database>,
  params: {
    user_id: string;
    staff_accelo_id: number;
    task_id: number;
    started_at: string;
    billable: boolean;
    rate_id: number | null;
  }
): Promise<TimeEntryRow> {
  const insert: TimeEntryInsert = {
    user_id: params.user_id,
    staff_accelo_id: params.staff_accelo_id,
    task_id: params.task_id,
    started_at: params.started_at,
    stopped_at: null,
    duration_seconds: 0,
    rounded_seconds: 0,
    billable: params.billable,
    rate_id: params.rate_id,
  };

  const { data, error } = await supabase
    .from("time_entries")
    .insert(insert)
    .select()
    .single();

  if (error) throw new Error(`createTimeEntry: ${error.message}`);
  return data;
}

/**
 * Stop a running time entry: set stopped_at, compute duration_seconds
 * from the difference between started_at and stopped_at, and compute
 * rounded_seconds using 6-minute billing increments.
 */
export async function stopTimeEntry(
  supabase: SupabaseClient<Database>,
  params: {
    id: number;
    user_id: string;
    stopped_at: string;
    description?: string;
  }
): Promise<TimeEntryRow> {
  // Fetch the entry to get started_at for duration calculation.
  // The subsequent UPDATE uses WHERE stopped_at IS NULL to prevent
  // double-stop races (if another request stops it first, this UPDATE
  // will affect 0 rows and we return a clean error).
  const { data: existing, error: fetchErr } = await supabase
    .from("time_entries")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", params.user_id)
    .is("stopped_at", null)
    .single();

  if (fetchErr || !existing) {
    throw new Error(
      fetchErr
        ? `stopTimeEntry fetch: ${fetchErr.message}`
        : `stopTimeEntry: no active entry found with id=${params.id}`
    );
  }

  const startedMs = new Date(existing.started_at).getTime();
  const stoppedMs = new Date(params.stopped_at).getTime();
  const durationSeconds = Math.max(0, Math.round((stoppedMs - startedMs) / 1000));
  const roundedSeconds = roundToIncrement(durationSeconds);

  const update: TimeEntryUpdate = {
    stopped_at: params.stopped_at,
    duration_seconds: durationSeconds,
    rounded_seconds: roundedSeconds,
  };
  if (params.description !== undefined) {
    update.description = params.description;
  }

  // Atomic: only update if still running (stopped_at IS NULL)
  const { data, error } = await supabase
    .from("time_entries")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", params.user_id)
    .is("stopped_at", null)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error(`stopTimeEntry: entry id=${params.id} was already stopped`);
    }
    throw new Error(`stopTimeEntry update: ${error.message}`);
  }
  return data;
}

/**
 * Return the currently running entry (stopped_at IS NULL) for a user.
 * There should be at most one; returns null if none is running.
 */
export async function getActiveEntry(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<TimeEntryRow | null> {
  const { data, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("user_id", userId)
    .is("stopped_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getActiveEntry: ${error.message}`);
  return data;
}

/**
 * Return recent entries for a user, ordered by created_at DESC.
 */
export async function getRecentEntries(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 20
): Promise<TimeEntryRow[]> {
  const { data, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentEntries: ${error.message}`);
  return data ?? [];
}

/**
 * Return completed entries for a user within a date range, ordered by
 * started_at DESC. Used by the time-log history page. Only returns
 * stopped entries (stopped_at IS NOT NULL).
 */
export async function getEntriesInRange(
  supabase: SupabaseClient<Database>,
  userId: string,
  from: string,
  to: string
): Promise<TimeEntryRow[]> {
  const { data, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("user_id", userId)
    .not("stopped_at", "is", null)
    .gte("started_at", from)
    .lte("started_at", to)
    .order("started_at", { ascending: false });

  if (error) throw new Error(`getEntriesInRange: ${error.message}`);
  return data ?? [];
}

/**
 * Partial update of a time entry. Ensures user_id matches to prevent
 * cross-user edits.
 */
export async function updateTimeEntry(
  supabase: SupabaseClient<Database>,
  params: {
    id: number;
    user_id: string;
    billable?: boolean;
    description?: string;
    rate_id?: number | null;
  }
): Promise<TimeEntryRow> {
  const update: TimeEntryUpdate = {};
  if (params.billable !== undefined) update.billable = params.billable;
  if (params.description !== undefined) update.description = params.description;
  if (params.rate_id !== undefined) update.rate_id = params.rate_id;

  const hasFields = params.billable !== undefined
    || params.description !== undefined
    || params.rate_id !== undefined;
  if (!hasFields) {
    throw new Error("updateTimeEntry: no fields to update");
  }

  const { data, error } = await supabase
    .from("time_entries")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", params.user_id)
    .select()
    .single();

  if (error) throw new Error(`updateTimeEntry: ${error.message}`);
  return data;
}

/**
 * Delete a time entry by id. Only allows deletion if the entry belongs to
 * the given user and has NOT been synced to Accelo (synced_to_accelo_at IS NULL).
 * Returns the deleted row.
 */
export async function deleteTimeEntry(
  supabase: SupabaseClient<Database>,
  params: { id: number; user_id: string }
): Promise<TimeEntryRow> {
  // Verify the entry exists, belongs to this user, and is not synced.
  const { data: existing, error: fetchErr } = await supabase
    .from("time_entries")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", params.user_id)
    .single();

  if (fetchErr || !existing) {
    throw new Error(
      fetchErr
        ? `deleteTimeEntry fetch: ${fetchErr.message}`
        : `deleteTimeEntry: no entry found with id=${params.id}`
    );
  }

  if (existing.synced_to_accelo_at) {
    throw new Error("deleteTimeEntry: cannot delete an entry that has been synced to Accelo");
  }

  const { error: deleteErr } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", params.id)
    .eq("user_id", params.user_id);

  if (deleteErr) throw new Error(`deleteTimeEntry delete: ${deleteErr.message}`);
  return existing;
}

/**
 * Safety stop: stop all running entries for a user. Used before starting
 * a new timer to prevent orphaned running entries.
 * Returns the number of entries stopped.
 */
export async function stopAllActive(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const now = new Date().toISOString();

  // Fetch all running entries for this user
  const { data: active, error: fetchErr } = await supabase
    .from("time_entries")
    .select("id, started_at")
    .eq("user_id", userId)
    .is("stopped_at", null);

  if (fetchErr) throw new Error(`stopAllActive fetch: ${fetchErr.message}`);
  if (!active || active.length === 0) return 0;

  // Stop each one with computed durations
  for (const entry of active) {
    const startedMs = new Date(entry.started_at).getTime();
    const stoppedMs = new Date(now).getTime();
    const durationSeconds = Math.max(0, Math.round((stoppedMs - startedMs) / 1000));
    const roundedSeconds = roundToIncrement(durationSeconds);

    const { error } = await supabase
      .from("time_entries")
      .update({
        stopped_at: now,
        duration_seconds: durationSeconds,
        rounded_seconds: roundedSeconds,
      })
      .eq("id", entry.id)
      .eq("user_id", userId);

    if (error) throw new Error(`stopAllActive update id=${entry.id}: ${error.message}`);
  }

  return active.length;
}

// Persists per-task timers in localStorage so elapsed time survives navigation.
// Only one task runs at a time; startTask() pauses any currently running one.

export type TimerEntry = {
  taskId: string;
  elapsed: number;       // accumulated seconds from all previous runs
  runSince: number | null; // Date.now() when the current run began; null = paused
};

const KEY = "sampson_timers";

export function readStore(): Record<string, TimerEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function write(store: Record<string, TimerEntry>): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

/** Start or resume a task. Pauses any currently running task first. */
export function startTask(taskId: string): Record<string, TimerEntry> {
  const store = readStore();
  // Pause everything currently running
  for (const entry of Object.values(store)) {
    if (entry.runSince !== null) {
      entry.elapsed += Math.floor((Date.now() - entry.runSince) / 1000);
      entry.runSince = null;
    }
  }
  // Start / resume this task
  if (!store[taskId]) {
    store[taskId] = { taskId, elapsed: 0, runSince: Date.now() };
  } else {
    store[taskId].runSince = Date.now();
  }
  write(store);
  return store;
}

/** Pause a task without removing it. */
export function pauseTask(taskId: string): Record<string, TimerEntry> {
  const store = readStore();
  const entry = store[taskId];
  if (entry && entry.runSince !== null) {
    entry.elapsed += Math.floor((Date.now() - entry.runSince) / 1000);
    entry.runSince = null;
  }
  write(store);
  return store;
}

/** Remove a task from the store (on complete or request-info). */
export function removeTask(taskId: string): Record<string, TimerEntry> {
  const store = readStore();
  delete store[taskId];
  write(store);
  return store;
}

/** Current live elapsed seconds for an entry. */
export function liveElapsed(entry: TimerEntry): number {
  return entry.runSince !== null
    ? entry.elapsed + Math.floor((Date.now() - entry.runSince) / 1000)
    : entry.elapsed;
}

/**
 * 6-minute billing increment rounding.
 * 360 seconds = 0.1 hours (industry standard for accounting).
 */
export function timerToHours(elapsedSeconds: number): number {
  const rounded = Math.ceil(elapsedSeconds / 360) * 360;
  return rounded / 3600;
}

export function formatBillingTime(elapsedSeconds: number): string {
  const hours = timerToHours(elapsedSeconds);
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Retry queue for failed Accelo writes ──────────────────────────────────────

export type PendingEntry = {
  accelo_task_id: number;
  elapsed_seconds: number;
  description: string;
  billable: boolean;
  queued_at: number;
};

const PENDING_KEY = "sampson_pending_entries";

export function getPendingEntries(): PendingEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addPendingEntry(entry: PendingEntry): void {
  const queue = getPendingEntries();
  queue.push(entry);
  localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
}

export function removePendingEntry(index: number): void {
  const queue = getPendingEntries();
  queue.splice(index, 1);
  localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
}

export function clearPendingEntries(): void {
  localStorage.removeItem(PENDING_KEY);
}

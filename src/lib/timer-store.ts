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

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  formatBillingTime,
  timerToHours,
  startTask as lsStartTask,
  pauseTask as lsPauseTask,
  removeTask as lsRemoveTask,
} from "@/lib/timer-store";

// ── Types ────────────────────────────────────────────────────────────────────

export type TimeEntry = {
  id: string;
  user_id: string;
  staff_accelo_id: number | null;
  task_id: number;
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number | null;
  rounded_seconds: number | null;
  billable: boolean;
  rate_id: string | null;
  description: string | null;
  synced_to_accelo_at: string | null;
  created_at: string;
};

type UseTimerReturn = {
  activeEntry: TimeEntry | null;
  elapsed: number;
  isRunning: boolean;
  startTimer: (taskId: number, billable?: boolean) => Promise<void>;
  stopTimer: (description?: string) => Promise<void>;
  updateEntry: (updates: { billable?: boolean; description?: string }) => Promise<void>;
  pendingConfirmation: TimeEntry | null;
  confirmEntry: () => void;
  discardEntry: () => Promise<void>;
  formattedTime: string;
  billingHours: number;
  isLoading: boolean;
  error: string | null;
};

// ── localStorage fallback key ────────────────────────────────────────────────

const FALLBACK_KEY = "sampson_timer_fallback";

type FallbackEntry = {
  task_id: number;
  started_at: string;
  billable: boolean;
};

function readFallback(): FallbackEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as FallbackEntry) : null;
  } catch {
    return null;
  }
}

function writeFallback(entry: FallbackEntry | null): void {
  if (entry) {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(entry));
  } else {
    localStorage.removeItem(FALLBACK_KEY);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabaseBrowser.auth.getSession();
  const token = session?.access_token;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function elapsedSince(isoStartedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(isoStartedAt).getTime()) / 1000));
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTimer(): UseTimerReturn {
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed]         = useState(0);
  const [isLoading, setIsLoading]     = useState(true); // H1: start true so buttons disabled until restore completes
  const [error, setError]             = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<TimeEntry | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeEntryRef = useRef(activeEntry);
  const sessionRef = useRef(0); // C3: monotonic counter to detect stale responses

  useEffect(() => {
    activeEntryRef.current = activeEntry;
  }, [activeEntry]);

  // ── Tick interval ────────────────────────────────────────────────────────

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (activeEntry) {
      setElapsed(elapsedSince(activeEntry.started_at));

      intervalRef.current = setInterval(() => {
        const entry = activeEntryRef.current;
        if (entry) {
          setElapsed(elapsedSince(entry.started_at));
        }
      }, 1000);
    } else {
      setElapsed(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeEntry]);

  // ── Restore on mount ─────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/time-entries/active", { headers });

        if (!res.ok) throw new Error(`GET /active failed: ${res.status}`);

        const data = await res.json();
        if (!cancelled && data.entry) {
          setActiveEntry(data.entry);
          writeFallback(null);
        }

        if (!cancelled && !data.entry) {
          const fallback = readFallback();
          if (fallback) {
            await reconcileFallback(fallback, cancelled);
          }
        }
      } catch {
        if (!cancelled) {
          const fallback = readFallback();
          if (fallback) {
            setActiveEntry({
              id: "__local__",
              user_id: "",
              staff_accelo_id: null,
              task_id: fallback.task_id,
              started_at: fallback.started_at,
              stopped_at: null,
              duration_seconds: null,
              rounded_seconds: null,
              billable: fallback.billable,
              rate_id: null,
              description: null,
              synced_to_accelo_at: null,
              created_at: fallback.started_at,
            } satisfies TimeEntry);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    restore();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reconcile a localStorage fallback with the server ─────────────────────
  // C1 fix: pass the original started_at to the server so duration is correct

  async function reconcileFallback(fallback: FallbackEntry, cancelled: boolean) {
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/time-entries/start", {
        method: "POST",
        headers,
        body: JSON.stringify({
          task_id: fallback.task_id,
          billable: fallback.billable,
          started_at: fallback.started_at, // C1: server records the real start time
        }),
      });
      if (!res.ok) return;

      const data = await res.json();
      if (!cancelled) {
        setActiveEntry(data.entry);
      }
      writeFallback(null);
      lsRemoveTask(String(fallback.task_id));
    } catch {
      // Still offline — keep fallback.
    }
  }

  // ── startTimer ────────────────────────────────────────────────────────────

  const startTimer = useCallback(async (taskId: number, billable = true) => {
    const now = new Date().toISOString();
    const thisSession = ++sessionRef.current; // C3: capture session counter

    const optimisticEntry: TimeEntry = {
      id: "__pending__",
      user_id: "",
      staff_accelo_id: null,
      task_id: taskId,
      started_at: now,
      stopped_at: null,
      duration_seconds: null,
      rounded_seconds: null,
      billable,
      rate_id: null,
      description: null,
      synced_to_accelo_at: null,
      created_at: now,
    };

    setActiveEntry(optimisticEntry);
    setError(null);
    setIsLoading(true);

    try {
      const headers = await authHeaders();
      const res = await fetch("/api/time-entries/start", {
        method: "POST",
        headers,
        body: JSON.stringify({ task_id: taskId, billable }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `POST /start failed: ${res.status}`);
      }

      const data = await res.json();

      // C3: only update state if no newer action has fired
      if (sessionRef.current === thisSession) {
        setActiveEntry(data.entry);
      }

      writeFallback(null);
      lsRemoveTask(String(taskId));
    } catch (err) {
      // Network failure — fall back to localStorage.
      lsStartTask(String(taskId));
      writeFallback({ task_id: taskId, started_at: now, billable });
      // Keep the optimistic entry so the UI still works.
      setError(err instanceof Error ? err.message : "Failed to start timer");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── stopTimer ─────────────────────────────────────────────────────────────

  const stopTimer = useCallback(async (description?: string) => {
    const stoppingEntry = activeEntryRef.current;
    if (!stoppingEntry) return;

    ++sessionRef.current; // C3: invalidate any in-flight start responses

    setActiveEntry(null);
    setError(null);
    setIsLoading(true);

    try {
      const headers = await authHeaders();

      // C2 fix: for local-only entries, preserve time in localStorage pending queue
      if (stoppingEntry.id === "__local__" || stoppingEntry.id === "__pending__") {
        const elapsedMs = Date.now() - new Date(stoppingEntry.started_at).getTime();
        const elapsedSec = Math.max(0, Math.round(elapsedMs / 1000));
        if (elapsedSec > 0) {
          // Ensure the timer-store has the task so pauseTask captures elapsed
          lsStartTask(String(stoppingEntry.task_id));
          lsPauseTask(String(stoppingEntry.task_id));
        }
        writeFallback(null);
        return;
      }

      const res = await fetch("/api/time-entries/stop", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: stoppingEntry.id, description }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `POST /stop failed: ${res.status}`);
      }

      const data = await res.json();
      const stoppedEntry = data.entry as TimeEntry;

      // If the entry is very short (< 60s), prompt for confirmation
      if (stoppedEntry.duration_seconds !== null && stoppedEntry.duration_seconds < 60) {
        setPendingConfirmation(stoppedEntry);
      }

      writeFallback(null);
      lsRemoveTask(String(stoppingEntry.task_id));
    } catch (err) {
      lsPauseTask(String(stoppingEntry.task_id));
      setError(err instanceof Error ? err.message : "Failed to stop timer");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── updateEntry ───────────────────────────────────────────────────────────

  const updateEntry = useCallback(async (updates: { billable?: boolean; description?: string }) => {
    const current = activeEntryRef.current;
    if (!current || current.id.startsWith("__")) return;

    const optimistic = { ...current, ...updates };
    setActiveEntry(optimistic);
    setError(null);

    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/time-entries/${current.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `PATCH failed: ${res.status}`);
      }

      const data = await res.json();
      if (activeEntryRef.current?.id === current.id) {
        setActiveEntry(data.entry);
      }
    } catch (err) {
      if (activeEntryRef.current?.id === optimistic.id) {
        setActiveEntry(current);
      }
      setError(err instanceof Error ? err.message : "Failed to update entry");
    }
  }, []);

  // ── confirmEntry ───────────────────────────────────────────────────────────

  const confirmEntry = useCallback(() => {
    setPendingConfirmation(null);
  }, []);

  // ── discardEntry ──────────────────────────────────────────────────────────

  const discardEntry = useCallback(async () => {
    const entry = pendingConfirmation;
    if (!entry || entry.id.startsWith("__")) {
      setPendingConfirmation(null);
      return;
    }

    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/time-entries/${entry.id}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `DELETE failed: ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discard entry");
    } finally {
      setPendingConfirmation(null);
    }
  }, [pendingConfirmation]);

  // ── Derived values ────────────────────────────────────────────────────────

  const isRunning     = activeEntry !== null;
  const formattedTime = formatBillingTime(elapsed);
  const billingHours  = timerToHours(elapsed);

  return {
    activeEntry,
    elapsed,
    isRunning,
    startTimer,
    stopTimer,
    updateEntry,
    pendingConfirmation,
    confirmEntry,
    discardEntry,
    formattedTime,
    billingHours,
    isLoading,
    error,
  };
}

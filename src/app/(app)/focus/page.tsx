"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { tasks as baseTasks } from "@/lib/data";
import type { Task } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, SkipForward, Mail, ArrowLeft, Play } from "lucide-react";
import {
  startTask,
  pauseTask,
  removeTask,
  readStore,
  liveElapsed,
} from "@/lib/timer-store";
import type { TimerEntry } from "@/lib/timer-store";

// ── Shared task pool (mirrors dashboard) ─────────────────────────────────────

const EXTRA_TASKS: Task[] = [
  { id: "t13", title: "Bank Rec — January", client: "OES", assignee: "Gio", category: "Bank & CC Rec's", priority: "medium", status: "todo", dueDate: "2026-02-27", estimatedHours: 3, loggedHours: 0, recurring: true },
  { id: "t14", title: "Q4 Sales Tax", client: "Elan", assignee: "Gio", category: "Sales Tax", priority: "low", status: "todo", dueDate: "2026-03-10", estimatedHours: 2, loggedHours: 0, recurring: false },
  { id: "t15", title: "AP Review — February", client: "Monda", assignee: "Faizan", category: "AP & AR", priority: "medium", status: "todo", dueDate: "2026-02-26", estimatedHours: 2, loggedHours: 0, recurring: true },
  { id: "t16", title: "Monthly Close", client: "OBI", assignee: "Mitch", category: "Bookkeeping", priority: "high", status: "todo", dueDate: "2026-02-25", estimatedHours: 5, loggedHours: 1, recurring: true },
  { id: "t17", title: "Payroll — March 1", client: "WWB", assignee: "Jordea", category: "Payroll", priority: "high", status: "todo", dueDate: "2026-02-28", estimatedHours: 3, loggedHours: 0, recurring: true },
];

const allTasks: Task[] = [...baseTasks, ...EXTRA_TASKS];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatHours(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = seconds / 3600;
  if (h < 0.1) return `${Math.ceil(seconds / 60)}m`;
  return `${h.toFixed(1)}h`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr).getTime() - today.getTime()) / 86400000
  );
}

function dueLabel(dateStr: string): string {
  const d = daysUntil(dateStr);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d}d`;
}

// ── Session states ────────────────────────────────────────────────────────────

type SessionState = "active" | "complete" | "blocked";

// ── Inner component (uses useSearchParams) ────────────────────────────────────

function FocusSession() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const taskId = searchParams.get("task");
  const task = taskId ? allTasks.find((t) => t.id === taskId) ?? null : null;

  const [elapsed, setElapsed] = useState(0);
  const [sessionState, setSessionState] = useState<SessionState>("active");
  const [store, setStore] = useState<Record<string, TimerEntry>>({});
  const finalElapsedRef = useRef(0); // captures elapsed at complete/blocked time
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Start this task on mount (pauses any other running task)
  useEffect(() => {
    if (!taskId) return;

    startTask(taskId);

    const tick = () => {
      const s = readStore();
      setStore(s);
      const entry = s[taskId];
      if (entry) setElapsed(liveElapsed(entry));
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [taskId]);

  function handleComplete() {
    clearInterval(intervalRef.current);
    finalElapsedRef.current = elapsed;
    if (taskId) removeTask(taskId);
    setSessionState("complete");
  }

  function handleBlocked() {
    clearInterval(intervalRef.current);
    finalElapsedRef.current = elapsed;
    if (taskId) removeTask(taskId);
    setSessionState("blocked");
  }

  function handleSkip() {
    clearInterval(intervalRef.current);
    if (taskId) pauseTask(taskId);
    router.push("/");
  }

  function handleSwitch(otherId: string) {
    // Navigate — the new page's mount will call startTask(otherId),
    // which automatically pauses the current task.
    clearInterval(intervalRef.current);
    router.push(`/focus?task=${otherId}`);
  }

  // ── No task found ──────────────────────────────────────────────────────────

  if (!task) {
    return (
      <div
        className="-mx-6 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6"
        style={{ backgroundColor: "#1B3D21" }}
      >
        <p className="text-white/60">No task selected.</p>
        <Button
          variant="ghost"
          onClick={() => router.push("/")}
          className="text-white/70 hover:text-white cursor-pointer"
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const finalElapsed = finalElapsedRef.current;
  const totalLogged = task.loggedHours + elapsed / 3600;
  const progressPct =
    task.estimatedHours > 0
      ? Math.min(Math.round((totalLogged / task.estimatedHours) * 100), 100)
      : 0;
  const d = daysUntil(task.dueDate);
  const isUrgent = d <= 0;

  // Other tasks that are paused in the store (not the current one)
  const pausedTasks = Object.values(store).filter(
    (e) => e.taskId !== taskId
  );

  // ── Completion screen ──────────────────────────────────────────────────────

  if (sessionState === "complete") {
    return (
      <div
        className="-mx-6 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-10 px-6"
        style={{ backgroundColor: "#1B3D21" }}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-14" style={{ color: "#C39749" }} />
          <h1
            className="text-3xl font-semibold text-white"
            style={{
              fontFamily:
                '"Big Caslon", "Book Antiqua", "Palatino Linotype", Georgia, serif',
            }}
          >
            Task Complete
          </h1>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.55)" }}>
            {task.title}
          </p>
        </div>

        {/* Stats */}
        <div
          className="flex items-center gap-8 rounded-2xl px-10 py-6"
          style={{ backgroundColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="flex flex-col items-center gap-1">
            <span
              className="text-4xl font-bold tabular-nums"
              style={{ color: "#C39749", fontFamily: "var(--font-geist-mono)" }}
            >
              {formatHours(finalElapsed)}
            </span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
              time tracked
            </span>
          </div>
          <div className="h-10 w-px" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
          <div className="flex flex-col items-center gap-1">
            <span className="text-4xl font-bold tabular-nums text-white">
              {(task.loggedHours + finalElapsed / 3600).toFixed(1)}h
            </span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
              total logged
            </span>
          </div>
          <div className="h-10 w-px" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
          <div className="flex flex-col items-center gap-1">
            <span
              className="text-4xl font-bold tabular-nums"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              {task.estimatedHours}h
            </span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
              estimated
            </span>
          </div>
        </div>

        <Button
          onClick={() => router.push("/")}
          size="lg"
          className="cursor-pointer px-10 font-semibold"
          style={{ backgroundColor: "#C39749", color: "#1B3D21" }}
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // ── Blocked / info requested screen ───────────────────────────────────────

  if (sessionState === "blocked") {
    return (
      <div
        className="-mx-6 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-8 px-6"
        style={{ backgroundColor: "#1B3D21" }}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <Mail className="size-14" style={{ color: "#C39749" }} />
          <h1
            className="text-3xl font-semibold text-white"
            style={{
              fontFamily:
                '"Big Caslon", "Book Antiqua", "Palatino Linotype", Georgia, serif',
            }}
          >
            Info Requested
          </h1>
          <p
            className="max-w-xs text-sm leading-relaxed"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {formatHours(finalElapsed)} logged. Task moved to Waiting on Client —
            it&apos;ll resurface when they reply.
          </p>
        </div>

        <Button
          onClick={() => router.push("/")}
          size="lg"
          className="cursor-pointer px-10 font-semibold"
          style={{ backgroundColor: "#C39749", color: "#1B3D21" }}
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // ── Active focus screen ────────────────────────────────────────────────────

  return (
    <div
      className="-mx-6 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col"
      style={{ backgroundColor: "#1B3D21" }}
    >
      {/* Back */}
      <div className="px-8 pt-6">
        <button
          onClick={handleSkip}
          className="flex cursor-pointer items-center gap-1.5 text-sm opacity-40 transition-opacity hover:opacity-70"
          style={{ color: "white" }}
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
      </div>

      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6">
        {/* Metadata badges */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Badge
            className="text-xs font-medium"
            style={{
              backgroundColor: "rgba(195,151,73,0.15)",
              color: "#C39749",
              border: "1px solid rgba(195,151,73,0.3)",
            }}
          >
            {task.client}
          </Badge>
          <Badge
            variant="outline"
            className="text-xs font-normal"
            style={{
              color: "rgba(255,255,255,0.45)",
              borderColor: "rgba(255,255,255,0.15)",
            }}
          >
            {task.category}
          </Badge>
          <span
            className="text-xs font-medium"
            style={{ color: isUrgent ? "#ef4444" : "rgba(255,255,255,0.35)" }}
          >
            {dueLabel(task.dueDate)}
          </span>
        </div>

        {/* Task title */}
        <h1
          className="max-w-2xl text-center text-4xl font-semibold leading-snug text-white"
          style={{
            fontFamily:
              '"Big Caslon", "Book Antiqua", "Palatino Linotype", Georgia, serif',
          }}
        >
          {task.title}
        </h1>

        {/* Timer */}
        <div className="flex flex-col items-center gap-2">
          <span
            className="text-7xl font-bold tabular-nums tracking-tight"
            style={{
              color: "#C39749",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            {formatTimer(elapsed)}
          </span>
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            time tracked
          </span>
        </div>

        {/* Progress */}
        <div className="w-full max-w-sm space-y-2">
          <div
            className="flex items-center justify-between text-xs"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <span>{totalLogged.toFixed(1)}h logged</span>
            <span>{task.estimatedHours}h estimated</span>
          </div>
          <div
            className="h-1 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${progressPct}%`, backgroundColor: "#C39749" }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            onClick={handleComplete}
            size="lg"
            className="cursor-pointer gap-2 px-10 text-base font-semibold"
            style={{ backgroundColor: "#C39749", color: "#1B3D21" }}
          >
            <CheckCircle2 className="size-5" />
            Mark Complete
          </Button>
          <Button
            onClick={handleBlocked}
            size="lg"
            className="cursor-pointer gap-2"
            style={{
              backgroundColor: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "rgba(255,255,255,0.65)",
            }}
          >
            <Mail className="size-4" />
            Request Info
          </Button>
          <Button
            onClick={handleSkip}
            variant="ghost"
            size="sm"
            className="cursor-pointer gap-1.5"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Pause <SkipForward className="size-3.5" />
          </Button>
        </div>

        {/* Paused tasks */}
        {pausedTasks.length > 0 && (
          <div className="w-full max-w-sm space-y-2">
            <p
              className="text-center text-[10px] uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              {pausedTasks.length} task{pausedTasks.length !== 1 ? "s" : ""} paused
            </p>
            <div className="space-y-1.5">
              {pausedTasks.map((entry) => {
                const t = allTasks.find((x) => x.id === entry.taskId);
                if (!t) return null;
                return (
                  <button
                    key={entry.taskId}
                    onClick={() => handleSwitch(entry.taskId)}
                    className="flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-left transition-colors"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)")
                    }
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>
                        {t.title}
                      </p>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {t.client}
                      </p>
                    </div>
                    <div className="ml-4 flex shrink-0 items-center gap-2">
                      <span
                        className="tabular-nums text-xs"
                        style={{ color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-geist-mono)" }}
                      >
                        {formatTimer(liveElapsed(entry))}
                      </span>
                      <Play className="size-3" style={{ color: "rgba(255,255,255,0.35)" }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Brand mark */}
      <div className="flex justify-center pb-8 opacity-[0.08]">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="#C39749">
          <path d="M12 2 L13.53 8.3 L17.66 6.34 L15.7 10.47 L22 12 L15.7 13.53 L17.66 17.66 L13.53 15.7 L12 22 L10.47 15.7 L6.34 17.66 L8.3 13.53 L2 12 L8.3 10.47 L6.34 6.34 L10.47 8.3 Z" />
        </svg>
      </div>
    </div>
  );
}

// ── Export wrapped in Suspense (required for useSearchParams) ─────────────────

export default function FocusPage() {
  return (
    <Suspense
      fallback={
        <div
          className="-mx-6 -my-6 min-h-[calc(100dvh-4rem)]"
          style={{ backgroundColor: "#1B3D21" }}
        />
      }
    >
      <FocusSession />
    </Suspense>
  );
}

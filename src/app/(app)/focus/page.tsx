"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, SkipForward, Mail, ArrowLeft, Play, Loader2 } from "lucide-react";
import {
  startTask,
  pauseTask,
  removeTask,
  readStore,
  liveElapsed,
  timerToHours,
  formatBillingTime,
  addPendingEntry,
  getPendingEntries,
} from "@/lib/timer-store";
import type { TimerEntry } from "@/lib/timer-store";
import { supabaseBrowser } from "@/lib/supabase-browser";

type TaskData = {
  accelo_id: number;
  title: string;
  client: string;
  category: string;
  due_date: string | null;
  estimated_hours: number;
  logged_hours: number;
};

async function fetchTask(acceloId: number): Promise<TaskData | null> {
  const { data: t } = await supabaseBrowser
    .from("tasks")
    .select("accelo_id, title, company_id, due_date, budgeted, logged")
    .eq("accelo_id", acceloId)
    .single();

  if (!t) return null;

  const { data: company } = await supabaseBrowser
    .from("companies")
    .select("name")
    .eq("accelo_id", t.company_id)
    .single();

  return {
    accelo_id: t.accelo_id,
    title: t.title,
    client: company?.name ?? "",
    category: "",
    due_date: t.due_date,
    estimated_hours: (t.budgeted ?? 0) / 3600,
    logged_hours: (t.logged ?? 0) / 3600,
  };
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatHours(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = seconds / 3600;
  if (h < 0.1) return `${Math.ceil(seconds / 60)}m`;
  return `${h.toFixed(1)}h`;
}

function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
}

function dueLabel(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = daysUntil(dateStr);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d}d`;
}

type SessionState = "active" | "confirming" | "submitting" | "complete" | "blocked";

function FocusSession() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const taskIdStr = searchParams.get("task");
  const taskId = taskIdStr ?? null;

  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [sessionState, setSessionState] = useState<SessionState>("active");
  const [store, setStore] = useState<Record<string, TimerEntry>>({});
  const finalElapsedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Confirmation dialog state
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [markDone, setMarkDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load task from Supabase
  useEffect(() => {
    if (!taskId) { setLoading(false); return; }
    const numId = parseInt(taskId, 10);
    if (isNaN(numId)) { setLoading(false); return; }
    fetchTask(numId).then((t) => { setTask(t); setLoading(false); });
  }, [taskId]);

  // Start timer
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

  const resumeTimer = useCallback(() => {
    if (!taskId) return;
    setSessionState("active");
    startTask(taskId);
    intervalRef.current = setInterval(() => {
      const s = readStore();
      setStore(s);
      const entry = s[taskId];
      if (entry) setElapsed(liveElapsed(entry));
    }, 1000);
  }, [taskId]);

  const handleComplete = useCallback(() => {
    clearInterval(intervalRef.current);
    finalElapsedRef.current = elapsed;
    if (taskId) pauseTask(taskId);
    setSessionState("confirming");
  }, [elapsed, taskId]);

  const handleConfirmSubmit = useCallback(async () => {
    if (!task || !taskId) return;
    const billingHours = timerToHours(finalElapsedRef.current);
    if (billingHours === 0) {
      setSubmitError("Duration rounds to zero — work at least 6 minutes before submitting.");
      return;
    }
    setSessionState("submitting");
    setSubmitError(null);

    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch("/api/activities/post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          accelo_task_id: task.accelo_id,
          elapsed_seconds: finalElapsedRef.current,
          description: description || undefined,
          billable,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed (${res.status})`);
      }

      // Mark task done in Accelo if requested
      if (markDone) {
        await fetch(`/api/tasks/${task.accelo_id}/status`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ status_id: 5 }),
        }).catch(() => {}); // non-critical
      }

      removeTask(taskId);
      setSessionState("complete");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setSubmitError(message);
      // Only queue if not already queued for this task in this session
      const existing = getPendingEntries();
      const alreadyQueued = existing.some((e) => e.accelo_task_id === task.accelo_id && Math.abs(e.elapsed_seconds - finalElapsedRef.current) < 60);
      if (!alreadyQueued) {
        addPendingEntry({
          accelo_task_id: task.accelo_id,
          elapsed_seconds: finalElapsedRef.current,
          description: description || "Time entry",
          billable,
          queued_at: Date.now(),
        });
      }
      setSessionState("confirming");
    }
  }, [task, taskId, description, billable, markDone]);

  function handleBlocked() {
    clearInterval(intervalRef.current);
    finalElapsedRef.current = elapsed;
    // Preserve time in retry queue so it's not silently lost
    if (task && timerToHours(elapsed) > 0) {
      addPendingEntry({
        accelo_task_id: task.accelo_id,
        elapsed_seconds: elapsed,
        description: "Time entry (info requested)",
        billable: true,
        queued_at: Date.now(),
      });
    }
    if (taskId) removeTask(taskId);
    setSessionState("blocked");
  }

  function handleSkip() {
    clearInterval(intervalRef.current);
    if (taskId) pauseTask(taskId);
    router.push("/");
  }

  function handleSwitch(otherId: string) {
    clearInterval(intervalRef.current);
    router.push(`/focus?task=${otherId}`);
  }

  // Loading state
  if (loading) {
    return (
      <div className="-mx-6 -my-6 flex min-h-[calc(100dvh-4rem)] items-center justify-center" style={{ backgroundColor: "#1B3D21" }}>
        <Loader2 className="size-8 animate-spin text-white/40" />
      </div>
    );
  }

  // No task
  if (!task) {
    return (
      <div className="-mx-6 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6" style={{ backgroundColor: "#1B3D21" }}>
        <p className="text-white/60">Task not found.</p>
        <Button variant="ghost" onClick={() => router.push("/")} className="text-white/70 hover:text-white cursor-pointer">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const finalElapsed = finalElapsedRef.current;
  const totalLogged = task.logged_hours + elapsed / 3600;
  const progressPct = task.estimated_hours > 0 ? Math.min(Math.round((totalLogged / task.estimated_hours) * 100), 100) : 0;
  const isUrgent = daysUntil(task.due_date) <= 0;
  const pausedTasks = Object.values(store).filter((e) => e.taskId !== taskId);

  // Complete screen
  if (sessionState === "complete") {
    return (
      <div className="-mx-6 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-10 px-6" style={{ backgroundColor: "#1B3D21" }}>
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-14" style={{ color: "#C39749" }} />
          <h1 className="text-3xl font-semibold text-white" style={{ fontFamily: '"Big Caslon", "Book Antiqua", "Palatino Linotype", Georgia, serif' }}>
            Time Logged
          </h1>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.55)" }}>{task.title}</p>
        </div>
        <div className="flex items-center gap-8 rounded-2xl px-10 py-6" style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex flex-col items-center gap-1">
            <span className="text-4xl font-bold tabular-nums" style={{ color: "#C39749", fontFamily: "var(--font-geist-mono)" }}>
              {formatBillingTime(finalElapsed)}
            </span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>billed</span>
          </div>
          <div className="h-10 w-px" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
          <div className="flex flex-col items-center gap-1">
            <span className="text-4xl font-bold tabular-nums text-white">{timerToHours(finalElapsed).toFixed(1)}h</span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>decimal</span>
          </div>
        </div>
        <Button onClick={() => router.push("/")} size="lg" className="cursor-pointer px-10 font-semibold" style={{ backgroundColor: "#C39749", color: "#1B3D21" }}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // Blocked screen
  if (sessionState === "blocked") {
    return (
      <div className="-mx-6 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-8 px-6" style={{ backgroundColor: "#1B3D21" }}>
        <div className="flex flex-col items-center gap-4 text-center">
          <Mail className="size-14" style={{ color: "#C39749" }} />
          <h1 className="text-3xl font-semibold text-white" style={{ fontFamily: '"Big Caslon", "Book Antiqua", "Palatino Linotype", Georgia, serif' }}>
            Info Requested
          </h1>
          <p className="max-w-xs text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
            {formatHours(finalElapsed)} logged. Task moved to Waiting on Client.
          </p>
        </div>
        <Button onClick={() => router.push("/")} size="lg" className="cursor-pointer px-10 font-semibold" style={{ backgroundColor: "#C39749", color: "#1B3D21" }}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // Active focus screen
  return (
    <div className="-mx-6 -my-6 flex min-h-[calc(100dvh-4rem)] flex-col" style={{ backgroundColor: "#1B3D21" }}>
      <div className="px-8 pt-6">
        <button onClick={handleSkip} className="flex cursor-pointer items-center gap-1.5 text-sm opacity-40 transition-opacity hover:opacity-70" style={{ color: "white" }}>
          <ArrowLeft className="size-4" /> Back
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Badge className="text-xs font-medium" style={{ backgroundColor: "rgba(195,151,73,0.15)", color: "#C39749", border: "1px solid rgba(195,151,73,0.3)" }}>
            {task.client}
          </Badge>
          {task.category && (
            <Badge variant="outline" className="text-xs font-normal" style={{ color: "rgba(255,255,255,0.45)", borderColor: "rgba(255,255,255,0.15)" }}>
              {task.category}
            </Badge>
          )}
          {task.due_date && (
            <span className="text-xs font-medium" style={{ color: isUrgent ? "#ef4444" : "rgba(255,255,255,0.35)" }}>
              {dueLabel(task.due_date)}
            </span>
          )}
        </div>

        <h1 className="max-w-2xl text-center text-4xl font-semibold leading-snug text-white" style={{ fontFamily: '"Big Caslon", "Book Antiqua", "Palatino Linotype", Georgia, serif' }}>
          {task.title}
        </h1>

        <div className="flex flex-col items-center gap-2">
          <span className="text-7xl font-bold tabular-nums tracking-tight" style={{ color: "#C39749", fontFamily: "var(--font-geist-mono)" }}>
            {formatTimer(elapsed)}
          </span>
          <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>time tracked</span>
        </div>

        {task.estimated_hours > 0 && (
          <div className="w-full max-w-sm space-y-2">
            <div className="flex items-center justify-between text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              <span>{totalLogged.toFixed(1)}h logged</span>
              <span>{task.estimated_hours}h estimated</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progressPct}%`, backgroundColor: "#C39749" }} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button onClick={handleComplete} size="lg" className="cursor-pointer gap-2 px-10 text-base font-semibold" style={{ backgroundColor: "#C39749", color: "#1B3D21" }}>
            <CheckCircle2 className="size-5" /> Mark Complete
          </Button>
          <Button onClick={handleBlocked} size="lg" className="cursor-pointer gap-2" style={{ backgroundColor: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.65)" }}>
            <Mail className="size-4" /> Request Info
          </Button>
          <Button onClick={handleSkip} variant="ghost" size="sm" className="cursor-pointer gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            Pause <SkipForward className="size-3.5" />
          </Button>
        </div>

        {pausedTasks.length > 0 && (
          <div className="w-full max-w-sm space-y-2">
            <p className="text-center text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
              {pausedTasks.length} task{pausedTasks.length !== 1 ? "s" : ""} paused
            </p>
            <div className="space-y-1.5">
              {pausedTasks.map((entry) => (
                <button key={entry.taskId} onClick={() => handleSwitch(entry.taskId)} className="flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-left transition-colors" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <p className="truncate text-sm font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>Task #{entry.taskId}</p>
                  <span className="tabular-nums text-xs" style={{ color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-geist-mono)" }}>
                    {formatTimer(liveElapsed(entry))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={sessionState === "confirming" || sessionState === "submitting"} onOpenChange={(open) => { if (!open && sessionState === "confirming") { resumeTimer(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Time Entry</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{task.title} · {task.client}</p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Billable Time</p>
                <p className="text-xs text-muted-foreground">Rounded to nearest 6 minutes</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums">{formatBillingTime(finalElapsed)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{timerToHours(finalElapsed).toFixed(1)}h · raw {formatTimer(finalElapsed)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description <span className="font-normal text-muted-foreground">(appears on invoice)</span></label>
              <Input placeholder="e.g. Reconciled January bank statements" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="rounded" />
                Billable
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} className="rounded" />
                Also mark task as Done
              </label>
            </div>

            {submitError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{submitError}</p>
                <p className="text-xs text-red-500 mt-1">Entry queued for retry — it won&apos;t be lost.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resumeTimer} disabled={sessionState === "submitting"}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSubmit} disabled={sessionState === "submitting" || timerToHours(finalElapsed) === 0} className="gap-2">
              {sessionState === "submitting" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {sessionState === "submitting" ? "Posting..." : "Log Time"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-center pb-8 opacity-[0.08]">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="#C39749">
          <path d="M12 2 L13.53 8.3 L17.66 6.34 L15.7 10.47 L22 12 L15.7 13.53 L17.66 17.66 L13.53 15.7 L12 22 L10.47 15.7 L6.34 17.66 L8.3 13.53 L2 12 L8.3 10.47 L6.34 6.34 L10.47 8.3 Z" />
        </svg>
      </div>
    </div>
  );
}

export default function FocusPage() {
  return (
    <Suspense fallback={<div className="-mx-6 -my-6 min-h-[calc(100dvh-4rem)]" style={{ backgroundColor: "#1B3D21" }} />}>
      <FocusSession />
    </Suspense>
  );
}

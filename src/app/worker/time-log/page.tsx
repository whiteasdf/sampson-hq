"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getEntriesInRange } from "@/lib/queries/time-entries";
import type { Database } from "@/lib/database.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2, Clock, XCircle, Pencil, Calendar,
  RefreshCw, DollarSign, FileText, ExternalLink,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type TimeEntryRow = Database["public"]["Tables"]["time_entries"]["Row"];

type TaskInfo = {
  id: number;
  title: string;
  company_name: string | null;
};

type DatePreset = "today" | "this-week" | "this-month" | "custom";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1);
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const entryDate = new Date(d);
  entryDate.setHours(0, 0, 0, 0);

  if (entryDate.getTime() === today.getTime()) return "Today";
  if (entryDate.getTime() === yesterday.getTime()) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dateToKey(isoStr: string): string {
  return isoStr.slice(0, 10);
}

function getPresetRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today": {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return {
        from: today.toISOString(),
        to: tomorrow.toISOString(),
      };
    }
    case "this-week": {
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dow + 6) % 7));
      const nextMonday = new Date(monday);
      nextMonday.setDate(monday.getDate() + 7);
      return {
        from: monday.toISOString(),
        to: nextMonday.toISOString(),
      };
    }
    case "this-month": {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return {
        from: firstOfMonth.toISOString(),
        to: firstOfNext.toISOString(),
      };
    }
    default:
      return { from: today.toISOString(), to: today.toISOString() };
  }
}

function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Sync status helpers ──────────────────────────────────────────────────────

type SyncStatus = "synced" | "pending" | "failed";

function getSyncStatus(entry: TimeEntryRow): SyncStatus {
  if (entry.synced_to_accelo_at) return "synced";
  // No explicit failed flag in the schema; we infer "pending" for unsynced.
  // Could cross-reference sync_failures table, but for UI simplicity we
  // treat all unsynced entries as pending.
  return "pending";
}

function SyncIcon({ status }: { status: SyncStatus }) {
  switch (status) {
    case "synced":
      return <CheckCircle2 className="size-4 text-emerald-500" />;
    case "pending":
      return <Clock className="size-4 text-amber-500" />;
    case "failed":
      return <XCircle className="size-4 text-red-500" />;
  }
}

function syncLabel(status: SyncStatus): string {
  switch (status) {
    case "synced":  return "Synced to Accelo";
    case "pending": return "Pending sync";
    case "failed":  return "Sync failed";
  }
}

// ── Auth helper (same pattern as use-timer.ts) ──────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabaseBrowser.auth.getSession();
  const token = session?.access_token;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TimeLogPage() {
  const [entries, setEntries]       = useState<TimeEntryRow[]>([]);
  const [taskMap, setTaskMap]       = useState<Map<number, TaskInfo>>(new Map());
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Date filter state
  const [preset, setPreset]         = useState<DatePreset>("this-week");
  const [customFrom, setCustomFrom] = useState(toLocalDateInput(new Date()));
  const [customTo, setCustomTo]     = useState(toLocalDateInput(new Date()));

  // Edit dialog state
  const [editingEntry, setEditingEntry] = useState<TimeEntryRow | null>(null);
  const [editBillable, setEditBillable] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving]     = useState(false);

  // ── Compute date range ──────────────────────────────────────────────────

  const dateRange = useMemo(() => {
    if (preset === "custom") {
      const from = new Date(customFrom);
      const to = new Date(customTo);
      to.setDate(to.getDate() + 1); // include end date fully
      return { from: from.toISOString(), to: to.toISOString() };
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  // ── Fetch entries ───────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) {
        setError("Not authenticated");
        return;
      }

      const rows = await getEntriesInRange(
        supabaseBrowser,
        user.id,
        dateRange.from,
        dateRange.to
      );
      setEntries(rows);

      // Resolve task titles and company names
      const taskIds = [...new Set(rows.map((r) => r.task_id))];
      if (taskIds.length > 0) {
        const { data: tasks } = await supabaseBrowser
          .from("tasks")
          .select("id, title, company_id")
          .in("id", taskIds);

        if (tasks && tasks.length > 0) {
          const companyIds = [...new Set(tasks.map((t) => t.company_id).filter(Boolean))] as number[];
          let companyMap = new Map<number, string>();

          if (companyIds.length > 0) {
            const { data: companies } = await supabaseBrowser
              .from("companies")
              .select("accelo_id, name")
              .in("accelo_id", companyIds);
            companyMap = new Map((companies ?? []).map((c) => [c.accelo_id, c.name]));
          }

          const map = new Map<number, TaskInfo>();
          for (const t of tasks) {
            map.set(t.id, {
              id: t.id,
              title: t.title,
              company_name: t.company_id ? companyMap.get(t.company_id) ?? null : null,
            });
          }
          setTaskMap(map);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entries");
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // ── Group entries by date ───────────────────────────────────────────────

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, TimeEntryRow[]>();
    for (const entry of entries) {
      const key = dateToKey(entry.started_at);
      const existing = groups.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }
    return groups;
  }, [entries]);

  // ── Summary calculations ────────────────────────────────────────────────

  const summary = useMemo(() => {
    let totalSeconds = 0;
    let billableSeconds = 0;
    let nonBillableSeconds = 0;
    let entryCount = 0;

    for (const entry of entries) {
      const dur = entry.rounded_seconds || entry.duration_seconds;
      totalSeconds += dur;
      if (entry.billable) {
        billableSeconds += dur;
      } else {
        nonBillableSeconds += dur;
      }
      entryCount++;
    }

    return { totalSeconds, billableSeconds, nonBillableSeconds, entryCount };
  }, [entries]);

  // Weekly totals (when viewing this-week or this-month)
  const weeklyTotals = useMemo(() => {
    if (preset === "today") return null;

    const weekMap = new Map<string, { billable: number; nonBillable: number }>();
    for (const entry of entries) {
      const d = new Date(entry.started_at);
      const dow = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((dow + 6) % 7));
      const weekKey = toLocalDateInput(monday);

      const existing = weekMap.get(weekKey) ?? { billable: 0, nonBillable: 0 };
      const dur = entry.rounded_seconds || entry.duration_seconds;
      if (entry.billable) {
        existing.billable += dur;
      } else {
        existing.nonBillable += dur;
      }
      weekMap.set(weekKey, existing);
    }

    return weekMap;
  }, [entries, preset]);

  // ── Edit handlers ───────────────────────────────────────────────────────

  function openEdit(entry: TimeEntryRow) {
    setEditingEntry(entry);
    setEditBillable(entry.billable);
    setEditDescription(entry.description ?? "");
  }

  function closeEdit() {
    setEditingEntry(null);
    setEditBillable(false);
    setEditDescription("");
    setIsSaving(false);
  }

  async function saveEdit() {
    if (!editingEntry) return;
    setIsSaving(true);

    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/time-entries/${editingEntry.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          billable: editBillable,
          description: editDescription || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `PATCH failed: ${res.status}`);
      }

      const { entry: updated } = await res.json();

      // Update local state
      setEntries((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e))
      );
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setIsSaving(false);
    }
  }

  // ── Preset label ────────────────────────────────────────────────────────

  const presetLabel: Record<DatePreset, string> = {
    "today": "Today",
    "this-week": "This Week",
    "this-month": "This Month",
    "custom": "Custom Range",
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Time Log</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Review and edit your past time entries.
        </p>
      </header>

      {/* ── Date filter ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["today", "this-week", "this-month", "custom"] as DatePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                preset === p
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {presetLabel[p]}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 w-36 text-sm"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 w-36 text-sm"
            />
          </div>
        )}
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Summary card ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="size-4" />
            {presetLabel[preset]} Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <RefreshCw className="size-4 animate-spin" />
              Loading entries...
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatHours(summary.totalSeconds)}h
                </p>
                <p className="text-xs text-muted-foreground">Total hours</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-semibold tabular-nums text-emerald-600">
                  {formatHours(summary.billableSeconds)}h
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="size-3" /> Billable
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-semibold tabular-nums text-slate-500">
                  {formatHours(summary.nonBillableSeconds)}h
                </p>
                <p className="text-xs text-muted-foreground">Non-billable</p>
              </div>
            </div>
          )}
          {!isLoading && summary.entryCount > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{
                    width: summary.totalSeconds > 0
                      ? `${(summary.billableSeconds / summary.totalSeconds) * 100}%`
                      : "0%",
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {summary.totalSeconds > 0
                  ? Math.round((summary.billableSeconds / summary.totalSeconds) * 100)
                  : 0}% billable
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Weekly totals ───────────────────────────────────────────────── */}
      {weeklyTotals && weeklyTotals.size > 1 && (
        <div className="flex flex-wrap gap-2">
          {[...weeklyTotals.entries()].map(([weekStart, totals]) => {
            const weekDate = new Date(weekStart);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            return (
              <div
                key={weekStart}
                className="flex-1 min-w-[140px] rounded-lg border px-3 py-2.5"
              >
                <p className="text-[11px] font-medium text-muted-foreground">
                  {weekDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" - "}
                  {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
                <p className="text-sm font-semibold tabular-nums mt-0.5">
                  {formatHours(totals.billable + totals.nonBillable)}h
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-emerald-600 tabular-nums">
                    {formatHours(totals.billable)}h bill
                  </span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {formatHours(totals.nonBillable)}h non-bill
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Entries grouped by date ─────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <RefreshCw className="size-5 animate-spin mr-2" />
          Loading time entries...
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No entries for this period</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Start a timer on your{" "}
              <Link href="/worker" className="underline hover:text-foreground">
                dashboard
              </Link>{" "}
              to log time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...groupedEntries.entries()].map(([dateKey, dayEntries]) => {
            const dayTotal = dayEntries.reduce(
              (acc, e) => acc + (e.rounded_seconds || e.duration_seconds),
              0
            );
            const dayBillable = dayEntries
              .filter((e) => e.billable)
              .reduce((acc, e) => acc + (e.rounded_seconds || e.duration_seconds), 0);

            return (
              <div key={dateKey}>
                {/* Day header */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">
                    {formatDateHeader(dayEntries[0].started_at)}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatHours(dayTotal)}h total</span>
                    <span className="tabular-nums text-emerald-600">
                      {formatHours(dayBillable)}h billable
                    </span>
                  </div>
                </div>

                {/* Entry rows */}
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {dayEntries.map((entry) => {
                        const task = taskMap.get(entry.task_id);
                        const syncStatus = getSyncStatus(entry);
                        const dur = entry.rounded_seconds || entry.duration_seconds;
                        const canEdit = !entry.synced_to_accelo_at;

                        return (
                          <div
                            key={entry.id}
                            className="flex items-center gap-3 px-4 py-3 group"
                          >
                            {/* Sync status icon */}
                            <div title={syncLabel(syncStatus)} className="shrink-0">
                              <SyncIcon status={syncStatus} />
                            </div>

                            {/* Task + description */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">
                                  {task?.title ?? `Task #${entry.task_id}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {task?.company_name && (
                                  <span className="text-xs text-muted-foreground truncate">
                                    {task.company_name}
                                  </span>
                                )}
                                {task?.company_name && entry.description && (
                                  <span className="text-xs text-muted-foreground">
                                    &middot;
                                  </span>
                                )}
                                {entry.description && (
                                  <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                    <FileText className="size-3 shrink-0" />
                                    {entry.description}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Time range */}
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden sm:block">
                              {formatTime(entry.started_at)}
                              {entry.stopped_at && ` - ${formatTime(entry.stopped_at)}`}
                            </span>

                            {/* Duration */}
                            <span className="text-sm font-medium tabular-nums shrink-0 w-14 text-right">
                              {formatDuration(dur)}
                            </span>

                            {/* Billable badge */}
                            {entry.billable ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0"
                              >
                                Billable
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal bg-slate-50 text-slate-500 border-slate-200 shrink-0"
                              >
                                Non-bill
                              </Badge>
                            )}

                            {/* Edit button (only for unsynced entries) */}
                            {canEdit ? (
                              <button
                                onClick={() => openEdit(entry)}
                                className="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100 shrink-0 cursor-pointer"
                                title="Edit entry"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                            ) : (
                              <div className="size-7 shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!editingEntry} onOpenChange={(o) => { if (!o) closeEdit(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4" /> Edit Time Entry
            </DialogTitle>
            {editingEntry && (
              <p className="text-sm text-muted-foreground pt-1">
                {taskMap.get(editingEntry.task_id)?.title ?? `Task #${editingEntry.task_id}`}
                {" "}
                &middot;{" "}
                {formatDuration(editingEntry.rounded_seconds || editingEntry.duration_seconds)}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Billable toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Billable</label>
              <button
                onClick={() => setEditBillable(!editBillable)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  editBillable ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                    editBillable ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Description{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="What did you work on?"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={isSaving} className="gap-2">
              {isSaving && <RefreshCw className="size-3.5 animate-spin" />}
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, useMemo, useEffect } from "react";
import { tasks, teamMembers, clients, serviceCategories, clientDocuments } from "@/lib/data";
import type { Task, ClientDocument } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckCircle2, Hourglass, Square, Play,
  Mail, ChevronDown, ChevronRight, X,
  Clock, RefreshCw, Eye, Globe, Phone, Plus, AlertCircle,
  FileText, FileSpreadsheet, FileType, ExternalLink, FolderOpen,
} from "lucide-react";

// ── Data ──────────────────────────────────────────────────────────────────────

const EXTRA_TASKS: Task[] = [
  { id: "t13", title: "Bank Rec — January",  client: "OES",   assignee: "Gio",    category: "Bank & CC Rec's", priority: "medium", status: "todo", dueDate: "2026-02-27", estimatedHours: 3, loggedHours: 0, recurring: true  },
  { id: "t14", title: "Q4 Sales Tax",         client: "Elan",  assignee: "Gio",    category: "Sales Tax",       priority: "low",    status: "todo", dueDate: "2026-03-10", estimatedHours: 2, loggedHours: 0, recurring: false },
  { id: "t15", title: "AP Review — February", client: "Monda", assignee: "Faizan", category: "AP & AR",         priority: "medium", status: "todo", dueDate: "2026-02-26", estimatedHours: 2, loggedHours: 0, recurring: true  },
  { id: "t16", title: "Monthly Close",        client: "OBI",   assignee: "Mitch",  category: "Bookkeeping",     priority: "high",   status: "todo", dueDate: "2026-02-25", estimatedHours: 5, loggedHours: 1, recurring: true  },
  { id: "t17", title: "Payroll — March 1",    client: "WWB",   assignee: "Jordea", category: "Payroll",         priority: "high",   status: "todo", dueDate: "2026-02-28", estimatedHours: 3, loggedHours: 0, recurring: true  },
];

const SEED_TASKS: Task[] = [...tasks, ...EXTRA_TASKS];
const WORKERS = teamMembers.map((m) => m.name);

// Tasks that are blocked waiting on client (hardcoded for mock)
const WAITING_IDS = new Set(["t3", "t5"]);

// ── Config ────────────────────────────────────────────────────────────────────

const TODAY_MS = new Date().setHours(0, 0, 0, 0);

const severityClasses = {
  critical: "bg-red-50 text-red-700 border-red-200",
  warning:  "bg-amber-50 text-amber-700 border-amber-200",
  normal:   "bg-slate-100 text-slate-600 border-slate-200",
} as const;

const categoryDot: Record<string, string> = {
  "Bookkeeping":     "bg-emerald-500", "AP & AR":       "bg-emerald-500",
  "Payroll":         "bg-emerald-500", "Sales Tax":     "bg-emerald-500",
  "Bank & CC Rec's": "bg-emerald-500", "Tax Returns":   "bg-red-500",
  "Tax Notices":     "bg-red-500",     "Audits":        "bg-red-500",
  "Advisory":        "bg-blue-500",    "CFO Services":  "bg-blue-500",
  "Cash Flow":       "bg-blue-500",    "Board Meeting": "bg-slate-400",
};

const categoryAccent: Record<string, string> = {
  "Bookkeeping":     "#10b981", "AP & AR":       "#10b981",
  "Payroll":         "#10b981", "Sales Tax":     "#10b981",
  "Bank & CC Rec's": "#10b981", "Tax Returns":   "#ef4444",
  "Tax Notices":     "#ef4444", "Audits":        "#ef4444",
  "Advisory":        "#3b82f6", "CFO Services":  "#3b82f6",
  "Cash Flow":       "#3b82f6", "Board Meeting": "#94a3b8",
};

// ── Task history mock data ─────────────────────────────────────────────────────

type HistoryEntry = { status: Task["status"]; date: string; by: string; note?: string };
type TaskNote     = { text: string; by: string; at: string };

const TASK_HISTORY: Record<string, HistoryEntry[]> = {
  "t1":  [
    { status: "todo",        date: "2026-02-01", by: "Gio",    note: "Created from recurring monthly template" },
    { status: "in-progress", date: "2026-02-18", by: "Faizan" },
  ],
  "t2":  [
    { status: "todo",        date: "2026-02-05", by: "Gio"  },
    { status: "in-progress", date: "2026-02-20", by: "Sam"  },
    { status: "review",      date: "2026-02-24", by: "Sam",   note: "Ready for partner sign-off" },
  ],
  "t3":  [
    { status: "todo",        date: "2026-01-28", by: "Gio"   },
    { status: "in-progress", date: "2026-02-03", by: "Mitch" },
    { status: "todo",        date: "2026-02-10", by: "Mitch", note: "Bounced — waiting on January statements from client" },
  ],
  "t4":  [
    { status: "todo",        date: "2026-02-10", by: "Gio"  },
    { status: "in-progress", date: "2026-02-22", by: "Jordea" },
  ],
  "t13": [
    { status: "todo",        date: "2026-02-20", by: "Gio",   note: "Recurring — January bank rec" },
  ],
  "t14": [
    { status: "todo",        date: "2026-02-15", by: "Gio"  },
  ],
  "t15": [
    { status: "todo",        date: "2026-02-18", by: "Gio"  },
  ],
  "t16": [
    { status: "todo",        date: "2026-02-01", by: "Mitch" },
    { status: "in-progress", date: "2026-02-23", by: "Mitch", note: "Started month-end close process" },
  ],
  "t17": [
    { status: "todo",        date: "2026-02-21", by: "Gio",   note: "Payroll run due March 1 — confirm headcount with client" },
  ],
};

const TASK_NOTES: Record<string, TaskNote[]> = {
  "t3":  [{ text: "Client confirmed statements will be sent by Feb 28.", by: "Gio", at: "2026-02-12" }],
  "t16": [{ text: "CEO on vacation until 3/1 — adjusted internal deadline.", by: "Mitch", at: "2026-02-23" }],
};

const statusDot: Record<Task["status"], string> = {
  "todo":        "bg-slate-400",
  "in-progress": "bg-blue-500",
  "review":      "bg-violet-500",
  "done":        "bg-emerald-500",
};

// ── Config ─────────────────────────────────────────────────────────────────────

const statusConfig: Record<Task["status"], { label: string; className: string; icon: React.ElementType }> = {
  "todo":        { label: "To Do",       className: "bg-slate-100 text-slate-600 border-slate-200",      icon: Clock        },
  "in-progress": { label: "In Progress", className: "bg-blue-50 text-blue-700 border-blue-200",          icon: RefreshCw    },
  "review":      { label: "In Review",   className: "bg-violet-50 text-violet-700 border-violet-200",    icon: Eye          },
  "done":        { label: "Done",        className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
};

const INFO_METHODS = [
  { id: "email",  label: "Email",         icon: Mail  },
  { id: "portal", label: "Client Portal", icon: Globe },
  { id: "phone",  label: "Phone",         icon: Phone },
] as const;

// Which document categories are relevant to each task category
const RELEVANT_DOC_CATEGORIES: Record<string, string[]> = {
  "Tax Returns":          ["Tax Returns", "Engagement", "Financial Statements"],
  "Tax Notices":          ["Tax Notices", "Tax Returns"],
  "Bookkeeping":          ["Bookkeeping", "Financial Statements"],
  "Bank & CC Rec's":      ["Bank & CC Rec's", "Bank Statements"],
  "AP & AR":              ["AP & AR"],
  "Payroll":              ["Payroll", "HR"],
  "Sales Tax":            ["Sales Tax"],
  "Board Meeting":        ["Board Meeting", "Financial Statements"],
  "Audits":               ["Audits", "Financial Statements"],
  "CFO Services":         ["CFO Services", "Financial Statements"],
  "Advisory":             ["Advisory", "Financial Statements"],
  "Cash Flow":            ["Cash Flow", "Financial Statements"],
  "Financial Statements": ["Financial Statements"],
  "Inventory":            ["Inventory"],
};

function blankTask(clientName: string): Omit<Task, "id"> {
  return { title: "", client: clientName, assignee: "", category: "", priority: "medium", status: "todo", dueDate: "", estimatedHours: 1, loggedHours: 0, recurring: false };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - TODAY_MS) / 86400000);
}
function dueLabel(dateStr: string) {
  const d = daysUntil(dateStr);
  if (d < 0)  return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d}d`;
}
function dueSeverity(dateStr: string): keyof typeof severityClasses {
  const d = daysUntil(dateStr);
  if (d <= 0) return "critical";
  if (d <= 3) return "warning";
  return "normal";
}
function taskSortScore(t: Task) {
  return ({ high: 0, medium: 1, low: 2 } as const)[t.priority] * 1000 + daysUntil(t.dueDate);
}
function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkerPage() {
  const [taskList, setTaskList]             = useState<Task[]>(SEED_TASKS);
  const [selectedWorker, setSelectedWorker] = useState("Gio");
  const [greeting, setGreeting]             = useState("");

  // Timer
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [timerStart, setTimerStart]     = useState<number | null>(null);
  // Accumulated seconds per task across multiple start/pause cycles this session
  const [baseSeconds, setBaseSeconds]   = useState<Record<string, number>>({});
  // Ticks every second to force a re-render while the timer is running
  const [, setTick]                     = useState(0);
  const [focusMode, setFocusMode]       = useState(false);

  // Accounts section state
  const [infoRequested, setInfoRequested] = useState<Set<string>>(new Set());
  const [infoTask, setInfoTask]           = useState<Task | null>(null);
  const [infoMethod, setInfoMethod]       = useState<"email" | "portal" | "phone">("email");
  const [infoNote, setInfoNote]           = useState("");
  const [newTaskClient, setNewTaskClient] = useState<string | null>(null);
  const [newTask, setNewTask]             = useState<Omit<Task, "id">>(blankTask(""));
  const [expandedAccountTaskId, setExpandedAccountTaskId] = useState<string | null>(null);
  const [expandedClientDocsId, setExpandedClientDocsId]   = useState<string | null>(null);

  useEffect(() => {
    setGreeting(new Date().getHours() < 12 ? "Good morning" : "Good afternoon");
  }, []);

  useEffect(() => {
    if (!activeTaskId) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeTaskId]);

  // Live elapsed for any task: accumulated base + current interval (if active)
  function getElapsed(taskId: string): number {
    const base = baseSeconds[taskId] ?? 0;
    if (taskId === activeTaskId && timerStart !== null) {
      return base + Math.floor((Date.now() - timerStart) / 1000);
    }
    return base;
  }

  // ── Timer actions ──────────────────────────────────────────────────────────

  function logSeconds(taskId: string, seconds: number) {
    const hours = Math.round((seconds / 3600) * 100) / 100;
    setTaskList((p) => p.map((t) => t.id === taskId ? { ...t, loggedHours: Math.round((t.loggedHours + hours) * 100) / 100 } : t));
  }

  function startTask(taskId: string) {
    // Pause the currently running task — save interval into baseSeconds without logging
    if (activeTaskId && timerStart !== null) {
      const interval = Math.floor((Date.now() - timerStart) / 1000);
      setBaseSeconds((p) => ({ ...p, [activeTaskId]: (p[activeTaskId] ?? 0) + interval }));
    }
    setActiveTaskId(taskId);
    setTimerStart(Date.now());
    setFocusMode(true);
  }

  function stopTask() {
    if (!activeTaskId || timerStart === null) return;
    const interval = Math.floor((Date.now() - timerStart) / 1000);
    const total    = (baseSeconds[activeTaskId] ?? 0) + interval;
    if (total > 0) logSeconds(activeTaskId, total);
    // Reset session for this task so next start is fresh
    setBaseSeconds((p) => ({ ...p, [activeTaskId]: 0 }));
    setActiveTaskId(null);
    setTimerStart(null);
    setFocusMode(false);
  }

  // ── Accounts helpers ───────────────────────────────────────────────────────

  function changeStatus(taskId: string, status: Task["status"]) {
    setTaskList((p) => p.map((t) => t.id === taskId ? { ...t, status } : t));
  }
  function reassign(taskId: string, assignee: string) {
    setTaskList((p) => p.map((t) => t.id === taskId ? { ...t, assignee } : t));
  }
  function changePriorityAcc(taskId: string, priority: Task["priority"]) {
    setTaskList((p) => p.map((t) => t.id === taskId ? { ...t, priority } : t));
  }
  function confirmInfoRequest() {
    if (!infoTask) return;
    setInfoRequested((p) => new Set(p).add(infoTask.id));
    setInfoTask(null); setInfoNote(""); setInfoMethod("email");
  }
  function openNewTask(clientName: string) {
    setNewTask(blankTask(clientName));
    setNewTaskClient(clientName);
  }
  function createTask() {
    if (!newTask.title || !newTask.assignee) return;
    setTaskList((p) => [{ ...newTask, id: `t${Date.now()}` }, ...p]);
    setNewTaskClient(null);
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const workerActiveTasks = useMemo(
    () =>
      taskList
        .filter((t) => t.assignee === selectedWorker && t.status !== "done" && !WAITING_IDS.has(t.id))
        .sort((a, b) => taskSortScore(a) - taskSortScore(b)),
    [taskList, selectedWorker]
  );

  const workerWaitingTasks = useMemo(
    () => taskList.filter((t) => t.assignee === selectedWorker && WAITING_IDS.has(t.id)),
    [taskList, selectedWorker]
  );

  const activeTask = activeTaskId ? taskList.find((t) => t.id === activeTaskId) ?? null : null;

  const myClients = useMemo(
    () => clients.filter((c) => c.assignedTo.includes(selectedWorker)),
    [selectedWorker]
  );

  return (
    <>
    {focusMode && activeTask && (
      <FocusMode
        task={activeTask}
        elapsed={getElapsed(activeTask.id)}
        otherTasks={workerActiveTasks.filter((t) => t.id !== activeTask.id)}
        getElapsed={getElapsed}
        onStop={stopTask}
        onExit={() => setFocusMode(false)}
        onSwitch={startTask}
        infoRequested={infoRequested.has(activeTask.id)}
        onRequestInfo={setInfoTask}
      />
    )}
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight" suppressHydrationWarning>
          {greeting},{" "}
          <select
            value={selectedWorker}
            onChange={(e) => { if (activeTaskId) stopTask(); setSelectedWorker(e.target.value); }}
            className="cursor-pointer appearance-none bg-transparent font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid focus:outline-none"
          >
            {WORKERS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          February 26, 2026 · Here&apos;s what&apos;s on your plate.
        </p>
      </header>

      <div className="space-y-5">
        <WorkerFeedCard
          tasks={workerActiveTasks}
          activeTaskId={activeTaskId}
          getElapsed={getElapsed}
          onStart={startTask}
          onStop={stopTask}
        />
        {workerWaitingTasks.length > 0 && <WaitingSection tasks={workerWaitingTasks} />}
      </div>

      {/* ── My Accounts ───────────────────────────────────────────────────── */}
      {myClients.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">My Accounts</h2>

          {myClients.length === 0 ? (
            <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
              No accounts assigned.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden divide-y">
              {myClients.map((client, clientIdx) => {
                const openTasks = taskList
                  .filter((t) => t.client === client.name && t.status !== "done")
                  .sort((a, b) => {
                    const pw = { high: 0, medium: 1, low: 2 } as const;
                    return pw[a.priority] - pw[b.priority] || a.dueDate.localeCompare(b.dueDate);
                  });

                const clientDocs = clientDocuments.filter((d) => d.clientName === client.name);
                const docsExpanded = expandedClientDocsId === client.id;

                return (
                  <div key={client.id}>
                    {/* Client header */}
                    <div className={`flex items-center gap-3 px-4 py-2.5 bg-muted/40 ${clientIdx > 0 ? "border-t border-border" : ""}`}>
                      <span className="text-sm font-semibold flex-1">{client.name}</span>
                      {client.status === "at-risk" && (
                        <Badge variant="outline" className="font-normal text-xs bg-amber-50 text-amber-700 border-amber-200 gap-1 shrink-0">
                          <AlertCircle className="size-3" /> At Risk
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">{openTasks.length} open</span>
                      {clientDocs.length > 0 && (
                        <button
                          onClick={() => setExpandedClientDocsId(docsExpanded ? null : client.id)}
                          className={`flex items-center gap-1 text-xs font-medium transition-colors shrink-0 cursor-pointer ${docsExpanded ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          <FolderOpen className="size-3.5" /> {clientDocs.length}
                        </button>
                      )}
                      <button
                        onClick={() => openNewTask(client.name)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
                      >
                        <Plus className="size-3.5" /> Task
                      </button>
                    </div>

                    {/* Task rows */}
                    {openTasks.length === 0 ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-xs text-emerald-600">
                        <CheckCircle2 className="size-3.5" /> All caught up
                      </div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {openTasks.map((t) => {
                          const sc = statusConfig[t.status];
                          const StatusIcon = sc.icon;
                          const hasInfoReq = infoRequested.has(t.id);
                          const accent = categoryAccent[t.category];

                          const isExpanded = expandedAccountTaskId === t.id;
                          return (
                            <div key={t.id}>
                            <div
                              className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                              style={accent ? { boxShadow: `inset 3px 0 0 ${accent}`, transition: "box-shadow 150ms ease" } : undefined}
                              onMouseEnter={(e) => { if (accent) e.currentTarget.style.boxShadow = `inset 6px 0 0 ${accent}`; }}
                              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = accent ? `inset 3px 0 0 ${accent}` : ""; }}
                            >

                              <div className="flex-1 min-w-0">
                                <span className="text-sm truncate block">{t.title}</span>
                                {hasInfoReq && (
                                  <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                                    <Mail className="size-2.5" /> Waiting on client
                                  </span>
                                )}
                              </div>

                              {/* Assignee */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-background transition-colors group/a cursor-pointer shrink-0">
                                    <Avatar className="size-5">
                                      <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">{t.assignee ? t.assignee[0] : "?"}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs text-muted-foreground">{t.assignee || "Unassigned"}</span>
                                    <ChevronDown className="size-3 text-muted-foreground opacity-0 group-hover/a:opacity-100 transition-opacity" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">Assign to</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {WORKERS.map((w) => (
                                    <DropdownMenuItem key={w} onClick={() => reassign(t.id, w)} className={t.assignee === w ? "font-semibold" : ""}>
                                      <Avatar className="size-5 mr-2"><AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">{w[0]}</AvatarFallback></Avatar>
                                      {w}
                                      {t.assignee === w && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>

                              {/* Status */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="shrink-0 cursor-pointer">
                                    <Badge variant="outline" className={`gap-1 text-[10px] font-normal ${sc.className}`}>
                                      <StatusIcon className="size-2.5" /> {sc.label}
                                    </Badge>
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">Update status</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {(["todo", "in-progress", "review", "done"] as const).map((s) => {
                                    const cfg = statusConfig[s]; const Icon = cfg.icon;
                                    return <DropdownMenuItem key={s} onClick={() => changeStatus(t.id, s)}><Icon className="size-3.5 mr-2" />{cfg.label}</DropdownMenuItem>;
                                  })}
                                </DropdownMenuContent>
                              </DropdownMenu>

                              {/* Priority */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-background transition-colors group/p cursor-pointer shrink-0">
                                    <span className={`size-1.5 rounded-full flex-shrink-0 ${{ high: "bg-red-500", medium: "bg-amber-400", low: "bg-emerald-500" }[t.priority]}`} />
                                    <ChevronDown className="size-3 text-muted-foreground opacity-0 group-hover/p:opacity-100 transition-opacity" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">Set priority</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {(["high", "medium", "low"] as const).map((p) => (
                                    <DropdownMenuItem key={p} onClick={() => changePriorityAcc(t.id, p)} className={t.priority === p ? "font-semibold" : ""}>
                                      <span className={`size-2 rounded-full mr-2 inline-block shrink-0 ${{ high: "bg-red-500", medium: "bg-amber-400", low: "bg-emerald-500" }[p]}`} />
                                      {p.charAt(0).toUpperCase() + p.slice(1)}
                                      {t.priority === p && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>

                              {/* Due date */}
                              <span className={`text-xs tabular-nums shrink-0 w-20 text-right ${daysUntil(t.dueDate) < 0 ? "text-red-600 font-semibold" : daysUntil(t.dueDate) <= 2 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                                {(() => { const d = daysUntil(t.dueDate); if (!t.dueDate) return "—"; if (d < 0) return `${Math.abs(d)}d overdue`; if (d === 0) return "Due today"; if (d === 1) return "Tomorrow"; return new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }); })()}
                              </span>

                              {/* Request Info */}
                              <button
                                onClick={() => setInfoTask(t)}
                                title={hasInfoReq ? "Update info request" : "Request info from client"}
                                className={`flex items-center justify-center size-6 rounded transition-colors shrink-0 cursor-pointer ${hasInfoReq ? "text-amber-500 hover:bg-amber-50" : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-amber-50 hover:text-amber-600"}`}
                              >
                                <Mail className="size-3.5" />
                              </button>

                              {/* Expand chevron */}
                              <button
                                onClick={() => setExpandedAccountTaskId(isExpanded ? null : t.id)}
                                className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
                              >
                                {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                              </button>
                            </div>

                            {/* Expanded history panel */}
                            {isExpanded && (
                              <div className="px-4 pb-4 pt-3 space-y-3 bg-muted/20 border-t border-border/50">

                                {/* Meta */}
                                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                                  <span>Assigned to <span className="font-medium text-foreground">{t.assignee || "—"}</span></span>
                                  {t.dueDate && (
                                    <span className={`font-medium px-2 py-0.5 rounded-full border ${severityClasses[dueSeverity(t.dueDate)]}`}>
                                      {dueLabel(t.dueDate)}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Clock className="size-3" />
                                    {t.loggedHours}h of {t.estimatedHours}h estimated
                                  </span>
                                </div>

                                {/* Status history */}
                                {(TASK_HISTORY[t.id] ?? []).length > 0 && (
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">History</p>
                                    <div className="space-y-1">
                                      {(TASK_HISTORY[t.id] ?? []).map((entry, i) => {
                                        const entries = TASK_HISTORY[t.id] ?? [];
                                        const isLast = i === entries.length - 1;
                                        return (
                                          <div key={i} className="flex items-start gap-2.5">
                                            <div className="flex flex-col items-center flex-shrink-0 mt-1">
                                              <span className={`size-2 rounded-full ${statusDot[entry.status]}`} />
                                              {!isLast && <div className="w-px bg-border mt-1" style={{ height: "14px" }} />}
                                            </div>
                                            <div className="min-w-0 pb-1">
                                              <span className="text-xs font-medium">{statusConfig[entry.status].label}</span>
                                              <span className="text-xs text-muted-foreground ml-1.5">{formatDate(entry.date)} · {entry.by}</span>
                                              {entry.note && (
                                                <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Notes */}
                                {(TASK_NOTES[t.id] ?? []).length > 0 && (
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</p>
                                    <div className="space-y-2">
                                      {(TASK_NOTES[t.id] ?? []).map((note, i) => (
                                        <div key={i} className="text-xs">
                                          <p className="text-foreground leading-relaxed">{note.text}</p>
                                          <p className="text-muted-foreground mt-0.5">{note.by} · {formatDate(note.at)}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              </div>
                            )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Documents panel */}
                    {docsExpanded && clientDocs.length > 0 && (
                      <div className="border-t border-border/50 px-4 py-3 space-y-1.5 bg-muted/10">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Documents</p>
                        {clientDocs.map((doc) => {
                          const Icon = doc.fileType === "pdf" ? FileText
                                     : doc.fileType === "xlsx" || doc.fileType === "csv" ? FileSpreadsheet
                                     : FileType;
                          const iconClass = doc.fileType === "pdf" ? "text-red-400"
                                          : doc.fileType === "xlsx" || doc.fileType === "csv" ? "text-emerald-500"
                                          : "text-blue-400";
                          return (
                            <button
                              key={doc.id}
                              className="group w-full flex items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-muted/50 transition-colors cursor-pointer"
                            >
                              <Icon className={`size-3.5 flex-shrink-0 ${iconClass}`} />
                              <span className="flex-1 min-w-0">
                                <span className="text-xs block truncate">{doc.name}</span>
                                <span className="text-[10px] text-muted-foreground">{doc.category}{doc.year ? ` · ${doc.year}` : ""} · {doc.uploadedBy}</span>
                              </span>
                              <ExternalLink className="size-3 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── New Task Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!newTaskClient} onOpenChange={(o) => { if (!o) setNewTaskClient(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Task · {newTaskClient}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Task name *</label>
              <Input placeholder="e.g. Monthly Bookkeeping Close" value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Assign to *</label>
                <select value={newTask.assignee} onChange={(e) => setNewTask((p) => ({ ...p, assignee: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                  <option value="">Select staff…</option>
                  {WORKERS.map((w) => <option key={w}>{w}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Due date</label>
                <Input type="date" value={newTask.dueDate} onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <select value={newTask.category} onChange={(e) => setNewTask((p) => ({ ...p, category: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                <option value="">Select…</option>
                {serviceCategories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTaskClient(null)}>Cancel</Button>
            <Button onClick={createTask} disabled={!newTask.title || !newTask.assignee}>Create & Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Request Info Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!infoTask} onOpenChange={(o) => { if (!o) { setInfoTask(null); setInfoNote(""); setInfoMethod("email"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="size-4" /> Request Info from Client</DialogTitle>
            {infoTask && <p className="text-sm text-muted-foreground pt-1">{infoTask.title} · {infoTask.client}</p>}
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Contact method</p>
              <div className="flex gap-2">
                {INFO_METHODS.map((m) => { const Icon = m.icon; return (
                  <button key={m.id} onClick={() => setInfoMethod(m.id)} className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors cursor-pointer ${infoMethod === m.id ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40 text-muted-foreground"}`}>
                    <Icon className="size-4" /> {m.label}
                  </button>
                ); })}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">What&apos;s needed <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea value={infoNote} onChange={(e) => setInfoNote(e.target.value)} placeholder="e.g. January bank statements, Q4 expense receipts…" rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInfoTask(null); setInfoNote(""); setInfoMethod("email"); }}>Cancel</Button>
            <Button onClick={confirmInfoRequest} className="gap-2"><Mail className="size-3.5" /> Send Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}

// ── Focus Mode ────────────────────────────────────────────────────────────────

const focusCategoryAccent: Record<string, string> = {
  "Bookkeeping":     "#10b981", "AP & AR":       "#10b981",
  "Payroll":         "#10b981", "Sales Tax":     "#10b981",
  "Bank & CC Rec's": "#10b981", "Tax Returns":   "#ef4444",
  "Tax Notices":     "#ef4444", "Audits":        "#ef4444",
  "Advisory":        "#3b82f6", "CFO Services":  "#3b82f6",
  "Cash Flow":       "#3b82f6", "Board Meeting": "#94a3b8",
};

function FocusMode({ task, elapsed, otherTasks, getElapsed, onStop, onExit, onSwitch, infoRequested, onRequestInfo }: {
  task: Task;
  elapsed: number;
  otherTasks: Task[];
  getElapsed: (id: string) => number;
  onStop: () => void;
  onExit: () => void;
  onSwitch: (id: string) => void;
  infoRequested: boolean;
  onRequestInfo: (task: Task) => void;
}) {
  const liveLogged = task.loggedHours + elapsed / 3600;
  const progress   = task.estimatedHours > 0
    ? Math.max(0, Math.min((liveLogged / task.estimatedHours) * 100, 100))
    : 0;
  const accent    = focusCategoryAccent[task.category] ?? "#94a3b8";
  const history   = TASK_HISTORY[task.id] ?? [];
  const notes     = TASK_NOTES[task.id]   ?? [];
  const relevantCategories = RELEVANT_DOC_CATEGORIES[task.category] ?? [];
  const documents = clientDocuments.filter(
    (d) => d.clientName === task.client && relevantCategories.includes(d.category)
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ backgroundColor: "#0d1117" }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 pt-8 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: accent }} />
            <span className="relative inline-flex rounded-full size-2" style={{ backgroundColor: accent }} />
          </span>
          <span className="text-xs font-medium" style={{ color: accent }}>Logging time</span>
        </div>
        <button
          onClick={onExit}
          title="Exit focus mode (timer keeps running)"
          className="flex items-center justify-center size-8 rounded-lg transition-colors cursor-pointer"
          style={{ color: "rgba(255,255,255,0.3)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Main content — centered when short, scrollable from top when tall */}
      <div className="flex-1 overflow-y-auto px-8">
      <div className="min-h-full flex flex-col items-center justify-center text-center py-10">

        {/* Category + client */}
        <div className="flex items-center gap-2 mb-6">
          <span
            className="text-xs font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${accent}20`, color: accent }}
          >
            {task.category}
          </span>
          <span className="text-white/30 text-sm">·</span>
          <span className="text-white/50 text-sm">{task.client}</span>
        </div>

        {/* Task title */}
        <h1 className="text-white text-3xl font-semibold tracking-tight mb-12 max-w-lg leading-snug">
          {task.title}
        </h1>

        {/* Big timer */}
        <div
          className="font-mono font-light tabular-nums leading-none mb-12"
          style={{ fontSize: "clamp(72px, 15vw, 120px)", color: "white", letterSpacing: "-0.03em" }}
        >
          {formatElapsed(elapsed)}
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-sm space-y-2 mb-10">
          <div className="flex items-center justify-between text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            <span>{liveLogged.toFixed(2)}h logged</span>
            <span>{task.estimatedHours}h estimated</span>
          </div>
          <div className="h-px w-full rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${progress}%`, backgroundColor: accent }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mb-12">
          <button
            onClick={onStop}
            className="flex items-center gap-2.5 rounded-full px-8 py-3.5 text-sm font-semibold transition-opacity hover:opacity-80 cursor-pointer"
            style={{ backgroundColor: accent, color: "#0d1117" }}
          >
            <Square className="size-4 fill-current" />
            Stop & Log Time
          </button>
          <button
            onClick={() => onRequestInfo(task)}
            className="flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-medium border transition-opacity hover:opacity-80 cursor-pointer"
            style={{
              borderColor: infoRequested ? `${accent}50` : "rgba(255,255,255,0.15)",
              color: infoRequested ? accent : "rgba(255,255,255,0.45)",
            }}
          >
            <Mail className="size-4" />
            {infoRequested ? "Info Requested" : "Request Info"}
          </button>
        </div>

        {/* Task context */}
        {(history.length > 0 || notes.length > 0 || documents.length > 0) && (
          <div className="w-full max-w-sm text-left space-y-5 mb-10">
            <div className="h-px w-full" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />

            {/* History */}
            {history.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
                  History
                </p>
                <div className="space-y-1">
                  {history.map((entry, i) => {
                    const isLast = i === history.length - 1;
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                          <span className={`size-2 rounded-full ${statusDot[entry.status]}`} />
                          {!isLast && <div className="w-px flex-1 mt-1" style={{ height: "14px", backgroundColor: "rgba(255,255,255,0.1)" }} />}
                        </div>
                        <div className="min-w-0 pb-1">
                          <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.65)" }}>
                            {statusConfig[entry.status].label}
                          </span>
                          <span className="text-xs ml-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                            {formatDate(entry.date)} · {entry.by}
                          </span>
                          {entry.note && (
                            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{entry.note}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            {notes.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
                  Notes
                </p>
                <div className="space-y-3">
                  {notes.map((note, i) => (
                    <div key={i}>
                      <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{note.text}</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{note.by} · {formatDate(note.at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Documents */}
            {documents.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {task.client} — Documents
                </p>
                <div className="space-y-1">
                  {documents.map((doc) => {
                    const Icon = doc.fileType === "pdf" ? FileText
                               : doc.fileType === "xlsx" || doc.fileType === "csv" ? FileSpreadsheet
                               : FileType;
                    const iconColor = doc.fileType === "pdf" ? "rgba(248,113,113,0.8)"
                                    : doc.fileType === "xlsx" || doc.fileType === "csv" ? "rgba(52,211,153,0.8)"
                                    : "rgba(96,165,250,0.8)";
                    return (
                      <button
                        key={doc.id}
                        className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left cursor-pointer group transition-all"
                        style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                      >
                        <Icon className="size-4 flex-shrink-0" style={{ color: iconColor }} />
                        <span className="flex-1 min-w-0">
                          <span className="text-xs block truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
                            {doc.name}
                          </span>
                          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                            {doc.category}{doc.year ? ` · ${doc.year}` : ""} · {doc.uploadedBy}
                          </span>
                        </span>
                        <ExternalLink className="size-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "rgba(255,255,255,0.4)" }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Task switcher */}
      {otherTasks.length > 0 && (
        <div className="px-8 pb-6 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 mt-4" style={{ color: "rgba(255,255,255,0.25)" }}>
            Up next
          </p>
          <div className="flex flex-col gap-1">
            {otherTasks.map((t) => {
              const taskAccent  = focusCategoryAccent[t.category] ?? "#94a3b8";
              const taskElapsed = getElapsed(t.id);
              const hasTime     = taskElapsed > 0;
              return (
                <button
                  key={t.id}
                  onClick={() => onSwitch(t.id)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer group"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                >
                  <span className="size-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: taskAccent }} />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm text-white/70 truncate block">{t.title}</span>
                    <span className="text-xs truncate" style={{ color: "rgba(255,255,255,0.3)" }}>{t.client}</span>
                  </span>
                  {hasTime && (
                    <span className="font-mono text-xs shrink-0" style={{ color: taskAccent }}>
                      {formatElapsed(taskElapsed)}
                    </span>
                  )}
                  <Play className="size-3.5 fill-current flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: taskAccent }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom progress strip */}
      <div className="h-0.5 w-full flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full transition-all duration-1000"
          style={{ width: `${progress}%`, backgroundColor: `${accent}60` }}
        />
      </div>
    </div>
  );
}

// ── Worker Feed ───────────────────────────────────────────────────────────────

function WorkerFeedCard({ tasks, activeTaskId, getElapsed, onStart, onStop }: {
  tasks: Task[];
  activeTaskId: string | null;
  getElapsed: (id: string) => number;
  onStart: (id: string) => void;
  onStop: () => void;
}) {
  // First task auto-expanded so it acts like the old hero card
  const [expandedId, setExpandedId] = useState<string | null>(tasks[0]?.id ?? null);

  // Keep expanded id valid when tasks list changes (worker switch)
  useEffect(() => {
    setExpandedId(tasks[0]?.id ?? null);
  }, [tasks[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tasks.length === 0) {
    return (
      <Card className="border-2 border-emerald-200 bg-emerald-50/30">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="size-12 text-emerald-500 mb-3" />
          <p className="text-lg font-semibold">You&apos;re all caught up!</p>
          <p className="mt-1 text-sm text-muted-foreground">No open tasks right now.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            My Queue
            <Badge variant="secondary" className="text-xs font-normal">{tasks.length}</Badge>
          </CardTitle>

          {/* Live timer in header when a task is running */}
          {activeTaskId && (
            <div className="flex items-center gap-2 text-emerald-600">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums">{formatElapsed(getElapsed(activeTaskId))}</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 px-0">
        <div className="divide-y divide-border">
          {tasks.map((task, i) => (
            <WorkerTaskRow
              key={task.id}
              task={task}
              isFirst={i === 0}
              isActive={activeTaskId === task.id}
              elapsed={getElapsed(task.id)}
              expanded={expandedId === task.id}
              onToggleExpand={() => setExpandedId(expandedId === task.id ? null : task.id)}
              onStart={() => onStart(task.id)}
              onStop={onStop}
            />
          ))}
        </div>

        {/* Category legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-5 py-2.5">
          {[
            { label: "Recurring",  dot: "bg-emerald-500" },
            { label: "Compliance", dot: "bg-red-400"     },
            { label: "Advisory",   dot: "bg-blue-400"    },
            { label: "Admin",      dot: "bg-slate-400"   },
          ].map(({ label, dot }) => (
            <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={`size-1.5 rounded-full flex-shrink-0 ${dot}`} />
              {label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkerTaskRow({ task, isFirst, isActive, elapsed, expanded, onToggleExpand, onStart, onStop }: {
  task: Task;
  isFirst: boolean;
  isActive: boolean;
  elapsed: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const liveLogged = task.loggedHours + (isActive ? elapsed / 3600 : 0);
  const progress   = task.estimatedHours > 0
    ? Math.max(0, Math.min(Math.round((liveLogged / task.estimatedHours) * 100), 100))
    : 0;

  const accent = categoryAccent[task.category];

  return (
    <div
      className={isActive ? "bg-emerald-50/30" : ""}
      style={!isActive && accent ? { boxShadow: `inset 3px 0 0 ${accent}`, transition: "box-shadow 150ms ease" } : undefined}
      onMouseEnter={(e) => { if (!isActive && accent) e.currentTarget.style.boxShadow = `inset 6px 0 0 ${accent}`; }}
      onMouseLeave={(e) => { if (!isActive && accent) e.currentTarget.style.boxShadow = `inset 3px 0 0 ${accent}`; }}
    >
      {/* ── Collapsed row ── */}
      <div className="flex items-center gap-3 px-5 py-3.5">

        {/* Name + meta — clicking expands */}
        <button onClick={onToggleExpand} className="min-w-0 flex-1 text-left group">
          <div className="flex items-center gap-2">
            {isFirst && !isActive && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border border-border rounded px-1 py-px shrink-0">
                Next
              </span>
            )}
            <p className="truncate text-sm font-medium">{task.title}</p>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{task.client} · {task.category}</p>
        </button>

        {/* Timer when active, due badge otherwise */}
        {isActive ? (
          <span className="font-mono text-sm font-semibold tabular-nums text-emerald-600 shrink-0">
            {formatElapsed(elapsed)}
          </span>
        ) : (
          <Badge
            variant="outline"
            className={`flex-shrink-0 text-xs font-normal ${severityClasses[dueSeverity(task.dueDate)]}`}
          >
            {dueLabel(task.dueDate)}
          </Badge>
        )}

        <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums w-8 text-right">
          {task.estimatedHours}h
        </span>

        {/* Play / Stop button */}
        <button
          onClick={isActive ? onStop : onStart}
          className={`size-7 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
            isActive
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-muted hover:bg-foreground hover:text-background"
          }`}
          title={isActive ? "Stop & log time" : "Start timer"}
        >
          {isActive
            ? <Square className="size-3 fill-current" />
            : <Play className="size-3 fill-current ml-0.5" />
          }
        </button>

        {/* Expand chevron */}
        <button onClick={onToggleExpand} className="shrink-0 text-muted-foreground cursor-pointer">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="px-5 pb-4 space-y-3 border-t border-border/40 bg-muted/20">
          {/* Progress bar — live when active */}
          <div className="pt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {isActive ? liveLogged.toFixed(2) : task.loggedHours}h logged of {task.estimatedHours}h estimated
              </span>
              <span className="font-medium tabular-nums">{progress}%</span>
            </div>
            <Progress
              value={progress}
              className={`h-1.5 transition-all ${isActive ? "[&>div]:bg-emerald-500" : ""}`}
            />
          </div>

        </div>
      )}
    </div>
  );
}

// ── Supporting sections ───────────────────────────────────────────────────────

function WaitingSection({ tasks }: { tasks: Task[] }) {
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-amber-800">
          <Hourglass className="size-4 text-amber-600" />
          Waiting on Client
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-amber-100">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-1 py-3">
              <Hourglass className="size-3.5 flex-shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.client} · info requested 3 days ago</p>
              </div>
              <Button size="sm" variant="ghost" className="flex-shrink-0 text-amber-700 hover:text-amber-900 hover:bg-amber-100">
                Follow up
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


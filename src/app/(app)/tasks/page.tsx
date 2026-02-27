"use client";

import { useState, useMemo } from "react";
import { tasks as baseTasks, teamMembers, clients, serviceCategories, clientDocuments } from "@/lib/data";
import type { Task } from "@/lib/data";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Search, Plus, ChevronDown, ChevronRight, ArrowUpDown,
  RefreshCw, Clock, CheckCircle2, Eye, Flag,
  ArrowUp, ArrowDown, Mail, Phone, Globe, ListOrdered, Trash2,
  FileText, FileSpreadsheet, FileType, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskMeta = {
  flagged?: boolean;
  flagReason?: string;
  flagNote?: string;
  flaggedAt?: string;
  infoRequested?: boolean;
  infoRequestedAt?: string;
  infoRequestMethod?: "email" | "portal" | "phone";
  infoRequestNote?: string;
};

// ── Seed data ─────────────────────────────────────────────────────────────────

const extraTasks: Task[] = [
  { id: "t13", title: "Bank Rec — January",    client: "OES",            assignee: "Gio",    category: "Bank & CC Rec's",      priority: "medium", status: "todo",        dueDate: "2026-02-27", estimatedHours: 3,  loggedHours: 0,   recurring: true  },
  { id: "t14", title: "Q4 Sales Tax",           client: "Elan",           assignee: "Gio",    category: "Sales Tax",            priority: "low",    status: "todo",        dueDate: "2026-03-10", estimatedHours: 2,  loggedHours: 0,   recurring: false },
  { id: "t15", title: "AP Review — February",   client: "Monda",          assignee: "Faizan", category: "AP & AR",              priority: "medium", status: "todo",        dueDate: "2026-02-26", estimatedHours: 2,  loggedHours: 0,   recurring: true  },
  { id: "t16", title: "Monthly Close",          client: "OBI",            assignee: "Mitch",  category: "Bookkeeping",          priority: "high",   status: "todo",        dueDate: "2026-02-25", estimatedHours: 5,  loggedHours: 1,   recurring: true  },
  { id: "t17", title: "Payroll — March 1",      client: "WWB",            assignee: "Jordea", category: "Payroll",              priority: "high",   status: "todo",        dueDate: "2026-02-28", estimatedHours: 3,  loggedHours: 0,   recurring: true  },
  { id: "t18", title: "Tax Return 2025",        client: "JD",             assignee: "Henry",  category: "Tax Returns",          priority: "high",   status: "in-progress", dueDate: "2026-04-15", estimatedHours: 10, loggedHours: 3,   recurring: false },
  { id: "t19", title: "Audit Prep — Q1",        client: "Amaracon",       assignee: "Sam",    category: "Audits",               priority: "medium", status: "in-progress", dueDate: "2026-03-20", estimatedHours: 8,  loggedHours: 2,   recurring: false },
  { id: "t20", title: "Cash Flow Review",       client: "Green Team",     assignee: "Jim",    category: "Cash Flow",            priority: "medium", status: "review",      dueDate: "2026-02-28", estimatedHours: 3,  loggedHours: 2.5, recurring: true  },
  { id: "t21", title: "Advisory Call — March",  client: "Devocion",       assignee: "Jim",    category: "Advisory",             priority: "low",    status: "todo",        dueDate: "2026-03-06", estimatedHours: 2,  loggedHours: 0,   recurring: true  },
  { id: "t22", title: "Financial Statements",   client: "The Experience", assignee: "Musa",   category: "Financial Statements", priority: "medium", status: "todo",        dueDate: "2026-03-01", estimatedHours: 5,  loggedHours: 0,   recurring: true  },
];

const ALL_TASKS: Task[] = [...baseTasks, ...extraTasks];
const WORKERS = teamMembers.map((m) => m.name);
const CLIENT_NAMES = clients.map((c) => c.name);

// ── Config ────────────────────────────────────────────────────────────────────

const statusConfig: Record<Task["status"], { label: string; className: string; icon: React.ElementType }> = {
  "todo":        { label: "To Do",       className: "bg-slate-100 text-slate-600 border-slate-200",      icon: Clock        },
  "in-progress": { label: "In Progress", className: "bg-blue-50 text-blue-700 border-blue-200",          icon: RefreshCw    },
  "review":      { label: "In Review",   className: "bg-violet-50 text-violet-700 border-violet-200",    icon: Eye          },
  "done":        { label: "Done",        className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
};

const priorityConfig: Record<Task["priority"], { label: string; dot: string }> = {
  high:   { label: "High",   dot: "bg-red-500"     },
  medium: { label: "Medium", dot: "bg-amber-400"   },
  low:    { label: "Low",    dot: "bg-emerald-500" },
};

const categoryAccent: Record<string, string> = {
  "Bookkeeping": "#10b981", "AP & AR": "#10b981",
  "Payroll": "#10b981", "Sales Tax": "#10b981", "Bank & CC Rec's": "#10b981",
  "Tax Returns": "#ef4444", "Tax Notices": "#ef4444", "Audits": "#ef4444",
  "Advisory": "#3b82f6", "CFO Services": "#3b82f6",
  "Cash Flow": "#3b82f6", "Financial Statements": "#3b82f6",
  "Board Meeting": "#94a3b8", "Inventory": "#94a3b8",
};

const categoryDot: Record<string, string> = {
  "Bookkeeping": "bg-emerald-500", "AP & AR": "bg-emerald-500",
  "Payroll": "bg-emerald-500", "Sales Tax": "bg-emerald-500", "Bank & CC Rec's": "bg-emerald-500",
  "Tax Returns": "bg-red-500", "Tax Notices": "bg-red-500", "Audits": "bg-red-500",
  "Advisory": "bg-blue-500", "CFO Services": "bg-blue-500",
  "Cash Flow": "bg-blue-500", "Financial Statements": "bg-blue-500",
  "Board Meeting": "bg-slate-400", "Inventory": "bg-slate-400",
};

const ESCALATE_REASONS = [
  { id: "deadline",     label: "Deadline at risk",       desc: "Due date too close for remaining work" },
  { id: "stalled",      label: "Task stalled",           desc: "No progress in 3+ days" },
  { id: "unresponsive", label: "Client unresponsive",    desc: "Waiting on client with no reply" },
  { id: "review",       label: "Needs partner review",   desc: "Decision needed before work continues" },
] as const;

const INFO_METHODS = [
  { id: "email",  label: "Email",          icon: Mail  },
  { id: "portal", label: "Client Portal",  icon: Globe },
  { id: "phone",  label: "Phone",          icon: Phone },
] as const;

type SortKey = "dueDate" | "priority" | "status" | "client" | "assignee";
type SortDir = "asc" | "desc";

const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
const statusWeight   = { "in-progress": 0, "review": 1, "todo": 2, "done": 3 } as const;

function blankTask(): Omit<Task, "id"> {
  return { title: "", client: "", assignee: "", category: "", priority: "medium", status: "todo", dueDate: "", estimatedHours: 1, loggedHours: 0, recurring: false };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [taskList, setTaskList]   = useState<Task[]>(ALL_TASKS);
  const [taskMeta, setTaskMeta]   = useState<Record<string, TaskMeta>>({});

  // Filters
  const [search, setSearch]               = useState("");
  const [filterStatus, setFilterStatus]   = useState<Task["status"] | "all">("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterClient, setFilterClient]   = useState("all");
  const [filterPriority, setFilterPriority] = useState<Task["priority"] | "all">("all");
  const [showFlagged, setShowFlagged]     = useState(false);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Row expansion (documents panel)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Selection
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [reassignTarget, setReassignTarget] = useState<string | null>(null);

  // New task dialog
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTask, setNewTask]         = useState<Omit<Task, "id">>(blankTask());

  // Batch reassign
  const [batchDialog, setBatchDialog]   = useState(false);
  const [batchAssignee, setBatchAssignee] = useState("");

  // Escalate / flag dialog
  const [escalateTask, setEscalateTask]   = useState<Task | null>(null);
  const [escalateReason, setEscalateReason] = useState("");
  const [escalateNote, setEscalateNote]   = useState("");

  // Request info dialog
  const [infoTask, setInfoTask]   = useState<Task | null>(null);
  const [infoMethod, setInfoMethod] = useState<"email" | "portal" | "phone">("email");
  const [infoNote, setInfoNote]   = useState("");

  // Staff queue sheet
  const [queueOpen, setQueueOpen]   = useState(false);
  const [queueWorker, setQueueWorker] = useState(WORKERS[0]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getMeta(id: string): TaskMeta { return taskMeta[id] ?? {}; }
  function updateMeta(id: string, patch: Partial<TaskMeta>) {
    setTaskMeta((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  }

  function reassign(taskId: string, assignee: string) {
    setTaskList((p) => p.map((t) => t.id === taskId ? { ...t, assignee } : t));
    setReassignTarget(null);
  }
  function changeStatus(taskId: string, status: Task["status"]) {
    setTaskList((p) => p.map((t) => t.id === taskId ? { ...t, status } : t));
  }
  function changePriority(taskId: string, priority: Task["priority"]) {
    setTaskList((p) => p.map((t) => t.id === taskId ? { ...t, priority } : t));
  }
  function nudgePriority(taskId: string, dir: "up" | "down") {
    const order: Task["priority"][] = ["low", "medium", "high"];
    setTaskList((p) => p.map((t) => {
      if (t.id !== taskId) return t;
      const idx = order.indexOf(t.priority);
      return { ...t, priority: order[dir === "up" ? Math.min(idx + 1, 2) : Math.max(idx - 1, 0)] };
    }));
  }

  function confirmEscalate() {
    if (!escalateTask || !escalateReason) return;
    updateMeta(escalateTask.id, { flagged: true, flagReason: escalateReason, flagNote: escalateNote, flaggedAt: "2026-02-26" });
    setEscalateTask(null); setEscalateReason(""); setEscalateNote("");
  }
  function confirmInfoRequest() {
    if (!infoTask) return;
    updateMeta(infoTask.id, { infoRequested: true, infoRequestedAt: "2026-02-26", infoRequestMethod: infoMethod, infoRequestNote: infoNote });
    setInfoTask(null); setInfoNote(""); setInfoMethod("email");
  }

  function toggleSelect(id: string) {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    setSelected(selected.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map((t) => t.id)));
  }
  function applyBatchReassign() {
    if (!batchAssignee) return;
    setTaskList((p) => p.map((t) => selected.has(t.id) ? { ...t, assignee: batchAssignee } : t));
    setSelected(new Set()); setBatchDialog(false); setBatchAssignee("");
  }
  function createTask() {
    if (!newTask.title || !newTask.client || !newTask.assignee) return;
    setTaskList((p) => [{ ...newTask, id: `t${Date.now()}` }, ...p]);
    setNewTask(blankTask()); setNewTaskOpen(false);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function daysUntil(dateStr: string) {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - new Date().setHours(0,0,0,0)) / 86400000);
  }
  function dueLabelClass(dateStr: string) {
    const d = daysUntil(dateStr);
    if (d === null) return "";
    if (d < 0)  return "text-red-600 font-semibold";
    if (d <= 2) return "text-amber-600 font-medium";
    return "text-muted-foreground";
  }
  function formatDue(dateStr: string) {
    const d = daysUntil(dateStr);
    if (d === null || !dateStr) return "—";
    if (d < 0)  return `${Math.abs(d)}d overdue`;
    if (d === 0) return "Today";
    if (d === 1) return "Tomorrow";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = taskList;
    if (showFlagged)          list = list.filter((t) => taskMeta[t.id]?.flagged);
    if (search)               list = list.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()) || t.client.toLowerCase().includes(search.toLowerCase()));
    if (filterStatus !== "all")   list = list.filter((t) => t.status === filterStatus);
    if (filterAssignee !== "all") list = list.filter((t) => t.assignee === filterAssignee);
    if (filterClient !== "all")   list = list.filter((t) => t.client === filterClient);
    if (filterPriority !== "all") list = list.filter((t) => t.priority === filterPriority);
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "dueDate")  cmp = a.dueDate.localeCompare(b.dueDate);
      if (sortKey === "priority") cmp = priorityWeight[a.priority] - priorityWeight[b.priority];
      if (sortKey === "status")   cmp = statusWeight[a.status] - statusWeight[b.status];
      if (sortKey === "client")   cmp = a.client.localeCompare(b.client);
      if (sortKey === "assignee") cmp = a.assignee.localeCompare(b.assignee);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [taskList, taskMeta, showFlagged, search, filterStatus, filterAssignee, filterClient, filterPriority, sortKey, sortDir]);

  const statusCounts = useMemo(() => {
    const base = taskList.filter((t) => {
      if (showFlagged && !taskMeta[t.id]?.flagged) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.client.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterAssignee !== "all" && t.assignee !== filterAssignee) return false;
      if (filterClient !== "all" && t.client !== filterClient) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      return true;
    });
    return { all: base.length, todo: base.filter((t) => t.status === "todo").length, "in-progress": base.filter((t) => t.status === "in-progress").length, review: base.filter((t) => t.status === "review").length, done: base.filter((t) => t.status === "done").length };
  }, [taskList, taskMeta, showFlagged, search, filterAssignee, filterClient, filterPriority]);

  const flaggedCount = useMemo(() => taskList.filter((t) => taskMeta[t.id]?.flagged).length, [taskList, taskMeta]);

  const queueTasks = useMemo(() =>
    taskList
      .filter((t) => t.assignee === queueWorker && t.status !== "done")
      .sort((a, b) => {
        const pc = priorityWeight[a.priority] - priorityWeight[b.priority];
        return pc !== 0 ? pc : a.dueDate.localeCompare(b.dueDate);
      }),
    [taskList, queueWorker]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Task Manager</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Assign, reprioritize, escalate, and track all active work across the team.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" className="gap-2" onClick={() => setQueueOpen(true)}>
            <ListOrdered className="size-4" /> Staff Queue
          </Button>
          <Button className="gap-2" onClick={() => setNewTaskOpen(true)}>
            <Plus className="size-4" /> New Task
          </Button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b">
        {(["all", "todo", "in-progress", "review", "done"] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setFilterStatus(s); setShowFlagged(false); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              filterStatus === s && !showFlagged ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {s === "all" ? "All Tasks" : statusConfig[s].label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] tabular-nums", filterStatus === s && !showFlagged ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
              {statusCounts[s]}
            </span>
          </button>
        ))}
        {/* Flagged tab */}
        <button
          onClick={() => { setShowFlagged((v) => !v); if (!showFlagged) setFilterStatus("all"); }}
          className={cn(
            "ml-2 flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            showFlagged ? "border-red-500 text-red-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Flag className={cn("size-3.5", showFlagged ? "fill-red-500 text-red-500" : "")} />
          Flagged
          {flaggedCount > 0 && (
            <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] tabular-nums", showFlagged ? "bg-red-500 text-white" : "bg-red-100 text-red-600")}>
              {flaggedCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search tasks or clients…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              {filterAssignee === "all" ? "All Staff" : filterAssignee} <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Assignee</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setFilterAssignee("all")}>All Staff</DropdownMenuItem>
            <DropdownMenuSeparator />
            {WORKERS.map((w) => <DropdownMenuItem key={w} onClick={() => setFilterAssignee(w)}>{w}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              {filterClient === "all" ? "All Clients" : filterClient} <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Client</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setFilterClient("all")}>All Clients</DropdownMenuItem>
            <DropdownMenuSeparator />
            {CLIENT_NAMES.map((c) => <DropdownMenuItem key={c} onClick={() => setFilterClient(c)}>{c}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              {filterPriority === "all" ? "All Priority" : priorityConfig[filterPriority].label} <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Priority</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setFilterPriority("all")}>All Priority</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(["high", "medium", "low"] as const).map((p) => (
              <DropdownMenuItem key={p} onClick={() => setFilterPriority(p)}>
                <span className={cn("size-2 rounded-full mr-2 inline-block", priorityConfig[p].dot)} /> {priorityConfig[p].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {(filterStatus !== "all" || filterAssignee !== "all" || filterClient !== "all" || filterPriority !== "all" || search || showFlagged) && (
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => { setFilterStatus("all"); setFilterAssignee("all"); setFilterClient("all"); setFilterPriority("all"); setSearch(""); setShowFlagged(false); }}>
            Clear filters
          </Button>
        )}

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setBatchDialog(true)}>
              <RefreshCw className="size-3.5" /> Reassign
            </Button>
            <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={() => setSelected(new Set())}>Cancel</Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-10 pl-5">
                <input type="checkbox" className="rounded cursor-pointer" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
              </TableHead>
              <TableHead className="min-w-[240px]">Task</TableHead>
              <TableHead><button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-colors" onClick={() => toggleSort("client")}>Client <ArrowUpDown className="size-3" /></button></TableHead>
              <TableHead><button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-colors" onClick={() => toggleSort("assignee")}>Assignee <ArrowUpDown className="size-3" /></button></TableHead>
              <TableHead><button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-colors" onClick={() => toggleSort("status")}>Status <ArrowUpDown className="size-3" /></button></TableHead>
              <TableHead><button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-colors" onClick={() => toggleSort("priority")}>Priority <ArrowUpDown className="size-3" /></button></TableHead>
              <TableHead><button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-colors" onClick={() => toggleSort("dueDate")}>Due <ArrowUpDown className="size-3" /></button></TableHead>
              <TableHead className="w-10" />
              <TableHead className="w-8" />
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-16 text-center text-muted-foreground text-sm">
                  No tasks match the current filters.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((task) => {
              const sc       = statusConfig[task.status];
              const StatusIcon = sc.icon;
              const meta     = getMeta(task.id);
              const isFlagged = !!meta.flagged;
              const hasInfoReq = !!meta.infoRequested;
              const tint     = isFlagged ? "bg-red-50/40" : hasInfoReq ? "bg-amber-50/30" : "";
              const accent   = categoryAccent[task.category];
              const isSelected = selected.has(task.id);
              const isExpanded = expandedTaskId === task.id;
              const taskDocs = clientDocuments.filter((d) => d.clientName === task.client);

              return (
                <>
                <TableRow
                  key={task.id}
                  className={cn("group transition-colors", tint, isSelected && "ring-1 ring-inset ring-primary/30")}
                  style={accent ? { boxShadow: `inset 3px 0 0 ${accent}`, transition: "box-shadow 150ms ease" } : undefined}
                  onMouseEnter={(e) => { if (accent) e.currentTarget.style.boxShadow = `inset 6px 0 0 ${accent}`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = accent ? `inset 3px 0 0 ${accent}` : ""; }}
                >

                  {/* Checkbox */}
                  <TableCell className="pl-5">
                    <input type="checkbox" className="rounded cursor-pointer" checked={isSelected} onChange={() => toggleSelect(task.id)} />
                  </TableCell>

                  {/* Task name */}
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium leading-tight">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">{task.category}</span>
                        {task.recurring && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><RefreshCw className="size-2.5" /> Recurring</span>}
                        {hasInfoReq && (
                          <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                            {meta.infoRequestMethod === "email" ? <Mail className="size-2.5" /> : meta.infoRequestMethod === "phone" ? <Phone className="size-2.5" /> : <Globe className="size-2.5" />}
                            Info requested · Feb 26
                          </span>
                        )}
                        {isFlagged && (
                          <span className="text-[10px] text-red-600 font-medium">
                            {ESCALATE_REASONS.find((r) => r.id === meta.flagReason)?.label ?? "Flagged"}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Client */}
                  <TableCell>
                    <Badge variant="secondary" className="font-normal text-xs">{task.client}</Badge>
                  </TableCell>

                  {/* Assignee — click to reassign */}
                  <TableCell>
                    <DropdownMenu open={reassignTarget === task.id} onOpenChange={(o) => setReassignTarget(o ? task.id : null)}>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-background/80 transition-colors group cursor-pointer">
                          <Avatar className="size-6">
                            <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">{task.assignee[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{task.assignee}</span>
                          <ChevronDown className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Reassign to</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {WORKERS.map((w) => (
                          <DropdownMenuItem key={w} className={cn(w === task.assignee && "font-semibold")} onClick={() => reassign(task.id, w)}>
                            <Avatar className="size-5 mr-2"><AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">{w[0]}</AvatarFallback></Avatar>
                            {w}
                            {w === task.assignee && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>

                  {/* Status — click to change */}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="cursor-pointer">
                          <Badge variant="outline" className={cn("gap-1 text-xs font-normal", sc.className)}>
                            <StatusIcon className="size-3" /> {sc.label}
                          </Badge>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Change status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {(["todo", "in-progress", "review", "done"] as const).map((s) => {
                          const cfg = statusConfig[s]; const Icon = cfg.icon;
                          return <DropdownMenuItem key={s} onClick={() => changeStatus(task.id, s)}><Icon className="size-3.5 mr-2" />{cfg.label}</DropdownMenuItem>;
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>

                  {/* Priority — click to change */}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-background/80 transition-colors group cursor-pointer">
                          <span className={cn("size-2 rounded-full flex-shrink-0", priorityConfig[task.priority].dot)} />
                          <span className="text-sm text-muted-foreground">{priorityConfig[task.priority].label}</span>
                          <ChevronDown className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Set priority</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {(["high", "medium", "low"] as const).map((p) => (
                          <DropdownMenuItem key={p} className={cn(task.priority === p && "font-semibold")} onClick={() => changePriority(task.id, p)}>
                            <span className={cn("size-2 rounded-full mr-2 inline-block", priorityConfig[p].dot)} />
                            {priorityConfig[p].label}
                            {task.priority === p && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>

                  {/* Due date */}
                  <TableCell>
                    <span className={cn("text-sm tabular-nums", dueLabelClass(task.dueDate))}>{formatDue(task.dueDate)}</span>
                  </TableCell>

                  {/* Hover actions */}
                  <TableCell>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setInfoTask(task)}
                        className={cn(
                          "flex items-center justify-center size-7 rounded transition-colors cursor-pointer",
                          hasInfoReq
                            ? "text-amber-500 hover:bg-amber-50"
                            : "text-muted-foreground hover:bg-amber-50 hover:text-amber-600"
                        )}
                        title={hasInfoReq ? "Update info request" : "Request info from client"}
                      >
                        <Mail className="size-3.5" />
                      </button>
                      <button
                        onClick={() => changeStatus(task.id, "done")}
                        disabled={task.status === "done"}
                        className="flex items-center justify-center size-7 rounded transition-colors text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-0 cursor-pointer disabled:cursor-default"
                        title="Mark done"
                      >
                        <CheckCircle2 className="size-3.5" />
                      </button>
                      <button
                        onClick={() => setTaskList((p) => p.filter((t) => t.id !== task.id))}
                        className="flex items-center justify-center size-7 rounded transition-colors text-muted-foreground hover:bg-red-50 hover:text-red-500 cursor-pointer"
                        title="Delete task"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </TableCell>

                  {/* Flag button */}
                  <TableCell className="pr-1">
                    <button
                      onClick={() => isFlagged ? updateMeta(task.id, { flagged: false }) : setEscalateTask(task)}
                      className="flex items-center justify-center size-6 rounded hover:bg-red-50 transition-colors group cursor-pointer"
                      title={isFlagged ? `Flagged: ${meta.flagReason}` : "Escalate / Flag"}
                    >
                      <Flag className={cn("size-3.5 transition-colors", isFlagged ? "fill-red-500 text-red-500" : "text-muted-foreground/40 group-hover:text-red-400")} />
                    </button>
                  </TableCell>

                  {/* Expand chevron */}
                  <TableCell className="pr-3">
                    {taskDocs.length > 0 && (
                      <button
                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                        className="flex items-center justify-center size-6 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer"
                      >
                        {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      </button>
                    )}
                  </TableCell>
                </TableRow>

                {/* Expanded documents row */}
                {isExpanded && taskDocs.length > 0 && (
                  <TableRow key={`${task.id}-docs`} className="hover:bg-transparent">
                    <TableCell colSpan={10} className="pt-0 pb-3 pl-14 pr-6">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                        {taskDocs.map((doc) => {
                          const Icon = doc.fileType === "pdf" ? FileText
                                     : doc.fileType === "xlsx" || doc.fileType === "csv" ? FileSpreadsheet
                                     : FileType;
                          const iconClass = doc.fileType === "pdf" ? "text-red-400"
                                          : doc.fileType === "xlsx" || doc.fileType === "csv" ? "text-emerald-500"
                                          : "text-blue-400";
                          return (
                            <button
                              key={doc.id}
                              className="group flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/50 transition-colors cursor-pointer"
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
                    </TableCell>
                  </TableRow>
                )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
        <p className="text-xs text-muted-foreground">Showing {filtered.length} of {taskList.length} tasks</p>
      </div>

      {/* ── Escalate / Flag Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!escalateTask} onOpenChange={(o) => { if (!o) { setEscalateTask(null); setEscalateReason(""); setEscalateNote(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="size-4 text-red-500" /> Escalate Task
            </DialogTitle>
            {escalateTask && <p className="text-sm text-muted-foreground pt-1">{escalateTask.title} · {escalateTask.client}</p>}
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Why is this being flagged?</p>
              <div className="grid grid-cols-2 gap-2">
                {ESCALATE_REASONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setEscalateReason(r.id)}
                    className={cn(
                      "text-left rounded-lg border p-3 transition-colors cursor-pointer",
                      escalateReason === r.id ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40"
                    )}
                  >
                    <p className="text-sm font-medium leading-tight">{r.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Note for the assignee <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea
                value={escalateNote}
                onChange={(e) => setEscalateNote(e.target.value)}
                placeholder="Add context, deadline info, or what action is needed…"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEscalateTask(null); setEscalateReason(""); setEscalateNote(""); }}>Cancel</Button>
            <Button onClick={confirmEscalate} disabled={!escalateReason} className="gap-2 bg-red-600 hover:bg-red-700">
              <Flag className="size-3.5" /> Flag Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Request Info Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!infoTask} onOpenChange={(o) => { if (!o) { setInfoTask(null); setInfoNote(""); setInfoMethod("email"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-4" /> Request Info from Client
            </DialogTitle>
            {infoTask && <p className="text-sm text-muted-foreground pt-1">{infoTask.title} · {infoTask.client}</p>}
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Contact method</p>
              <div className="flex gap-2">
                {INFO_METHODS.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setInfoMethod(m.id)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors cursor-pointer",
                        infoMethod === m.id ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40 text-muted-foreground"
                      )}
                    >
                      <Icon className="size-4" /> {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">What&apos;s needed <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea
                value={infoNote}
                onChange={(e) => setInfoNote(e.target.value)}
                placeholder="e.g. January bank statements, Q4 expense receipts, signed engagement letter…"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setInfoTask(null); setInfoNote(""); setInfoMethod("email"); }}>Cancel</Button>
            <Button onClick={confirmInfoRequest} className="gap-2">
              <Mail className="size-3.5" /> Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Batch Reassign Dialog ───────────────────────────────────────────── */}
      <Dialog open={batchDialog} onOpenChange={(o) => { setBatchDialog(o); if (!o) setBatchAssignee(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reassign {selected.size} task{selected.size !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Choose a team member to take over the selected task{selected.size !== 1 ? "s" : ""}.</p>
            <select value={batchAssignee} onChange={(e) => setBatchAssignee(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
              <option value="">Select staff member…</option>
              {WORKERS.map((w) => <option key={w}>{w}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBatchDialog(false); setBatchAssignee(""); }}>Cancel</Button>
            <Button onClick={applyBatchReassign} disabled={!batchAssignee}>Reassign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Task Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Task name *</label>
              <Input placeholder="e.g. Monthly Bookkeeping Close" value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Client *</label>
                <select value={newTask.client} onChange={(e) => setNewTask((p) => ({ ...p, client: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                  <option value="">Select client…</option>
                  {CLIENT_NAMES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Assign to *</label>
                <select value={newTask.assignee} onChange={(e) => setNewTask((p) => ({ ...p, assignee: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                  <option value="">Select staff…</option>
                  {WORKERS.map((w) => <option key={w}>{w}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <select value={newTask.category} onChange={(e) => setNewTask((p) => ({ ...p, category: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                  <option value="">Select category…</option>
                  {serviceCategories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Due date</label>
                <Input type="date" value={newTask.dueDate} onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Priority</label>
                <select value={newTask.priority} onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value as Task["priority"] }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer">
                  <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Est. hours</label>
                <Input type="number" min={0.5} step={0.5} value={newTask.estimatedHours} onChange={(e) => setNewTask((p) => ({ ...p, estimatedHours: Number(e.target.value) }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5 flex flex-col justify-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                  <input type="checkbox" checked={newTask.recurring} onChange={(e) => setNewTask((p) => ({ ...p, recurring: e.target.checked }))} className="rounded" />
                  Recurring
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewTaskOpen(false); setNewTask(blankTask()); }}>Cancel</Button>
            <Button onClick={createTask} disabled={!newTask.title || !newTask.client || !newTask.assignee}>Create Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Staff Queue Sheet ───────────────────────────────────────────────── */}
      <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
        <SheetContent className="w-[520px] sm:max-w-[520px] flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ListOrdered className="size-4" /> Staff Queue
            </SheetTitle>
            <p className="text-sm text-muted-foreground">View and reprioritize a team member&apos;s open tasks.</p>
          </SheetHeader>

          {/* Worker tabs */}
          <div className="flex gap-0.5 overflow-x-auto px-4 pt-3 pb-0 border-b shrink-0">
            {WORKERS.map((w) => {
              const count = taskList.filter((t) => t.assignee === w && t.status !== "done").length;
              return (
                <button
                  key={w}
                  onClick={() => setQueueWorker(w)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors shrink-0",
                    queueWorker === w ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {w}
                  <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", queueWorker === w ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Queue list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {queueTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <CheckCircle2 className="size-8 mb-2 text-emerald-400" />
                <p className="text-sm">No open tasks for {queueWorker}.</p>
              </div>
            )}

            {/* Group by priority */}
            {(["high", "medium", "low"] as const).map((p) => {
              const group = queueTasks.filter((t) => t.priority === p);
              if (!group.length) return null;
              return (
                <div key={p}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <span className={cn("size-2 rounded-full", priorityConfig[p].dot)} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{priorityConfig[p].label} Priority</span>
                    <span className="text-xs text-muted-foreground">· {group.length}</span>
                  </div>
                  {group.map((task) => {
                    const sc = statusConfig[task.status];
                    const StatusIcon = sc.icon;
                    const meta = getMeta(task.id);
                    return (
                      <div key={task.id} className="flex items-center gap-3 rounded-lg px-3 py-3 mb-0.5 group transition-colors hover:bg-muted/40" style={categoryAccent[task.category] ? { boxShadow: `inset 3px 0 0 ${categoryAccent[task.category]}` } : undefined}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("size-1.5 rounded-full flex-shrink-0", categoryDot[task.category] ?? "bg-slate-400")} />
                            <p className="truncate text-sm font-medium">{task.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 pl-3">{task.client} · {formatDue(task.dueDate)}</p>
                        </div>

                        <Badge variant="outline" className={cn("gap-1 text-[11px] font-normal shrink-0", sc.className)}>
                          <StatusIcon className="size-2.5" /> {sc.label}
                        </Badge>

                        {meta.flagged && <Flag className="size-3.5 text-red-500 fill-red-500 shrink-0" />}

                        {/* Nudge priority buttons */}
                        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => nudgePriority(task.id, "up")}
                            disabled={task.priority === "high"}
                            className="size-5 rounded flex items-center justify-center hover:bg-background disabled:opacity-20 cursor-pointer disabled:cursor-default transition-colors"
                            title="Raise priority"
                          >
                            <ArrowUp className="size-3" />
                          </button>
                          <button
                            onClick={() => nudgePriority(task.id, "down")}
                            disabled={task.priority === "low"}
                            className="size-5 rounded flex items-center justify-center hover:bg-background disabled:opacity-20 cursor-pointer disabled:cursor-default transition-colors"
                            title="Lower priority"
                          >
                            <ArrowDown className="size-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <Separator className="my-2" />
                </div>
              );
            })}
          </div>

          <div className="px-6 py-4 border-t">
            <p className="text-xs text-muted-foreground">↑↓ arrows appear on hover to nudge priority up or down.</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { firmStats, teamMembers, clients, timeEntries } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Users,
  DollarSign,
  Clock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

// ── Rich Task Types ───────────────────────────────────────────────────────────

type Stage = "waiting-on-client" | "in-progress" | "in-review" | "ready-to-bill";

type StageHistoryEntry = {
  stage: Stage;
  enteredAt: string; // YYYY-MM-DD
  by: string;
  note?: string;
};

type Dependency = {
  item: string;
  waitingOn: string; // "client" or a staff name
  requestedAt: string;
};

type TaskNote = {
  text: string;
  by: string;
  at: string;
};

type RichTask = {
  id: string;
  client: string;
  serviceType: string;
  deliverable: string;
  deadline: string;
  assignee: string;
  assignedBy: string;
  assignedAt: string;
  stage: Stage;
  stageEnteredAt: string;
  priority: "high" | "medium" | "low";
  estimatedHours: number;
  loggedHours: number;
  hoursLoggedToday?: number;   // hours added to this task today
  completedToday?: boolean;    // true if marked done today
  dependencies: Dependency[];
  history: StageHistoryEntry[];
  notes: TaskNote[];
};

// ── Mock Data ─────────────────────────────────────────────────────────────────

const richTasks: RichTask[] = [
  {
    id: "rt1",
    client: "Maya Chen",
    serviceType: "Tax Prep",
    deliverable: "2025 Form 1040",
    deadline: "2026-04-15",
    assignee: "Gio",
    assignedBy: "Mitch",
    assignedAt: "2026-01-15",
    stage: "waiting-on-client",
    stageEnteredAt: "2026-02-20",
    priority: "high",
    estimatedHours: 8,
    loggedHours: 3,
    dependencies: [
      { item: "2025 W-2s", waitingOn: "client", requestedAt: "2026-02-10" },
      { item: "1099-INT from Schwab", waitingOn: "client", requestedAt: "2026-02-10" },
    ],
    history: [
      { stage: "in-progress", enteredAt: "2026-01-15", by: "Gio", note: "Assigned, starting intake" },
      { stage: "waiting-on-client", enteredAt: "2026-02-10", by: "Gio", note: "Sent doc request — W-2s and 1099s outstanding" },
      { stage: "in-progress", enteredAt: "2026-02-14", by: "Gio", note: "Partial docs received, began return" },
      { stage: "waiting-on-client", enteredAt: "2026-02-20", by: "Gio", note: "Missing 1099-INT from Schwab, sent follow-up" },
    ],
    notes: [
      { text: "Client said Schwab usually posts late Feb. Following up 2/28.", by: "Gio", at: "2026-02-20" },
    ],
  },
  {
    id: "rt2",
    client: "OES Corp",
    serviceType: "Bookkeeping",
    deliverable: "January 2026 Bank Rec",
    deadline: "2026-02-28",
    assignee: "Gio",
    assignedBy: "Mitch",
    assignedAt: "2026-02-01",
    stage: "in-progress",
    stageEnteredAt: "2026-02-22",
    priority: "high",
    estimatedHours: 3,
    loggedHours: 2.5,
    hoursLoggedToday: 1.5,
    dependencies: [],
    history: [
      { stage: "waiting-on-client", enteredAt: "2026-02-01", by: "Gio", note: "Waiting for January bank statements" },
      { stage: "in-progress", enteredAt: "2026-02-22", by: "Gio", note: "Statements received, rec in progress" },
    ],
    notes: [
      { text: "$4,200 transfer to unknown account — flagged for client clarification before closing.", by: "Gio", at: "2026-02-24" },
    ],
  },
  {
    id: "rt3",
    client: "OBI Industries",
    serviceType: "Bookkeeping",
    deliverable: "January 2026 Monthly Close",
    deadline: "2026-02-25",
    assignee: "Mitch",
    assignedBy: "Mitch",
    assignedAt: "2026-02-01",
    stage: "waiting-on-client",
    stageEnteredAt: "2026-02-05",
    priority: "high",
    estimatedHours: 5,
    loggedHours: 1,
    hoursLoggedToday: 1,
    dependencies: [
      { item: "January credit card statements", waitingOn: "client", requestedAt: "2026-02-05" },
      { item: "Expense receipts over $500", waitingOn: "client", requestedAt: "2026-02-05" },
      { item: "Payroll summary from ADP", waitingOn: "Jordea", requestedAt: "2026-02-18" },
    ],
    history: [
      { stage: "in-progress", enteredAt: "2026-02-01", by: "Mitch", note: "Started month-end close" },
      { stage: "waiting-on-client", enteredAt: "2026-02-05", by: "Mitch", note: "CC statements and expense receipts missing" },
    ],
    notes: [
      { text: "OBI slow with docs two months running. Should set hard deadline in engagement letter.", by: "Mitch", at: "2026-02-19" },
      { text: "Still waiting on Jordea for ADP payroll export.", by: "Mitch", at: "2026-02-22" },
    ],
  },
  {
    id: "rt4",
    client: "Monda Group",
    serviceType: "AP & AR",
    deliverable: "February AP Review",
    deadline: "2026-02-26",
    assignee: "Faizan",
    assignedBy: "Mitch",
    assignedAt: "2026-02-10",
    stage: "in-review",
    stageEnteredAt: "2026-02-24",
    priority: "high",
    estimatedHours: 2,
    loggedHours: 2.5,
    completedToday: true,
    dependencies: [],
    history: [
      { stage: "in-progress", enteredAt: "2026-02-10", by: "Faizan", note: "Started AP aging review" },
      { stage: "waiting-on-client", enteredAt: "2026-02-17", by: "Faizan", note: "Two vendor invoices missing — sent to client" },
      { stage: "in-progress", enteredAt: "2026-02-21", by: "Faizan", note: "Invoices received, completing review" },
      { stage: "in-review", enteredAt: "2026-02-24", by: "Faizan", note: "Submitted to Mitch for sign-off" },
    ],
    notes: [
      { text: "Running 30 min over estimate due to the missing invoices. No major concern.", by: "Faizan", at: "2026-02-24" },
    ],
  },
  {
    id: "rt5",
    client: "WWB Holdings",
    serviceType: "Payroll",
    deliverable: "March 1 Payroll Run",
    deadline: "2026-02-28",
    assignee: "Jordea",
    assignedBy: "Mitch",
    assignedAt: "2026-02-20",
    stage: "in-progress",
    stageEnteredAt: "2026-02-20",
    priority: "high",
    estimatedHours: 3,
    loggedHours: 1,
    hoursLoggedToday: 1,
    dependencies: [
      { item: "February hours from all managers", waitingOn: "client", requestedAt: "2026-02-24" },
    ],
    history: [
      { stage: "in-progress", enteredAt: "2026-02-20", by: "Jordea", note: "Started payroll prep" },
    ],
    notes: [],
  },
  {
    id: "rt6",
    client: "Elan Brands",
    serviceType: "Sales Tax",
    deliverable: "Q4 2025 Sales Tax Return",
    deadline: "2026-03-10",
    assignee: "Gio",
    assignedBy: "Faizan",
    assignedAt: "2026-02-15",
    stage: "in-progress",
    stageEnteredAt: "2026-02-15",
    priority: "medium",
    estimatedHours: 2,
    loggedHours: 0.5,
    completedToday: true,
    dependencies: [],
    history: [
      { stage: "in-progress", enteredAt: "2026-02-15", by: "Gio", note: "Q4 data pulled from QuickBooks, return started" },
    ],
    notes: [],
  },
  {
    id: "rt7",
    client: "Apex Ventures",
    serviceType: "Advisory",
    deliverable: "Q1 Cash Flow Projection",
    deadline: "2026-03-05",
    assignee: "Mitch",
    assignedBy: "Mitch",
    assignedAt: "2026-02-12",
    stage: "waiting-on-client",
    stageEnteredAt: "2026-02-12",
    priority: "medium",
    estimatedHours: 4,
    loggedHours: 0,
    dependencies: [
      { item: "Q4 actuals export from QuickBooks", waitingOn: "client", requestedAt: "2026-02-12" },
      { item: "2026 revenue forecast from CEO", waitingOn: "client", requestedAt: "2026-02-12" },
    ],
    history: [
      { stage: "waiting-on-client", enteredAt: "2026-02-12", by: "Mitch", note: "Sent data request to CEO — need Q4 actuals and 2026 projections before starting" },
    ],
    notes: [
      { text: "CEO on vacation until 3/1. Adjusted internal start to 3/2.", by: "Mitch", at: "2026-02-14" },
    ],
  },
];

// ── Config ────────────────────────────────────────────────────────────────────

const TODAY_MS = new Date().setHours(0, 0, 0, 0);

const stageConfig: Record<Stage, { label: string; className: string }> = {
  "waiting-on-client": { label: "Waiting on Client", className: "bg-amber-50 text-amber-700 border-amber-200" },
  "in-progress":       { label: "In Progress",       className: "bg-blue-50 text-blue-700 border-blue-200" },
  "in-review":         { label: "In Review",          className: "bg-violet-50 text-violet-700 border-violet-200" },
  "ready-to-bill":     { label: "Ready to Bill",      className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const stageDot: Record<Stage, string> = {
  "waiting-on-client": "bg-amber-400",
  "in-progress":       "bg-blue-500",
  "in-review":         "bg-violet-500",
  "ready-to-bill":     "bg-emerald-500",
};


// Task category accents — maps service types to their parent category color (hex)
const categoryAccent: Record<string, string> = {
  // Recurring Service Delivery — emerald
  "Bookkeeping":  "#10b981",
  "AP & AR":      "#10b981",
  "Payroll":      "#10b981",
  "Sales Tax":    "#10b981",
  // Compliance & Filings — red
  "Tax Prep":     "#ef4444",
  "Tax Filing":   "#ef4444",
  "Audit":        "#ef4444",
  // Client Advisory — blue
  "Advisory":     "#3b82f6",
  "CFO Services": "#3b82f6",
  // Administrative & Internal — slate
  "Admin":        "#94a3b8",
  "Onboarding":   "#94a3b8",
};

function taskCategoryAccent(serviceType: string): React.CSSProperties | undefined {
  const color = categoryAccent[serviceType];
  return color ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined;
}

const categoryDot: Record<string, string> = {
  "Bookkeeping":  "bg-emerald-500",
  "AP & AR":      "bg-emerald-500",
  "Payroll":      "bg-emerald-500",
  "Sales Tax":    "bg-emerald-500",
  "Tax Prep":     "bg-red-500",
  "Tax Filing":   "bg-red-500",
  "Audit":        "bg-red-500",
  "Advisory":     "bg-blue-500",
  "CFO Services": "bg-blue-500",
  "Admin":        "bg-slate-400",
  "Onboarding":   "bg-slate-400",
};

function taskCategoryDot(serviceType: string): string {
  return categoryDot[serviceType] ?? "bg-muted-foreground";
}

const severityClasses = {
  critical: "bg-red-50 text-red-700 border-red-200",
  warning:  "bg-amber-50 text-amber-700 border-amber-200",
  normal:   "bg-slate-100 text-slate-600 border-slate-200",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string): number {
  return Math.floor((TODAY_MS - new Date(dateStr).getTime()) / 86400000);
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - TODAY_MS) / 86400000);
}

function dueLabel(dateStr: string): string {
  const d = daysUntil(dateStr);
  if (d < 0) return `${Math.abs(d)}d overdue`;
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

function dwellLabel(dateStr: string): string {
  const d = daysAgo(dateStr);
  if (d === 0) return "since today";
  if (d === 1) return "1d";
  return `${d}d`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function bounceCount(history: StageHistoryEntry[]): number {
  // Count how many times the task returned to a stage it had already left
  let count = 0;
  const seen = new Set<Stage>();
  for (const entry of history) {
    if (seen.has(entry.stage)) count++;
    seen.add(entry.stage);
  }
  return count;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashV2Page() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Manager Overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">February 26, 2026</p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        <TaskFeedCard tasks={richTasks} />
        <div className="space-y-5">
          <TeamCapacityCard />
        </div>
      </div>
    </div>
  );
}

// ── Task Feed ─────────────────────────────────────────────────────────────────

type SortKey = "priority" | "due-date" | "status";
type FeedView = "queue" | "today";

const stageOrder: Record<Stage, number> = {
  "waiting-on-client": 0,
  "in-progress":       1,
  "in-review":         2,
  "ready-to-bill":     3,
};

const priorityOrder = { high: 0, medium: 1, low: 2 } as const;

function sortTasks(tasks: RichTask[], sort: SortKey): RichTask[] {
  return [...tasks].sort((a, b) => {
    if (sort === "due-date") return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    if (sort === "status")   return stageOrder[a.stage] - stageOrder[b.stage];
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

function TaskFeedCard({ tasks }: { tasks: RichTask[] }) {
  const [view, setView] = useState<FeedView>("queue");
  const [sort, setSort] = useState<SortKey>("priority");
  const sorted = useMemo(() => sortTasks(tasks.filter(t => !t.completedToday), sort), [tasks, sort]);

  const completedToday = tasks.filter((t) => t.completedToday);
  const progressedToday = tasks.filter((t) => !t.completedToday && (t.hoursLoggedToday ?? 0) > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Task Feed</CardTitle>
            <div className="flex items-center rounded-md border border-border p-0.5 gap-0.5">
              <button
                onClick={() => setView("queue")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${view === "queue" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                Queue
              </button>
              <button
                onClick={() => setView("today")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${view === "today" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                Today
              </button>
            </div>
          </div>
          {view === "queue" && (
            <div className="flex items-center rounded-md border border-border p-0.5 gap-0.5">
              {(["priority", "due-date", "status"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    sort === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {key === "priority" ? "Priority" : key === "due-date" ? "Due Date" : "Status"}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-0">
        {view === "queue" ? (
          <div className="divide-y divide-border">
            {sorted.map((t) => <TaskFeedRow key={t.id} task={t} />)}
          </div>
        ) : (
          <TodayFeedView completed={completedToday} progressed={progressedToday} />
        )}
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

function TodayFeedView({ completed, progressed }: { completed: RichTask[]; progressed: RichTask[] }) {
  const totalCompleted = completed.length;
  const totalProgressed = progressed.length;

  return (
    <div className="space-y-0">
      {/* Summary banner */}
      <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-emerald-600 tabular-nums">{totalCompleted}</span> task{totalCompleted !== 1 ? "s" : ""} completed
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="font-semibold text-foreground tabular-nums">{totalProgressed}</span> task{totalProgressed !== 1 ? "s" : ""} moved forward
        </span>
      </div>

      {/* Completed section */}
      {completed.length > 0 && (
        <div>
          <p className="px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Completed
          </p>
          <div className="divide-y divide-border">
            {completed.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3" style={taskCategoryAccent(t.serviceType)}>
                <div className="size-4 flex-shrink-0 rounded-full bg-emerald-100 flex items-center justify-center">
                  <div className="size-1.5 rounded-full bg-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.deliverable}</p>
                  <p className="text-xs text-muted-foreground">{t.client} · {t.serviceType}</p>
                </div>
                <Avatar size="sm" className="flex-shrink-0">
                  <AvatarFallback className="text-[10px] font-medium">{t.assignee[0]}</AvatarFallback>
                </Avatar>
                <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                  {t.loggedHours}h logged
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress section */}
      {progressed.length > 0 && (
        <div>
          <p className="px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Progress Today
          </p>
          <div className="divide-y divide-border">
            {progressed.map((t) => {
              const hoursToday = t.hoursLoggedToday ?? 0;
              const prevLogged = t.loggedHours - hoursToday;
              const prevPct = t.estimatedHours > 0 ? (prevLogged / t.estimatedHours) * 100 : 0;
              const nowPct = t.estimatedHours > 0 ? (t.loggedHours / t.estimatedHours) * 100 : 0;
              const deltaPct = Math.round(nowPct - prevPct);

              return (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3" style={taskCategoryAccent(t.serviceType)}>
                  <span className={`size-2 flex-shrink-0 rounded-full ${taskCategoryDot(t.serviceType)}`} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{t.deliverable}</p>
                      <span className="flex-shrink-0 text-xs font-semibold text-emerald-600 tabular-nums">
                        +{deltaPct}%
                      </span>
                    </div>
                    {/* Stacked bar: previous progress + today's addition */}
                    <div className="h-1.5 rounded-full overflow-hidden bg-muted flex">
                      <div className="h-full bg-muted-foreground/30 transition-all" style={{ width: `${Math.min(prevPct, 100)}%` }} />
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(deltaPct, 100 - prevPct)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.client} · +{hoursToday}h today · {Math.round(nowPct)}% total
                    </p>
                  </div>
                  <Avatar size="sm" className="flex-shrink-0">
                    <AvatarFallback className="text-[10px] font-medium">{t.assignee[0]}</AvatarFallback>
                  </Avatar>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {completed.length === 0 && progressed.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No activity logged today yet.</p>
      )}
    </div>
  );
}

function TaskFeedRow({ task }: { task: RichTask }) {
  const [expanded, setExpanded] = useState(false);
  const bounces = bounceCount(task.history);
  const dwell = daysAgo(task.stageEnteredAt);
  const timeRatio = task.estimatedHours > 0 ? task.loggedHours / task.estimatedHours : 0;
  const timeColor = timeRatio >= 1 ? "text-red-600" : timeRatio >= 0.8 ? "text-amber-600" : "text-muted-foreground";
  // timeColor used in expanded meta row

  return (
    <div>
      {/* ── Collapsed row ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors text-left"
        style={taskCategoryAccent(task.serviceType)}
      >
        {/* Category dot */}
        <span className={`size-2 flex-shrink-0 rounded-full ${taskCategoryDot(task.serviceType)}`} />

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{task.deliverable}</p>
          <p className="text-xs text-muted-foreground truncate">{task.client}</p>
        </div>

        {/* Stage badge */}
        <Badge
          variant="outline"
          className={`flex-shrink-0 text-[11px] font-normal ${stageConfig[task.stage].className}`}
        >
          {stageConfig[task.stage].label}
          {dwell >= 1 && (
            <span className={`ml-1 ${dwell >= 7 ? "font-semibold" : "opacity-70"}`}>
              · {dwellLabel(task.stageEnteredAt)}
            </span>
          )}
        </Badge>

        {/* Assignee */}
        <Avatar size="sm" className="flex-shrink-0">
          <AvatarFallback className="text-[10px] font-medium">{task.assignee[0]}</AvatarFallback>
        </Avatar>

        {/* Chevron */}
        {expanded
          ? <ChevronDown className="size-4 flex-shrink-0 text-muted-foreground" />
          : <ChevronRight className="size-4 flex-shrink-0 text-muted-foreground" />
        }
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="px-5 pb-4 space-y-4 bg-muted/20 border-t border-border/50">

          {/* Meta row */}
          <div className="pt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span>Assigned to <span className="font-medium text-foreground">{task.assignee}</span> by {task.assignedBy} · {formatDate(task.assignedAt)}</span>
            <span className={`font-medium ${severityClasses[dueSeverity(task.deadline)]} px-2 py-0.5 rounded-full border`}>
              {dueLabel(task.deadline)}
            </span>
            <span className={`flex items-center gap-1 ${timeColor}`}>
              <Clock className="size-3" />
              {task.loggedHours}h of {task.estimatedHours}h estimated
            </span>
            {bounces >= 2 && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <RefreshCw className="size-3" />
                Bounced {bounces}×
              </span>
            )}
          </div>

          {/* Stage history */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Stage History</p>
            <div className="space-y-1">
              {task.history.map((entry, i) => {
                const isLast = i === task.history.length - 1;
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="flex flex-col items-center flex-shrink-0 mt-1">
                      <span className={`size-2 rounded-full ${stageDot[entry.stage]}`} />
                      {!isLast && <div className="w-px flex-1 bg-border mt-1" style={{ height: "14px" }} />}
                    </div>
                    <div className="min-w-0 pb-1">
                      <span className="text-xs font-medium">{stageConfig[entry.stage].label}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">{formatDate(entry.enteredAt)} · {entry.by}</span>
                      {entry.note && (
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dependencies */}
          {task.dependencies.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Blocking</p>
              <div className="space-y-1.5">
                {task.dependencies.map((dep, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="size-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                    <span>
                      <span className="font-medium">{dep.item}</span>
                      <span className="text-muted-foreground">
                        {" "}— waiting on {dep.waitingOn === "client" ? "client" : dep.waitingOn}
                        {" "}· requested {formatDate(dep.requestedAt)}
                        {" "}({daysAgo(dep.requestedAt)}d ago)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {task.notes.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</p>
              <div className="space-y-2">
                {task.notes.map((note, i) => (
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
}


// ── Team Capacity Card ────────────────────────────────────────────────────────

const TODAY_LOG      = "2026-02-20";
const WEEK_START     = "2026-02-23";
const WEEK_END       = "2026-02-28";
const LUNCH_PER_DAY  = 0.5; // fixed, permanent — labeled separately

// PTO this week per person (variable; meetings/admin come from logged time)
const WEEKLY_PTO: Record<string, number> = {
  "Musa":  8,  // 1 day PTO
  "Henry": 8,  // 1 day PTO
};

function TeamCapacityCard() {
  const [cardView, setCardView] = useState<"capacity" | "time-log">("capacity");
  const [openId, setOpenId] = useState<string | null>(null);

  const taskHoursByMember = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of richTasks) {
      map[t.assignee] = (map[t.assignee] ?? 0) + t.estimatedHours;
    }
    return map;
  }, []);

  // Non-billable logged hours this week, grouped by member → category → total
  const nonBillableByMember = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const e of timeEntries) {
      if (e.billable || e.date < WEEK_START || e.date > WEEK_END) continue;
      if (!map[e.member]) map[e.member] = {};
      map[e.member][e.category] = (map[e.member][e.category] ?? 0) + e.duration;
    }
    return map;
  }, []);

  // Pre-compute capacity tiers for every member, then sort by real load
  const memberRows = useMemo(() => {
    return teamMembers.map((m) => {
      const taskHours      = taskHoursByMember[m.name] ?? 0;
      const ptoHours       = WEEKLY_PTO[m.name] ?? 0;
      const availHours     = 40 - ptoHours;
      const daysWorked     = availHours / 8;
      const lunchHours     = Math.round(daysWorked * LUNCH_PER_DAY * 10) / 10;
      const nbByCategory   = nonBillableByMember[m.name] ?? {};
      const nbLoggedHours  = Math.round(Object.values(nbByCategory).reduce((s, v) => s + v, 0) * 10) / 10;
      const netCapacity    = Math.max(1, availHours - lunchHours - nbLoggedHours);
      const loadPct        = Math.min(100, Math.round((taskHours / netCapacity) * 100));
      return { ...m, taskHours, ptoHours, availHours, daysWorked, lunchHours, nbByCategory, nbLoggedHours, netCapacity, loadPct };
    }).sort((a, b) => b.loadPct - a.loadPct);
  }, [taskHoursByMember, nonBillableByMember]);

  const todayEntries = useMemo(
    () => timeEntries.filter((e) => e.date === TODAY_LOG),
    []
  );
  const todayTotal    = todayEntries.reduce((s, e) => s + e.duration, 0);
  const todayBillable = todayEntries.filter((e) => e.billable).reduce((s, e) => s + e.duration, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-muted-foreground" />
            Team
          </CardTitle>
          <div className="flex items-center rounded-md border border-border p-0.5 gap-0.5">
            <button
              onClick={() => setCardView("capacity")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${cardView === "capacity" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Capacity
            </button>
            <button
              onClick={() => setCardView("time-log")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${cardView === "time-log" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Time Log
            </button>
          </div>
        </div>
      </CardHeader>

      {cardView === "capacity" ? (
        <CardContent className="pt-0 px-0">
          <div className="divide-y divide-border">
            {memberRows.map((m) => {
              const isOpen   = openId === m.id;
              const barColor = m.loadPct >= 90 ? "#ef4444" : m.loadPct >= 70 ? "#f59e0b" : "#10b981";
              const revenue  = Math.round(m.billableHours / 4) * m.billingRate;
              const cost     = 40 * m.costRate;
              const margin   = revenue - cost;

              // Stacked bar segments as % of 40h paid week
              const W = 40;
              const taskPct   = Math.min(100, Math.round((m.taskHours    / W) * 100));
              const nbPct     = Math.round((m.nbLoggedHours / W) * 100);
              const lunchPct  = Math.round((m.lunchHours    / W) * 100);
              const ptoPct    = Math.round((m.ptoHours      / W) * 100);
              const remaining = Math.round(Math.max(0, m.netCapacity - m.taskHours) * 10) / 10;

              // Non-billable breakdown labels (sorted by hours desc)
              const nbEntries = Object.entries(m.nbByCategory).sort((a, b) => b[1] - a[1]);

              return (
                <div key={m.id}>
                  <button
                    onClick={() => setOpenId(isOpen ? null : m.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors text-left"
                  >
                    <Avatar size="sm" className="flex-shrink-0">
                      <AvatarFallback className="text-[10px] font-medium">{m.avatar}</AvatarFallback>
                    </Avatar>
                    <span className="w-16 flex-shrink-0 text-sm font-medium truncate">{m.name}</span>
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full transition-all" style={{ width: `${m.loadPct}%`, backgroundColor: barColor }} />
                      </div>
                      <span className="w-9 flex-shrink-0 text-right text-xs font-semibold tabular-nums">{m.loadPct}%</span>
                    </div>
                    {isOpen
                      ? <ChevronDown className="size-3.5 flex-shrink-0 text-muted-foreground" />
                      : <ChevronRight className="size-3.5 flex-shrink-0 text-muted-foreground" />
                    }
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 pt-2 bg-muted/20 border-t border-border/50 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">{m.role}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {m.taskHours}h on plate · {m.netCapacity.toFixed(1)}h net capacity
                        </p>
                      </div>

                      {/* Stacked week breakdown */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">This week — 40h paid</p>
                        <div className="h-2.5 rounded-full overflow-hidden bg-muted flex gap-px">
                          {taskPct > 0  && <div className="h-full transition-all" style={{ width: `${taskPct}%`, backgroundColor: barColor }} />}
                          {nbPct > 0    && <div className="h-full bg-blue-400 transition-all" style={{ width: `${nbPct}%` }} />}
                          {lunchPct > 0 && <div className="h-full bg-orange-300 transition-all" style={{ width: `${lunchPct}%` }} />}
                          {ptoPct > 0   && <div className="h-full bg-amber-300 transition-all" style={{ width: `${ptoPct}%` }} />}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="size-1.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: barColor }} />
                            {m.taskHours}h tasks
                          </span>
                          {nbEntries.map(([cat, hrs]) => (
                            <span key={cat} className="flex items-center gap-1">
                              <span className="size-1.5 rounded-full bg-blue-400 inline-block flex-shrink-0" />
                              {hrs}h {cat.toLowerCase()} <span className="text-muted-foreground/50">(logged)</span>
                            </span>
                          ))}
                          <span className="flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-orange-300 inline-block flex-shrink-0" />
                            {m.lunchHours}h lunch <span className="text-muted-foreground/50">(daily)</span>
                          </span>
                          {m.ptoHours > 0 && (
                            <span className="flex items-center gap-1">
                              <span className="size-1.5 rounded-full bg-amber-300 inline-block flex-shrink-0" />
                              {m.ptoHours}h PTO
                            </span>
                          )}
                          {remaining > 0 && (
                            <span className="flex items-center gap-1 text-emerald-600 font-medium">
                              {remaining}h open
                            </span>
                          )}
                        </div>
                      </div>

                      <Separator />
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Revenue generated</span>
                          <span className="tabular-nums font-semibold text-emerald-600">{formatCurrency(revenue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cost of hours paid</span>
                          <span className="tabular-nums font-medium">{formatCurrency(cost)}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                          <span className="font-medium">Margin</span>
                          <span className={`tabular-nums font-bold ${margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(margin)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      ) : (
        <CardContent className="pt-0 px-0">
          <div className="divide-y divide-border">
            {todayEntries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <Avatar size="sm" className="flex-shrink-0 mt-0.5">
                  <AvatarFallback className="text-[10px] font-medium">{entry.member[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{entry.member}</span>
                    <Badge variant="secondary" className="text-[11px] font-normal">{entry.category}</Badge>
                    <span className="text-xs text-muted-foreground">{entry.client}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.description}</p>
                </div>
                <div className="flex-shrink-0 flex items-center gap-1.5 text-xs tabular-nums">
                  {entry.billable && <span className="size-1.5 rounded-full bg-emerald-500" title="Billable" />}
                  <span className="font-semibold">{entry.duration}h</span>
                </div>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex items-center justify-between px-5 py-3 text-xs text-muted-foreground">
            <span><span className="font-semibold text-foreground tabular-nums">{todayTotal}h</span> logged today</span>
            <span><span className="font-semibold text-emerald-600 tabular-nums">{todayBillable}h</span> billable</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

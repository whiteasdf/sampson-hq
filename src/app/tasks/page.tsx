"use client";

import { useState, useMemo } from "react";
import {
  Clock,
  Plus,
  Mic,
  Calendar,
  CheckCircle2,
  Circle,
  Eye,
  ArrowUpRight,
  Timer,
  TrendingUp,
  Users,
  BarChart3,
  RefreshCw,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  tasks,
  timeEntries,
  serviceCategories,
  teamMembers,
} from "@/lib/data";
import type { Task } from "@/lib/data";

// ── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = "2026-02-20";

function relativeDueDate(dateStr: string): string {
  const due = new Date(dateStr);
  const today = new Date(TODAY);
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return `${diffDays} days`;
  if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} weeks`;
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dueDateColor(dateStr: string): string {
  const due = new Date(dateStr);
  const today = new Date(TODAY);
  const diffDays = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return "text-destructive";
  if (diffDays <= 2) return "text-orange-600";
  return "text-muted-foreground";
}

const priorityConfig = {
  high: { color: "bg-red-500", label: "High" },
  medium: { color: "bg-amber-400", label: "Medium" },
  low: { color: "bg-emerald-500", label: "Low" },
} as const;

const statusConfig = {
  todo: {
    label: "To Do",
    variant: "outline" as const,
    icon: Circle,
    className: "",
  },
  "in-progress": {
    label: "In Progress",
    variant: "secondary" as const,
    icon: Timer,
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  review: {
    label: "Review",
    variant: "secondary" as const,
    icon: Eye,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  done: {
    label: "Done",
    variant: "secondary" as const,
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
} as const;

type StatusFilter = "all" | "todo" | "in-progress" | "review" | "done";

const quickCategories = [
  "Bookkeeping",
  "Tax Returns",
  "Bank & CC Rec's",
  "AP & AR",
  "CFO Services",
  "Payroll",
];

// ── Category color mapping for analytics bars ────────────────────────────────

const categoryColors: Record<string, string> = {
  "Tax Returns": "bg-chart-1",
  Bookkeeping: "bg-chart-2",
  "Board Meeting": "bg-chart-3",
  "Sales Tax": "bg-chart-4",
  "Tax Notices": "bg-chart-5",
  "CFO Services": "bg-primary",
  "Financial Statements": "bg-emerald-500",
  "Cash Flow": "bg-amber-500",
  "AP & AR": "bg-violet-500",
  Payroll: "bg-rose-500",
  "Bank & CC Rec's": "bg-teal-500",
  Audits: "bg-sky-500",
};

function getCategoryColor(cat: string) {
  return categoryColors[cat] || "bg-muted-foreground";
}

// ── Page Component ───────────────────────────────────────────────────────────

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Sort tasks by due date, then filter
  const sortedTasks = useMemo(() => {
    const filtered =
      statusFilter === "all"
        ? tasks
        : tasks.filter((t) => t.status === statusFilter);
    return [...filtered].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
  }, [statusFilter]);

  // Time log: today's entries
  const todayEntries = useMemo(
    () => timeEntries.filter((e) => e.date === TODAY),
    []
  );

  const todayTotal = useMemo(
    () => todayEntries.reduce((sum, e) => sum + e.duration, 0),
    [todayEntries]
  );

  const todayBillable = useMemo(
    () =>
      todayEntries.filter((e) => e.billable).reduce((s, e) => s + e.duration, 0),
    [todayEntries]
  );

  // Analytics
  const allTimeTotal = useMemo(
    () => timeEntries.reduce((s, e) => s + e.duration, 0),
    []
  );
  const allTimeBillable = useMemo(
    () =>
      timeEntries.filter((e) => e.billable).reduce((s, e) => s + e.duration, 0),
    []
  );
  const billableRate = allTimeTotal > 0 ? (allTimeBillable / allTimeTotal) * 100 : 0;

  const uniqueClients = useMemo(
    () => new Set(timeEntries.map((e) => e.client)).size,
    []
  );
  const avgHoursPerClient =
    uniqueClients > 0 ? allTimeTotal / uniqueClients : 0;

  // Hours by category for analytics
  const hoursByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    timeEntries.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.duration;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([category, hours]) => ({ category, hours }));
  }, []);

  const maxCategoryHours = useMemo(
    () => Math.max(...hoursByCategory.map((c) => c.hours), 1),
    [hoursByCategory]
  );

  // Filter pills counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasks.length };
    tasks.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return counts;
  }, []);

  return (
    <div className="space-y-8">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Tasks & Time
          </h1>
          <p className="text-sm text-muted-foreground">
            Track work, log hours, meet deadlines
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button className="cursor-pointer gap-2">
            <Clock className="size-4" />
            Log Time
          </Button>
          <Button variant="outline" className="cursor-pointer gap-2">
            <Plus className="size-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* ── Quick Time Entry Bar ──────────────────────────────────────── */}
      <Card className="py-5">
        <CardContent className="space-y-4">
          <div className="relative">
            <Input
              placeholder='What did you work on? e.g. "Spent 2 hours on OES tax review"'
              className="h-12 pr-12 text-base placeholder:text-muted-foreground/60"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <Mic className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Voice input</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground mr-1">
              Quick add:
            </span>
            {quickCategories.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setSelectedCategory(selectedCategory === cat ? null : cat)
                }
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 ${
                  selectedCategory === cat
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <Tabs defaultValue="tasks">
        <TabsList variant="line">
          <TabsTrigger value="tasks" className="cursor-pointer gap-1.5">
            <CheckCircle2 className="size-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="time-log" className="cursor-pointer gap-1.5">
            <Clock className="size-4" />
            Time Log
          </TabsTrigger>
          <TabsTrigger value="analytics" className="cursor-pointer gap-1.5">
            <BarChart3 className="size-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* ── Tasks Tab ──────────────────────────────────────────────── */}
        <TabsContent value="tasks" className="mt-6 space-y-6">
          {/* Filter pills */}
          <div className="flex items-center gap-2">
            {(
              [
                { key: "all", label: "All" },
                { key: "todo", label: "To Do" },
                { key: "in-progress", label: "In Progress" },
                { key: "review", label: "Review" },
                { key: "done", label: "Done" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  statusFilter === key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                }`}
              >
                {label}
                <span className="ml-1.5 opacity-60">
                  {statusCounts[key] || 0}
                </span>
              </button>
            ))}
          </div>

          {/* Task cards grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>

          {sortedTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                No tasks match this filter.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ── Time Log Tab ───────────────────────────────────────────── */}
        <TabsContent value="time-log" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Today &mdash;{" "}
              {new Date(TODAY).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h3>
          </div>

          <Card className="py-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="pl-4 w-[72px]">Time</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="min-w-[260px]">Description</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="pr-4 text-center w-[80px]">
                    Billable
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todayEntries.map((entry, idx) => {
                  const member = teamMembers.find(
                    (m) => m.name === entry.member
                  );
                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer transition-colors duration-150"
                    >
                      <TableCell className="pl-4 text-muted-foreground text-xs tabular-nums">
                        {idx === 0
                          ? "9:00"
                          : idx === 1
                          ? "9:30"
                          : idx === 2
                          ? "10:00"
                          : idx === 3
                          ? "10:15"
                          : idx === 4
                          ? "11:00"
                          : "11:30"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar size="sm">
                            <AvatarFallback className="text-[10px] font-medium">
                              {member?.avatar || entry.member[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">
                            {entry.member}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{entry.client}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="font-normal text-xs"
                        >
                          {entry.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {entry.description}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold tabular-nums">
                          {entry.duration}h
                        </span>
                      </TableCell>
                      <TableCell className="pr-4 text-center">
                        {entry.billable ? (
                          <DollarSign className="inline-block size-4 text-emerald-600" />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            --
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <Separator />
            <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
              <span className="text-sm text-muted-foreground">
                Today:{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {todayTotal} hours
                </span>{" "}
                logged
              </span>
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-emerald-600 tabular-nums">
                  {todayBillable} billable
                </span>{" "}
                of {todayTotal} total
              </span>
            </div>
          </Card>
        </TabsContent>

        {/* ── Analytics Tab ──────────────────────────────────────────── */}
        <TabsContent value="analytics" className="mt-6 space-y-6">
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="py-5">
              <CardContent className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Total Hours
                  </p>
                  <p className="text-3xl font-semibold tabular-nums tracking-tight">
                    {allTimeTotal}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Across {timeEntries.length} entries
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Timer className="size-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card className="py-5">
              <CardContent className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Billable Rate
                  </p>
                  <p className="text-3xl font-semibold tabular-nums tracking-tight">
                    {billableRate.toFixed(0)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {allTimeBillable}h billable of {allTimeTotal}h
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50">
                  <TrendingUp className="size-5 text-emerald-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="py-5">
              <CardContent className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Avg Hours / Client
                  </p>
                  <p className="text-3xl font-semibold tabular-nums tracking-tight">
                    {avgHoursPerClient.toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {uniqueClients} clients tracked
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50">
                  <Users className="size-5 text-blue-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Utilization by category */}
          <Card>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Hours by Category</h3>
                  <p className="text-xs text-muted-foreground">
                    Time distribution across service categories
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {hoursByCategory.map(({ category, hours }) => {
                  const pct = (hours / maxCategoryHours) * 100;
                  return (
                    <div key={category} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{category}</span>
                        <span className="text-sm tabular-nums text-muted-foreground font-medium">
                          {hours}h
                        </span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${getCategoryColor(
                            category
                          )}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Task Card Component ──────────────────────────────────────────────────────

function TaskCard({ task }: { task: Task }) {
  const member = teamMembers.find((m) => m.name === task.assignee);
  const progress =
    task.estimatedHours > 0
      ? Math.min((task.loggedHours / task.estimatedHours) * 100, 100)
      : 0;

  const status = statusConfig[task.status];
  const priority = priorityConfig[task.priority];
  const StatusIcon = status.icon;

  return (
    <Card className="group cursor-pointer py-0 transition-all duration-200 hover:shadow-md hover:border-foreground/10">
      <div className="p-5 space-y-4">
        {/* Top row: priority + status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${priority.color}`}
              title={`${priority.label} priority`}
            />
            <span className="text-xs text-muted-foreground font-medium">
              {task.client}
            </span>
          </div>
          <Badge
            variant="outline"
            className={`gap-1 text-[11px] font-medium ${status.className}`}
          >
            <StatusIcon className="size-3" />
            {status.label}
          </Badge>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold leading-snug group-hover:text-foreground/80 transition-colors duration-150">
            {task.title}
          </h3>
          {task.recurring && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <RefreshCw className="size-3" />
              Recurring
            </div>
          )}
        </div>

        {/* Category badge */}
        <Badge variant="secondary" className="font-normal text-xs">
          {task.category}
        </Badge>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {task.loggedHours}h / {task.estimatedHours}h
            </span>
            <span className="tabular-nums text-muted-foreground font-medium">
              {progress.toFixed(0)}%
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        <Separator />

        {/* Footer: assignee + due date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback className="text-[10px] font-medium">
                {member?.avatar || task.assignee[0]}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground font-medium">
              {task.assignee}
            </span>
          </div>
          <div
            className={`flex items-center gap-1 text-xs font-medium ${dueDateColor(
              task.dueDate
            )}`}
          >
            <Calendar className="size-3" />
            {relativeDueDate(task.dueDate)}
          </div>
        </div>
      </div>
    </Card>
  );
}

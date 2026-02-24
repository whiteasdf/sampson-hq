"use client";

import { firmStats, tasks, teamMembers, communications } from "@/lib/data";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Mic,
  DollarSign,
  Users,
  Activity,
  Clock,
  Mail,
  Phone,
  MessageSquare,
  CalendarDays,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Loader2,
  Zap,
} from "lucide-react";

// ── Helpers ─────────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function daysUntil(dateStr: string) {
  const today = new Date("2026-02-20");
  const target = new Date(dateStr);
  const diff = Math.ceil(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diff;
}

function formatDueLabel(dateStr: string) {
  const days = daysUntil(dateStr);
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days}d`;
}

function timeAgo(dateStr: string) {
  const now = new Date("2026-02-20T12:00:00");
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getStatusIcon(status: string) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="size-4 text-success" />;
    case "in-progress":
      return <Loader2 className="size-4 text-chart-1" />;
    case "review":
      return <AlertCircle className="size-4 text-warning" />;
    default:
      return <Circle className="size-4 text-muted-foreground" />;
  }
}

function getCommIcon(type: "email" | "call" | "text") {
  switch (type) {
    case "email":
      return <Mail className="size-4" />;
    case "call":
      return <Phone className="size-4" />;
    case "text":
      return <MessageSquare className="size-4" />;
  }
}

function utilizationColor(pct: number) {
  if (pct >= 75) return "bg-success";
  if (pct >= 60) return "bg-warning";
  return "bg-destructive";
}

function utilizationTextColor(pct: number) {
  if (pct >= 75) return "text-success";
  if (pct >= 60) return "text-warning";
  return "text-destructive";
}

// ── Data preparation ────────────────────────────────────────────────────────────

const priorityTasks = tasks
  .filter((t) => t.status !== "done")
  .sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  })
  .slice(0, 5);

const upcomingDeadlines = tasks
  .filter((t) => {
    const days = daysUntil(t.dueDate);
    return days >= 0 && days <= 7 && t.status !== "done";
  })
  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

const recentComms = communications.slice(0, 3);

const sortedTeam = [...teamMembers].sort(
  (a, b) => b.utilization - a.utilization
);

// Monetary efficiency: revenue generated vs cost, sorted by multiplier
const efficiencyData = [...teamMembers]
  .map((m) => {
    const revenue = m.billableHours * m.billingRate;
    const cost = m.totalHours * m.costRate;
    const multiplier = cost > 0 ? revenue / cost : 0;
    return { ...m, revenue, cost, multiplier };
  })
  .sort((a, b) => b.multiplier - a.multiplier);

const maxRevenue = Math.max(...efficiencyData.map((m) => m.revenue));

const revenuePercent = Math.round(
  (firmStats.monthlyRevenue / firmStats.monthlyRevenueTarget) * 100
);

// ── Component ───────────────────────────────────────────────────────────────────

export default function DashboardHome() {
  return (
    <div className="space-y-8">
          {/* ── Header ─────────────────────────────────────────────────── */}
          <header className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Good morning
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                February 20, 2026
              </p>
            </div>
            <Button className="cursor-pointer gap-2" size="default">
              <Mic className="size-4" />
              Quick Entry
            </Button>
          </header>

          {/* ── Stat Cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Revenue */}
            <Card className="group cursor-pointer transition-shadow duration-200 hover:shadow-md">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    Monthly Revenue
                  </p>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                    <DollarSign className="size-4 text-muted-foreground" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight">
                    {formatCurrency(firmStats.monthlyRevenue)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {formatCurrency(firmStats.monthlyRevenueTarget)}
                  </span>
                </div>
                <div className="mt-3">
                  <Progress value={revenuePercent} className="h-1.5" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {revenuePercent}% of target
                </p>
              </CardContent>
            </Card>

            {/* Active Clients */}
            <Card className="group cursor-pointer transition-shadow duration-200 hover:shadow-md">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    Active Clients
                  </p>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                    <Users className="size-4 text-muted-foreground" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight">
                    {firmStats.activeClients}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    of {firmStats.totalClients}
                  </span>
                </div>
                <div className="mt-3">
                  <Progress
                    value={
                      (firmStats.activeClients / firmStats.totalClients) * 100
                    }
                    className="h-1.5"
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {firmStats.totalClients - firmStats.activeClients} pending or
                  at-risk
                </p>
              </CardContent>
            </Card>

            {/* Team Utilization */}
            <Card className="group cursor-pointer transition-shadow duration-200 hover:shadow-md">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    Team Utilization
                  </p>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                    <Activity className="size-4 text-muted-foreground" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight">
                    {firmStats.avgUtilization}%
                  </span>
                  <span className="text-xs text-muted-foreground">average</span>
                </div>
                <div className="mt-3">
                  <Progress
                    value={firmStats.avgUtilization}
                    className="h-1.5"
                  />
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-success">
                  <TrendingUp className="size-3" />
                  On track this month
                </p>
              </CardContent>
            </Card>

            {/* Outstanding Balance */}
            <Card className="group cursor-pointer transition-shadow duration-200 hover:shadow-md">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    Outstanding Balance
                  </p>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                    <Clock className="size-4 text-muted-foreground" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight">
                    {formatCurrency(firmStats.totalOutstanding)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <AlertCircle className="size-3.5 text-warning" />
                  <span className="text-xs text-muted-foreground">
                    Across 3 clients
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Two-column layout ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.65fr]">
            {/* Left: Priority Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  Today&apos;s Priority Tasks
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {priorityTasks.map((task, idx) => {
                    const progress = task.estimatedHours
                      ? Math.round(
                          (task.loggedHours / task.estimatedHours) * 100
                        )
                      : 0;
                    const member = teamMembers.find(
                      (m) => m.name === task.assignee
                    );
                    const dueDays = daysUntil(task.dueDate);
                    const dueLabel = formatDueLabel(task.dueDate);
                    const isUrgent = dueDays <= 2;

                    return (
                      <div key={task.id}>
                        {idx > 0 && <Separator className="my-3" />}
                        <div className="group flex items-center gap-4 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-secondary/50 cursor-pointer">
                          {/* Status icon */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex-shrink-0">
                                {getStatusIcon(task.status)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={4}>
                              {task.status === "in-progress"
                                ? "In Progress"
                                : task.status === "todo"
                                ? "To Do"
                                : task.status === "review"
                                ? "In Review"
                                : "Done"}
                            </TooltipContent>
                          </Tooltip>

                          {/* Task info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-foreground">
                                {task.title}
                              </p>
                              {task.priority === "high" && (
                                <Badge
                                  variant="secondary"
                                  className="border-destructive/20 bg-destructive/10 text-destructive text-[10px] px-1.5 py-0"
                                >
                                  High
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-3">
                              <span className="text-xs text-muted-foreground">
                                {task.client}
                              </span>
                              <span className="text-muted-foreground/40">
                                ·
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {task.loggedHours}h / {task.estimatedHours}h
                              </span>
                            </div>
                            {/* Progress bar */}
                            <div className="mt-2 max-w-48">
                              <Progress value={progress} className="h-1" />
                            </div>
                          </div>

                          {/* Due date badge */}
                          <Badge
                            variant="outline"
                            className={`flex-shrink-0 text-xs font-normal ${
                              isUrgent
                                ? "border-destructive/30 text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {dueLabel}
                          </Badge>

                          {/* Assignee avatar */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Avatar size="sm">
                                  <AvatarFallback className="text-[10px] font-medium">
                                    {member?.avatar ?? task.assignee[0]}
                                  </AvatarFallback>
                                </Avatar>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={4}>
                              {task.assignee}
                            </TooltipContent>
                          </Tooltip>

                          <ArrowUpRight className="size-4 text-muted-foreground/0 transition-colors duration-150 group-hover:text-muted-foreground" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Right column */}
            <div className="flex flex-col gap-6">
              {/* Upcoming Deadlines */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="size-4 text-muted-foreground" />
                    Upcoming Deadlines
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-0">
                    {upcomingDeadlines.map((task, idx) => {
                      const dueDays = daysUntil(task.dueDate);
                      const isUrgent = dueDays <= 2;
                      return (
                        <div key={task.id}>
                          {idx > 0 && <Separator className="my-2.5" />}
                          <div className="group flex items-start gap-3 rounded-lg px-1 py-1.5 transition-colors duration-150 hover:bg-secondary/50 cursor-pointer">
                            {/* Date column */}
                            <div
                              className={`flex h-10 w-10 flex-shrink-0 flex-col items-center justify-center rounded-lg border text-center ${
                                isUrgent
                                  ? "border-destructive/20 bg-destructive/5"
                                  : "bg-secondary/60"
                              }`}
                            >
                              <span className="text-[10px] font-medium uppercase text-muted-foreground leading-none">
                                {new Date(task.dueDate).toLocaleDateString(
                                  "en-US",
                                  { month: "short" }
                                )}
                              </span>
                              <span
                                className={`text-sm font-semibold leading-tight ${
                                  isUrgent ? "text-destructive" : "text-foreground"
                                }`}
                              >
                                {new Date(task.dueDate).getDate()}
                              </span>
                            </div>
                            {/* Info */}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {task.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {task.client}
                                <span className="text-muted-foreground/40">
                                  {" "}
                                  ·{" "}
                                </span>
                                {task.assignee}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="size-4 text-muted-foreground" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-0">
                    {recentComms.map((comm, idx) => (
                      <div key={comm.id}>
                        {idx > 0 && <Separator className="my-2.5" />}
                        <div className="group flex items-start gap-3 rounded-lg px-1 py-1.5 transition-colors duration-150 hover:bg-secondary/50 cursor-pointer">
                          {/* Icon */}
                          <div
                            className={`mt-0.5 flex size-8 flex-shrink-0 items-center justify-center rounded-lg ${
                              !comm.read
                                ? "bg-chart-1/10 text-chart-1"
                                : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {getCommIcon(comm.type)}
                          </div>
                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className={`truncate text-sm ${
                                  !comm.read
                                    ? "font-semibold text-foreground"
                                    : "font-medium text-foreground"
                                }`}
                              >
                                {comm.from}
                              </p>
                              <span className="flex-shrink-0 text-xs text-muted-foreground">
                                {timeAgo(comm.date)}
                              </span>
                            </div>
                            {comm.subject && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {comm.subject}
                              </p>
                            )}
                            <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
                              {comm.preview}
                            </p>
                          </div>
                          {!comm.read && (
                            <span className="mt-2 size-1.5 flex-shrink-0 rounded-full bg-chart-1" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── Team Workload ──────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-muted-foreground" />
                Team Workload
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {sortedTeam.map((member) => (
                  <div
                    key={member.id}
                    className="group flex items-center gap-4 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-secondary/50 cursor-pointer"
                  >
                    {/* Avatar */}
                    <Avatar size="sm">
                      <AvatarFallback className="text-[10px] font-medium">
                        {member.avatar}
                      </AvatarFallback>
                    </Avatar>

                    {/* Name + role */}
                    <div className="w-32 flex-shrink-0">
                      <p className="text-sm font-medium text-foreground">
                        {member.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        {member.role}
                      </p>
                    </div>

                    {/* Bar */}
                    <div className="flex flex-1 items-center gap-3">
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${utilizationColor(
                            member.utilization
                          )}`}
                          style={{ width: `${member.utilization}%` }}
                        />
                      </div>
                      <span
                        className={`w-10 text-right text-sm font-semibold tabular-nums ${utilizationTextColor(
                          member.utilization
                        )}`}
                      >
                        {member.utilization}%
                      </span>
                    </div>

                    {/* Hours */}
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      {member.billableHours}h / {member.totalHours}h
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Monetary Efficiency ────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Zap className="size-4 text-muted-foreground" />
                    Revenue Efficiency
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Revenue generated vs. labor cost per team member &mdash; higher multiplier = more profitable
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-chart-1" />
                    Revenue
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/25" />
                    Cost
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-4">
                {efficiencyData.map((member) => {
                  const revPct = (member.revenue / maxRevenue) * 100;
                  const costPct = (member.cost / maxRevenue) * 100;
                  const isTop = member.multiplier >= 3;

                  return (
                    <div
                      key={member.id}
                      className="group flex items-center gap-4 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-secondary/50 cursor-pointer"
                    >
                      {/* Avatar */}
                      <Avatar size="sm">
                        <AvatarFallback className="text-[10px] font-medium">
                          {member.avatar}
                        </AvatarFallback>
                      </Avatar>

                      {/* Name + role */}
                      <div className="w-32 flex-shrink-0">
                        <p className="text-sm font-medium text-foreground">
                          {member.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          {member.role}
                        </p>
                      </div>

                      {/* Stacked bars */}
                      <div className="flex flex-1 flex-col gap-1">
                        {/* Revenue bar */}
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-chart-1 transition-all duration-500"
                            style={{ width: `${revPct}%` }}
                          />
                        </div>
                        {/* Cost bar */}
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-muted-foreground/25 transition-all duration-500"
                            style={{ width: `${costPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Revenue / Cost labels */}
                      <div className="hidden w-28 flex-shrink-0 text-right sm:block">
                        <p className="text-xs font-medium tabular-nums text-foreground">
                          {formatCurrency(member.revenue)}
                        </p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {formatCurrency(member.cost)} cost
                        </p>
                      </div>

                      {/* Multiplier */}
                      <Badge
                        variant="secondary"
                        className={`w-14 justify-center tabular-nums text-xs font-semibold ${
                          isTop
                            ? "bg-success/10 text-success border-success/20"
                            : "text-muted-foreground"
                        }`}
                      >
                        {member.multiplier.toFixed(1)}x
                      </Badge>
                    </div>
                  );
                })}
              </div>

              {/* Summary row */}
              <Separator className="mt-5 mb-4" />
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Total Revenue
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {formatCurrency(efficiencyData.reduce((s, m) => s + m.revenue, 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Total Cost
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {formatCurrency(efficiencyData.reduce((s, m) => s + m.cost, 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Firm Multiplier
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-chart-1">
                      {(
                        efficiencyData.reduce((s, m) => s + m.revenue, 0) /
                        efficiencyData.reduce((s, m) => s + m.cost, 0)
                      ).toFixed(1)}x
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-success">
                  <TrendingUp className="size-3.5" />
                  <span className="font-medium">Healthy margin</span>
                </div>
              </div>
            </CardContent>
          </Card>
    </div>
  );
}

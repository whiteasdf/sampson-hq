"use client";

import { useState, useMemo } from "react";
import {
  UserPlus,
  Search,
  Mail,
  Phone,
  MessageSquare,
  AlertTriangle,
  DollarSign,
  Clock,
  ArrowRight,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { clients, communications, teamMembers } from "@/lib/data";
import type { Client, Communication } from "@/lib/data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeDate(dateStr: string): string {
  const now = new Date("2026-02-20T12:00:00");
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const contactTypeIcon: Record<string, typeof Mail> = {
  email: Mail,
  call: Phone,
  text: MessageSquare,
};

function getHealthColor(score: number) {
  if (score > 85) return { ring: "text-emerald-500", bg: "bg-emerald-500/10" };
  if (score >= 70) return { ring: "text-amber-500", bg: "bg-amber-500/10" };
  return { ring: "text-red-500", bg: "bg-red-500/10" };
}

function getStatusColor(status: Client["status"]) {
  if (status === "active") return "bg-emerald-500";
  if (status === "pending") return "bg-amber-400";
  return "bg-red-500";
}

function getCommTypeStyle(type: Communication["type"]) {
  if (type === "email")
    return { bg: "bg-blue-50", text: "text-blue-600", Icon: Mail };
  if (type === "call")
    return { bg: "bg-emerald-50", text: "text-emerald-600", Icon: Phone };
  return {
    bg: "bg-purple-50",
    text: "text-purple-600",
    Icon: MessageSquare,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HealthScoreRing({ score }: { score: number }) {
  const { ring, bg } = getHealthColor(score);
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="48" height="48" className="-rotate-90">
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-muted/60"
        />
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={ring}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <span
        className={`absolute text-xs font-semibold ${ring.replace("text-", "text-")}`}
      >
        {score}
      </span>
    </div>
  );
}

function ClientCard({ client }: { client: Client }) {
  const ContactIcon = contactTypeIcon[client.lastContactType];
  const maxVisible = 3;
  const visibleMembers = client.assignedTo.slice(0, maxVisible);
  const remaining = client.assignedTo.length - maxVisible;
  const maxServices = 3;
  const visibleServices = client.services.slice(0, maxServices);
  const moreServices = client.services.length - maxServices;

  return (
    <Card className="group relative cursor-pointer transition-shadow duration-200 hover:shadow-md">
      {/* Status dot */}
      <div className="absolute top-5 right-5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`block h-2.5 w-2.5 rounded-full ${getStatusColor(client.status)} ring-2 ring-white`}
            />
          </TooltipTrigger>
          <TooltipContent sideOffset={4}>
            <span className="capitalize">{client.status}</span>
          </TooltipContent>
        </Tooltip>
      </div>

      <CardContent className="flex flex-col gap-5">
        {/* Top: Name + Entity + Industry */}
        <div className="flex flex-col gap-1.5 pr-6">
          <div className="flex items-center gap-2.5">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              {client.name}
            </h3>
            <Badge
              variant="secondary"
              className="text-[11px] font-medium px-2 py-0"
            >
              {client.entityType}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{client.industry}</p>
        </div>

        {/* Middle row: Health + Team */}
        <div className="flex items-center justify-between">
          <HealthScoreRing score={client.healthScore} />
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Team
            </span>
            <AvatarGroup>
              {visibleMembers.map((name) => {
                const member = teamMembers.find((m) => m.name === name);
                return (
                  <Tooltip key={name}>
                    <TooltipTrigger asChild>
                      <Avatar size="sm">
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                          {member?.avatar ?? name[0]}
                        </AvatarFallback>
                      </Avatar>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={4}>{name}</TooltipContent>
                  </Tooltip>
                );
              })}
              {remaining > 0 && (
                <AvatarGroupCount className="text-[10px]">
                  +{remaining}
                </AvatarGroupCount>
              )}
            </AvatarGroup>
          </div>
        </div>

        {/* Services */}
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleServices.map((svc) => (
            <Badge
              key={svc}
              variant="outline"
              className="text-[10px] font-normal text-muted-foreground px-2 py-0.5"
            >
              {svc}
            </Badge>
          ))}
          {moreServices > 0 && (
            <span className="text-[10px] text-muted-foreground font-medium">
              +{moreServices} more
            </span>
          )}
        </div>

        {/* Bottom: Retainer + Last Contact */}
        <div className="flex items-end justify-between border-t border-border/60 pt-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Monthly retainer
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatCurrency(client.monthlyRetainer)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ContactIcon className="h-3.5 w-3.5" />
            <span className="text-xs">{relativeDate(client.lastContact)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CommunicationRow({ comm }: { comm: Communication }) {
  const { bg, text, Icon } = getCommTypeStyle(comm.type);
  const client = clients.find((c) => c.id === comm.clientId);

  return (
    <div
      className={`group flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors duration-150 hover:bg-accent/50 ${
        !comm.read ? "border-l-2 border-l-blue-500 bg-blue-50/30" : ""
      }`}
    >
      {/* Type icon circle */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bg}`}
      >
        <Icon className={`h-4 w-4 ${text}`} />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm ${!comm.read ? "font-semibold text-foreground" : "font-medium text-foreground"}`}
          >
            {comm.from}
          </span>
          {client && (
            <Badge
              variant="secondary"
              className="text-[10px] font-medium px-1.5 py-0"
            >
              {client.name}
            </Badge>
          )}
        </div>
        {comm.subject && (
          <p
            className={`text-sm truncate ${!comm.read ? "font-medium text-foreground" : "text-muted-foreground"}`}
          >
            {comm.subject}
          </p>
        )}
        <p className="text-sm text-muted-foreground truncate">
          {comm.preview}
        </p>
      </div>

      {/* Timestamp */}
      <div className="shrink-0 pt-0.5">
        <span
          className={`text-xs ${!comm.read ? "font-semibold text-foreground" : "text-muted-foreground"}`}
        >
          {relativeDate(comm.date)}
        </span>
      </div>
    </div>
  );
}

function AtRiskCard({ client }: { client: Client }) {
  const ContactIcon = contactTypeIcon[client.lastContactType];

  // Generate a risk reason based on the data
  let riskReason: string;
  if (client.status === "at-risk" && client.outstandingBalance > 0) {
    riskReason = `Outstanding balance of ${formatCurrency(client.outstandingBalance)} and declining engagement`;
  } else if (client.outstandingBalance > 0) {
    riskReason = `Outstanding balance of ${formatCurrency(client.outstandingBalance)} overdue`;
  } else if (client.healthScore < 70) {
    riskReason = "Health score below threshold - low engagement";
  } else {
    riskReason = "Health score trending downward - needs attention";
  }

  // Generate suggested action
  let suggestedAction: string;
  if (client.status === "at-risk") {
    suggestedAction = `Schedule urgent call with ${client.teamLead} to address client concerns and review service delivery`;
  } else if (client.outstandingBalance > 0) {
    suggestedAction = `Follow up on outstanding invoice and schedule check-in with ${client.name}`;
  } else {
    suggestedAction = `Have ${client.teamLead} schedule proactive touchpoint to improve engagement`;
  }

  return (
    <Card className="cursor-pointer border-amber-200/70 bg-amber-50/20 transition-shadow duration-200 hover:shadow-md">
      <CardContent className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {client.name}
              </h3>
              <Badge
                variant="secondary"
                className="text-[11px] font-medium px-2 py-0"
              >
                {client.entityType}
              </Badge>
              {client.status === "at-risk" && (
                <Badge
                  variant="destructive"
                  className="text-[10px] font-medium px-2 py-0 gap-1"
                >
                  <AlertTriangle className="h-3 w-3" />
                  At Risk
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{client.industry}</p>
          </div>
          <HealthScoreRing score={client.healthScore} />
        </div>

        {/* Risk Details */}
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200/60 bg-white p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Risk Reason
              </span>
              <p className="text-sm text-foreground">{riskReason}</p>
            </div>
          </div>

          {client.outstandingBalance > 0 && (
            <div className="flex items-start gap-2.5">
              <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Outstanding Balance
                </span>
                <p className="text-sm font-semibold text-red-600">
                  {formatCurrency(client.outstandingBalance)}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Suggested Action
              </span>
              <p className="text-sm text-foreground">{suggestedAction}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Retainer
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatCurrency(client.monthlyRetainer)}
              </span>
            </div>
            <div className="h-8 w-px bg-border/60" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Lead
              </span>
              <span className="text-sm font-medium">{client.teamLead}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <ContactIcon className="h-3.5 w-3.5" />
            <span className="text-xs">
              {relativeDate(client.lastContact)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [commFilter, setCommFilter] = useState<
    "all" | "email" | "call" | "text"
  >("all");

  // Filter clients by search
  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q) ||
        c.entityType.toLowerCase().includes(q) ||
        c.services.some((s) => s.toLowerCase().includes(q))
    );
  }, [search]);

  // At-risk clients
  const atRiskClients = useMemo(
    () =>
      clients.filter(
        (c) => c.healthScore < 85 || c.status === "at-risk"
      ),
    []
  );

  // Sorted communications
  const sortedComms = useMemo(() => {
    const sorted = [...communications].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    if (commFilter === "all") return sorted;
    return sorted.filter((c) => c.type === commFilter);
  }, [commFilter]);

  const commFilterOptions: {
    label: string;
    value: "all" | "email" | "call" | "text";
    Icon: typeof Mail | typeof Filter;
  }[] = [
    { label: "All", value: "all", Icon: Filter },
    { label: "Email", value: "email", Icon: Mail },
    { label: "Calls", value: "call", Icon: Phone },
    { label: "Texts", value: "text", Icon: MessageSquare },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* ----------------------------------------------------------------- */}
      {/* Header */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage relationships, track communications
          </p>
        </div>
        <Button variant="outline" className="cursor-pointer gap-2">
          <UserPlus className="h-4 w-4" />
          Add Client
        </Button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tabs */}
      {/* ----------------------------------------------------------------- */}
      <Tabs defaultValue="all-clients">
        <TabsList variant="line" className="gap-2">
          <TabsTrigger value="all-clients" className="cursor-pointer">
            All Clients
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] px-1.5 py-0"
            >
              {clients.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="communications" className="cursor-pointer">
            Communications
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] px-1.5 py-0"
            >
              {communications.filter((c) => !c.read).length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="at-risk" className="cursor-pointer">
            At Risk
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] px-1.5 py-0"
            >
              {atRiskClients.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ----- All Clients Tab ----- */}
        <TabsContent value="all-clients" className="mt-6 flex flex-col gap-6">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>

          {/* Client Grid */}
          {filteredClients.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredClients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No clients match &ldquo;{search}&rdquo;
              </p>
            </div>
          )}
        </TabsContent>

        {/* ----- Communications Tab ----- */}
        <TabsContent
          value="communications"
          className="mt-6 flex flex-col gap-5"
        >
          {/* Filter pills */}
          <div className="flex items-center gap-2">
            {commFilterOptions.map((opt) => (
              <Button
                key={opt.value}
                variant={commFilter === opt.value ? "default" : "outline"}
                size="sm"
                onClick={() => setCommFilter(opt.value)}
                className="cursor-pointer gap-1.5 text-xs"
              >
                <opt.Icon className="h-3.5 w-3.5" />
                {opt.label}
              </Button>
            ))}
          </div>

          {/* Communications list */}
          <Card className="overflow-hidden py-0">
            <div className="divide-y divide-border/60">
              {sortedComms.map((comm) => (
                <CommunicationRow key={comm.id} comm={comm} />
              ))}
              {sortedComms.length === 0 && (
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                  No communications found
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* ----- At Risk Tab ----- */}
        <TabsContent value="at-risk" className="mt-6 flex flex-col gap-5">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200/70 bg-amber-50/30 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-800">
              <span className="font-medium">{atRiskClients.length} clients</span>{" "}
              require attention &mdash; health score below 85 or flagged at-risk
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {atRiskClients.map((client) => (
              <AtRiskCard key={client.id} client={client} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

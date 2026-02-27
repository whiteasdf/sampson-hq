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
  X,
  FolderOpen,
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
// Document vault mock data
// ---------------------------------------------------------------------------

type DocExt = "pdf" | "xlsx" | "csv" | "docx" | "zip";
type DocSource = "Client" | "IRS" | "State" | "Internal";

type ClientDocument = {
  id: string;
  name: string;
  category: string;
  ext: DocExt;
  date: string;
  size: string;
  source: DocSource;
};

const extConfig: Record<DocExt, { label: string; className: string }> = {
  pdf:  { label: "PDF",  className: "bg-red-50 text-red-700 border-red-200" },
  xlsx: { label: "XLSX", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  csv:  { label: "CSV",  className: "bg-teal-50 text-teal-700 border-teal-200" },
  docx: { label: "DOCX", className: "bg-blue-50 text-blue-700 border-blue-200" },
  zip:  { label: "ZIP",  className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const sourceConfig: Record<DocSource, { className: string }> = {
  Client:   { className: "bg-violet-50 text-violet-700 border-violet-200" },
  IRS:      { className: "bg-red-50 text-red-700 border-red-200" },
  State:    { className: "bg-amber-50 text-amber-700 border-amber-200" },
  Internal: { className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const clientDocuments: Record<string, ClientDocument[]> = {
  oes: [
    { id: "d1",  name: "W-2 Forms (Corrected) — 2025",        category: "Tax Returns",     ext: "pdf",  date: "2026-02-19", size: "312 KB",  source: "Client" },
    { id: "d2",  name: "Q4 2025 Sales Tax Report",             category: "Tax Returns",     ext: "xlsx", date: "2026-02-10", size: "84 KB",   source: "Client" },
    { id: "d3",  name: "Bank Statement — January 2026",        category: "Bank Statements", ext: "pdf",  date: "2026-02-05", size: "1.2 MB",  source: "Client" },
    { id: "d4",  name: "CC Statement — January 2026",          category: "Bank Statements", ext: "pdf",  date: "2026-02-05", size: "890 KB",  source: "Client" },
    { id: "d5",  name: "1120-S Return — 2024",                 category: "Tax Returns",     ext: "pdf",  date: "2025-03-15", size: "1.8 MB",  source: "Internal" },
    { id: "d6",  name: "AP Invoice Summary — January",         category: "Invoices & AP",   ext: "xlsx", date: "2026-02-12", size: "56 KB",   source: "Client" },
  ],
  jd: [
    { id: "d7",  name: "Board Meeting Agenda — Feb 2026",      category: "Board Meetings",  ext: "docx", date: "2026-02-17", size: "42 KB",   source: "Internal" },
    { id: "d8",  name: "Bank Statement — January 2026",        category: "Bank Statements", ext: "pdf",  date: "2026-02-04", size: "760 KB",  source: "Client" },
    { id: "d9",  name: "Property Expense Report — Q4",         category: "Financial Reports", ext: "xlsx", date: "2026-01-28", size: "118 KB", source: "Client" },
    { id: "d10", name: "1065 Partnership Return — 2024",       category: "Tax Returns",     ext: "pdf",  date: "2025-03-12", size: "2.1 MB",  source: "Internal" },
    { id: "d11", name: "Mortgage Statements — Jan 2026",       category: "Bank Statements", ext: "pdf",  date: "2026-02-08", size: "430 KB",  source: "Client" },
  ],
  wwb: [
    { id: "d12", name: "IRS Notice CP2000 — 2024",             category: "IRS Notices",     ext: "pdf",  date: "2026-02-14", size: "520 KB",  source: "IRS" },
    { id: "d13", name: "Payroll Register — February 2026",     category: "Payroll",         ext: "xlsx", date: "2026-02-14", size: "96 KB",   source: "Client" },
    { id: "d14", name: "Sales Report — January 2026",          category: "Financial Reports", ext: "csv", date: "2026-02-03", size: "68 KB",  source: "Client" },
    { id: "d15", name: "Bank Statement — January 2026",        category: "Bank Statements", ext: "pdf",  date: "2026-02-05", size: "940 KB",  source: "Client" },
    { id: "d16", name: "1065 Partnership Return — 2024",       category: "Tax Returns",     ext: "pdf",  date: "2025-03-14", size: "1.6 MB",  source: "Internal" },
  ],
  monda: [
    { id: "d17", name: "Financial Statements — January 2026",  category: "Financial Reports", ext: "pdf", date: "2026-02-20", size: "410 KB", source: "Internal" },
    { id: "d18", name: "Board Resolutions — Q4 2025",          category: "Board Meetings",  ext: "docx", date: "2026-01-15", size: "58 KB",   source: "Client" },
    { id: "d19", name: "Employee Stock Options Report",         category: "Payroll",         ext: "xlsx", date: "2026-01-20", size: "124 KB",  source: "Client" },
    { id: "d20", name: "Bank Statement — January 2026",        category: "Bank Statements", ext: "pdf",  date: "2026-02-04", size: "1.1 MB",  source: "Client" },
    { id: "d21", name: "1120 Corporate Return — 2024",         category: "Tax Returns",     ext: "pdf",  date: "2025-04-10", size: "2.4 MB",  source: "Internal" },
    { id: "d22", name: "R&D Tax Credit Summary",               category: "Tax Returns",     ext: "xlsx", date: "2025-04-05", size: "72 KB",   source: "Internal" },
  ],
  "green-team": [
    { id: "d23", name: "Q4 2025 Sales Tax Records",            category: "Tax Returns",     ext: "xlsx", date: "2026-02-18", size: "88 KB",   source: "Client" },
    { id: "d24", name: "Job Cost Report — January 2026",       category: "Financial Reports", ext: "xlsx", date: "2026-02-10", size: "148 KB", source: "Client" },
    { id: "d25", name: "Subcontractor 1099s — 2025",           category: "Tax Returns",     ext: "pdf",  date: "2026-01-30", size: "280 KB",  source: "Internal" },
    { id: "d26", name: "Bank Statement — January 2026",        category: "Bank Statements", ext: "pdf",  date: "2026-02-05", size: "820 KB",  source: "Client" },
    { id: "d27", name: "Insurance Certificates — 2026",        category: "Contracts",       ext: "pdf",  date: "2026-01-10", size: "190 KB",  source: "Client" },
    { id: "d28", name: "AIA Billing Schedule — February",      category: "Invoices & AP",   ext: "pdf",  date: "2026-02-12", size: "62 KB",   source: "Client" },
  ],
  "the-experience": [
    { id: "d29", name: "Artist Payroll — February 2026",       category: "Payroll",         ext: "xlsx", date: "2026-02-14", size: "76 KB",   source: "Client" },
    { id: "d30", name: "Venue Revenue Report — January",       category: "Financial Reports", ext: "csv", date: "2026-02-05", size: "52 KB",  source: "Client" },
    { id: "d31", name: "Bank Statement — January 2026",        category: "Bank Statements", ext: "pdf",  date: "2026-02-04", size: "1.0 MB",  source: "Client" },
    { id: "d32", name: "Invoice #4521 (Disputed)",             category: "Invoices & AP",   ext: "pdf",  date: "2026-02-01", size: "38 KB",   source: "Internal" },
    { id: "d33", name: "Q4 2025 Sales Tax Summary",            category: "Tax Returns",     ext: "xlsx", date: "2026-01-22", size: "64 KB",   source: "Client" },
  ],
  obi: [
    { id: "d34", name: "Inventory Count Sheet — February",     category: "Financial Reports", ext: "xlsx", date: "2026-02-15", size: "204 KB", source: "Client" },
    { id: "d35", name: "POS Sales Report — January 2026",      category: "Financial Reports", ext: "csv", date: "2026-02-03", size: "310 KB", source: "Client" },
    { id: "d36", name: "Bank Statement — January 2026",        category: "Bank Statements", ext: "pdf",  date: "2026-02-04", size: "870 KB",  source: "Client" },
    { id: "d37", name: "AP Invoices — February 2026",          category: "Invoices & AP",   ext: "pdf",  date: "2026-02-10", size: "1.4 MB",  source: "Client" },
    { id: "d38", name: "Q4 2025 Sales Tax Summary",            category: "Tax Returns",     ext: "xlsx", date: "2026-01-20", size: "90 KB",   source: "Client" },
  ],
  devocion: [
    { id: "d39", name: "P&L Statement — January 2026",         category: "Financial Reports", ext: "pdf", date: "2026-02-20", size: "310 KB", source: "Internal" },
    { id: "d40", name: "Cost of Goods Report — January",       category: "Financial Reports", ext: "xlsx", date: "2026-02-08", size: "82 KB", source: "Client" },
    { id: "d41", name: "Bank Statement — January 2026",        category: "Bank Statements", ext: "pdf",  date: "2026-02-05", size: "540 KB",  source: "Client" },
    { id: "d42", name: "2024 Tax Return (1065)",               category: "Tax Returns",     ext: "pdf",  date: "2025-04-14", size: "1.3 MB",  source: "Internal" },
  ],
  elan: [
    { id: "d43", name: "Employee Roster — February 2026",      category: "Payroll",         ext: "xlsx", date: "2026-02-13", size: "44 KB",   source: "Client" },
    { id: "d44", name: "Payroll Records — January 2026",       category: "Payroll",         ext: "xlsx", date: "2026-01-31", size: "60 KB",   source: "Client" },
    { id: "d45", name: "Bank Statement — January 2026",        category: "Bank Statements", ext: "pdf",  date: "2026-02-04", size: "620 KB",  source: "Client" },
    { id: "d46", name: "Q4 2025 Sales Tax Records",            category: "Tax Returns",     ext: "xlsx", date: "2026-01-18", size: "50 KB",   source: "Client" },
    { id: "d47", name: "AP Invoices — January 2026",           category: "Invoices & AP",   ext: "pdf",  date: "2026-01-28", size: "280 KB",  source: "Client" },
  ],
  amaracon: [
    { id: "d48", name: "Audit Prep Document Package",          category: "Audit",           ext: "zip",  date: "2026-02-15", size: "18.4 MB", source: "Client" },
    { id: "d49", name: "Financial Statements — January 2026",  category: "Financial Reports", ext: "pdf", date: "2026-02-18", size: "480 KB", source: "Internal" },
    { id: "d50", name: "Bank Statement — January 2026",        category: "Bank Statements", ext: "pdf",  date: "2026-02-04", size: "1.3 MB",  source: "Client" },
    { id: "d51", name: "Client Invoices — Q4 2025",            category: "Invoices & AP",   ext: "xlsx", date: "2026-01-15", size: "120 KB",  source: "Client" },
    { id: "d52", name: "1120 Corporate Return — 2024",         category: "Tax Returns",     ext: "pdf",  date: "2025-04-10", size: "2.8 MB",  source: "Internal" },
  ],
};

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

function ClientDocumentsDrawer({
  client,
  onClose,
}: {
  client: Client;
  onClose: () => void;
}) {
  const [docSearch, setDocSearch] = useState("");
  const docs = clientDocuments[client.id] ?? [];

  const filtered = docSearch.trim()
    ? docs.filter(
        (d) =>
          d.name.toLowerCase().includes(docSearch.toLowerCase()) ||
          d.category.toLowerCase().includes(docSearch.toLowerCase())
      )
    : docs;

  // Group by category, preserving insertion order
  const grouped = filtered.reduce<Record<string, ClientDocument[]>>((acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = [];
    acc[doc.category].push(doc);
    return acc;
  }, {});

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-[101] flex h-full w-[440px] flex-col bg-background shadow-2xl border-l border-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold">{client.name}</h2>
              <Badge variant="secondary" className="text-[11px]">
                {client.entityType}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {docs.length} document{docs.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="border-b border-border/60 px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto">
          {Object.keys(grouped).length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <FolderOpen className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No documents found</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {Object.entries(grouped).map(([category, categoryDocs]) => (
                <div key={category}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 bg-muted/30 px-6 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {category}
                    </span>
                    <span className="text-[11px] text-muted-foreground/50">
                      {categoryDocs.length}
                    </span>
                  </div>
                  {/* Documents */}
                  <div className="divide-y divide-border/40">
                    {categoryDocs.map((doc) => {
                      const ext = extConfig[doc.ext];
                      const src = sourceConfig[doc.source];
                      return (
                        <div
                          key={doc.id}
                          className="flex cursor-pointer items-start gap-3 px-6 py-3 transition-colors hover:bg-muted/30"
                        >
                          <Badge
                            variant="outline"
                            className={`mt-0.5 shrink-0 px-1.5 font-mono text-[10px] font-normal ${ext.className}`}
                          >
                            {ext.label}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-snug">
                              {doc.name}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(doc.date).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                              <span className="text-[11px] text-muted-foreground/40">·</span>
                              <span className="text-[11px] text-muted-foreground">
                                {doc.size}
                              </span>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[10px] font-normal ${src.className}`}
                          >
                            {doc.source}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ClientCard({ client, onClick }: { client: Client; onClick: () => void }) {
  const ContactIcon = contactTypeIcon[client.lastContactType];
  const maxVisible = 3;
  const visibleMembers = client.assignedTo.slice(0, maxVisible);
  const remaining = client.assignedTo.length - maxVisible;
  const maxServices = 3;
  const visibleServices = client.services.slice(0, maxServices);
  const moreServices = client.services.length - maxServices;

  return (
    <Card className="group relative cursor-pointer transition-shadow duration-200 hover:shadow-md" onClick={onClick}>
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
  const [commFilter, setCommFilter] = useState<"all" | "email" | "call" | "text">("all");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

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
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
              {clients.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="communications" className="cursor-pointer">
            Communications
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
              {communications.filter((c) => !c.read).length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ----- All Clients Tab ----- */}
        <TabsContent value="all-clients" className="mt-6 flex flex-col gap-8">

          {/* Needs Attention section */}
          {atRiskClients.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <h2 className="text-sm font-semibold text-amber-800">
                    Needs Attention
                  </h2>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {atRiskClients.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {atRiskClients.map((client) => (
                  <AtRiskCard key={client.id} client={client} />
                ))}
              </div>
              <div className="border-t border-border/60" />
            </div>
          )}

          {/* Search */}
          <div className="flex flex-col gap-5">
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
                  <ClientCard
                    key={client.id}
                    client={client}
                    onClick={() => setSelectedClient(client)}
                  />
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
          </div>
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

      </Tabs>

      {selectedClient && (
        <ClientDocumentsDrawer
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
}

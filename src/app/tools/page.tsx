"use client";

import { useState } from "react";
import {
  Search,
  Calendar,
  FileText,
  DollarSign,
  ClipboardCheck,
  Receipt,
  UserPlus,
  ArrowRight,
  BookOpen,
  Clock,
  CalendarDays,
  Users,
  Layers,
  Briefcase,
  ShieldCheck,
  CreditCard,
  FileBarChart,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/* -------------------------------------------------------------------------- */
/*  DATA                                                                      */
/* -------------------------------------------------------------------------- */

interface Tool {
  name: string;
  description: string;
  icon: LucideIcon;
  accent: string; // tailwind bg for the icon circle
  iconColor: string; // tailwind text for the icon
}

const tools: Tool[] = [
  {
    name: "Tax Deadline Calculator",
    description: "Look up filing deadlines by entity type and state",
    icon: Calendar,
    accent: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    name: "Engagement Letter Generator",
    description: "Generate scoped engagement letters for new clients",
    icon: FileText,
    accent: "bg-indigo-50",
    iconColor: "text-indigo-600",
  },
  {
    name: "Fee Estimator",
    description: "Calculate suggested pricing based on entity and complexity",
    icon: DollarSign,
    accent: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    name: "Document Checklist",
    description: "Generate required docs list for onboarding or filings",
    icon: ClipboardCheck,
    accent: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    name: "Invoice Generator",
    description: "Pull time entries and create draft invoices",
    icon: Receipt,
    accent: "bg-purple-50",
    iconColor: "text-purple-600",
  },
  {
    name: "Client Onboarding",
    description: "Step-by-step new client setup workflow",
    icon: UserPlus,
    accent: "bg-teal-50",
    iconColor: "text-teal-600",
  },
];

interface Guide {
  title: string;
  description: string;
  category: string;
  readTime: number;
  icon: LucideIcon;
  categoryColor: string; // tailwind classes for the badge
}

const guides: Guide[] = [
  {
    title: "Monthly Close Procedure",
    description:
      "Step-by-step checklist for reconciling accounts, reviewing entries, and preparing monthly financial packages for clients.",
    category: "Bookkeeping",
    readTime: 8,
    icon: BookOpen,
    categoryColor: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    title: "New Client Onboarding",
    description:
      "Complete workflow for intake, document collection, system setup, and first-month deliverables for new engagements.",
    category: "Operations",
    readTime: 12,
    icon: UserPlus,
    categoryColor: "bg-teal-50 text-teal-700 border-teal-200",
  },
  {
    title: "Tax Season Workflow",
    description:
      "End-to-end process for managing tax return preparation, review cycles, e-filing, and extension tracking.",
    category: "Tax",
    readTime: 15,
    icon: FileBarChart,
    categoryColor: "bg-rose-50 text-rose-700 border-rose-200",
  },
  {
    title: "Payroll Processing Guide",
    description:
      "Procedures for running payroll, handling garnishments, filing quarterly returns, and year-end W-2 preparation.",
    category: "Payroll",
    readTime: 6,
    icon: CreditCard,
    categoryColor: "bg-violet-50 text-violet-700 border-violet-200",
  },
  {
    title: "IRS Notice Response",
    description:
      "How to triage, research, draft responses, and track resolution for IRS and state tax notices.",
    category: "Compliance",
    readTime: 10,
    icon: ShieldCheck,
    categoryColor: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    title: "Board Meeting Prep",
    description:
      "Preparing financial presentations, KPI dashboards, cash flow forecasts, and board-ready reporting packages.",
    category: "CFO Services",
    readTime: 8,
    icon: Briefcase,
    categoryColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
];

interface Deadline {
  label: string;
  date: string;
  daysOut: number;
}

const deadlines: Deadline[] = [
  { label: "Q4 Estimated Taxes", date: "Mar 15, 2026", daysOut: 23 },
  { label: "S-Corp / Partnership Returns", date: "Mar 15, 2026", daysOut: 23 },
  { label: "Individual Returns (1040)", date: "Apr 15, 2026", daysOut: 54 },
];

interface TeamMember {
  name: string;
  role: string;
  initials: string;
}

const team: TeamMember[] = [
  { name: "Jim", role: "Partner / CFO Lead", initials: "JI" },
  { name: "Henry", role: "Manager", initials: "HE" },
  { name: "Mark", role: "Manager", initials: "MA" },
  { name: "Gio", role: "Senior Accountant", initials: "GI" },
  { name: "Mitch", role: "Senior Accountant", initials: "MI" },
  { name: "Musa", role: "Staff Accountant", initials: "MU" },
  { name: "Donna", role: "Staff Accountant", initials: "DO" },
  { name: "Faizan", role: "Staff Accountant", initials: "FA" },
  { name: "Sam", role: "Junior Accountant", initials: "SA" },
  { name: "Jordea", role: "Payroll Specialist", initials: "JO" },
];

const services: string[] = [
  "Bookkeeping",
  "Bank & CC Rec's",
  "AP & AR",
  "Invoice & Billing",
  "Payroll",
  "Payroll Taxes",
  "Sales Tax",
  "Tax Notices & Compliance",
  "Cash Flow",
  "Financial Statements",
  "Tax Returns",
  "CFO Services",
  "Inventory",
  "Operations",
  "HR",
  "Board Meeting",
  "Audits",
  "Advisory",
];

/* -------------------------------------------------------------------------- */
/*  COMPONENT                                                                 */
/* -------------------------------------------------------------------------- */

export default function ToolsPage() {
  const [search, setSearch] = useState("");

  const lowerSearch = search.toLowerCase();

  const filteredTools = tools.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerSearch) ||
      t.description.toLowerCase().includes(lowerSearch)
  );

  const filteredGuides = guides.filter(
    (g) =>
      g.title.toLowerCase().includes(lowerSearch) ||
      g.description.toLowerCase().includes(lowerSearch) ||
      g.category.toLowerCase().includes(lowerSearch)
  );

  return (
    <div className="space-y-10 pb-16">
      {/* ------------------------------------------------------------------ */}
      {/*  HEADER                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Tools & Guides
          </h1>
          <p className="text-sm text-muted-foreground">
            Quick access to calculators, templates, and firm knowledge
          </p>
        </div>

        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tools & guides..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 bg-muted/50 pl-9 text-sm border-transparent focus:border-border focus:bg-background"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  QUICK TOOLS                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          Quick Tools
        </h2>

        {filteredTools.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No tools match your search.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTools.map((tool) => (
            <Card
              key={tool.name}
              className="group cursor-pointer border border-border/60 py-0 shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tool.accent}`}
                  >
                    <tool.icon className={`h-5 w-5 ${tool.iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="text-sm font-semibold leading-tight text-foreground">
                      {tool.name}
                    </h3>
                    <p className="text-[13px] leading-snug text-muted-foreground">
                      {tool.description}
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full cursor-pointer text-xs font-medium transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground"
                >
                  Launch
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  PLAYBOOKS & PROCEDURES                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            Playbooks & Procedures
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
          >
            View all
            <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
          </Button>
        </div>

        {filteredGuides.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No guides match your search.
          </p>
        )}

        <div className="space-y-2">
          {filteredGuides.map((guide) => (
            <Card
              key={guide.title}
              className="group cursor-pointer border border-border/60 py-0 shadow-none transition-all duration-200 hover:shadow-sm"
            >
              <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                {/* Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70">
                  <guide.icon className="h-5 w-5 text-muted-foreground" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold leading-tight text-foreground">
                      {guide.title}
                    </h3>
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-medium ${guide.categoryColor}`}
                    >
                      {guide.category}
                    </Badge>
                  </div>
                  <p className="text-[13px] leading-snug text-muted-foreground line-clamp-1">
                    {guide.description}
                  </p>
                </div>

                {/* Meta + Action */}
                <div className="hidden shrink-0 items-center gap-4 sm:flex">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />~{guide.readTime} min read
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors duration-150 group-hover:text-foreground"
                  >
                    View Guide
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Mobile: just arrow */}
                <div className="flex shrink-0 sm:hidden">
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  QUICK REFERENCE                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          Quick Reference
        </h2>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* KEY DEADLINES */}
          <Card className="border border-border/60 py-0 shadow-none">
            <CardHeader className="px-5 pb-0 pt-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50">
                  <CalendarDays className="h-4 w-4 text-rose-600" />
                </div>
                <CardTitle className="text-sm">Key Deadlines</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-4">
              <div className="space-y-3">
                {deadlines.map((d) => (
                  <div
                    key={d.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {d.label}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {d.date}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-amber-200 bg-amber-50 text-[11px] font-medium text-amber-700"
                    >
                      {d.daysOut}d
                    </Badge>
                  </div>
                ))}
              </div>
              <Separator className="my-4" />
              <Button
                variant="ghost"
                size="sm"
                className="w-full cursor-pointer text-xs text-muted-foreground hover:text-foreground"
              >
                View full calendar
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>

          {/* TEAM DIRECTORY */}
          <Card className="border border-border/60 py-0 shadow-none">
            <CardHeader className="px-5 pb-0 pt-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <CardTitle className="text-sm">Team Directory</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-4">
              <div className="space-y-2.5">
                {team.map((member) => (
                  <div
                    key={member.name}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-muted/60 cursor-pointer"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-primary/8 text-[10px] font-semibold text-primary">
                        {member.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {member.name}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SERVICE CATALOG */}
          <Card className="border border-border/60 py-0 shadow-none">
            <CardHeader className="px-5 pb-0 pt-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                  <Layers className="h-4 w-4 text-emerald-600" />
                </div>
                <CardTitle className="text-sm">Service Catalog</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-4">
              <div className="flex flex-wrap gap-1.5">
                {services.map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="cursor-pointer border-border/80 bg-muted/40 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-primary hover:text-primary-foreground"
                  >
                    {s}
                  </Badge>
                ))}
              </div>
              <Separator className="my-4" />
              <Button
                variant="ghost"
                size="sm"
                className="w-full cursor-pointer text-xs text-muted-foreground hover:text-foreground"
              >
                Manage services
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

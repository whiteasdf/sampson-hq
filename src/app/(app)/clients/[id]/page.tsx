"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MonthData = {
  month: string;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number;
  hours: number;
};

type StaffData = {
  staff_id: number;
  name: string;
  hours: number;
  cost: number;
};

type ProfitabilityData = {
  company: { accelo_id: number; name: string; standing: string };
  current_retainer: number;
  months: MonthData[];
  staff_breakdown: StaffData[];
  totals: {
    revenue: number;
    cost: number;
    margin: number;
    margin_pct: number;
    hours: number;
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function marginColor(value: number): string {
  return value >= 0 ? "text-green-600" : "text-red-600";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);

  const [data, setData] = useState<ProfitabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const res = await fetch(
        `/api/client-profitability?company_accelo_id=${id}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (!res.ok) {
        setError("Failed to load client data");
        setLoading(false);
        return;
      }

      const json = await res.json();
      setData(json);
    } catch {
      setError("An error occurred while loading data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Loading...
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to clients
        </Link>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          {error ?? "No data found for this client"}
        </div>
      </div>
    );
  }

  const { company, current_retainer, months, staff_breakdown, totals } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to clients
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {company.name}
          </h1>
          {current_retainer > 0 && (
            <Badge variant="secondary" className="text-sm font-mono">
              {formatCurrency(current_retainer)}/mo
            </Badge>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Revenue (12mo)</p>
            <div className="text-2xl font-bold font-mono mt-1">
              {formatCurrency(totals.revenue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Cost (12mo)</p>
            <div className="text-2xl font-bold font-mono mt-1">
              {formatCurrency(totals.cost)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Margin (12mo)</p>
            <div
              className={`text-2xl font-bold font-mono mt-1 ${marginColor(totals.margin)}`}
            >
              {formatCurrency(totals.margin)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Avg Margin %</p>
            <div
              className={`text-2xl font-bold font-mono mt-1 ${marginColor(totals.margin_pct)}`}
            >
              {totals.margin_pct.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Monthly Breakdown Table */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Monthly Breakdown
        </h2>
        {months.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No monthly data available
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">
                      {formatMonth(m.month)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(m.revenue)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(m.cost)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono ${marginColor(m.margin)}`}
                    >
                      {formatCurrency(m.margin)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono ${marginColor(m.margin_pct)}`}
                    >
                      {m.margin_pct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {m.hours.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <Separator />

      {/* Staff Cost Breakdown */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Staff Cost Breakdown
        </h2>
        {staff_breakdown.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No activity logged
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff_breakdown.map((s) => (
                  <TableRow key={s.staff_id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {s.hours.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(s.cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}

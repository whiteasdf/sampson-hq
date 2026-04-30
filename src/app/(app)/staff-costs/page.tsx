"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Pencil, Check, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StaffMember = {
  accelo_id: number;
  name: string;
  role: string | null;
  hourly_cost: number | null;
  effective_from: string | null;
};

type SortKey = "name" | "cost-asc" | "cost-desc" | "role";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Edit Dialog
// ---------------------------------------------------------------------------

function EditCostDialog({
  member,
  open,
  onClose,
  onSaved,
}: {
  member: StaffMember;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [hourlyCost, setHourlyCost] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setHourlyCost(member.hourly_cost != null ? String(member.hourly_cost) : "");
      setEffectiveFrom(
        member.effective_from ?? new Date().toISOString().split("T")[0]
      );
    }
  }, [open, member]);

  async function getAuthHeaders() {
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session) return null;
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  async function handleSave() {
    if (!hourlyCost || !effectiveFrom) return;
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers) return;
      const res = await fetch("/api/staff-costs", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          staff_accelo_id: member.accelo_id,
          hourly_cost: Number(hourlyCost),
          effective_from: effectiveFrom,
        }),
      });
      if (res.ok) {
        onSaved();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Edit Cost Rate</DialogTitle>
          <DialogDescription>
            Set the internal hourly cost for {member.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="hourly-cost">Hourly Cost ($)</Label>
            <Input
              id="hourly-cost"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 45.00"
              value={hourlyCost}
              onChange={(e) => setHourlyCost(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="effective-from">Effective From</Label>
            <Input
              id="effective-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !hourlyCost}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function StaffCostsPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [editMember, setEditMember] = useState<StaffMember | null>(null);

  const loadStaff = useCallback(async () => {
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session) return;

    const res = await fetch("/api/staff-costs", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const { staff: data } = await res.json();
      setStaff(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  // Filter
  const filtered = search.trim()
    ? staff.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase())
      )
    : staff;

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "cost-asc": {
        if (a.hourly_cost == null && b.hourly_cost == null) return 0;
        if (a.hourly_cost == null) return 1;
        if (b.hourly_cost == null) return -1;
        return a.hourly_cost - b.hourly_cost;
      }
      case "cost-desc": {
        if (a.hourly_cost == null && b.hourly_cost == null) return 0;
        if (a.hourly_cost == null) return 1;
        if (b.hourly_cost == null) return -1;
        return b.hourly_cost - a.hourly_cost;
      }
      case "role":
        return (a.role ?? "").localeCompare(b.role ?? "");
      default:
        return a.name.localeCompare(b.name);
    }
  });

  // Stats
  const totalStaff = staff.length;
  const withRates = staff.filter((s) => s.hourly_cost != null).length;
  const missingRates = totalStaff - withRates;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff Cost Rates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage internal hourly cost rates for profitability tracking
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalStaff}</div>
            <p className="text-xs text-muted-foreground">Total Staff</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{withRates}</div>
            <p className="text-xs text-muted-foreground">Rates Configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-amber-600">
                {missingRates}
              </span>
              {missingRates > 0 && (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Missing Rates</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search staff…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(
            [
              ["name", "Name"],
              ["cost-desc", "Cost ↓"],
              ["cost-asc", "Cost ↑"],
              ["role", "Role"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <Button
              key={key}
              variant={sort === key ? "default" : "outline"}
              size="sm"
              onClick={() => setSort(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search ? "No staff match your search" : "No staff found"}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[240px]">Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Hourly Cost</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((member) => (
                <TableRow key={member.accelo_id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell>
                    {member.role ? (
                      <span className="text-muted-foreground">{member.role}</span>
                    ) : (
                      <span className="text-muted-foreground/50 italic">
                        No role
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {member.hourly_cost != null ? (
                      <span className="font-mono">
                        {formatCurrency(member.hourly_cost)}
                      </span>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-300 text-amber-600"
                      >
                        Not set
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(member.effective_from)}
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditMember(member)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit cost rate</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Edit Dialog */}
      {editMember && (
        <EditCostDialog
          member={editMember}
          open={!!editMember}
          onClose={() => setEditMember(null)}
          onSaved={loadStaff}
        />
      )}
    </div>
  );
}

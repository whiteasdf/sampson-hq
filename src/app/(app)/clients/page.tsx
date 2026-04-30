"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { UserPlus, Search, LayoutGrid, List, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getClients } from "@/lib/queries/health";
import type { ClientData, ClientSort } from "@/lib/queries/health";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type Client = {
  id: string;
  name: string;
  monthlyRetainer: number;
  totalContractValue: number;
  assignedTo: string[];
};

function mapToClient(c: ClientData): Client {
  return {
    id: String(c.accelo_id),
    name: c.name,
    monthlyRetainer: c.monthly_retainer,
    totalContractValue: c.total_contract_value,
    assignedTo: c.assigned_to,
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type RetainerRange = {
  id: number;
  monthly_value: number;
  start_date: string;
  end_date: string | null;
};

function RetainerDialog({
  client,
  open,
  onClose,
  onSaved,
}: {
  client: Client;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ranges, setRanges] = useState<RetainerRange[]>([]);
  const [monthlyValue, setMonthlyValue] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  async function getAuthHeaders() {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session) return null;
    return { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` };
  }

  async function loadHistory() {
    const headers = await getAuthHeaders();
    if (!headers) return;
    const res = await fetch(`/api/retainers?company_accelo_id=${client.id}`, { headers });
    if (res.ok) {
      const { retainers } = await res.json();
      setRanges(retainers ?? []);
    }
  }

  useEffect(() => {
    if (open) loadHistory();
  }, [open]);

  async function handleSave() {
    if (!monthlyValue || !startDate) return;
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers) return;
      const res = await fetch("/api/retainers", {
        method: "POST",
        headers,
        body: JSON.stringify({
          company_accelo_id: Number(client.id),
          monthly_value: Number(monthlyValue),
          start_date: startDate,
          end_date: endDate || undefined,
        }),
      });
      if (res.ok) {
        setMonthlyValue("");
        setStartDate(new Date().toISOString().split("T")[0]);
        setEndDate("");
        setShowAddForm(false);
        await loadHistory();
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const headers = await getAuthHeaders();
    if (!headers) return;
    const res = await fetch(`/api/retainers?id=${id}`, { method: "DELETE", headers });
    if (res.ok) {
      await loadHistory();
      onSaved();
    }
  }

  const activeRange = ranges.find((r) => !r.end_date);
  const pastRanges = ranges.filter((r) => r.end_date);

  function formatDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Retainer — {client.name}</DialogTitle>
          <DialogDescription>
            Manage current and historical retainer ranges.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Current retainer */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current</span>
            {activeRange ? (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <span className="text-lg font-semibold tabular-nums">{formatCurrency(activeRange.monthly_value)}</span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Since {formatDate(activeRange.start_date)}</p>
                </div>
                <button onClick={() => handleDelete(activeRange.id)} className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active retainer.</p>
            )}
          </div>

          {/* History */}
          {pastRanges.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</span>
              <div className="flex flex-col gap-1">
                {pastRanges.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums">{formatCurrency(r.monthly_value)}/mo</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(r.start_date)} – {formatDate(r.end_date!)}
                      </span>
                    </div>
                    <button onClick={() => handleDelete(r.id)} className="cursor-pointer rounded-md p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add range form */}
          {showAddForm ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {endDate ? "Add Historical Range" : "Set New Retainer"}
              </span>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monthly-value">Monthly Value ($)</Label>
                <Input id="monthly-value" type="number" placeholder="e.g. 10000" value={monthlyValue} onChange={(e) => setMonthlyValue(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="end-date">End Date <span className="font-normal text-muted-foreground">(leave empty for current)</span></Label>
                  <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button onClick={handleSave} disabled={saving || !monthlyValue} size="sm" className="cursor-pointer">
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)} className="cursor-pointer">Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)} className="cursor-pointer gap-1.5 self-start">
              <Plus className="h-3.5 w-3.5" />
              Add Range
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="cursor-pointer">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientCard({ client, onEdit }: { client: Client; onEdit: () => void }) {
  const maxVisible = 3;
  const visibleMembers = client.assignedTo.slice(0, maxVisible);
  const remaining = client.assignedTo.length - maxVisible;

  return (
    <Card className="group relative transition-shadow duration-200 hover:shadow-md">
      <button
        onClick={onEdit}
        className="absolute top-4 right-4 cursor-pointer rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted/50 hover:text-foreground group-hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 pr-8">
          <Link href={`/clients/${client.id}`} className="text-lg font-semibold tracking-tight text-foreground hover:underline">
            {client.name}
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Monthly Retainer
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {client.monthlyRetainer > 0 ? formatCurrency(client.monthlyRetainer) : "—"}
            </span>
            {client.totalContractValue > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatCurrency(client.totalContractValue)} total
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Team
            </span>
            <AvatarGroup>
              {visibleMembers.map((name) => (
                <Tooltip key={name}>
                  <TooltipTrigger asChild>
                    <Avatar size="sm">
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                        {name[0]}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={4}>{name}</TooltipContent>
                </Tooltip>
              ))}
              {remaining > 0 && (
                <AvatarGroupCount className="text-[10px]">
                  +{remaining}
                </AvatarGroupCount>
              )}
            </AvatarGroup>
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [sortBy, setSortBy] = useState<ClientSort>("retainer-desc");
  const [editClient, setEditClient] = useState<Client | null>(null);
  const PAGE_SIZE = 50;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchClients = useCallback(
    async (offset: number, append: boolean) => {
      setLoading(true);
      try {
        const { clients: data, total: t } = await getClients(
          supabaseBrowser,
          { offset, limit: PAGE_SIZE, search: debouncedSearch || undefined, sort: sortBy }
        );
        const mapped = data.map(mapToClient);
        setClients((prev) => (append ? [...prev, ...mapped] : mapped));
        setTotal(t);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, sortBy]
  );

  useEffect(() => {
    fetchClients(0, false);
  }, [fetchClients]);

  const hasMore = clients.length < total;

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchClients(clients.length, true);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Clients
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage client relationships and contracts
            </p>
          </div>
          <Button variant="outline" className="cursor-pointer gap-2">
            <UserPlus className="h-4 w-4" />
            Add Client
          </Button>
        </div>

        {/* Search + Sort + View toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-1">
            {([
              { value: "name", label: "Name" },
              { value: "retainer-asc", label: "Value ↑" },
              { value: "retainer-desc", label: "Value ↓" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  sortBy === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`cursor-pointer rounded-md p-1.5 transition-colors ${
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`cursor-pointer rounded-md p-1.5 transition-colors ${
                viewMode === "table"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Client list */}
      {clients.length > 0 ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((client) => (
              <ClientCard key={client.id} client={client} onEdit={() => setEditClient(client)} />
            ))}
          </div>
        ) : (
          <Card className="overflow-hidden py-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Monthly</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Total</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {clients.map((client) => (
                    <tr key={client.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/clients/${client.id}`} className="font-medium text-foreground hover:underline">
                          {client.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {client.monthlyRetainer > 0 ? formatCurrency(client.monthlyRetainer) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {client.totalContractValue > 0 ? formatCurrency(client.totalContractValue) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {client.assignedTo.slice(0, 2).map((name) => (
                            <Tooltip key={name}>
                              <TooltipTrigger asChild>
                                <Avatar size="sm">
                                  <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                                    {name[0]}
                                  </AvatarFallback>
                                </Avatar>
                              </TooltipTrigger>
                              <TooltipContent sideOffset={4}>{name}</TooltipContent>
                            </Tooltip>
                          ))}
                          {client.assignedTo.length > 2 && (
                            <span className="text-[10px] text-muted-foreground font-medium">+{client.assignedTo.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setEditClient(client)}
                          className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {search ? `No clients match "${search}"` : "No clients found"}
          </p>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loading}
            className="cursor-pointer"
          >
            {loading ? "Loading..." : `Show more (${total - clients.length} remaining)`}
          </Button>
        </div>
      )}

      {editClient && (
        <RetainerDialog
          client={editClient}
          open={!!editClient}
          onClose={() => setEditClient(null)}
          onSaved={() => fetchClients(0, false)}
        />
      )}
    </div>
  );
}

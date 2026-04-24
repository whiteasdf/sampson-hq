// Phase 5: Typed Supabase query functions for the client health UI.
// All page-level data fetching goes through these — no raw Supabase calls in pages.
//
// When supabase gen types typescript runs, replace `SupabaseClient` with
// `SupabaseClient<Database>` from '@/lib/database.types'.

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClientWithHealth = {
  accelo_id: number;
  name: string;
  standing: string | null;
  date_last_interacted: string | null;
  entity_type: string | null;
  industry: string | null;
  health_score: number;
  interaction_score: number;
  invoice_score: number;
  task_score: number;
  contract_score: number;
  outstanding_balance: number;
  monthly_retainer: number;
  assigned_to: string[];
  services: string[];
  last_contact_type: string;
  status: "active" | "pending" | "at-risk";
};

export type ClientCommunication = {
  id: number;
  subject: string | null;
  body: string | null;
  medium: string;
  staff_name: string;
  date_created: string;
};

// ── Query: clients with health scores ─────────────────────────────────────────

/**
 * Returns all active companies enriched with health scores, outstanding
 * balances, retainer values, and assigned manager names.
 * Used by the manager client health dashboard.
 */
export async function getClientsWithHealth(
  supabase: SupabaseClient
): Promise<ClientWithHealth[]> {
  // Fetch active companies
  const { data: companies } = await supabase
    .from("companies")
    .select("accelo_id, name, standing, date_last_interacted")
    .or("standing.eq.active,standing.is.null")
    .order("name");

  if (!companies || companies.length === 0) return [];

  const companyIds = companies.map((c) => c.accelo_id);

  // Fetch health scores, invoices, contracts, company managers in parallel
  const [healthRes, invoiceRes, contractRes, managersRes] = await Promise.all([
    supabase
      .from("health_scores")
      .select("*")
      .in("company_accelo_id", companyIds),
    supabase
      .from("invoices")
      .select("company_id, outstanding")
      .in("company_id", companyIds),
    supabase
      .from("contracts")
      .select("company_id, value, standing")
      .in("company_id", companyIds)
      .eq("standing", "active"),
    supabase
      .from("company_managers")
      .select("company_accelo_id, staff_accelo_id")
      .in("company_accelo_id", companyIds),
  ]);

  // Build lookup maps
  const healthMap = new Map(
    (healthRes.data ?? []).map((h) => [h.company_accelo_id, h])
  );

  const outstandingMap = new Map<number, number>();
  for (const inv of invoiceRes.data ?? []) {
    if (!inv.company_id) continue;
    outstandingMap.set(
      inv.company_id,
      (outstandingMap.get(inv.company_id) ?? 0) + (inv.outstanding ?? 0)
    );
  }

  const retainerMap = new Map<number, number>();
  for (const c of contractRes.data ?? []) {
    if (!c.company_id) continue;
    retainerMap.set(
      c.company_id,
      (retainerMap.get(c.company_id) ?? 0) + (c.value ?? 0)
    );
  }

  // Resolve manager names
  const allStaffIds = new Set<number>();
  const managersByCompany = new Map<number, number[]>();
  for (const m of managersRes.data ?? []) {
    allStaffIds.add(m.staff_accelo_id);
    const existing = managersByCompany.get(m.company_accelo_id) ?? [];
    existing.push(m.staff_accelo_id);
    managersByCompany.set(m.company_accelo_id, existing);
  }

  const { data: staffRecords } = await supabase
    .from("staff")
    .select("accelo_id, firstname, surname")
    .in("accelo_id", [...allStaffIds]);

  const staffNameMap = new Map(
    (staffRecords ?? []).map((s) => [
      s.accelo_id,
      [s.firstname, s.surname].filter(Boolean).join(" "),
    ])
  );

  return companies.map((company) => {
    const health = healthMap.get(company.accelo_id);
    const score = health?.score ?? 50;
    const managerIds = managersByCompany.get(company.accelo_id) ?? [];

    return {
      accelo_id: company.accelo_id,
      name: company.name,
      standing: company.standing,
      date_last_interacted: company.date_last_interacted,
      entity_type: null,
      industry: null,
      health_score: score,
      interaction_score: health?.interaction_score ?? 0,
      invoice_score: health?.invoice_score ?? 0,
      task_score: health?.task_score ?? 0,
      contract_score: health?.contract_score ?? 0,
      outstanding_balance: outstandingMap.get(company.accelo_id) ?? 0,
      monthly_retainer: retainerMap.get(company.accelo_id) ?? 0,
      assigned_to: managerIds.map((id) => staffNameMap.get(id) ?? "Unknown"),
      services: [],
      last_contact_type: "email",
      status: score < 70 ? "at-risk" : score < 85 ? "pending" : "active",
    };
  });
}

// ── Query: client communication history ───────────────────────────────────────

/**
 * Returns recent communication activities (email, call, meeting) for a
 * specific company. Used by the client detail communication panel.
 */
export async function getClientCommunications(
  supabase: SupabaseClient,
  companyAcceloId: number,
  limit = 50
): Promise<ClientCommunication[]> {
  const { data: activities } = await supabase
    .from("activities")
    .select("accelo_id, subject, body, medium, staff_id, date_created")
    .in("medium", ["email", "call", "meeting"])
    .order("date_created", { ascending: false })
    .limit(limit);

  if (!activities || activities.length === 0) return [];

  // Resolve staff names
  const staffIds = [...new Set(activities.map((a) => a.staff_id).filter(Boolean))];
  const { data: staffRecords } = await supabase
    .from("staff")
    .select("accelo_id, firstname, surname")
    .in("accelo_id", staffIds);

  const staffMap = new Map(
    (staffRecords ?? []).map((s) => [
      s.accelo_id,
      [s.firstname, s.surname].filter(Boolean).join(" "),
    ])
  );

  return activities.map((a) => ({
    id: a.accelo_id,
    subject: a.subject,
    body: a.body,
    medium: a.medium ?? "email",
    staff_name: staffMap.get(a.staff_id) ?? "Unknown",
    date_created: a.date_created,
  }));
}

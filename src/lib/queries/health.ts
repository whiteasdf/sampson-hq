// Typed Supabase query functions for the clients page.
// All page-level data fetching goes through these — no raw Supabase calls in pages.

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClientData = {
  accelo_id: number;
  name: string;
  standing: string | null;
  monthly_retainer: number;
  total_contract_value: number;
  assigned_to: string[];
};

export type ClientCommunication = {
  id: number;
  subject: string | null;
  body: string | null;
  medium: string;
  staff_name: string;
  date_created: string;
};

// ── Query: clients ───────────────────────────────────────────────────────────

export type ClientSort = "name" | "retainer-asc" | "retainer-desc";

export async function getClients(
  supabase: SupabaseClient,
  opts: { offset?: number; limit?: number; search?: string; sort?: ClientSort } = {}
): Promise<{ clients: ClientData[]; total: number }> {
  const { offset = 0, limit = 50, search, sort = "retainer-desc" } = opts;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeQuery = (promise: PromiseLike<{ data: any[] | null }>) =>
    Promise.resolve(promise).catch(() => ({ data: [] as any[] }));

  // 1. Fetch all active companies + all active contracts
  let companyQuery = supabase
    .from("companies")
    .select("accelo_id, name, standing")
    .eq("standing", "active");

  if (search?.trim()) {
    companyQuery = companyQuery.ilike("name", `%${search.trim()}%`);
  }

  const [companyRes, retainerRes] = await Promise.all([
    companyQuery.order("name"),
    safeQuery(supabase.from("retainers").select("company_accelo_id, monthly_value, start_date, end_date")),
  ]);

  const allCompanies = companyRes.data;
  if (!allCompanies || allCompanies.length === 0) return { clients: [], total: 0 };

  // 2. Build retainer maps: monthly (active) + total (all ranges)
  const monthlyMap = new Map<number, number>();
  const totalValueMap = new Map<number, number>();
  const now = new Date();

  for (const r of retainerRes.data ?? []) {
    const cid = r.company_accelo_id;
    if (!cid) continue;

    if (!r.end_date) {
      monthlyMap.set(cid, (monthlyMap.get(cid) ?? 0) + (r.monthly_value ?? 0));
    }

    const start = new Date(r.start_date);
    const end = r.end_date ? new Date(r.end_date) : now;
    const months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
    totalValueMap.set(cid, (totalValueMap.get(cid) ?? 0) + (r.monthly_value ?? 0) * months);
  }

  // 3. Sort all companies, then paginate
  const sorted = [...allCompanies];
  switch (sort) {
    case "retainer-asc":
      sorted.sort((a, b) => (monthlyMap.get(a.accelo_id) ?? 0) - (monthlyMap.get(b.accelo_id) ?? 0));
      break;
    case "retainer-desc":
      sorted.sort((a, b) => (monthlyMap.get(b.accelo_id) ?? 0) - (monthlyMap.get(a.accelo_id) ?? 0));
      break;
    default:
      break;
  }

  const total = sorted.length;
  const companies = sorted.slice(offset, offset + limit);
  if (companies.length === 0) return { clients: [], total };

  // 4. Enrich only the visible page
  const companyIds = companies.map((c) => c.accelo_id);

  const managersRes = await safeQuery(
    supabase.from("company_managers").select("company_accelo_id, staff_accelo_id").in("company_accelo_id", companyIds)
  );

  const allStaffIds = new Set<number>();
  const managersByCompany = new Map<number, number[]>();
  for (const m of managersRes.data ?? []) {
    allStaffIds.add(m.staff_accelo_id);
    const existing = managersByCompany.get(m.company_accelo_id) ?? [];
    existing.push(m.staff_accelo_id);
    managersByCompany.set(m.company_accelo_id, existing);
  }

  const { data: staffRecords } = allStaffIds.size > 0
    ? await supabase.from("staff").select("accelo_id, firstname, surname").in("accelo_id", [...allStaffIds])
    : { data: [] };

  const staffNameMap = new Map(
    (staffRecords ?? []).map((s) => [
      s.accelo_id,
      [s.firstname, s.surname].filter(Boolean).join(" "),
    ])
  );

  const clients = companies.map((company) => {
    const managerIds = managersByCompany.get(company.accelo_id) ?? [];

    return {
      accelo_id: company.accelo_id,
      name: company.name,
      standing: company.standing ?? null,
      monthly_retainer: monthlyMap.get(company.accelo_id) ?? 0,
      total_contract_value: totalValueMap.get(company.accelo_id) ?? 0,
      assigned_to: managerIds.map((id) => staffNameMap.get(id) ?? "Unknown"),
    } satisfies ClientData;
  });

  return { clients, total };
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

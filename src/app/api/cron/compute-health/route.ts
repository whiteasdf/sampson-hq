// Phase 5: compute-health — computes client health scores for all active companies.
//
// Weighted formula:
//   40% interaction recency (days since date_last_interacted)
//   30% invoice aging (outstanding / total)
//   20% overdue task count
//   10% active contract standing

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

function interactionScore(daysSinceInteraction: number | null): number {
  if (daysSinceInteraction === null) return 0;
  if (daysSinceInteraction <= 7) return 100;
  if (daysSinceInteraction <= 14) return 80;
  if (daysSinceInteraction <= 30) return 60;
  if (daysSinceInteraction <= 60) return 30;
  return 0;
}

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── 1. Get all active companies ────────────────────────────────────────────
    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select("accelo_id, date_last_interacted, standing")
      .or("standing.eq.active,standing.is.null");

    if (!companies || companies.length === 0) {
      return Response.json({ ok: true, computed: 0 });
    }

    const companyIds = companies.map((c) => c.accelo_id);
    const now = new Date();

    // ── 2. Fetch supporting data in parallel ───────────────────────────────────
    const [invoiceRes, overdueTaskRes, openTaskRes, contractRes] = await Promise.all([
      // Invoice data grouped by company
      supabaseAdmin
        .from("invoices")
        .select("company_id, total, outstanding")
        .in("company_id", companyIds),

      // Overdue task counts by company
      supabaseAdmin
        .from("tasks")
        .select("company_id")
        .in("company_id", companyIds)
        .not("status_id", "in", "(5,6)")
        .lt("due_date", now.toISOString()),

      // Open task counts by company
      supabaseAdmin
        .from("tasks")
        .select("company_id")
        .in("company_id", companyIds)
        .not("status_id", "in", "(5,6)"),

      // Active contracts by company
      supabaseAdmin
        .from("contracts")
        .select("company_id, standing")
        .in("company_id", companyIds)
        .eq("standing", "active"),
    ]);

    // ── 3. Build lookup maps ───────────────────────────────────────────────────
    const invoiceByCompany = new Map<number, { total: number; outstanding: number }>();
    for (const inv of invoiceRes.data ?? []) {
      if (!inv.company_id) continue;
      const existing = invoiceByCompany.get(inv.company_id) ?? { total: 0, outstanding: 0 };
      existing.total += inv.total ?? 0;
      existing.outstanding += inv.outstanding ?? 0;
      invoiceByCompany.set(inv.company_id, existing);
    }

    const overdueByCompany = new Map<number, number>();
    for (const t of overdueTaskRes.data ?? []) {
      if (!t.company_id) continue;
      overdueByCompany.set(t.company_id, (overdueByCompany.get(t.company_id) ?? 0) + 1);
    }

    const openByCompany = new Map<number, number>();
    for (const t of openTaskRes.data ?? []) {
      if (!t.company_id) continue;
      openByCompany.set(t.company_id, (openByCompany.get(t.company_id) ?? 0) + 1);
    }

    const contractsByCompany = new Set<number>();
    for (const c of contractRes.data ?? []) {
      if (c.company_id) contractsByCompany.add(c.company_id);
    }

    // ── 4. Compute scores ──────────────────────────────────────────────────────
    const healthRows = companies.map((company) => {
      // Interaction score (40%)
      let daysSince: number | null = null;
      if (company.date_last_interacted) {
        daysSince = Math.floor(
          (now.getTime() - new Date(company.date_last_interacted).getTime()) / 86400000
        );
      }
      const iScore = interactionScore(daysSince);

      // Invoice score (30%)
      const inv = invoiceByCompany.get(company.accelo_id);
      let invScore = 100;
      if (inv && inv.total > 0) {
        invScore = Math.round((1 - inv.outstanding / inv.total) * 100);
      }

      // Task score (20%)
      const overdueCount = overdueByCompany.get(company.accelo_id) ?? 0;
      const openCount = openByCompany.get(company.accelo_id) ?? 0;
      let tScore = 100;
      if (openCount > 0) {
        tScore = Math.round((1 - overdueCount / openCount) * 100);
      }

      // Contract score (10%)
      const cScore = contractsByCompany.has(company.accelo_id) ? 100 : 0;

      const totalScore = Math.round(0.4 * iScore + 0.3 * invScore + 0.2 * tScore + 0.1 * cScore);

      return {
        company_accelo_id: company.accelo_id,
        score: totalScore,
        interaction_score: iScore,
        invoice_score: invScore,
        task_score: tScore,
        contract_score: cScore,
        computed_at: now.toISOString(),
      };
    });

    // ── 5. Upsert health scores ────────────────────────────────────────────────
    if (healthRows.length > 0) {
      const { error } = await supabaseAdmin
        .from("health_scores")
        .upsert(healthRows, { onConflict: "company_accelo_id" });
      if (error) throw new Error(`health_scores upsert: ${error.message}`);
    }

    return Response.json({
      ok: true,
      computed: healthRows.length,
      at_risk: healthRows.filter((h) => h.score < 70).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

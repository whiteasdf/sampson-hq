// Backfill activities.company_id via Accelo job resolution.
// Skips tasks entirely — only resolves activities → jobs → companies.

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { acceloFetchAll } from "@/lib/accelo-client";

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: activities } = await supabaseAdmin
      .from("activities")
      .select("accelo_id")
      .is("company_id", null)
      .limit(10000);

    if (!activities || activities.length === 0) {
      return Response.json({ ok: true, message: "No activities need backfill" });
    }

    const ids = activities.map((a) => a.accelo_id);
    const BATCH = 50;

    // Fetch against_id (job_id) from Accelo for these activities
    const actJobMap = new Map<number, number>();
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const acceloActs = await acceloFetchAll<{ id: number; against_id: number }>(
        "/activities",
        { _fields: "id,against_id", _filters: `id_in(${batch.join(",")})` }
      );
      for (const a of acceloActs) {
        if (a.against_id) actJobMap.set(a.id, a.against_id);
      }
    }

    // Collect unique job IDs and fetch their parent companies
    const jobIds = [...new Set(actJobMap.values())];
    const jobToCompany = new Map<number, number>();

    for (let i = 0; i < jobIds.length; i += BATCH) {
      const batch = jobIds.slice(i, i + BATCH);
      const jobs = await acceloFetchAll<{ id: number; company: { id: number } | null }>(
        "/jobs",
        { _fields: "id,company(id)", _filters: `id_in(${batch.join(",")})` }
      );
      for (const j of jobs) {
        if (j.company?.id) jobToCompany.set(j.id, j.company.id);
      }
    }

    // Update activities
    let updated = 0;
    for (const [actId, jobId] of actJobMap) {
      const companyId = jobToCompany.get(jobId);
      if (companyId == null) continue;
      const { error } = await supabaseAdmin
        .from("activities")
        .update({ company_id: companyId })
        .eq("accelo_id", actId);
      if (!error) updated++;
    }

    return Response.json({
      ok: true,
      activities_checked: ids.length,
      jobs_resolved: jobToCompany.size,
      activities_updated: updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

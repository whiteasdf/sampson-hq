// GAR-635: sync-companies — every 10 minutes, incremental
// First run: full scan of all active companies (~1,200 records, ~12 pages).
// Subsequent runs: only records modified since last_synced_at watermark.

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { acceloFetchAll } from "@/lib/accelo-client";

type AcceloCompany = {
  id: number;
  name: string;
  standing: string;
};

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // ── 1. Read watermark ────────────────────────────────────────────────────────
  const { data: wm } = await supabaseAdmin
    .from("sync_watermarks")
    .select("last_synced_at")
    .eq("entity", "companies")
    .single();

  const lastSynced = wm?.last_synced_at;
  const isFirstRun = !lastSynced || lastSynced === "1970-01-01T00:00:00+00:00";

  // ── 2. Fetch from Accelo ─────────────────────────────────────────────────────
  const params: Record<string, string> = {
    _fields: "id,name,standing",
  };

  if (!isFirstRun) {
    const unixTs = Math.floor(new Date(lastSynced).getTime() / 1000);
    params._filters = `date_modified_after(${unixTs})`;
  }

  const companies = await acceloFetchAll<AcceloCompany>("/companies", params);

  // ── 3. Upsert ────────────────────────────────────────────────────────────────
  const rows = companies.map((c) => ({
    accelo_id: c.id,
    name:      c.name ?? "",
    standing:  c.standing ?? null,
    synced_at: now,
  }));

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("companies")
      .upsert(rows, { onConflict: "accelo_id" });
    if (error) throw new Error(`companies upsert: ${error.message}`);
  }

  // ── 4. Update watermark ──────────────────────────────────────────────────────
  const { error: wmErr } = await supabaseAdmin
    .from("sync_watermarks")
    .update({ last_synced_at: now })
    .eq("entity", "companies");
  if (wmErr) throw new Error(`watermark update: ${wmErr.message}`);

  return Response.json({ ok: true, companies: rows.length, firstRun: isFirstRun });
}

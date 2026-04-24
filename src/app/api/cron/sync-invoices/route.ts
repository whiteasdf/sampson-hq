// Phase 5: sync-invoices — syncs invoices and contracts from Accelo.
// Invoices use incremental sync via date_modified watermark.
// Contracts do a full sync each run (small dataset, no date_modified filter).

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { acceloFetchAll } from "@/lib/accelo-client";

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // ── 1. Read watermark ──────────────────────────────────────────────────────
    const { data: wm } = await supabaseAdmin
      .from("sync_watermarks")
      .select("last_synced_at")
      .eq("entity", "invoices")
      .single();

    const lastSynced = wm?.last_synced_at;
    const isFirstRun = !lastSynced || lastSynced === "1970-01-01T00:00:00+00:00";

    // ── 2. Sync invoices ───────────────────────────────────────────────────────
    const invoiceParams: Record<string, string> = {
      _fields: "id,against_id,standing,date_issued,date_due,date_paid,total,outstanding",
    };

    if (!isFirstRun) {
      const unixTs = Math.floor(new Date(lastSynced).getTime() / 1000);
      invoiceParams._filters = `date_modified_after(${unixTs})`;
    }

    const invoices = await acceloFetchAll<Record<string, unknown>>("/invoices", invoiceParams);

    if (invoices.length > 0) {
      const rows = invoices.map((inv) => ({
        accelo_id: Number(inv.id),
        company_id: Number(inv.against_id) || null,
        standing: String(inv.standing ?? ""),
        date_issued: inv.date_issued
          ? new Date(Number(inv.date_issued) * 1000).toISOString()
          : null,
        date_due: inv.date_due
          ? new Date(Number(inv.date_due) * 1000).toISOString()
          : null,
        date_paid: inv.date_paid
          ? new Date(Number(inv.date_paid) * 1000).toISOString()
          : null,
        total: Number(inv.total) || 0,
        outstanding: Number(inv.outstanding) || 0,
        synced_at: now,
      }));

      const { error } = await supabaseAdmin
        .from("invoices")
        .upsert(rows, { onConflict: "accelo_id" });
      if (error) throw new Error(`invoices upsert: ${error.message}`);
    }

    // ── 3. Sync contracts ──────────────────────────────────────────────────────
    const contracts = await acceloFetchAll<Record<string, unknown>>("/contracts", {
      _fields: "id,against_id,title,value,standing,date_expires",
    });

    if (contracts.length > 0) {
      const contractRows = contracts.map((c) => ({
        accelo_id: Number(c.id),
        company_id: Number(c.against_id) || null,
        title: String(c.title ?? ""),
        value: Number(c.value) || 0,
        standing: String(c.standing ?? ""),
        date_expires: c.date_expires
          ? new Date(Number(c.date_expires) * 1000).toISOString()
          : null,
        synced_at: now,
      }));

      const { error } = await supabaseAdmin
        .from("contracts")
        .upsert(contractRows, { onConflict: "accelo_id" });
      if (error) throw new Error(`contracts upsert: ${error.message}`);
    }

    // ── 4. Update watermark ────────────────────────────────────────────────────
    const { error: wmErr } = await supabaseAdmin
      .from("sync_watermarks")
      .update({ last_synced_at: now })
      .eq("entity", "invoices");
    if (wmErr) throw new Error(`watermark update: ${wmErr.message}`);

    return Response.json({
      ok: true,
      invoices_synced: invoices.length,
      contracts_synced: contracts.length,
      firstRun: isFirstRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

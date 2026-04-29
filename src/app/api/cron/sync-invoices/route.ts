// sync-invoices — syncs invoices from Accelo.
// Incremental sync via date_modified watermark.

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

    // ── 3. Update watermark ────────────────────────────────────────────────────
    const { error: wmErr } = await supabaseAdmin
      .from("sync_watermarks")
      .update({ last_synced_at: now })
      .eq("entity", "invoices");
    if (wmErr) throw new Error(`watermark update: ${wmErr.message}`);

    return Response.json({
      ok: true,
      invoices_synced: invoices.length,
      firstRun: isFirstRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

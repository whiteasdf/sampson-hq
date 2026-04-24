// GAR-634: sync-staff — hourly
// Syncs staff records and updates sync_watermarks.
// Vercel automatically sends Authorization: Bearer $CRON_SECRET when invoking crons.

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { acceloFetchAll } from "@/lib/accelo-client";

type AcceloStaff = {
  id: number;
  firstname: string;
  surname: string;
  title: string;
  email: string;
  standing: string;
  rate: { id: number } | null;
};

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // ── 1. Sync staff ────────────────────────────────────────────────────────────
  const staffList = await acceloFetchAll<AcceloStaff>("/staff", {
    _fields: "id,firstname,surname,title,email,standing,rate(id)",
  });

  const staffRows = staffList.map((s) => ({
    accelo_id: s.id,
    firstname:  s.firstname ?? null,
    surname:    s.surname   ?? null,
    email:      s.email     ?? null,
    rate_id:    s.rate?.id  ?? null,
    synced_at:  now,
  }));

  if (staffRows.length > 0) {
    const { error } = await supabaseAdmin
      .from("staff")
      .upsert(staffRows, { onConflict: "accelo_id" });
    if (error) throw new Error(`staff upsert: ${error.message}`);
  }

  // ── 2. Update watermark ──────────────────────────────────────────────────────
  const { error: wmErr } = await supabaseAdmin
    .from("sync_watermarks")
    .update({ last_synced_at: now })
    .eq("entity", "staff");
  if (wmErr) throw new Error(`watermark update: ${wmErr.message}`);

  return Response.json({ ok: true, staff: staffRows.length });
}

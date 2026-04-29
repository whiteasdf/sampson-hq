import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getManager(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  if (!user || user.app_metadata?.role !== "manager") return null;
  return user;
}

export async function GET(request: NextRequest) {
  const user = await getManager(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = request.nextUrl.searchParams.get("company_accelo_id");
  if (!companyId) return Response.json({ error: "Missing company_accelo_id" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("retainers")
    .select("*")
    .eq("company_accelo_id", Number(companyId))
    .order("start_date", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ retainers: data });
}

export async function POST(request: NextRequest) {
  const user = await getManager(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { company_accelo_id, monthly_value, start_date, end_date } = await request.json();
  if (!company_accelo_id || monthly_value == null || !start_date) {
    return Response.json({ error: "Missing company_accelo_id, monthly_value, or start_date" }, { status: 400 });
  }

  // Historical range (has end_date) — insert directly without closing anything
  // Current range (no end_date) — close existing open range first
  if (!end_date) {
    const startDate = new Date(start_date);
    const dayBefore = new Date(startDate);
    dayBefore.setDate(dayBefore.getDate() - 1);

    const { data: existing } = await supabaseAdmin
      .from("retainers")
      .select("id")
      .eq("company_accelo_id", company_accelo_id)
      .is("end_date", null)
      .single();

    if (existing) {
      await supabaseAdmin
        .from("retainers")
        .update({ end_date: dayBefore.toISOString().split("T")[0] })
        .eq("id", existing.id);
    }
  }

  const staffAcceloId = user.app_metadata?.staff_accelo_id ?? null;
  const { data, error } = await supabaseAdmin
    .from("retainers")
    .insert({
      company_accelo_id,
      monthly_value: Number(monthly_value),
      start_date,
      end_date: end_date ?? null,
      created_by: staffAcceloId,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ retainer: data });
}

export async function DELETE(request: NextRequest) {
  const user = await getManager(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("retainers")
    .delete()
    .eq("id", Number(id));

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

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

  const [staffResult, ratesResult, costRatesResult] = await Promise.all([
    supabaseAdmin.from("staff").select("accelo_id, firstname, surname, rate_id"),
    supabaseAdmin.from("rates").select("id, title"),
    supabaseAdmin.from("staff_cost_rates").select("*"),
  ]);

  if (staffResult.error) return Response.json({ error: staffResult.error.message }, { status: 500 });
  if (ratesResult.error) return Response.json({ error: ratesResult.error.message }, { status: 500 });
  if (costRatesResult.error) return Response.json({ error: costRatesResult.error.message }, { status: 500 });

  const rateMap = new Map(ratesResult.data.map((r) => [r.id, r.title]));
  const costMap = new Map(
    costRatesResult.data.map((c) => [c.staff_accelo_id, c])
  );

  const staff = staffResult.data.map((s) => {
    const cost = costMap.get(s.accelo_id);
    return {
      accelo_id: s.accelo_id,
      name: [s.firstname, s.surname].filter(Boolean).join(" ") || "Unknown",
      role: rateMap.get(s.rate_id) ?? null,
      hourly_cost: cost?.hourly_cost ?? null,
      effective_from: cost?.effective_from ?? null,
    };
  });

  return Response.json({ staff });
}

export async function PUT(request: NextRequest) {
  const user = await getManager(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { staff_accelo_id, hourly_cost, effective_from } = body;

  if (staff_accelo_id == null || hourly_cost == null || !effective_from) {
    return Response.json(
      { error: "Missing staff_accelo_id, hourly_cost, or effective_from" },
      { status: 400 }
    );
  }

  const staffId = Number(staff_accelo_id);
  const cost = Number(hourly_cost);
  if (isNaN(staffId) || isNaN(cost) || cost < 0) {
    return Response.json(
      { error: "hourly_cost and staff_accelo_id must be valid numbers" },
      { status: 400 }
    );
  }

  const { data: staffRow } = await supabaseAdmin
    .from("staff")
    .select("accelo_id")
    .eq("accelo_id", staffId)
    .single();
  if (!staffRow) {
    return Response.json({ error: "staff_accelo_id not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("staff_cost_rates")
    .upsert(
      {
        staff_accelo_id: staffId,
        hourly_cost: cost,
        effective_from: effective_from as string,
      },
      { onConflict: "staff_accelo_id" }
    )
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, rate: data });
}

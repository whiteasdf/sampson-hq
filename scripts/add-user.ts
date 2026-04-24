import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
  const { data, error } = await supabase.auth.admin.createUser({
    email: "daoli@sampsonllc.com",
    email_confirm: true,
    app_metadata: { staff_accelo_id: 37, role: "manager", rate_id: 24 },
    user_metadata: { full_name: "Daohao Li" },
  });

  if (error) console.error("ERROR:", error.message);
  else console.log("OK:", data.user.email, data.user.id);
}

run().catch(console.error);

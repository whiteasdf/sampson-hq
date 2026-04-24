/**
 * Phase 1 — One-time seed script
 * Creates Supabase auth.users for all 15 active Sampson staff.
 *
 * Requires env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   npx tsx scripts/seed-auth-users.ts
 *
 * Safe to re-run — skips users that already exist (upsert via email).
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

type StaffRecord = {
  staff_accelo_id: number;
  email: string;
  full_name: string;
  role: "manager" | "worker";
  rate_id: number; // 18=Sr P&G | 19=Jr P&G | 22=Executive Leadership | 24=Admin
};

// Billing rate reference:
//   18 → Sr. Profit and Growth Accountants (active)
//   19 → Jr. Profit and Growth Accountant  (active)
//   22 → Executive Leadership              (active)
//   24 → Admin                             (active)

const STAFF: StaffRecord[] = [
  { staff_accelo_id: 2,  email: "hfiorillo@sampsonllc.com",   full_name: "Henry Fiorillo",       role: "manager", rate_id: 22 },
  { staff_accelo_id: 5,  email: "mlangsam@sampsonllc.com",    full_name: "Mitchell Langsam",      role: "worker",  rate_id: 18 },
  { staff_accelo_id: 7,  email: "donna@sampsonllc.com",        full_name: "Donna Fiorillo",        role: "manager", rate_id: 22 },
  { staff_accelo_id: 11, email: "jfernandez@sampsonllc.com",  full_name: "Jordea Fernandez",      role: "worker",  rate_id: 24 },
  { staff_accelo_id: 12, email: "jtall@sampsonllc.com",        full_name: "Jim Tall",              role: "manager", rate_id: 22 },
  { staff_accelo_id: 13, email: "gioplasencia@sampsonllc.com",full_name: "Giordanys Plasencia",   role: "worker",  rate_id: 19 },
  { staff_accelo_id: 14, email: "pmoloney@sampsonllc.com",    full_name: "Patrick Moloney",       role: "worker",  rate_id: 18 },
  { staff_accelo_id: 24, email: "myoung@sampsonllc.com",      full_name: "Mark Young",            role: "manager", rate_id: 22 },
  { staff_accelo_id: 29, email: "mshahbaz@sampsonllc.com",    full_name: "Musa Shahbaz",          role: "worker",  rate_id: 19 },
  { staff_accelo_id: 32, email: "hjfio3@sampsonllc.com",       full_name: "Henry Fiorillo III",    role: "manager", rate_id: 18 },
  { staff_accelo_id: 33, email: "mfaizan@sampsonllc.com",     full_name: "Muhammad Faizan",       role: "worker",  rate_id: 19 },
  { staff_accelo_id: 34, email: "sspeirs@sampsonllc.com",     full_name: "Samantha Speirs",       role: "worker",  rate_id: 18 },
  { staff_accelo_id: 36, email: "aklepadlo@sampsonllc.com",   full_name: "Alex Klepadlo",         role: "worker",  rate_id: 19 },
  { staff_accelo_id: 37, email: "daohao@munchinsights.com",   full_name: "Daohao Li",             role: "manager", rate_id: 24 },
  { staff_accelo_id: 38, email: "usaif@sampsonllc.com",        full_name: "Umer Saif",             role: "worker",  rate_id: 19 },
];

async function seed() {
  console.log(`Seeding ${STAFF.length} staff members...\n`);

  for (const s of STAFF) {
    // Check if user already exists
    const { data: existing } = await supabase.auth.admin.listUsers();
    const alreadyExists = existing?.users.some((u) => u.email === s.email);

    if (alreadyExists) {
      console.log(`  SKIP  ${s.email} (already exists)`);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: s.email,
      email_confirm: true, // confirmed immediately — user receives magic link on first login
      // app_metadata is server-only and cannot be modified by the client.
      // user_metadata is user-writable — never put role/rate there.
      app_metadata: {
        staff_accelo_id: s.staff_accelo_id,
        role: s.role,
        rate_id: s.rate_id,
      },
      user_metadata: {
        full_name: s.full_name,
      },
    });

    if (error) {
      console.error(`  ERROR ${s.email}: ${error.message}`);
    } else {
      console.log(`  OK    ${s.email}  [${s.role}, rate:${s.rate_id}, accelo:${s.staff_accelo_id}]`);
    }
  }

  console.log("\nDone.");
}

seed().catch(console.error);

import { supabaseAdmin } from "@/lib/supabase-server";
import { getTeamCapacity, getTodayTimeLog } from "@/lib/queries/dashboard";
import { getOpenTasks } from "@/lib/queries/tasks";

export async function GET() {
  const [capacity, timeLog, tasks] = await Promise.all([
    getTeamCapacity(supabaseAdmin),
    getTodayTimeLog(supabaseAdmin),
    getOpenTasks(supabaseAdmin),
  ]);

  return Response.json({ capacity, timeLog, tasks });
}

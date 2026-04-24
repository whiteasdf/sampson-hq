import { createClient } from "@supabase/supabase-js";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function createServerClient() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll is called when the Supabase client refreshes the session.
            // In Server Components the response is already sealed, so setting
            // cookies here throws. The middleware handles session refresh for
            // all navigations, so this is safe to ignore.
          }
        },
      },
    }
  );
}

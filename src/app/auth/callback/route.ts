import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * /auth/callback
 *
 * Supabase sends the user here after they click a magic-link email.
 * The URL contains a PKCE `code` parameter (and optionally a `next` path).
 * We exchange the code for a session, write the session cookies, then
 * redirect the user to their intended destination (defaulting to "/").
 *
 * This route MUST be listed in PUBLIC_ROUTES in middleware.ts (it already is).
 * It MUST also be set as the Supabase "Site URL" / "Redirect URL" in the
 * Supabase dashboard (Authentication → URL Configuration).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` lets callers encode where the user was trying to go before auth.
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    // No code present — redirect to login with an error hint.
    return NextResponse.redirect(
      new URL("/login?error=missing_code", origin)
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin)
    );
  }

  // Redirect to the intended destination — must be a relative path to prevent
  // open-redirect attacks.
  const redirectTo = next.startsWith("/") ? next : "/";
  return NextResponse.redirect(new URL(redirectTo, origin));
}

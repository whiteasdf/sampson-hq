import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Set APP_MODE="manager" or APP_MODE="worker" in Vercel environment variables.
// When unset (local dev), all routes are accessible.
const mode = process.env.APP_MODE;

const PUBLIC_ROUTES = ["/login", "/auth/callback"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes through without auth check
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Build a mutable response so cookie updates can be piped back to the browser
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write refreshed cookies onto both the forwarded request and the
          // outgoing response so downstream server components see them too.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Use getUser() — re-validates the JWT against the Supabase server,
  // unlike getSession() which only reads the local cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the originally requested path so the login page can pass it
    // through to /auth/callback → final redirect after successful sign-in.
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated — apply APP_MODE routing
  if (mode === "worker") {
    // Worker deployment: only /worker routes are accessible
    if (!pathname.startsWith("/worker")) {
      return NextResponse.redirect(new URL("/worker", request.url));
    }
  }

  if (mode === "manager") {
    // Manager deployment: /worker routes are blocked
    if (pathname.startsWith("/worker")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Copy any refreshed-session Set-Cookie headers onto the final response,
  // preserving all cookie attributes (HttpOnly, Secure, SameSite, Path, MaxAge).
  // ResponseCookies.getAll() strips attributes, so we must work at the raw
  // Set-Cookie header level.
  const refreshedCookies = response.headers.getSetCookie?.() ?? [];
  if (refreshedCookies.length === 0) {
    return response;
  }
  const mergedHeaders = new Headers(response.headers);
  for (const raw of refreshedCookies) {
    mergedHeaders.append("Set-Cookie", raw);
  }
  return new NextResponse(response.body, {
    status: response.status,
    headers: mergedHeaders,
  });
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

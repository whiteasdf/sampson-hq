import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Set APP_MODE="manager" or APP_MODE="worker" in Vercel environment variables.
// When unset (local dev), all routes are accessible.
const mode = process.env.APP_MODE;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

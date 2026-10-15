import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NONCE_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "@/lib/auth/signed-envelope";

// Fail-closed presence gate for signed mutations. Any data-mutating request on /api/* must carry
// the three signature headers, otherwise it is rejected before the route runs. This does NOT read
// bodies nor verify signatures: full verification lives in `signedRoute` (src/lib/auth/signed-route.ts),
// which has the session and returns the typed payload.

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Endpoints that are legitimately unsigned (login challenge–response and NextAuth internals). */
const UNSIGNED_EXACT_PATHS = new Set([
  "/api/auth/challenge",
  "/api/auth/signout",
  "/api/auth/_log",
  "/api/auth/csrf",
  "/api/auth/session",
]);
const UNSIGNED_PATH_PREFIXES = ["/api/auth/callback/"];

function isUnsignedAllowed(pathname: string): boolean {
  return (
    UNSIGNED_EXACT_PATHS.has(pathname) ||
    UNSIGNED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function proxy(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return NextResponse.next();
  if (isUnsignedAllowed(request.nextUrl.pathname)) return NextResponse.next();

  const { headers } = request;
  if (
    !headers.get(SIGNATURE_HEADER) ||
    !headers.get(TIMESTAMP_HEADER) ||
    !headers.get(NONCE_HEADER)
  ) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

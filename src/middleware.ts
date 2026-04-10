import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Reject cross-origin requests to API routes.
 *
 * Without this, any website the user visits could make fetch() calls to
 * localhost:3200 and hit state-changing endpoints (kill processes, delete
 * branches, send text to terminals, etc.).
 *
 * We allow requests that either:
 * - Have no Origin header (same-origin navigations, curl, Electron webview)
 * - Have an Origin matching the local server
 */
export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (origin) {
    const allowedOrigins = [`http://localhost:3200`, `http://127.0.0.1:3200`];
    if (!allowedOrigins.includes(origin)) {
      return NextResponse.json({ error: "Forbidden: cross-origin request" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

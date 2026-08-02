import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Optimistic UX redirect only — NOT the security boundary. See docs/auth.md §4:
// every protected Server Component/layout and every Server Action/Route Handler
// independently calls requireUser(), since Proxy can't cover Server Functions
// that get refactored onto a route it doesn't match.
export default auth((req) => {
  if (!req.auth) {
    const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: [
    "/((?!api/auth|login|signup|_next/static|_next/image|favicon.ico).*)",
  ],
};

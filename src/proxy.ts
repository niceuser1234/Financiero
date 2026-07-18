import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/cron", "/api/banking/callback"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(req);
  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Alles außer statischen Assets & Next-Interna.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*\\.png).*)"],
};

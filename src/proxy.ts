import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Gate the staff app (/hq) and the client portal (/portal). Public quote and invoice pages,
// auth pages, webhooks and the MCP endpoint handle their own checks.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;
  const isStaffArea = pathname.startsWith("/hq");
  const isPortalArea = pathname.startsWith("/portal");

  // Let server layouts know the current path (used for per screen help).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  if (!isStaffArea && !isPortalArea) return pass();

  if (!user) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", pathname);
    if (isPortalArea) url.searchParams.set("as", "client");
    return NextResponse.redirect(url);
  }
  if (isStaffArea && user.kind !== "STAFF") {
    return NextResponse.redirect(new URL("/portal", req.nextUrl.origin));
  }
  return pass();
});

export const config = {
  matcher: ["/hq/:path*", "/portal/:path*"],
};

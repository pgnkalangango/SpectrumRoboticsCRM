import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/mailer";
import { metaAuthorizeUrl, metaConfigured } from "@/lib/social/meta";

const COOKIE = "hq_oauth_meta";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF" || user.tier !== "OWNER" || !can(user, "integrations.manage")) return NextResponse.redirect(appUrl("/hq/integrations?error=owners_only"));
  if (!metaConfigured()) return NextResponse.redirect(appUrl("/hq/integrations?error=meta_not_configured"));
  const token = randomToken();
  const res = NextResponse.redirect(metaAuthorizeUrl(sha256(token), appUrl("/api/oauth/meta/callback")));
  res.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: appUrl().startsWith("https"), path: "/api/oauth/meta", maxAge: 600 });
  return res;
}

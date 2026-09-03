import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/mailer";
import { linkedinAuthorizeUrl, linkedinConfigured } from "@/lib/social/linkedin";

export const LINKEDIN_STATE_COOKIE = "hq_oauth_linkedin";

// Owners only. The state is the sha256 of a random token kept in an httpOnly cookie.
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF" || user.tier !== "OWNER" || !can(user, "integrations.manage")) return NextResponse.redirect(appUrl("/hq/integrations?error=owners_only"));
  if (!linkedinConfigured()) return NextResponse.redirect(appUrl("/hq/integrations?error=linkedin_not_configured"));
  const token = randomToken();
  const res = NextResponse.redirect(linkedinAuthorizeUrl(sha256(token), appUrl("/api/oauth/linkedin/callback")));
  res.cookies.set(LINKEDIN_STATE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: appUrl().startsWith("https"), path: "/api/oauth/linkedin", maxAge: 600 });
  return res;
}

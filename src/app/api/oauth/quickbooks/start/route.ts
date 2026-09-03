import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/session";
import { randomToken } from "@/lib/crypto";
import { appUrl } from "@/lib/mailer";
import { quickbooksAuthUrl, quickbooksConfigured } from "@/lib/quickbooks";

// Owner only: sends the browser to Intuit to authorize the QuickBooks company.
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF") return NextResponse.redirect(appUrl("/login?next=/hq/integrations"));
  if (user.tier !== "OWNER") return NextResponse.redirect(appUrl("/hq?denied=1"));
  if (!quickbooksConfigured()) return NextResponse.redirect(appUrl("/hq/integrations?error=quickbooks_not_configured"));
  const state = randomToken(16);
  const jar = await cookies();
  jar.set("qb_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return NextResponse.redirect(quickbooksAuthUrl(state));
}
